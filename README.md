# Agentic Chat Codex

Arquitetura para um agente de desenvolvimento baseado em LLM, harness, tools, MCPs, skills e GitHub.

A ideia é sair do modelo cru, que só recebe texto e devolve texto, e construir um sistema agentic de verdade: o modelo raciocina, o harness orquestra, as tools executam e o GitHub registra o trabalho.

## Visão rápida

```text
Usuário
  -> Interface: chat, CLI, IDE ou bot
  -> Agent Harness
  -> Context Builder
  -> LLM Runtime
  -> Tool Router
  -> GitHub / Shell / MCPs / Skills
  -> Resposta, Issue, Commit, PR ou Review
```

## Componentes principais

- **Agent Harness**: controla o loop pensar -> agir -> observar -> responder.
- **Context Builder**: monta contexto útil a partir de repo, issues, PRs e arquivos.
- **Planner**: transforma intenção vaga em plano executável.
- **LLM Runtime**: conecta GPT, Claude ou outros modelos.
- **Tool Router**: chama GitHub, shell, MCPs, skills e APIs.
- **GitHub Adapter**: busca código, lê arquivos, cria issues, branches e PRs.
- **Execution Sandbox**: roda comandos com isolamento e limites.
- **Policy Guard**: bloqueia ações perigosas e exige aprovação quando necessário.
- **Skills**: empacotam workflows reutilizáveis.
- **MCP Client**: conecta sistemas externos padronizados.

## Documentação

Leia a arquitetura completa em:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Roadmap

### MVP

- Chat/CLI simples
- GitHub read-only
- Context Builder básico
- LLM com tool calling
- Criação de issues
- Geração de arquitetura e planos técnicos

### V2

- Branches
- Escrita de arquivos
- Pull requests
- Sandbox para testes
- Policy Guard inicial

### V3

- Skills reutilizáveis
- MCP client
- Memória por projeto
- Revisão automática de PR
- Logs e auditoria

### V4

- Agente multi-step robusto
- Aprovação humana granular
- Integração com CI
- Auto-fix de testes quebrados
- Integração com IDE

## Frase do projeto

**Agentic Chat Codex transforma LLMs em agentes de desenvolvimento: modelos raciocinam, tools executam, políticas controlam, GitHub registra, e o usuário continua mandando no volante.**
