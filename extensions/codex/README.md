# ChatGPT Codex

OpenAI Codex as a chat agent in Lumen. Each message starts the installed
Codex CLI (`codex exec`); your login, `AGENTS.md` and `~/.codex/config.toml`
apply.

## Chat

- **Modes** are sandbox levels: *In project* (default), *Read only* and — only
  when enabled — *Full access*
- **Tools** with preview: commands with their output, changed files to
  open, MCP calls, web searches
- **Plan**: Codex's to-do list as a card with progress
- **Tokens and duration** per answer
- **Multiple chats**, **resume earlier sessions** (from `~/.codex/sessions`)
- **Models** from `~/.codex/models_cache.json` or from `codex app-server`
  (`model/list`) — ↻ next to the picker asks the CLI again
- **Reasoning effort per model** chosen in the chat — only the levels the model
  supports; Lumen remembers the choice per model
- Switch **models** directly in the chat, paste or attach **images**,
  `@` for files, send the open file and selection along

## Settings

*Settings → Extensions → ChatGPT Codex*: path to `codex`, profile,
default model, model list source, more models, default reasoning effort,
reasoning summary, verbosity, hide reasoning, web search, network in the sandbox, approval policy,
full access, more writable folders, Git check, more
configuration (`-c key=value`) and environment variables.

## Project

- **Project type** `ChatGPT Codex` — detected by `AGENTS.md` or `.codex/`, with the
  tasks *Start Codex*, *Resume last session*, *Sign in*,
  *Show MCP servers* and *Install Codex*
- **Template** `AGENTS.md` with commands and conventions

## Requirements

```sh
npm install -g @openai/codex
codex login
```

The extension ships executable code that must be confirmed on installation.
It only starts the program you have installed.
