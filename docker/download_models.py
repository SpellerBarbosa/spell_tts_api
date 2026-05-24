"""
Downloads Piper TTS models at Docker build time.
Called by Dockerfile Stage 1 — never runs at container runtime.

Environment variables:
  PIPER_VOICES  — comma-separated voice names, e.g. pt_BR-edresson-low
"""

import os
import time
import urllib.request

PIPER_DIR  = "/build/models/piper"
PIPER_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"

os.makedirs(PIPER_DIR, exist_ok=True)


def fetch(url: str, dest: str) -> None:
    tmp = dest + ".tmp"
    urllib.request.urlretrieve(url, tmp)
    os.replace(tmp, dest)
    print(f"  OK  {os.path.basename(dest)}  ({os.path.getsize(dest)/1e6:.1f} MB)", flush=True)


piper_voices_env = os.environ.get("PIPER_VOICES", "")
voice_names = [v.strip() for v in piper_voices_env.split(",") if v.strip()]

if not voice_names:
    print("PIPER_VOICES not set — nothing to download", flush=True)
else:
    print(f"\n[Piper] downloading: {voice_names}", flush=True)
    t0 = time.time()

    for voice_name in voice_names:
        parts = voice_name.split("-")
        if len(parts) < 3:
            print(f"  SKIP {voice_name}: cannot parse name", flush=True)
            continue

        lang_region = parts[0]
        lang        = lang_region.split("_")[0].lower()
        speaker     = parts[1]
        quality     = parts[2]
        hf_path     = f"{lang}/{lang_region}/{speaker}/{quality}"

        for ext in (".onnx", ".onnx.json"):
            filename = f"{voice_name}{ext}"
            dest = os.path.join(PIPER_DIR, filename)
            if os.path.exists(dest):
                print(f"  SKIP {filename} (already present)", flush=True)
                continue
            fetch(f"{PIPER_BASE}/{hf_path}/{filename}", dest)

    print(f"\n[Piper] done in {time.time()-t0:.1f}s", flush=True)

print("\nAll models ready.", flush=True)
