#!/usr/bin/env python3
"""
Piper TTS Worker — pt-BR.

IPC Protocol (newline-delimited JSON):
  stdin  ← requests from Node.js
  stdout → responses to Node.js
  stderr → structured log entries (JSON)

Request types:
  {"id": "...", "type": "ping"}
  {"id": "...", "type": "generate", "text": "...", "voice": "...", "speed": 1.0, "outputPath": "..."}
  {"id": "...", "type": "voices"}

Response types:
  {"type": "ready"}
  {"id": "...", "type": "pong"}
  {"id": "...", "type": "result", "success": true,  "path": "...", "generation_time": 1.2, "audio_duration": 3.5}
  {"id": "...", "type": "result", "success": false, "error": "..."}
  {"id": "...", "type": "voices", "voices": [...]}
  {"id": "...", "type": "error",  "error": "..."}
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
import time
import wave
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

MODELS_DIR       = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "models"))
PIPER_MODELS_DIR = os.path.join(MODELS_DIR, "piper")
PIPER_VOICES_ENV = os.environ.get("PIPER_VOICES", "pt_BR-edresson-low")
PIPER_HF_BASE    = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"

# Set ESPEAK_DATA_PATH BEFORE piper_phonemize is ever imported.
# The C extension calls espeak_Initialize() at load time; if the env var
# isn't set yet the compiled-in default path may not exist in the image,
# causing espeak to silently return zero phonemes for every utterance.
import importlib.util as _ilu
_espeak_paths = [
    "/usr/lib/x86_64-linux-gnu/espeak-ng-data",
    "/usr/lib/aarch64-linux-gnu/espeak-ng-data",
    "/usr/share/espeak-ng-data",
    "/usr/local/share/espeak-ng-data"
]
_spec = _ilu.find_spec("piper_phonemize")
if _spec:
    if _spec.submodule_search_locations:
        _espeak_paths.insert(0, os.path.join(list(_spec.submodule_search_locations)[0], "espeak-ng-data"))
    elif _spec.origin:
        _dir = os.path.dirname(_spec.origin)
        _espeak_paths.insert(0, os.path.join(_dir, "piper_phonemize", "espeak-ng-data"))
        _espeak_paths.insert(0, os.path.join(_dir, "espeak-ng-data"))

for _p in _espeak_paths:
    if os.path.isdir(_p):
        os.environ.setdefault("ESPEAK_DATA_PATH", _p)
        break

# ---------------------------------------------------------------------------
# Logging & IPC
# ---------------------------------------------------------------------------


def log(message: str, level: str = "INFO", **extra: Any) -> None:
    entry: Dict[str, Any] = {"timestamp": time.time(), "level": level, "source": "tts-worker", "message": message}
    entry.update(extra)
    sys.stderr.write(json.dumps(entry) + "\n")
    sys.stderr.flush()


def send(data: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(data) + "\n")
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Model management
# ---------------------------------------------------------------------------


def _voice_list() -> List[str]:
    return [v.strip() for v in PIPER_VOICES_ENV.split(",") if v.strip()]


def _hf_path(voice_name: str) -> str:
    """pt_BR-faber-medium  →  pt/pt_BR/faber/medium"""
    parts = voice_name.split("-")
    if len(parts) < 3:
        raise ValueError(f"Cannot parse voice name: {voice_name!r}")
    lang_region = parts[0]
    lang        = lang_region.split("_")[0].lower()
    return f"{lang}/{lang_region}/{parts[1]}/{parts[2]}"


def check_models() -> None:
    os.makedirs(PIPER_MODELS_DIR, exist_ok=True)
    missing = []
    for voice_name in _voice_list():
        path = os.path.join(PIPER_MODELS_DIR, f"{voice_name}.onnx")
        if not os.path.exists(path):
            missing.append(path)
    if missing:
        raise FileNotFoundError(
            "Piper model files not found:\n"
            + "\n".join(f"  - {p}" for p in missing)
            + "\n\nFix: python generate.py --download-models"
        )


def download_models() -> None:
    import urllib.request
    os.makedirs(PIPER_MODELS_DIR, exist_ok=True)
    for voice_name in _voice_list():
        try:
            hf_path = _hf_path(voice_name)
        except ValueError as exc:
            log(str(exc), "WARN")
            continue
        for ext in (".onnx", ".onnx.json"):
            filename = f"{voice_name}{ext}"
            dest = os.path.join(PIPER_MODELS_DIR, filename)
            if os.path.exists(dest):
                log(f"{filename} already present, skipping")
                continue
            url = f"{PIPER_HF_BASE}/{hf_path}/{filename}"
            log(f"Downloading {filename}...", url=url)
            tmp = dest + ".tmp"
            try:
                urllib.request.urlretrieve(url, tmp)
                os.replace(tmp, dest)
                log(f"  {filename}: {os.path.getsize(dest)/1e6:.2f} MB")
            except Exception as exc:
                if os.path.exists(tmp):
                    os.unlink(tmp)
                raise RuntimeError(f"Failed to download {filename}: {exc}") from exc


# ---------------------------------------------------------------------------
# Engine init
# ---------------------------------------------------------------------------


def load_voices() -> Dict[str, Any]:
    from piper.voice import PiperVoice

    loaded: Dict[str, Any] = {}
    for voice_name in _voice_list():
        model_path  = os.path.join(PIPER_MODELS_DIR, f"{voice_name}.onnx")
        config_path = os.path.join(PIPER_MODELS_DIR, f"{voice_name}.onnx.json")
        if not os.path.exists(model_path):
            log(f"Model not found for {voice_name}, skipping", "WARN")
            continue
        t0 = time.time()
        log(f"Loading {voice_name}...")
        try:
            loaded[voice_name] = PiperVoice.load(model_path, config_path=config_path, use_cuda=False)
            log(f"{voice_name} ready in {time.time()-t0:.2f}s")
        except Exception as exc:
            log(f"Failed to load {voice_name}: {exc}", "ERROR")
    return loaded


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


def generate(piper_voice: Any, text: str, speed: float, output_path: str) -> Dict[str, Any]:
    t0 = time.time()
    try:
        length_scale = round(1.0 / max(speed, 0.1), 4)
        out_dir = os.path.dirname(os.path.abspath(output_path))
        os.makedirs(out_dir, exist_ok=True)

        sample_rate = piper_voice.config.sample_rate

        # length_scale lives on the config, not as a synthesize() kwarg
        piper_voice.config.length_scale = length_scale

        espeak_voice = getattr(piper_voice.config, "espeak_voice", "?")
        log(f"Synthesizing: espeak_voice={espeak_voice!r} sample_rate={sample_rate} length_scale={length_scale}")

        # Write WAV atomically — pre-set params (installed version doesn't set them)
        fd, tmp_path = tempfile.mkstemp(suffix=".wav", dir=out_dir)
        os.close(fd)
        try:
            with wave.open(tmp_path, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit PCM
                wf.setframerate(sample_rate)
                piper_voice.synthesize(text, wf)
            shutil.move(tmp_path, output_path)
        except Exception:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            raise

        with wave.open(output_path, "rb") as wf:
            frames = wf.getnframes()
            audio_duration = frames / wf.getframerate()

        log(f"Done: {frames} frames, {audio_duration:.3f}s")
        if frames == 0:
            raise RuntimeError(
                f"espeak-ng produced no phonemes for voice {espeak_voice!r} — "
                f"ESPEAK_DATA_PATH={os.environ.get('ESPEAK_DATA_PATH', 'unset')!r}"
            )

        return {
            "success": True,
            "path": output_path,
            "generation_time": round(time.time() - t0, 3),
            "audio_duration":  round(audio_duration, 3),
            "sample_rate":     sample_rate,
        }
    except Exception as exc:
        log(f"Generation error: {exc}", "ERROR")
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Worker loop
# ---------------------------------------------------------------------------


def run_worker() -> None:
    check_models()

    voices = load_voices()
    if not voices:
        log("No voices loaded — exiting", "FATAL")
        sys.exit(1)

    log(f"Ready. Loaded voices: {list(voices.keys())}")
    send({"type": "ready"})

    from voices import to_dict_list

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue

        try:
            req: Dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError as exc:
            log(f"Invalid JSON: {exc}", "WARN")
            continue

        req_id: str   = req.get("id", "")
        req_type: str = req.get("type", "")

        try:
            if req_type == "ping":
                send({"id": req_id, "type": "pong"})

            elif req_type == "generate":
                voice       = req["voice"]
                text        = req["text"]
                speed       = float(req["speed"])
                output_path = req["outputPath"]

                piper_voice = voices.get(voice)
                if piper_voice is None:
                    send({
                        "id": req_id, "type": "result", "success": False,
                        "error": f"Voice '{voice}' not loaded. Available: {list(voices.keys())}",
                    })
                else:
                    result = generate(piper_voice, text, speed, output_path)
                    send({"id": req_id, "type": "result", **result})

            elif req_type == "voices":
                send({"id": req_id, "type": "voices", "voices": to_dict_list()})

            else:
                send({"id": req_id, "type": "error", "error": f"Unknown type: {req_type!r}"})

        except KeyError as exc:
            send({"id": req_id, "type": "error", "error": f"Missing field: {exc}"})
        except Exception as exc:
            log(f"Request {req_id} failed: {exc}", "ERROR")
            send({"id": req_id, "type": "error", "error": str(exc)})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Piper TTS Worker")
    parser.add_argument("--download-models", action="store_true", help="Download model files and exit")
    args = parser.parse_args()

    if args.download_models:
        download_models()
        log("Models downloaded")
        sys.exit(0)

    try:
        run_worker()
    except KeyboardInterrupt:
        log("Worker shutting down")
        sys.exit(0)
    except Exception as exc:
        log(f"Fatal error: {exc}", "FATAL")
        sys.exit(1)
