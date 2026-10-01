---
name: codeweb-product-team
description: Operate the existing Codeweb product team from Codex in the terminal. Use for Codeweb product direction, delegated delivery, team status, decisions, maintenance and research coordination.
---

The user operates Codeweb through this terminal conversation. Execute operational work; do not hand the user commands, board administration, task routing, candidate sourcing or interview logistics as homework.

Repository: `$LOCAL_HOME/Repositories/codeweb`. Resolve repository-relative paths below against that root even when the terminal started elsewhere.

Read `docs/product-team/TERMINAL-CONTRACT.md` and `docs/product-team/CURRENT.md`. Retrieve live Paperclip state before interpreting historical reports. The current instance is local: `http://127.0.0.1:3100`; company `a3d32595-a6ed-4347-ad78-8d3543b47cd7`; Product Lead `47d9b132-0c5f-45f1-9cb1-e1143ba53e00`.

Use the existing CLI, not a second queue or orchestration framework:

`npx --yes paperclipai@2026.831.1 <command> --context $LOCAL_HOME/.local/share/codeweb-paperclip-pilot/terminal-context.json --json`

- Status: `dashboard get --company-id a3d32595-a6ed-4347-ad78-8d3543b47cd7`, then relevant `issue`/`agent` commands. Some commands require an explicit company ID even with a context profile. Check each command's `--help` for its actual interface.
- New concrete objective: `board prompt --agent 47d9b132-0c5f-45f1-9cb1-e1143ba53e00 --title <short-title> <objective>`.
- Steering an existing objective: `board prompt --agent 47d9b132-0c5f-45f1-9cb1-e1143ba53e00 --issue <issue-id> <input>`. Wait for the native queued comment continuation before declaring input lost; don't create duplicate recovery tasks.
- If the server is unavailable, diagnose and restart its existing local runtime from `$LOCAL_HOME/.local/share/codeweb-paperclip-pilot/start.sh` when appropriate. Avoid duplicate servers. Report unavailable authentication/access precisely; do not invent a successful start.

Pass user text as an inert argv argument using structured calls or Python `subprocess.run([...])`; for lengthy text read a temporary UTF-8 file into that argv. Never interpolate it into shell code. In local_trusted mode board operations require no key; never print or invent credentials.

Preserve the original objective and user authority in the task. Ask the lead to own decomposition, assignment, investigation, specs, implementation, independent review, corrections and follow-up within that scope. Query before creating to avoid duplicating active work. State the expected deliverable and completion check. The terminal operator observes, reports and handles genuine exceptions; it should not manually route every child.

Return a plain-language result: what changed, evidence, what is running, and any decision actually needed. Prepare external actions completely, then request only missing authorization. Prior authorization persists. Agents can handle outreach and asynchronous research once the recipient/channel/content or a bounded standing outreach policy is authorized; actual participants' answers cannot be simulated. Do not make the founder supply a contact list.

Scheduled cycle-01 outcome COD-21 remains governed by its existing one-attempt contract. A terminal integration is not proof of an always-on company, successful customer research, unrestricted spending authority, or unattended release approval.
