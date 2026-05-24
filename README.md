# Spell TTS API

API REST de Text-to-Speech em português brasileiro, powered by **Piper TTS** — 100% local, CPU-only, sem GPU, otimizada para Render Free Plan.

---

## Guia para IA — Integração no Projeto Principal

> Esta seção foi escrita para assistentes de IA (Claude, GPT, Gemini, etc.) que precisam integrar esta API em outro projeto. Leia inteiro antes de gerar código.

### O que esta API faz

Recebe texto em português, retorna arquivo de áudio WAV com a fala sintetizada. Tem cache automático por SHA-256 — textos repetidos retornam instantaneamente.

### Base URL

```
Desenvolvimento local : http://localhost:3000
Produção (Render)     : https://<seu-servico>.onrender.com
```

Defina sempre via variável de ambiente no projeto principal:
```
TTS_API_URL=https://<seu-servico>.onrender.com
```

---

### Endpoints

#### `POST /tts` — Sintetizar fala

```
POST /tts
Content-Type: application/json
```

**Body:**

```json
{
  "text": "Olá, bem-vindo ao sistema.",
  "voice": "pt_BR-edresson-low",
  "speed": 1.0
}
```

| Campo   | Tipo   | Obrigatório | Padrão                 | Descrição                        |
|---------|--------|-------------|------------------------|----------------------------------|
| `text`  | string | ✅ sim      | —                      | Texto a sintetizar (máx 1000 chars no Render Free) |
| `voice` | string | não         | `pt_BR-edresson-low`   | ID da voz (ver tabela abaixo)    |
| `speed` | number | não         | `1.0`                  | Velocidade: 0.5 (lento) a 2.0 (rápido) |

**Resposta de sucesso:**

```
HTTP 200
Content-Type: audio/wav
X-Cache: HIT | MISS
X-Generation-Time: 1.234
X-Audio-Duration: 2.800
```

O body é o arquivo WAV binário diretamente — não é JSON.

**Resposta de erro:**

```json
{
  "success": false,
  "error": "Validation Error",
  "message": "text: String must contain at most 1000 character(s)",
  "statusCode": 422,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

#### `GET /voices` — Listar vozes disponíveis

```
GET /voices
```

**Resposta:**

```json
{
  "success": true,
  "data": [
    {
      "id": "pt_BR-edresson-low",
      "name": "Edresson",
      "language": "pt-BR",
      "gender": "male",
      "description": "Voz masculina brasileira — leve e rápida"
    },
    {
      "id": "pt_BR-faber-medium",
      "name": "Faber",
      "language": "pt-BR",
      "gender": "male",
      "description": "Voz masculina brasileira — qualidade média"
    },
    {
      "id": "pt_BR-coqui-medium",
      "name": "Coqui",
      "language": "pt-BR",
      "gender": "female",
      "description": "Voz feminina brasileira — qualidade média"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Vozes disponíveis:**

| ID                     | Nome     | Gênero   | Qualidade | Tamanho modelo |
|------------------------|----------|----------|-----------|----------------|
| `pt_BR-edresson-low`   | Edresson | masculino | leve      | ~28 MB         |
| `pt_BR-faber-medium`   | Faber    | masculino | média     | ~60 MB         |
| `pt_BR-coqui-medium`   | Coqui    | feminino  | média     | ~60 MB         |

> A voz disponível em produção depende do `PIPER_VOICES` configurado no Render. Por padrão é `pt_BR-edresson-low`. Sempre verifique via `GET /voices` antes de usar um ID fixo no código.

---

#### `GET /health` — Status da API

```
GET /health
```

**Resposta:**

```json
{
  "status": "ok",
  "uptime": 120,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "pythonWorker": "ready",
  "cache": { "files": 12, "sizeMb": 4.2 },
  "memory": { "usedMb": 380, "totalMb": 512, "percentage": 74 }
}
```

| `status`         | Significado                                              |
|------------------|----------------------------------------------------------|
| `ok`             | API e worker Python prontos                              |
| `warming`        | Worker ainda carregando modelo (normal no cold start)    |
| `degraded`       | Worker com problema, API ainda responde                  |
| `error`          | Falha crítica (HTTP 503)                                 |

---

### Exemplos de código prontos para copiar

#### TypeScript / Node.js

```typescript
const TTS_API_URL = process.env.TTS_API_URL ?? 'http://localhost:3000';

/**
 * Sintetiza texto e retorna Buffer com o áudio WAV.
 * Lança erro se a API retornar status != 200.
 */
async function synthesize(
  text: string,
  voice = 'pt_BR-edresson-low',
  speed = 1.0,
): Promise<Buffer> {
  const res = await fetch(`${TTS_API_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice, speed }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`TTS error ${res.status}: ${(err as any).message ?? res.statusText}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// Salvar em arquivo
import fs from 'fs/promises';
const audio = await synthesize('Bem-vindo ao sistema!');
await fs.writeFile('output.wav', audio);

// Servir diretamente no Express
app.get('/audio', async (req, res) => {
  const audio = await synthesize('Olá!');
  res.setHeader('Content-Type', 'audio/wav');
  res.send(audio);
});
```

#### Python

```python
import os
import requests

TTS_API_URL = os.environ.get('TTS_API_URL', 'http://localhost:3000')

def synthesize(text: str, voice: str = 'pt_BR-edresson-low', speed: float = 1.0) -> bytes:
    """Retorna bytes do WAV gerado."""
    r = requests.post(
        f'{TTS_API_URL}/tts',
        json={'text': text, 'voice': voice, 'speed': speed},
        timeout=90,
    )
    r.raise_for_status()
    return r.content

# Salvar em arquivo
audio = synthesize('Bem-vindo ao sistema!')
with open('output.wav', 'wb') as f:
    f.write(audio)
```

#### curl

```bash
# Gerar e salvar
curl -s -X POST "$TTS_API_URL/tts" \
  -H "Content-Type: application/json" \
  -d '{"text":"Olá, tudo bem?","voice":"pt_BR-edresson-low"}' \
  -o output.wav

# Checar cache (header X-Cache)
curl -sI -X POST "$TTS_API_URL/tts" \
  -H "Content-Type: application/json" \
  -d '{"text":"Teste","voice":"pt_BR-edresson-low"}' \
  | grep -i x-cache
```

---

### Comportamento do cache

A API usa SHA-256 de `text + voice + speed` como chave. Mesmo texto + mesma voz + mesma velocidade **sempre retorna o WAV em cache** (~30–80ms), sem chamar o modelo novamente.

Implique: **não há custo de geração para frases repetidas**. Ideal para notificações fixas, mensagens de sistema, respostas padronizadas.

---

### Latência esperada (Render Free Plan)

| Situação | Tempo |
|---|---|
| Cache HIT (frase já gerada) | ~30–80ms |
| Cache MISS, serviço quente | ~1–3s |
| Cold start (15 min sem uso) | ~15–25s na primeira chamada |

**Como mitigar cold start no produto:** chame `GET /health` quando o usuário abrir o app. Isso acorda o serviço enquanto o usuário ainda está navegando.

```typescript
// Fazer warm-up silencioso ao carregar o app
fetch(`${TTS_API_URL}/health`).catch(() => {});
```

---

### Rate limiting

- Endpoint `/tts`: 10 req / 60s por IP
- Demais endpoints: 30 req / 60s por IP

Resposta ao exceder:
```json
{ "success": false, "error": "Too Many Requests", "statusCode": 429 }
```

---

### Tratamento de erros recomendado

```typescript
async function synthesizeWithRetry(text: string, retries = 2): Promise<Buffer> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await synthesize(text);
    } catch (err: any) {
      // Não tentar novamente em erros de validação (4xx)
      if (err.message?.includes('422') || err.message?.includes('400')) throw err;
      if (i === retries) throw err;
      // Aguardar antes de tentar novamente (cold start ou timeout)
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}
```

---

### O que NÃO fazer

```typescript
// ❌ Não concatenar textos longos numa única chamada
synthesize(longTextWith5000chars); // Vai falhar (limite 1000 chars no Render Free)

// ✅ Dividir em sentenças
for (const sentence of sentences) {
  await synthesize(sentence);
}

// ❌ Não assumir que uma voz está disponível sem verificar
synthesize('Olá', 'pt_BR-coqui-medium'); // Só funciona se estiver no PIPER_VOICES do deploy

// ✅ Verificar vozes disponíveis ou usar apenas a voz padrão
const voices = await fetch(`${TTS_API_URL}/voices`).then(r => r.json());

// ❌ Não fazer chamadas síncronas em sequência quando podem ser paralelas
const a = await synthesize('Frase um');
const b = await synthesize('Frase dois'); // Aguarda a terminar antes de começar b

// ✅ Paralelizar quando o texto não depende da ordem de geração
const [a, b] = await Promise.all([synthesize('Frase um'), synthesize('Frase dois')]);
```

---

### Variáveis de ambiente necessárias no projeto principal

```env
# URL da API TTS (obrigatório)
TTS_API_URL=https://<seu-servico>.onrender.com

# Voz padrão (opcional, usar se quiser fixar no cliente)
TTS_DEFAULT_VOICE=pt_BR-edresson-low

# Timeout para chamadas à API em ms (opcional)
TTS_TIMEOUT_MS=90000
```

---

## Instalação e execução

### Desenvolvimento local (sem Docker)

```bash
# 1. Instalar deps Node.js
cd apps/api && npm install && cd ../..

# 2. Instalar deps Python
pip install -r services/tts-engine/requirements.txt

# 3. Baixar modelo Piper (~28 MB)
python3 services/tts-engine/generate.py --download-models

# 4. Copiar env
cp .env.example .env

# 5. Iniciar
cd apps/api && npm run dev
```

### Docker

```bash
# Build (baixa modelo durante o build)
docker build -t spell-tts-api .

# Run
docker compose up --build

# Build com voz de melhor qualidade
docker build --build-arg PIPER_VOICES=pt_BR-faber-medium -t spell-tts-api .
```

### Deploy Render.com

1. Push para GitHub
2. New Web Service → conectar repo
3. Render detecta `render.yaml` automaticamente ��� Deploy

---

## Arquitetura

```
Cliente
  │
  ▼ HTTP REST (Express + TypeScript)
┌─────────────────────────────────┐
│  Helmet / CORS / Rate Limiter   │
│  Zod Validator                  │
│  Cache Service (SHA-256)        │
│  Python Worker Service (IPC)    │
└──────────────┬──────────────────┘
               │ stdin/stdout JSON (newline-delimited)
               ▼
       ┌───────────────┐
       │ generate.py   │  ← processo persistente
       │ Piper TTS     │  ← modelo carregado uma vez
       │ wave / atomic │  ← escrita atômica no disco
       └───────┬───────┘
               │
               ▼
        models/piper/*.onnx
        cache/*.wav  ──► HTTP response (audio/wav)
```

---

## Estrutura do projeto

```
spell_tts_api/
├── apps/api/src/
│   ├── config/index.ts          # Toda configuração via env vars
│   ├── types/index.ts           # Tipos TypeScript compartilhados
│   ├── utils/logger.ts          # Winston estruturado
│   ├── utils/hash.ts            # SHA-256 para cache
│   ├── services/
│   │   ├── python-worker.service.ts  # IPC com generate.py
│   │   ├── cache.service.ts          # Gerenciamento do cache WAV
│   │   ├── cleanup.service.ts        # Eviction automática
│   │   └── tts.service.ts            # Orquestração
│   ├── middlewares/
│   │   ├── error-handler.ts
│   │   ├── rate-limiter.ts
│   │   └── validator.ts
│   ├── controllers/             # tts / voices / health
│   ├── routes/                  # tts / voices / health
│   └── server.ts                # Bootstrap
│
├── services/tts-engine/
│   ├── generate.py              # Worker Piper (IPC persistente)
│   ├── voices.py                # Definição das vozes
│   └── requirements.txt
│
├── docker/download_models.py    # Script de download (build-time)
├── Dockerfile                   # Multi-stage
├── docker-compose.yml
├── render.yaml
└── .env.example
```

---

## Variáveis de ambiente da API

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `PIPER_VOICES` | `pt_BR-edresson-low` | Vozes a carregar (comma-separated) |
| `DEFAULT_VOICE` | `pt_BR-edresson-low` | Voz padrão |
| `DEFAULT_SPEED` | `1.0` | Velocidade padrão |
| `MAX_TEXT_LENGTH` | `2000` | Máximo de caracteres por request |
| `RATE_LIMIT_MAX` | `30` | Requests por janela |
| `CACHE_MAX_AGE_HOURS` | `12` | Expiração do cache |
| `MAX_CACHE_SIZE_MB` | `300` | Tamanho máximo do cache |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `CORS_ORIGINS` | `*` | Origins permitidas |

---

## Troubleshooting

**Modelo não encontrado:**
```bash
python3 services/tts-engine/generate.py --download-models
```

**Cold start lento (~20s):** Normal no Render Free. Fazer warm-up chamando `/health` ao iniciar o cliente.

**Erro 422 no texto:** Verificar tamanho (`MAX_TEXT_LENGTH=1000` no Render Free).

**Voz não disponível:** Verificar se `PIPER_VOICES` no Render inclui a voz desejada. Confirmar via `GET /voices`.
