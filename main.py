import io
import os
import time
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import numpy as np
import struct
import inspect
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
    voice: str = "pf_dora"
    speed: float = 1.0

def generate_wav_header(sample_rate=24000):
    header = b'RIFF'
    header += struct.pack('<I', 0xFFFFFFFF)
    header += b'WAVEfmt '
    header += struct.pack('<I', 16)
    header += struct.pack('<H', 1)
    header += struct.pack('<H', 1)
    header += struct.pack('<I', sample_rate)
    header += struct.pack('<I', sample_rate * 2)
    header += struct.pack('<H', 2)
    header += struct.pack('<H', 16)
    header += b'data'
    header += struct.pack('<I', 0xFFFFFFFF)
    return header

@app.get("/health")
async def health_check():
    return {"status": "ok", "model_loaded": kokoro is not None}

@app.post("/tts")
async def generate_tts(req: TTSRequest):
    if kokoro is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    async def audio_streamer():
        yield generate_wav_header(24000)
        try:
            stream = kokoro.create_stream(req.text, voice=req.voice, speed=req.speed, lang="pt-br")
            if inspect.isasyncgen(stream):
                async for samples, sr in stream:
                    pcm = (samples * 32767).astype(np.int16).tobytes()
                    yield pcm
            else:
                for samples, sr in stream:
                    pcm = (samples * 32767).astype(np.int16).tobytes()
                    yield pcm
        except Exception as e:
            print(f"Streaming error: {e}", flush=True)
            
    return StreamingResponse(audio_streamer(), media_type="audio/wav")
