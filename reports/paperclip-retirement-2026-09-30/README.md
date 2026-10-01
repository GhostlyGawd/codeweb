# Paperclip retired from Codeweb

User instruction on September 30, 2026: "yeah lets cut paperclip out". Codeweb now operates directly through Codex using repository-backed plans, tasks, decisions and evidence. [TERMINAL-CONTRACT.md](../../docs/product-team/TERMINAL-CONTRACT.md) governs the current workflow; [CURRENT.md](../../docs/product-team/CURRENT.md) is its entry point.

## Changes and verification

- Paused all three existing Paperclip agents; verified zero workers running before shutdown.
- Stopped the local server and embedded PostgreSQL cleanly. Neither localhost port 3100 nor 54329 accepts connections; no matching runner remains.
- Replaced the old start script with a retirement notice and exit 1; executed the guard and verified that it does not start the service. No Paperclip autostart reference was found in the inspected user shell, Codex hooks or LaunchAgents files.
- Updated both the installed and repository Codeweb skill copies, current terminal/operating contracts, repository AGENTS.md and the global Codex instruction file to use direct Codex work. The GitHub account-selection preference remains intact.
- Captured 94 original issue records and exported the six unfinished records into [OUTSTANDING-WORK.json](OUTSTANDING-WORK.json) and [BACKLOG.md](../../docs/product-team/BACKLOG.md). Their product scopes/acceptance criteria are retained; old blocked/in_review statuses remain historical, not claims of current delivery.
- Found no active issue schedules or routines. COD-21 had already completed its one scheduled attempt. No schedule was silently migrated into a new engine.
- Preserved six exact prior instruction/learning files in [history](../../docs/product-team/history/paperclip-2026-09-30/README.md), and checked all 711 previously pushed research files unchanged against the original backup receipt.

## Historical state

A cold database/configuration/encrypted-key/storage backup is verified locally at `$LOCAL_HOME/.local/share/codeweb-paperclip-pilot/retired-2026-09-30/paperclip-state.tar.gz`. Its private directory also holds original agent/issue snapshots and shutdown receipts. The database archive and private runtime configuration are not part of the GitHub publication. Original local state, worktrees, attachments and research archives remain available.

[STATE.json](STATE.json) records exact snapshot hashes, backup identity and runtime checks. [VALIDATION.json](VALIDATION.json) records instruction-format/link checks. The retired service can be restored only if the user explicitly requests it. Retirement does not claim that a direct workflow has proven comparative superiority.
