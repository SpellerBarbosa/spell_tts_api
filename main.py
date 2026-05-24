import io
import os
import time
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import soundfile as sf
from kokoro_onnx import Kokoro

app = FastAPI(title="Kokoro TTS API")

KOKORO_MODEL = os.getenv("KOKORO_MODEL", "models/kokoro-v1.0.int8.onnx")
KOKORO_VOICES = os.getenv("KOKORO_VOICES", "models/voices-v1.0.bin")

print(f"Loading Kokoro model from {KOKORO_MODEL}...", flush=True)
try:
    kokoro = Kokoro(KOKORO_MODEL, KOKORO_VOICES)
    print("Kokoro model loaded successfully!", flush=True)
except Exception as e:
    print(f"Error loading Kokoro model: {e}", flush=True)
    kokoro = None

class TTSRequest(BaseModel):
    text: str
    voice: str = "pf_dora" # default portuguese female voice
    speed: float = 1.0

@app.get("/health")
async def health_check():
    return {"status": "ok", "model_loaded": kokoro is not None}

@app.post("/tts")
async def generate_tts(req: TTSRequest):
    if kokoro is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    start_time = time.time()
    try:
        # Use create_stream to process one sentence at a time (reduces peak memory for 512MB limits)
        stream = kokoro.create_stream(
            req.text,
            voice=req.voice,
            speed=req.speed,
            lang="pt-br"
        )
        
        all_samples = []
        sample_rate = 24000
        for samples, sr in stream:
            all_samples.append(samples)
            sample_rate = sr
            
        if not all_samples:
            raise ValueError("No audio generated (empty text or phonemization failed)")
            
        import numpy as np
        final_samples = np.concatenate(all_samples)
        
        buffer = io.BytesIO()
        sf.write(buffer, final_samples, sample_rate, format='WAV')
        buffer.seek(0)
        
        duration = time.time() - start_time
        return StreamingResponse(
            buffer, 
            media_type="audio/wav",
            headers={"X-Generation-Time": f"{duration:.3f}"}
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
