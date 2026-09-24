# Claude Code

Claude Code as a chat agent in Lumen — with the same engine as the `claude` command:
your login, `CLAUDE.md`, settings and MCP servers all apply.

## Chat

- **Live answers**: text and reasoning appear while Claude writes;
  answers as Markdown with copyable code blocks
- **Tools** with preview — diffs for changes, the command for `Bash`, the
  file to open; changed files open on their own
- **Allow / Always allow / Deny** (also with a reason) for every action
- **Plan**: Claude's to-do list as a card with progress
- **Cost** per answer: tokens, cache, steps, duration and price
- **Multiple chats** side by side, **resume earlier sessions**
- **Models** come straight from the installed Claude Code CLI — always
  matching your version and account; ↻ next to the picker reloads them
- **Effort per model** chosen in the chat — only the levels the model supports
  (Haiku, for example, has none); Lumen remembers the choice per model
- **Modes** switched directly in the chat: Ask, Auto-accept edits,
  Plan and — only when enabled — No prompts
- **Input**: `/` for slash commands, `@` for files, ↑ for earlier messages,
  paste (Ctrl+V) or attach images, send the open file and selection along

## Settings

*Settings → Extensions → Claude Code*: path to `claude`, default and
fallback model, more models, model list cache,
default effort, extended thinking (adaptive, budget, off), fast mode,
output style, save sessions, live answers, maximum steps, cost limit, additional instructions,
allowed and denied tools, more folders, settings sources,
additional MCP servers (JSON) and environment variables.

## Template

*New project → Claude Code project* creates `CLAUDE.md`, `.claude/settings.json`
and the slash command `/review`.

## Requirements

Claude Code must be installed and signed in:

```sh
npm install -g @anthropic-ai/claude-code
claude
```

The extension ships executable code that must be confirmed on installation.
It starts the installed `claude`.
