import os
import urllib.request

def download_file(url, dest):
    if not os.path.exists(dest):
        print(f"Downloading {url} to {dest}...", flush=True)
        urllib.request.urlretrieve(url, dest)
        print("Done.", flush=True)
    else:
        print(f"{dest} already exists.", flush=True)

if __name__ == "__main__":
    os.makedirs("models", exist_ok=True)
    download_file("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx", "models/kokoro-v1.0.int8.onnx")
    download_file("https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin", "models/voices-v1.0.bin")
