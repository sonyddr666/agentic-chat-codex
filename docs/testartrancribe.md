# Testar Transcribe no Agentic Chat Codex

Este documento consolida tudo que foi pesquisado e discutido sobre transcricao de voz no ecossistema Codex, especialmente a suspeita de que o Codex CLI e possivelmente o Codex app Windows usam a autenticacao ChatGPT/Codex para chamar um endpoint interno de transcricao.

> Observacao: o nome do arquivo segue o pedido original: `testartrancribe.md`.

---

## 1. Conclusao principal

A conclusao mais importante e:

> O Codex provavelmente nao "ouve" audio diretamente no modelo de coding. A voz entra como uma camada separada de STT, que grava audio, transcreve para texto e depois injeta esse texto no prompt/composer.

Fluxo geral:

```text
Usuario fala
  -> app/CLI grava audio localmente
  -> audio vai para um servico de transcricao
  -> servico retorna texto
  -> texto entra no composer/prompt
  -> Codex recebe texto normal
```

Ou seja:

```text
Voz -> STT -> Texto -> Agentic/Codex
```

Nao:

```text
Voz -> Codex ouvindo magicamente
```

Essa separacao e essencial para o Agentic, porque STT deve ser uma camada antes do roteador de modo, nao uma responsabilidade direta do provider Codex.

---

## 2. Evidencia mais forte encontrada

### 2.1 Codex CLI com ChatGPT auth tenta chamar `/backend-api/transcribe`

Issues publicas do repositório `openai/codex` mostram usuarios no Windows usando Codex CLI com `voice_transcription=true` e login via ChatGPT. Ao soltar a tecla de push-to-talk, a CLI tenta chamar:

```text
https://chatgpt.com/backend-api/transcribe
```

E alguns usuarios recebem `403 Forbidden` / challenge Cloudflare.

Referencias:

- https://github.com/openai/codex/issues/12833
- https://github.com/openai/codex/issues/13132

Essas issues sao importantes porque mostram explicitamente:

```text
Login: ChatGPT
voice_transcription=true
endpoint: /backend-api/transcribe
erro: 403 / Cloudflare
```

Isso sugere fortemente que, quando a CLI esta autenticada via ChatGPT, ela usa a sessao/auth ChatGPT/Codex para acessar um endpoint interno de transcricao.

---

### 2.2 Artigo tecnico sobre Codex CLI voice input

Um artigo tecnico analisando a feature de voz do Codex CLI descreve dois caminhos de transcricao:

```text
API key auth:
  /v1/audio/transcriptions
  modelo: gpt-4o-transcribe

ChatGPT auth:
  /backend-api/transcribe
```

Referencia:

- https://zenn.dev/schroneko/articles/codex-cli-voice-input

O artigo tambem menciona que a feature `voice_transcription` entrou na CLI em versoes recentes e usa uma experiencia do tipo push-to-talk:

```text
segurar espaco -> falar -> soltar -> transcrever -> texto entra no prompt
```

A leitura tecnica mencionada no artigo aponta para gravacao local e envio de audio para transcricao, com escolha de endpoint dependendo do tipo de autenticacao.

---

### 2.3 OpenAI Audio API oficial

A rota oficial e documentada de STT da OpenAI e a Audio Transcriptions API.

Referencia:

- https://platform.openai.com/docs/guides/speech-to-text

Modelos relevantes citados na documentacao publica:

```text
gpt-4o-transcribe
gpt-4o-mini-transcribe
gpt-4o-transcribe-diarize
```

Formatos aceitos incluem audio comum como:

```text
mp3, mp4, mpeg, mpga, m4a, wav, webm
```

Para o Agentic, esta deve ser a rota padrao estavel, porque e contrato publico.

---

### 2.4 Realtime transcription oficial

A OpenAI tambem documenta transcricao em tempo real via Realtime API.

Referencia:

- https://platform.openai.com/docs/guides/realtime-transcription

Esse caminho e diferente do push-to-talk simples. Ele permite:

```text
WebRTC/WebSocket
streaming de audio
VAD/server turn detection
transcricao incremental
transcription delta
transcription completed
```

Para o Agentic, isso e ideal para um futuro `live mode`, mas nao precisa ser a primeira implementacao.

---

### 2.5 Reddit e foruns

Threads publicas no Reddit sobre Codex CLI e Codex app Windows sugerem que voz/transcricao esta aparecendo como feature integrada, mas nao encontrei prova publica completa do request exato do app Windows com headers e payload.

Referencias uteis:

- https://www.reddit.com/r/codex/comments/1rf0ktu/how_to_use_the_new_transcribe_voice_in_codex_cli/
- https://www.reddit.com/r/codex/comments/1rfeee7/psa_voice_transcription_is_now_tui_native/
- https://www.reddit.com/r/codex/comments/1qukcqh/codex_app_on_windows/

Leitura honesta:

```text
Codex CLI:
  evidencia forte de /backend-api/transcribe com ChatGPT auth.

Codex Windows app:
  muito provavel que use uma familia parecida de auth/endpoints,
  mas nao ha prova publica direta do request completo do app.
```

---

## 3. Hipotese mais provavel para o Codex app Windows

O fluxo provavel do app Windows e:

```text
Codex Windows app
  -> usuario aperta microfone / atalho de ditado
  -> app grava audio localmente
  -> app envia audio para camada de STT
  -> request usa sessao/auth ChatGPT/Codex
  -> recebe texto transcrito
  -> texto entra no composer
  -> agent Codex recebe texto
```

O ponto principal:

> Mesmo que o app Windows use auth Codex/ChatGPT para transcrever, isso nao significa que o modelo Codex esteja recebendo audio. A transcricao acontece antes.

---

## 4. Dois caminhos de STT que precisamos suportar

### 4.1 Caminho oficial e estavel

Usar OpenAI Audio API.

```text
Browser/App grava audio
  -> POST /api/stt/transcribe no Agentic
  -> backend chama /v1/audio/transcriptions
  -> retorna texto
  -> composer recebe texto
```

Vantagens:

- API publica
- documentada
- mais estavel
- menos risco de Cloudflare
- facil de debugar
- compativel com deploy comum

Desvantagens:

- exige API key ou credencial oficial de API
- pode ter custo separado
- nao usa necessariamente beneficios da sessao ChatGPT do usuario

---

### 4.2 Caminho experimental com backend ChatGPT/Codex

Tentar usar:

```text
https://chatgpt.com/backend-api/transcribe
```

com auth/sessao ChatGPT/Codex.

Vantagens:

- mais parecido com o fluxo do Codex CLI autenticado via ChatGPT
- pode aproveitar a mesma familia de auth do backend Codex
- interessante para testar integracao profunda

Desvantagens:

- endpoint interno
- sem contrato publico
- pode mudar sem aviso
- pode falhar por Cloudflare
- pode exigir headers/origin/user-agent especificos
- pode funcionar na CLI oficial e falhar fora dela
- precisa fallback obrigatorio

Esse modo deve ser tratado como experimental.

---

### 4.3 Fallback browser/sistema

Fallback possivel:

```text
Web Speech API
Windows dictation
macOS dictation
```

Vantagens:

- pode funcionar sem backend STT
- util em emergencia
- baixa complexidade no servidor

Desvantagens:

- qualidade irregular
- suporte inconsistente por navegador
- controle menor sobre idioma/modelo
- pior para termos tecnicos

---

## 5. Arquitetura sugerida para o Agentic

O STT deve ser um modulo separado:

```text
Voice Layer
  -> STT Provider Router
      -> openai_audio_api
      -> codex_backend_transcribe experimental
      -> browser_native fallback
  -> Transcript Normalizer
  -> Prompt Composer
  -> Mode Router
      -> Codex HTTP normal
      -> Codex CLI MCP modo coding profundo
```

Isso mantem a arquitetura limpa:

```text
STT gera texto.
Provider Codex processa texto.
TTS fala resposta.
```

Evitar isso:

```text
CodexProvider tambem grava audio, transcreve, fala, roda tool e faz cafe.
```

Isso viraria um monolito com aura de cabo embolado atras de gabinete gamer.

---

## 6. Estrutura de pastas sugerida

```text
src/lib/voice/
  recorder.ts
  media-recorder.ts
  audio-buffer.ts
  vad.ts
  transcript-client.ts
  transcript-normalizer.ts
  tts-cleaner.ts

src/lib/stt/
  stt-provider.ts
  openai-audio-stt-provider.ts
  codex-backend-stt-provider.ts
  browser-speech-provider.ts
  stt-router.ts

src/app/api/stt/
  transcribe/route.ts
  realtime-token/route.ts

src/components/voice/
  PushToTalkButton.tsx
  VoiceModeToggle.tsx
  TranscriptPreview.tsx
  MicPermissionBanner.tsx
  RecordingLevelMeter.tsx
```

---

## 7. Interface comum de STT Provider

```ts
export type SttProviderId =
  | "openai_audio_api"
  | "codex_backend_transcribe"
  | "browser_native";

export interface SttInput {
  audio: Blob | File | Buffer;
  mimeType: string;
  language?: string;
  prompt?: string;
  durationMs?: number;
}

export interface SttResult {
  text: string;
  provider: SttProviderId;
  model?: string;
  language?: string;
  durationMs?: number;
  confidence?: number;
  raw?: unknown;
}

export interface SttProvider {
  id: SttProviderId;
  label: string;
  stable: boolean;
  transcribe(input: SttInput): Promise<SttResult>;
}
```

---

## 8. Provider oficial: OpenAI Audio API

Fluxo:

```text
POST /api/stt/transcribe
  multipart/form-data:
    file: audio.webm
    provider: openai_audio_api
    language: pt
    prompt: termos tecnicos
```

Backend:

```ts
const transcript = await openai.audio.transcriptions.create({
  file,
  model: "gpt-4o-transcribe",
  language: "pt",
  prompt: "Transcreva em portugues brasileiro, preservando termos tecnicos como Codex, MCP, GitHub, repo, branch, PR, TypeScript, Next.js."
});
```

Resultado:

```json
{
  "text": "Analisa o repo e cria um plano de melhoria para o provider Codex.",
  "provider": "openai_audio_api",
  "model": "gpt-4o-transcribe"
}
```

---

## 9. Provider experimental: Codex backend transcribe

Fluxo hipotetico:

```text
POST https://chatgpt.com/backend-api/transcribe
  headers:
    Authorization/session auth ChatGPT/Codex
    cookies necessarios
    user-agent/origin/referer possivelmente importantes
  body:
    audio multipart ou formato esperado pelo endpoint
```

Pontos a descobrir por teste:

- formato exato do payload
- nome do campo do arquivo
- headers obrigatorios
- se precisa cookie alem de bearer token
- se precisa CSRF token
- se precisa origin/referer especifico
- se aceita webm ou exige wav/pcm
- se Cloudflare bloqueia fora da CLI/app oficial
- se retorna JSON simples ou evento

Riscos:

```text
403 Cloudflare
401 auth invalida
422 payload errado
mudanca de endpoint
bloqueio por user-agent/origin
```

Comportamento recomendado:

```text
se codex_backend_transcribe falhar:
  registrar erro detalhado
  marcar provider como indisponivel temporariamente
  cair automaticamente para openai_audio_api ou browser_native
```

UI:

```text
Transcricao Codex Backend: Experimental
Pode falhar com Cloudflare/403. Use Audio API para estabilidade.
```

---

## 10. Push-to-talk estilo Codex CLI

MVP recomendado:

```text
segurar botao ou tecla
  -> iniciar MediaRecorder
soltar
  -> parar gravacao
  -> enviar blob para STT
  -> mostrar preview do texto
  -> usuario confirma ou edita
```

Atalhos sugeridos:

```text
Segurar Espaco: ditar
Esc: cancelar gravacao
Ctrl+Enter: enviar transcricao
Shift+Espaco: ditado continuo
```

Importante: evitar enviar direto sem preview no inicio.

```text
Voce disse:
"corrige o provider codex e adiciona fallback store false"

[Enviar] [Editar] [Gravar de novo]
```

Isso evita o app ouvir "cria docs" e entender "apaga docs". Experiencia espiritual reversa, mas evitavel.

---

## 11. Modo live / realtime futuro

Para uma versao mais avancada:

```text
abrir sessao realtime
  -> capturar audio PCM
  -> enviar via WebRTC/WebSocket
  -> receber deltas de transcricao
  -> mostrar legenda ao vivo
  -> detectar turno por VAD
  -> enviar prompt final quando usuario parar
```

Uso:

```text
Live Mode para conversa longa
Voice coding explicando contexto
Legendas em tempo real
Ditado continuo de tarefas grandes
```

Provider possivel:

```text
OpenAI Realtime transcription
```

Referencia:

- https://platform.openai.com/docs/guides/realtime-transcription

---

## 12. Transcript Normalizer

Depois da transcricao, passar por uma limpeza leve antes de inserir no composer.

Objetivos:

- corrigir pontuacao
- preservar termos tecnicos
- nao mudar a intencao
- nao inventar conteudo
- normalizar nomes comuns do projeto

Termos para preservar:

```text
Codex
MCP
CLI
HTTP
STT
TTS
GitHub
repo
branch
commit
pull request
PR
Next.js
TypeScript
SQLite
Postgres
OpenAI
ChatGPT
backend-api/codex/responses
backend-api/transcribe
```

Exemplo:

```text
Entrada STT ruim:
"usa eme ce pe no codex cliente"

Saida normalizada:
"usa MCP no Codex CLI"
```

Mas cuidado: normalizacao nao pode virar reescrita criativa. Tem que ser conservadora.

---

## 13. Como STT encaixa nos dois modos do Agentic

O STT vem antes do Mode Router.

```text
Audio
  -> STT
  -> texto
  -> Mode Router
      -> Codex HTTP normal
      -> Codex CLI MCP modo profundo
```

Exemplos:

### Pedido simples

Usuario fala:

```text
Cria um HTML simples de uma landing page.
```

Fluxo:

```text
STT -> texto -> router escolhe Codex HTTP normal
```

Nao precisa CLI.

### Pedido complexo

Usuario fala:

```text
Analisa o repo, roda os testes, corrige o build e mostra o diff.
```

Fluxo:

```text
STT -> texto -> router escolhe Codex CLI MCP
```

Aqui entra modo coding profundo.

---

## 14. UI sugerida

### Controle de voz

```text
[Mic] Segure para falar
[Provider: OpenAI Audio API]
[Idioma: pt-BR]
```

### Seletor de provider

```text
Transcricao:
  ( ) OpenAI Audio API - estavel
  ( ) Codex Backend - experimental
  ( ) Browser Speech - fallback
```

### Status

```text
Gravando... 00:05
Enviando audio...
Transcrevendo...
Transcricao pronta
```

### Preview

```text
Texto detectado:
"Cria um modo de transcricao usando provider oficial e fallback Codex backend."

[Enviar] [Editar] [Descartar]
```

---

## 15. Logging e auditoria

Salvar metadados, nao necessariamente audio bruto.

```ts
type VoiceTranscriptLog = {
  id: string;
  threadId: string;
  runId?: string;
  provider: SttProviderId;
  model?: string;
  language?: string;
  durationMs: number;
  mimeType: string;
  text: string;
  normalizedText?: string;
  error?: string;
  createdAt: string;
};
```

Politica de privacidade local:

```text
Por padrao, nao salvar audio.
Salvar apenas texto transcrito e metadados.
Opcionalmente permitir salvar audio para debug, com opt-in claro.
```

---

## 16. Testes necessarios

### Testes unitarios

- STT router escolhe provider correto
- fallback funciona quando provider experimental falha
- normalizer preserva termos tecnicos
- upload rejeita MIME invalido
- limite de tamanho funciona
- erro 403 do Codex backend gera fallback

### Testes de integracao

- webm pequeno -> OpenAI Audio API -> texto
- wav pequeno -> OpenAI Audio API -> texto
- provider experimental retorna erro controlado
- browser fallback ativa quando backend nao esta configurado

### Testes de UX

- segurar botao inicia gravacao
- soltar envia audio
- Esc cancela
- preview aparece antes de enviar
- erro mostra mensagem legivel

---

## 17. Plano de implementacao por fases

### Fase 1: STT oficial simples

- criar `/api/stt/transcribe`
- usar OpenAI Audio API
- frontend com MediaRecorder
- push-to-talk
- preview antes de enviar
- prompt tecnico pt-BR

### Fase 2: Provider router

- adicionar interface `SttProvider`
- provider oficial
- provider browser fallback
- configuracao por usuario/projeto

### Fase 3: Codex backend experimental

- reaproveitar auth Codex/ChatGPT se disponivel
- tentar `/backend-api/transcribe`
- mapear headers/payload
- fallback automatico
- UI marcando experimental

### Fase 4: Live mode

- Realtime transcription
- VAD
- deltas parciais
- auto-send opcional
- TTS integrado

### Fase 5: Integracao profunda com modos

- STT alimenta Mode Router
- comando falado pode ativar modo CLI MCP
- UI mostra modo escolhido apos transcricao
- logs conectam transcript -> run -> tool calls

---

## 18. Perguntas abertas para investigar

1. O app Codex Windows usa exatamente `/backend-api/transcribe` ou endpoint interno diferente?
2. Qual e o formato exato do payload do `/backend-api/transcribe`?
3. Quais headers sao obrigatorios?
4. O endpoint aceita `webm` ou exige `wav/pcm`?
5. Ele exige cookies especificos alem do token usado em `/backend-api/codex/responses`?
6. O endpoint exige CSRF token?
7. O Cloudflare bloqueia chamadas fora da CLI/app oficial?
8. O Codex CLI ainda mantem `voice_transcription` nas versoes atuais ou migrou para outro fluxo?
9. `realtime_conversation` usa Realtime API publica ou endpoint interno proprio?
10. O app Windows compartilha codigo de STT com a CLI ou usa outro modulo?

---

## 19. Recomendacao final

Implementar STT no Agentic em tres camadas:

```text
1. OpenAI Audio API
   - padrao estavel
   - documentado
   - deve ser o caminho principal

2. Codex Backend Transcribe
   - experimental
   - usa auth ChatGPT/Codex se possivel
   - util para pesquisa e compatibilidade com fluxo Codex
   - sempre com fallback

3. Browser/System Dictation
   - fallback simples
   - util quando backend nao esta configurado
```

A arquitetura final deve ser:

```text
Voice Capture
  -> STT Provider Router
  -> Transcript Normalizer
  -> Prompt Composer
  -> Mode Router
  -> Codex HTTP ou Codex CLI MCP
```

Essa arquitetura deixa o Agentic com voz sem contaminar o provider Codex. O app ganha boca, mas o cerebro continua organizado.

---

## 20. Links de referencia

### Codex CLI / GitHub Issues

- https://github.com/openai/codex/issues/12833
- https://github.com/openai/codex/issues/13132
- https://github.com/openai/codex/issues/14630
- https://github.com/openai/codex/issues/16404

### Artigo tecnico

- https://zenn.dev/schroneko/articles/codex-cli-voice-input

### OpenAI Docs

- https://platform.openai.com/docs/guides/speech-to-text
- https://platform.openai.com/docs/guides/realtime-transcription

### Reddit / discussao publica

- https://www.reddit.com/r/codex/comments/1rf0ktu/how_to_use_the_new_transcribe_voice_in_codex_cli/
- https://www.reddit.com/r/codex/comments/1rfeee7/psa_voice_transcription_is_now_tui_native/
- https://www.reddit.com/r/codex/comments/1qukcqh/codex_app_on_windows/

---

## 21. Nota de cautela

`/backend-api/transcribe` e interno. Ele pode funcionar hoje e quebrar amanha, pode exigir headers especificos, pode ser bloqueado por Cloudflare e pode nao ser permitido fora dos clientes oficiais.

Por isso, a decisao saudavel e:

```text
Produto usa OpenAI Audio API.
Pesquisa testa Codex backend transcribe.
Fallback segura a UX.
```

Assim o Agentic nao fica dependente de uma porta secreta com alarme, mas tambem nao ignora a chance de reaproveitar a auth Codex onde fizer sentido.
