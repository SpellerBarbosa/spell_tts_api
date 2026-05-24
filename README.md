# Spell TTS API (Kokoro ONNX)

Uma API de Text-to-Speech (TTS) otimizada e de alta performance, construída com FastAPI e executando o modelo **Kokoro ONNX Quantizado (int8)**. Projetada para rodar de forma extremamente eficiente, com consumo de memória inferior a 512MB (ideal para instâncias gratuitas no Render), mantendo uma síntese de voz natural em Português do Brasil.

## Principais Funcionalidades
- **Modelo Leve:** Utiliza uma versão quantizada (int8) do Kokoro, pesando em torno de 88MB.
- **Processamento Assíncrono com HTTP Streaming:** Retorna o áudio em tempo real sob demanda. A conexão não sofre timeout no Render e o áudio pode ser reproduzido enquanto ainda está sendo gerado.
- **Controle de Threads:** ONNX runtime otimizado para não estourar os limites da CPU.
- **Fonetização Avançada:** Usa `misaki[pt]` para mapear as peculiaridades de pronúncia e acentuação no Português do Brasil.

## Como Usar a API

A API está exposta em uma rota `POST /tts`.
O corpo da requisição deve ser enviado em JSON, e a resposta será um fluxo (stream) binário `audio/wav`.

### Endpoint
`POST https://spell-tts-api.onrender.com/tts`

### Headers Opcionais
Nenhum token é necessário para chamadas diretas.
Apenas não se esqueça de usar: `Content-Type: application/json`

### Exemplo de Payload JSON
```json
{
  "text": "Olá! Bem-vindo à nova API de voz otimizada com Kokoro.",
  "voice": "pf_dora",
  "speed": 1.0
}
```
* **`text`**: O texto que você deseja converter para áudio. Suporta pontuações longas.
* **`voice`**: A voz desejada (padrão: `pf_dora`, voz nativa treinada para português brasileiro).
* **`speed`**: A velocidade da fala (padrão: `1.0`).

### Exemplo via cURL
```bash
curl -N -X POST "https://spell-tts-api.onrender.com/tts" \
  -H "Content-Type: application/json" \
  -d '{"text":"Olá! Bem-vindo à nova API de voz otimizada com Kokoro.","voice":"pf_dora"}' \
  --output resposta.wav
```
*(A flag `-N` instrui o curl a não segurar a resposta no buffer, permitindo o recebimento em stream)*

---

## Guia para Implementação (Para IAs e Agentes Autônomos)

Se você é uma IA encarregada de integrar esta API em um projeto (seja um Web App, um Bot do Discord, ou um sistema Back-end), leia estas instruções cuidadosamente para tirar proveito da arquitetura de Streaming da API.

### 1. Entendendo o Comportamento do Streaming
Esta API usa **True HTTP Chunked Streaming**. O servidor começará a enviar a resposta com HTTP Status `200` quase imediatamente após processar a primeira sentença, sem esperar o texto completo terminar.
- **O que isso significa:** Em aplicações Web (Front-end), você pode alimentar o `src` de uma tag `<audio>` com um `URL.createObjectURL(blob)` ou diretamente manipular o ReadableStream usando a Web Audio API para tocar o áudio instantaneamente. Não espere a request fechar para tocar o áudio, pois isso causaria lentidão desnecessária na UX.

### 2. Tratamento de Erros e Timeouts
- Como a API roda no Tier Gratuito do Render, ela **adormece** se ficar inativa por mais de 15 minutos.
- O **primeiro request** após um tempo de inatividade pode demorar de 30 a 60 segundos enquanto o container liga. Seu código deve prever um `timeout` de rede estendido (recomenda-se no mínimo 90 segundos de timeout para a inicialização da conexão) ao fazer a primeira chamada, bem como implementar a habilidade de apresentar feedback de "carregamento" ou "acordando o servidor" para o usuário.

### 3. Exemplo de Integração Frontend (JavaScript / Fetch)
Use este template para integrar com Node.js ou em um navegador (Browser Fetch API):

```javascript
async function fetchAndPlayTTS(textToSpeak) {
  const url = "https://spell-tts-api.onrender.com/tts";
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: textToSpeak,
        voice: "pf_dora",
        speed: 1.0
      })
    });

    if (!response.ok) {
      throw new Error(`Erro na API: ${response.status} - ${response.statusText}`);
    }

    // Para aplicações mais simples, gerar um blob do stream recebido:
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const audioPlayer = new Audio(audioUrl);
    audioPlayer.play();

    /* 
    Nota Avançada: Para aproveitar o Streaming Real e tocar enquanto baixa, 
    use MediaSource Extensions (MSE) ou processe os chunks com \`response.body.getReader()\`.
    */
    
  } catch (error) {
    console.error("Falha ao sintetizar o áudio:", error);
  }
}
```

### 4. Limitações de Concorrência e Hardware
- A instância que hospeda este serviço é uma máquina muito restrita (0.1 CPU core, 512MB RAM).
- A variável `OMP_NUM_THREADS` e `MKL_NUM_THREADS` estão limitadas a `1` por design para evitar OOM (Out of Memory).
- Se o seu sistema tiver alta volumetria de requisições simultâneas, você deve criar uma fila (Queue) no seu projeto para processar os pedidos um a um de forma serializada, ou hospedar uma cópia desta API em um servidor robusto para paralelismo.
