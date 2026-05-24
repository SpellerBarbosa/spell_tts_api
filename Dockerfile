FROM python:3.11-slim

WORKDIR /app

# Install espeak-ng for phonemization and curl for healthchecks
RUN apt-get update && \
    apt-get install -y --no-install-recommends espeak-ng curl && \
    rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download Kokoro ONNX model and voices at build time
COPY download_kokoro.py .
RUN python download_kokoro.py

# Copy the rest of the application
COPY main.py .

EXPOSE 10000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "10000"]
