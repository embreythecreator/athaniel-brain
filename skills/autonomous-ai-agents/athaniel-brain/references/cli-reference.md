# Athaniel CLI Reference

Live sources when anything looks stale: `athaniel --help`, `athaniel <command> --help`,
https://athaniel-brain.nousresearch.com/docs/reference/cli-commands

### Global Flags

```
athaniel [flags] [command]        (no subcommand = interactive chat)

  --version, -V             Show version
  -z, --oneshot PROMPT      One-shot: print ONLY the final response (for scripts/pipes)
  -m MODEL  --provider P    Model/provider override for this invocation
  -t, --toolsets LIST       Comma-separated toolsets for this invocation
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --tui / --cli             Force the Ink TUI / classic REPL
  --ignore-rules            Skip AGENTS.md/SOUL.md/memory/skill injection
  --safe-mode               Disable ALL customizations (troubleshooting)
  --pass-session-id         Include session ID in system prompt
```

### Chat

```
athaniel chat [flags]
  -q, --query TEXT          Single query, non-interactive
  --image PATH              Attach a local image to a single query
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --max-turns N             Cap tool-calling iterations
  --source TAG              Session source tag (default: cli)
```
(plus the global flags above)

### Configuration

```
athaniel setup [section]      Wizard (model|tts|terminal|gateway|tools|agent)
athaniel model                Interactive model/provider picker
athaniel fallback [add|remove|list]  Fallback provider chain
athaniel config [show|edit|get|set|unset|path|env-path|check|migrate]
athaniel login / logout       OAuth sign-in / clear stored auth
athaniel doctor [--fix]       Check dependencies and config
athaniel status [--all]       Component status
```

### Tools & Skills

```
athaniel tools [list|enable NAME|disable NAME]   Per-platform toolsets (curses UI with no args)

athaniel skills list|browse|search QUERY|inspect ID
athaniel skills install ID    Hub identifier OR a direct https://…/SKILL.md URL
athaniel skills config        Enable/disable skills per platform
athaniel skills check|update|uninstall|publish PATH
athaniel skills tap add REPO  Add a GitHub repo as a skill source
athaniel bundles              Skill bundles (one /<name> alias loads several skills)
```

### MCP Servers

```
athaniel mcp add NAME (--url or --command) | remove | list | test NAME
athaniel mcp catalog | install NAME     Curated catalog install
athaniel mcp configure NAME             Toggle tool selection
athaniel mcp serve                      Run Athaniel as an MCP server
```
Details (transport, tool discovery, catalog): `references/native-mcp.md`.

### Gateway (Messaging Platforms)

```
athaniel gateway run|install|start|stop|restart|status|setup
```

20+ platforms: Telegram, Discord, Slack, WhatsApp (Baileys + Business Cloud API), iMessage (Photon — `athaniel photon setup`), Signal, Email, SMS, Matrix, Mattermost, Teams, LINE, SimpleX, ntfy, Google Chat, Home Assistant, DingTalk, Feishu, WeCom, Weixin, API Server, Webhooks. Open WebUI connects via the API Server adapter. Most adapters ship under `plugins/platforms/`.
Docs: https://athaniel-brain.nousresearch.com/docs/user-guide/messaging/

### Sessions

```
athaniel sessions list|browse|rename ID TITLE|delete ID|export OUT|prune|stats
```

### Cron / Webhooks

```
athaniel cron list|create SCHED|edit ID|pause|resume|run ID|remove|status
    Schedules: '30m', 'every 2h', '0 9 * * *', ISO timestamp
athaniel webhook subscribe NAME|list|remove NAME|test NAME
```
Webhook payloads/routes: `references/webhooks.md`.

### Profiles

```
athaniel profile list|create NAME (--clone|--clone-all|--clone-from)|use|show|delete
athaniel profile rename A B | alias NAME | export NAME | import FILE
```

### Credentials & Pools

```
athaniel auth                 Interactive credential manager
athaniel auth add [PROVIDER]  Add OAuth or API-key credential (nous, openai-codex, qwen-oauth, …)
athaniel auth list|remove P IDX|reset PROVIDER|status
```
Multiple credentials per provider form a pool that rotates automatically and skips exhausted keys.

### Other

```
athaniel desktop / gui        Native desktop app
athaniel dashboard            Web admin panel + embedded chat (--stop / --status)
athaniel proxy                OpenAI-compatible local proxy backed by an OAuth provider
athaniel portal               Quick setup / sign in via Nous Portal
athaniel kanban <verb>        Multi-agent work-queue board
athaniel project              Named multi-folder workspaces
athaniel skin list|use|set    Switch/tweak skins (see references/themes.md)
athaniel pets <verb>          Pet mascots (see references/petdex.md)
athaniel memory setup|status|off|reset   Memory provider
athaniel secrets bitwarden|onepassword   External secret stores
athaniel moa                  Mixture-of-Agents slots
athaniel hooks / security / backup / import / checkpoints / console
athaniel logs [-f] [errors]   View agent/error logs
athaniel send                 One-off message through a gateway platform
athaniel pairing / plugins / insights / journey / computer-use
athaniel acp                  ACP server (IDE integration)
athaniel completion bash|zsh|fish
athaniel update / uninstall / claw migrate
```

Plugin- and provider-supplied subcommands (e.g. `athaniel photon setup`) only appear once their plugin is installed/active.

### Where to Find Things

| Looking for... | Location |
|---|---|
| Config options | `athaniel config edit` · [Configuration docs](https://athaniel-brain.nousresearch.com/docs/user-guide/configuration) |
| Tools / toolsets | `athaniel tools list` · [Tools reference](https://athaniel-brain.nousresearch.com/docs/reference/tools-reference) |
| Skills catalog | `athaniel skills browse` · [Skills catalog](https://athaniel-brain.nousresearch.com/docs/reference/skills-catalog) |
| Provider setup | `athaniel model` · [Providers guide](https://athaniel-brain.nousresearch.com/docs/integrations/providers) |
| Env variables | `athaniel config env-path` · [Env vars reference](https://athaniel-brain.nousresearch.com/docs/reference/environment-variables) |
| Gateway logs | `~/.athaniel/logs/gateway.log` (or `athaniel logs`) |
| Sessions | `athaniel sessions browse` (reads state.db) |
