# Melhorias para unificar o ecossistema Agentic Chat Codex

> Documento de visão técnica para evoluir o `agentic-chat-codex` para o projeto principal, absorvendo as melhores ideias dos outros repositórios do ecossistema.
>
> Objetivo: transformar o `agentic-chat-codex` em um ambiente agentic local-first, seguro, multiusuário, com Codex backend, tools locais/web, skills, voz, jobs persistentes, workspace seguro e API compatível.

---

## 1. Repositórios de referência

Este documento compara o `agentic-chat-codex` com os outros projetos existentes e propõe uma convergência progressiva.

| Projeto | Papel no ecossistema | Referência |
|---|---|---|
| `agentic-chat-codex` | Base moderna: Next.js, React, SQLite, runs, diff tracking, runtime agentic e ferramentas locais | https://github.com/sonyddr666/agentic-chat-codex |
| `chat-md` | Laboratório local com voz, workspace, tools web/HTTP, uploads, skills Markdown e action blocks | https://github.com/sonyddr666/chat-md |
| `fluxo-codex` | Proxy Flask para o backend Codex, com CORS bypass, `previous_response_id`, `store:true`, Auth Pool e API compatível | https://github.com/sonyddr666/fluxo-codex |
| `skills-chat` | SkillFlow multiusuário com login local, estado por usuário, skills custom, filesystem por usuário e jobs persistentes | https://github.com/sonyddr666/skills-chat |
| `code-chat-skills` | Variação do SkillFlow com jobs persistentes, exec allowlist, TTS hardening, filesystem e state por usuário | https://github.com/sonyddr666/code-chat-skills |

Arquivos específicos úteis:

- `agentic-chat-codex` README: https://github.com/sonyddr666/agentic-chat-codex/blob/main/README.md
- Runtime do agente: https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/agent/runtime.ts
- Tools locais do agentic: https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/agent/tools.ts
- Provider Codex do agentic: https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/ai/codex-chatgpt-provider.ts
- Análise técnica do agentic: https://github.com/sonyddr666/agentic-chat-codex/blob/main/docs/project_analysis.md
- `chat-md` README: https://github.com/sonyddr666/chat-md/blob/main/README.md
- Tester de tools do `chat-md`: https://github.com/sonyddr666/chat-md/blob/main/tester/tools-tester.mjs
- Skill creator do `chat-md`: https://github.com/sonyddr666/chat-md/blob/main/workspace/skills/SKILLSCREATOR.MD
- `fluxo-codex` README: https://github.com/sonyddr666/fluxo-codex/blob/main/README.md
- `skills-chat` README: https://github.com/sonyddr666/skills-chat/blob/main/README.md
- `code-chat-skills` README: https://github.com/sonyddr666/code-chat-skills/blob/main/README.md

---

## 2. Diagnóstico resumido

O `agentic-chat-codex` deve ser o projeto principal porque já possui a melhor base estrutural:

- Next.js e React modernos.
- SQLite local para persistência.
- Runs, eventos e tool calls.
- Diff tracking e snapshots de arquivos.
- Workspace guard.
- Runtime agentic com loop de ferramentas.
- Auth Codex mais estruturado.
- Testes unitários e E2E.

Porém, os outros projetos possuem capacidades que ainda faltam ou estão mais maduras em áreas específicas:

- `fluxo-codex` entende melhor o fluxo real do backend Codex, especialmente `store:true`, `previous_response_id`, fallback `store:false` e Auth Pool.
- `chat-md` possui mais tools, mais integração com voz, skills em Markdown e um runtime de tools mais amplo.
- `skills-chat` e `code-chat-skills` possuem peças importantes de produto: login local, estado por usuário, skills por usuário, filesystem por usuário e jobs persistentes recuperáveis.

A estratégia recomendada é: manter o `agentic-chat-codex` como base e migrar capacidades em módulos, sem copiar monólitos inteiros.

---

## 3. O que existe no `agentic-chat-codex` hoje

O `agentic-chat-codex` já tem um núcleo forte.

### 3.1 Runtime agentic

O runtime central executa runs, chama o provider, interpreta JSON-over-text, executa tools locais, cria tool calls, emite eventos, cria snapshots de arquivo e produz diffs.

Referência:

- https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/agent/runtime.ts

Capacidades importantes:

- `MAX_AGENT_TOOL_STEPS` para limitar loops.
- Parsing de tool calls em JSON.
- Suporte a uma tool ou várias tools em lote.
- Comandos explícitos como `/read`, `/search`, `/shell`, `/write`, `/patch`.
- Eventos como `tool_start`, `tool_output`, `file_changed`, `diff_ready`, `message_delta`, `run_complete`.
- Criação de snapshots com `beforeContent`, `afterContent` e diff.

### 3.2 Tools locais

As tools atuais são focadas no workspace:

- `list_files`
- `read_file`
- `search_text`
- `write_file`
- `write_files`
- `apply_patch`
- `run_shell`

Referência:

- https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/agent/tools.ts

### 3.3 Provider Codex

O provider chama diretamente:

```text
https://chatgpt.com/backend-api/codex/responses
```

Ele monta payload com `model`, `instructions`, `input`, `stream:true` e `store:false`. A tool call hoje não é nativa do backend Codex; ela é implementada como JSON-over-text no runtime local.

Referência:

- https://github.com/sonyddr666/agentic-chat-codex/blob/main/src/lib/ai/codex-chatgpt-provider.ts

---

## 4. Limitação central: Codex backend não entrega tool calling nativo neste fluxo

O ponto mais importante da arquitetura é entender que o backend Codex usado pelos projetos funciona principalmente como gerador de texto em streaming.

O provider envia algo nessa linha:

```json
{
  "model": "gpt-5.4-mini",
  "instructions": "...",
  "input": [
    { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "..." }] }
  ],
  "stream": true,
  "store": false
}
```

E recebe eventos SSE de texto:

```text
response.output_text.delta
response.completed
response.output_item.done
```

Não há, nesse fluxo atual, envio formal de schemas de tools como `tools`, `tool_choice` ou function calling nativo. Por isso, o runtime local precisa ensinar o modelo a responder JSON puro quando quiser uma ferramenta:

```json
{"tool":"read_file","args":{"path":"README.md"}}
```

Esse JSON é texto. O runtime local interpreta e executa. O Codex backend não sabe, de forma nativa, que uma ferramenta foi chamada.

Consequência: o `agentic-chat-codex` deve investir em um harness local forte, com parser robusto, validação de schema, permission layer, approval gate, persistência de eventos e reanexo de runs.

---

## 5. Capacidades de `fluxo-codex` que devem entrar no `agentic-chat-codex`

Referência principal:

- https://github.com/sonyddr666/fluxo-codex/blob/main/README.md

### 5.1 `store:true` + `previous_response_id`

O `fluxo-codex` usa contexto nativo do Codex:

1. Primeira mensagem envia `store:true`.
2. Codex retorna `response_id`.
3. O proxy salva `session_id -> response_id`.
4. Próxima mensagem envia `previous_response_id`.
5. O Codex reaproveita o contexto anterior sem reenviar o histórico inteiro.

Isso reduz custo de contexto, melhora conversas longas e aproxima o app do fluxo real do backend Codex.

Proposta para o `agentic-chat-codex`:

```ts
type CodexThreadState = {
  threadId: string;
  model: string;
  storeEnabled: boolean;
  lastResponseId: string | null;
  invalidatedAt?: string | null;
};
```

Adicionar ao provider:

- `store:true` quando permitido.
- `previous_response_id` quando houver thread ativa.
- persistência do novo `response_id` ao final da resposta.
- fallback automático quando `store:true` falhar.

### 5.2 Fallback `store:false`

O `fluxo-codex` tenta `store:true`, mas se o Codex recusar com erro, cai para `store:false` e evita reenviar um `previous_response_id` inválido.

Proposta:

```ts
async function requestWithStoreFallback(payload) {
  try {
    return await send({ ...payload, store: true });
  } catch (error) {
    if (isStoreRejected(error)) {
      invalidateThreadResponseId(payload.threadId);
      return await send({ ...payload, store: false, previous_response_id: undefined });
    }
    throw error;
  }
}
```

### 5.3 Auth Pool e rotação por rate limit

O `fluxo-codex` gerencia slots `auth1` até `auth5` e rotaciona quando encontra 429, quota ou usage limit.

O `agentic-chat-codex` já tem multi-account auth, mas deve incorporar uma política explícita de seleção e rotação:

- score por conta.
- cooldown por rate limit.
- seleção por projeto/usuário.
- logs de rotação.
- failover automático.

Módulos sugeridos:

```text
src/lib/codex/account-pool.ts
src/lib/codex/rate-limit-detector.ts
src/lib/codex/account-scorer.ts
src/lib/codex/thread-store.ts
```

### 5.4 API compatível com OpenAI

O `fluxo-codex` expõe rotas compatíveis:

- `/v1/chat/completions`
- `/v1/responses`
- `/v1/models`
- `/vcodex/v1/*` com `PUBLIC_API_KEY`

Proposta para o projeto unificado:

- manter a UI atual.
- adicionar modo API externa.
- permitir que outros clientes usem o agentic como proxy local.

Rotas sugeridas:

```text
/api/v1/models
/api/v1/chat/completions
/api/v1/responses
/api/v1/runs
/api/v1/tools
```

### 5.5 Histórico como ferramenta

O `fluxo-codex` tem tools como:

- `search_history`
- `load_chat`
- `list_chats`

No `agentic`, isso deve virar tools internas sobre SQLite:

```ts
search_history({ query, limit })
load_thread({ threadId })
list_threads({ projectId, limit })
```

Isso permite o agente lembrar conversas passadas sem depender apenas do contexto do modelo.

---

## 6. Capacidades de `chat-md` que devem entrar no `agentic-chat-codex`

Referências:

- README: https://github.com/sonyddr666/chat-md/blob/main/README.md
- Tester de tools: https://github.com/sonyddr666/chat-md/blob/main/tester/tools-tester.mjs
- Skill creator: https://github.com/sonyddr666/chat-md/blob/main/workspace/skills/SKILLSCREATOR.MD

### 6.1 Voz: STT, TTS e live mode

O `chat-md` tem uma experiência mais rica de voz:

- reconhecimento de voz no navegador.
- síntese de voz via browser ou Inworld.
- live mode.
- auto envio por silêncio.
- limpeza de Markdown/código antes de falar.
- fila de TTS.

Proposta para o `agentic-chat-codex`:

```text
src/lib/voice/stt.ts
src/lib/voice/tts.ts
src/lib/voice/tts-cleaner.ts
src/lib/voice/tts-queue.ts
src/components/voice/VoiceControls.tsx
src/components/voice/LiveModeToggle.tsx
```

Regras de UX:

- TTS deve ser opcional por thread.
- Código e HTML não devem ser narrados integralmente.
- O usuário deve conseguir interromper a fala e cancelar chunks pendentes.
- Live mode deve ter indicador visual claro.

### 6.2 Tools web/HTTP

O `chat-md` testa e expõe um conjunto amplo de tools:

- `http-get`
- `http-post`
- `http-put`
- `http-delete`
- `http-request`
- `fetch-url`
- `web-search`
- `crawl-page`
- `scrape-html`
- `download-url`
- `rss-read`

Hoje o `agentic` tem foco em filesystem local. Para virar um agente completo, precisa de tools de mundo externo.

Proposta:

```text
src/lib/tools/web.ts
src/lib/tools/http.ts
src/lib/tools/rss.ts
src/lib/tools/download.ts
```

Tools sugeridas:

```ts
web_search({ query, maxResults })
fetch_url({ url, maxBytes })
crawl_page({ url })
scrape_html({ url, selector? })
rss_read({ url, maxItems })
http_request({ method, url, headers?, body? })
download_url({ url, targetPath })
```

Todas devem passar por permission layer.

### 6.3 Filesystem expandido

O `agentic` já possui read/write/patch/search/list. O `chat-md` também possui ações equivalentes a:

- append.
- rename.
- delete.
- send/export de arquivo.
- glob.
- grep.

Proposta:

```ts
append_file({ path, content })
rename_file({ from, to })
delete_file({ path })
export_file({ path })
glob_files({ pattern })
grep_files({ pattern, query })
```

Atenção: `delete_file`, `rename_file`, `append_file`, `write_file` e `apply_patch` devem exigir approval quando o projeto estiver em modo seguro.

### 6.4 Skills em Markdown

O `chat-md` possui skills em Markdown carregadas no prompt. A skill `SKILLSCREATOR.MD` define um protocolo muito útil para compatibilidade:

- frontmatter simples.
- seções obrigatórias.
- actions reais.
- fallback.
- checklist de validação.
- proibição de tools inventadas.

Proposta:

```text
src/lib/skills/markdown-loader.ts
src/lib/skills/skill-validator.ts
src/lib/skills/skill-registry.ts
src/lib/skills/skill-context-builder.ts
```

Formato recomendado:

```md
---
name: repo-reviewer
description: Analisa um projeto e gera plano de melhoria.
version: 1.0
tools:
  - list_files
  - read_file
  - search_text
---

# REGRA PRINCIPAL

Analise o projeto usando ferramentas reais antes de sugerir mudanças.

# QUANDO USAR

- quando o usuário pedir análise de repo
- quando o usuário pedir plano de melhoria

# QUANDO NÃO USAR

- quando o usuário só quiser uma resposta conceitual

# COMO EXECUTAR

1. listar arquivos
2. ler README e configs
3. buscar pontos críticos
4. gerar plano

# FALLBACKS

- se não houver arquivos, explicar a limitação

# COMO APRESENTAR

- resumo
- riscos
- plano por fases
```

### 6.5 Compatibilidade com action blocks

O `chat-md` usa action blocks:

```text
::fs-read::README.md::
::exec::npm test::
```

O `agentic` usa JSON-over-text. O ideal é manter JSON como protocolo principal, mas suportar action blocks como camada de compatibilidade para importar skills antigas.

Proposta:

```ts
parseToolCalls(text) {
  return [
    ...parseJsonToolCalls(text),
    ...parseActionBlocks(text)
  ];
}
```

---

## 7. Capacidades de `skills-chat` e `code-chat-skills` que devem entrar no `agentic-chat-codex`

Referências:

- `skills-chat`: https://github.com/sonyddr666/skills-chat/blob/main/README.md
- `code-chat-skills`: https://github.com/sonyddr666/code-chat-skills/blob/main/README.md

### 7.1 Login local separado da auth Codex

Esses projetos possuem login local:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

No projeto unificado, é importante separar:

| Tipo de auth | Função |
|---|---|
| App User Auth | identifica quem usa o app |
| Codex Account Auth | define quais credenciais Codex o usuário pode usar |

Modelo sugerido:

```text
users
user_sessions
user_settings
user_codex_accounts
projects
threads
runs
```

### 7.2 Estado por usuário no servidor

`skills-chat` e `code-chat-skills` sincronizam estado no backend, incluindo:

- tema.
- configurações de modelo.
- conversas.
- memória.
- approvals pendentes.
- packs de skill.
- preferências de TTS.
- sidebar.

No `agentic`, isso deve ser mais estruturado do que um blob solto.

Tabelas sugeridas:

```text
user_settings
user_memory
user_skill_packs
user_ui_state
user_approvals
```

### 7.3 Skills custom por usuário

Esses projetos salvam skills por usuário em `skills/<user-id>/` e expõem rotas `GET`, `POST` e `DELETE`.

No projeto unificado, as skills devem ter escopo:

| Escopo | Uso |
|---|---|
| global | skills instaladas para todos |
| user | skills privadas do usuário |
| project | skills específicas do projeto |
| thread | skills temporárias da conversa |

Prioridade sugerida:

```text
thread > project > user > global
```

### 7.4 Filesystem por usuário

Os SkillFlow isolam arquivos por usuário em `workspace/<user-id>/`.

O projeto unificado deve combinar isso com o modelo de projetos do `agentic`:

```text
.data/users/<user-id>/workspaces/<project-id>/
.data/users/<user-id>/uploads/
.data/users/<user-id>/skills/
```

### 7.5 Jobs persistentes recuperáveis

`skills-chat` e `code-chat-skills` possuem `POST /api/chat/jobs` e `GET /api/chat/jobs/<job_id>`, permitindo recuperar uma resposta quando a aba cai.

O `agentic` já tem runs, mas deve evoluir para SSE reanexável por `runId`:

```text
POST /api/runs
GET /api/runs/:id
GET /api/runs/:id/events?afterSeq=123
GET /api/runs/:id/sse?afterSeq=123
POST /api/runs/:id/cancel
POST /api/runs/:id/retry
```

Regras:

- todo evento deve ter `seq` monotônico.
- o frontend deve reanexar usando último `seq` visto.
- cancelamento deve afetar runtime, provider e tools quando possível.
- o run deve continuar mesmo se a aba cair, quando configurado.

### 7.6 Exec allowlist

O `code-chat-skills` usa uma política de execução com allowlist e `shell=true` bloqueado por padrão.

No `agentic`, `run_shell` deve ganhar uma política mais explícita.

Config sugerida:

```ts
type ExecPolicy = {
  allowedBins: string[];
  allowShell: boolean;
  timeoutMs: number;
  maxOutputBytes: number;
  envAllowlist: string[];
  requireApproval: boolean;
};
```

Variáveis sugeridas:

```text
AGENTIC_EXEC_ALLOW_SHELL=false
AGENTIC_EXEC_ALLOWED_BINS=node,npm,npx,python,python3,py,bash,sh
AGENTIC_EXEC_TIMEOUT_MS=20000
AGENTIC_EXEC_MAX_OUTPUT_BYTES=65536
```

---

## 8. Segurança e permission layer

Conforme o projeto ganha tools, segurança vira prioridade. O agente não pode ter acesso irrestrito a escrita, rede e shell.

### 8.1 Categorias de tools

| Categoria | Exemplos | Risco | Aprovação |
|---|---|---:|---|
| leitura local | `read_file`, `list_files`, `search_text` | baixo | normalmente não |
| escrita local | `write_file`, `apply_patch`, `delete_file` | médio/alto | sim |
| shell | `run_shell` | alto | sim |
| rede leitura | `web_search`, `crawl_page`, `rss_read` | médio | depende |
| HTTP mutável | `http_post`, `http_put`, `http_delete` | alto | sim |
| GitHub write | commit, issue, PR, review | alto | sim |
| secrets/auth | Codex auth, env vars | crítico | restrito |

### 8.2 Permission model

Proposta:

```ts
type ToolPermission = {
  toolName: string;
  scope: "global" | "user" | "project" | "thread";
  mode: "allow" | "deny" | "ask";
  constraints?: Record<string, unknown>;
};
```

Exemplos:

```json
{
  "toolName": "run_shell",
  "scope": "project",
  "mode": "ask",
  "constraints": {
    "allowedBins": ["npm", "node", "python"]
  }
}
```

### 8.3 Approval gate

Antes de ações perigosas, a UI deve mostrar:

- tool solicitada.
- argumentos.
- motivo gerado pelo modelo.
- diff previsto, quando houver.
- opções: permitir uma vez, permitir nesta conversa, permitir neste projeto, negar.

### 8.4 Audit log

Toda tool call deve gerar evento persistente:

```ts
type ToolAuditEvent = {
  id: string;
  runId: string;
  userId: string;
  projectId: string;
  toolName: string;
  argsRedacted: unknown;
  status: "pending" | "approved" | "denied" | "running" | "completed" | "failed";
  outputPreview?: string;
  error?: string;
  createdAt: string;
};
```

---

## 9. GitHub como tool nativa futura

Atualmente, a análise usou GitHub externamente, mas o `agentic-chat-codex` ainda não deve depender disso como tool interna do app.

Uma evolução natural é criar um GitHub adapter próprio.

### 9.1 Tools GitHub read-only

```ts
github_list_repos()
github_read_file({ repo, path, ref })
github_search_code({ repo, query })
github_list_issues({ repo, query })
github_read_pr({ repo, number })
github_read_issue({ repo, number })
```

### 9.2 Tools GitHub write

Devem exigir approval:

```ts
github_create_issue({ repo, title, body })
github_create_branch({ repo, branch, from })
github_update_file({ repo, branch, path, content })
github_create_pr({ repo, branch, base, title, body })
github_comment_pr({ repo, number, body })
```

### 9.3 Uso ideal

Usuário pede:

```text
Analisa meu repo e abre um PR com melhorias de segurança.
```

Fluxo:

1. selecionar repo.
2. buscar README/configs.
3. listar arquivos relevantes.
4. propor plano.
5. pedir aprovação.
6. criar branch.
7. editar arquivos.
8. abrir PR com descrição.

---

## 10. Arquitetura alvo do projeto único

Estrutura sugerida:

```text
agentic-chat-codex/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── codex/
│   │   │   ├── projects/
│   │   │   ├── threads/
│   │   │   ├── runs/
│   │   │   ├── tools/
│   │   │   ├── skills/
│   │   │   ├── workspace/
│   │   │   ├── voice/
│   │   │   └── v1/
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── chat/
│   │   ├── workspace/
│   │   ├── skills/
│   │   ├── runs/
│   │   ├── auth/
│   │   ├── voice/
│   │   └── settings/
│   │
│   ├── lib/
│   │   ├── agent/
│   │   │   ├── runtime.ts
│   │   │   ├── planner.ts
│   │   │   ├── tool-router.ts
│   │   │   ├── permissions.ts
│   │   │   └── approval-gate.ts
│   │   │
│   │   ├── codex/
│   │   │   ├── provider.ts
│   │   │   ├── auth-pool.ts
│   │   │   ├── thread-store.ts
│   │   │   └── store-fallback.ts
│   │   │
│   │   ├── tools/
│   │   │   ├── filesystem.ts
│   │   │   ├── shell.ts
│   │   │   ├── web.ts
│   │   │   ├── http.ts
│   │   │   ├── rss.ts
│   │   │   ├── history.ts
│   │   │   └── github.ts
│   │   │
│   │   ├── skills/
│   │   │   ├── markdown-loader.ts
│   │   │   ├── code-skill-runner.ts
│   │   │   ├── registry.ts
│   │   │   └── validator.ts
│   │   │
│   │   ├── workspace/
│   │   ├── voice/
│   │   ├── db/
│   │   └── security/
│
├── docs/
├── tests/
└── .data/
    ├── users/
    ├── workspaces/
    ├── uploads/
    ├── skills/
    └── codex-auth/
```

---

## 11. Roadmap recomendado

### Fase 1 — Blindar o núcleo atual

Objetivo: estabilizar o `agentic-chat-codex` antes de adicionar mais poderes.

Tarefas:

- quebrar `app-shell.tsx` em componentes menores.
- criar `ToolRegistry` central.
- criar `PermissionLayer`.
- criar `ApprovalGate`.
- endurecer `run_shell` com allowlist.
- validar argumentos de todas as tools.
- adicionar testes para `runtime.ts`.
- persistir eventos com `seq` reanexável.

Resultado esperado:

- runtime mais testável.
- tools mais seguras.
- UI preparada para permissões.

### Fase 2 — Codex backend avançado

Objetivo: trazer o melhor do `fluxo-codex`.

Tarefas:

- implementar `store:true`.
- implementar `previous_response_id`.
- persistir `response_id` por thread.
- fallback `store:false`.
- rotação de auth por rate limit.
- API compatível `/v1`.

Resultado esperado:

- conversas longas mais eficientes.
- menor necessidade de reenviar histórico.
- uso melhor das contas Codex.

### Fase 3 — Expandir tools

Objetivo: trazer o melhor do `chat-md`.

Tarefas:

- web search.
- fetch/crawl/scrape.
- RSS.
- HTTP request.
- download.
- append/rename/delete/export/glob/grep.

Resultado esperado:

- agente capaz de operar além do workspace.

### Fase 4 — Skills

Objetivo: unificar skills Markdown e code skills.

Tarefas:

- loader de Markdown skills.
- validador de skill.
- escopos global/user/project/thread.
- UI de skills.
- importador de skills do `chat-md`.
- suporte a code skills com schema.

Resultado esperado:

- workflows reutilizáveis.
- personalização por projeto e usuário.

### Fase 5 — Multiusuário e state

Objetivo: trazer o melhor do SkillFlow.

Tarefas:

- login local.
- sessões persistentes.
- user settings.
- user memory.
- user skills.
- user workspace.
- user approvals.

Resultado esperado:

- app utilizável por mais de uma pessoa ou em deploy próprio.

### Fase 6 — Jobs recuperáveis

Objetivo: run não pode depender da aba aberta.

Tarefas:

- worker de runs.
- eventos persistidos com `seq`.
- SSE reanexável.
- retry/cancel robusto.
- painel de jobs/runs.

Resultado esperado:

- se a aba cair, nada se perde.

### Fase 7 — Voz e experiência viva

Objetivo: trazer a experiência mais humana do `chat-md`.

Tarefas:

- STT.
- TTS.
- live mode.
- TTS prefetch.
- cancelamento de fala.
- limpeza de Markdown/código para voz.

Resultado esperado:

- agente operável por voz, sem perder foco em desenvolvimento.

### Fase 8 — GitHub adapter

Objetivo: permitir que o agente opere repositórios.

Tarefas:

- GitHub read tools.
- GitHub write tools com approval.
- criação de branches.
- edição de arquivos.
- issues.
- PRs.
- review/comment.

Resultado esperado:

- agentic vira dev agent real sobre GitHub.

---

## 12. Usabilidade final esperada

A UI final deve ser um cockpit, não uma tela lotada.

### Layout sugerido

```text
┌──────────────────────┬───────────────────────────┬──────────────────────┐
│ Projetos / Threads   │ Chat principal             │ Painel operacional   │
│                      │                           │                      │
│ - histórico          │ - mensagens                │ - arquivos           │
│ - busca              │ - tool events recolhíveis  │ - diffs              │
│ - auth status        │ - resposta final limpa     │ - runs               │
│                      │ - input / voz / anexos     │ - skills             │
│                      │                           │ - approvals          │
└──────────────────────┴───────────────────────────┴──────────────────────┘
```

### Fluxo ideal

Usuário:

```text
Analisa esse projeto, identifica problemas de segurança e cria uma skill para auditoria recorrente.
```

Agente:

1. lista arquivos.
2. lê README, package/configs e código relevante.
3. usa busca local.
4. opcionalmente consulta web.
5. gera plano.
6. cria uma skill Markdown.
7. mostra diff.
8. pede aprovação antes de salvar.
9. salva no projeto.
10. registra tudo no run.

Se a aba cair:

1. usuário volta.
2. frontend reanexa no `runId`.
3. eventos continuam do último `seq`.
4. resposta final aparece sem perda.

Se bater rate limit:

1. provider detecta.
2. auth pool troca conta.
3. evento é registrado.
4. run continua.

---

## 13. Finalidade do projeto único

O objetivo final não é apenas ter um chat bonito. A finalidade é criar um ambiente operacional local-first para agentes.

Definição:

> Um sistema agentic local-first que usa Codex como cérebro textual e um harness próprio como corpo operacional, capaz de conversar, pesquisar, ler, escrever, executar, lembrar, automatizar, criar skills e operar projetos com segurança.

Casos de uso:

- desenvolvimento assistido por agente.
- análise de repositórios.
- criação de features.
- revisão de segurança.
- geração de documentação.
- automações locais.
- pesquisa web com ferramentas.
- execução de scripts.
- criação de skills por workflow.
- trabalho por voz.
- API local compatível para outros clientes.

A visão final:

```text
Não é só chat.
Não é só IDE.
Não é só proxy.
Não é só skill runner.

É um sistema operacional pequeno para agentes locais.
```

---

## 14. Princípio arquitetural

O `agentic-chat-codex` deve continuar sendo o projeto principal porque tem o esqueleto mais saudável.

Os outros projetos devem ser tratados como fontes de capacidades, não como bases para copiar tudo.

Estratégia correta:

```text
agentic-chat-codex = núcleo oficial
fluxo-codex        = referência para fluxo Codex e auth pool
chat-md            = referência para voz, tools e skills Markdown
skills-chat        = referência para multiusuário e state
code-chat-skills   = referência para jobs persistentes e exec policy
```

Regra de ouro:

> migrar conceitos, não colar monólitos.

Isso evita que o projeto final vire um Frankenstein difícil de manter.

---

## 15. Prioridade prática imediata

Se for começar agora, a ordem mais útil é:

1. `PermissionLayer` + `ApprovalGate`.
2. endurecer `run_shell` com allowlist.
3. `previous_response_id` + fallback `store:false`.
4. web tools básicas: `web_search`, `fetch_url`, `crawl_page`, `rss_read`.
5. skills Markdown com loader e validador.
6. jobs/runs reanexáveis por `seq`.
7. login/local users e state por usuário.
8. STT/TTS.
9. GitHub adapter.

Essa ordem melhora segurança antes de aumentar poder. O agente ganha braço, mas ganha coleira também.

---

## 16. Conclusão

O ecossistema atual já tem quase todas as peças de um produto agentic forte, mas elas estão espalhadas.

- O `agentic-chat-codex` tem o runtime mais limpo.
- O `fluxo-codex` tem a melhor compreensão do backend Codex.
- O `chat-md` tem a experiência mais rica em voz, tools e skills Markdown.
- O `skills-chat` e o `code-chat-skills` têm a camada de produto: login, estado, filesystem por usuário e jobs persistentes.

O caminho ideal é transformar o `agentic-chat-codex` no projeto unificado:

```text
agentic-chat-codex
+ Codex threading/auth pool
+ tools web/HTTP
+ skills Markdown/code
+ multiusuário/state
+ jobs reanexáveis
+ voz
+ GitHub adapter
= Agentic local-first completo
```

Este é o alvo: um único projeto agentic, seguro, extensível e útil de verdade.
