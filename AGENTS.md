# AGENTS.md

How AI coding agents should operate in this repository.

This repository is for a time-critical static GitHub Pages guest-list check-in MVP. These rules are intentionally project-specific to this app, but they must not inherit FactHarbor analysis, terminology, pipeline, or role rules.

## Instruction Precedence

When instructions conflict, apply this order:

1. Closest path-specific `AGENTS.md`, if one exists
2. Repository root `AGENTS.md`
3. Handoff and project docs under `docs/handoff/`, `CODEX_START_HERE.md`, and `README_DE.md`
4. Role or workflow docs under `docs/agents/`
5. Tool-specific wrappers such as `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, or Cursor rules
6. The active user request

If a rule is unclear and a reasonable assumption is risky for the event deployment, ask the user before changing files.

## Project Mission

Make the existing static guest-list check-in web app production-usable for a real event.

The chosen MVP architecture is fixed unless the user explicitly changes it:

```text
GitHub Pages static frontend + Firebase Firestore + Firebase Anonymous Auth
```

Do not replace this with React, Next.js, Vite, Express, Docker, Supabase, Vercel, Firebase Cloud Functions, or any other stack unless explicitly requested.

## Product Constraints

- No paid hosting.
- No new app user accounts in the MVP.
- No server, VPS, Docker, or backend deployment for the MVP.
- German UI and German operator documentation.
- Mobile/tablet-first check-in workflow.
- Event size target: about 1200 guests.
- Concurrent check-in target: about 5 devices.
- Internet is assumed at the entrance; offline multi-device mode is out of scope.
- Do not commit real guest data, real PINs, Firebase private secrets, service-account keys, or private exports.

## Product Structure

Public app files live at the repository root:

- `index.html`
- `app.js`
- `styles.css`
- `app-config.js`
- `manifest.webmanifest`
- `.nojekyll`
- `firebase.rules`

Supporting docs and generated/sample data live under:

- `docs/handoff/` - imported handoff and decisions
- `docs/deployment/` - GitHub Pages and Firebase setup
- `docs/testing/` - manual event test plan
- `docs/requirements/` - broader requirements, including out-of-MVP items
- `docs/agents/` - agent collaboration and operational knowledge
- `data/samples/` - synthetic sample CSVs only

The earlier `site/` localStorage prototype is obsolete and should not be recreated.

## MVP Features To Preserve

- Event setup with Admin PIN and Check-in PIN.
- Anonymous Firebase Auth.
- Admin mode and Check-in Staff mode.
- Guest import/export as CSV.
- Manual guest creation.
- Categories: GA, Member GA, Member VIP, On Stage, Mitarbeiter.
- Search by guest name or Guest ID.
- One-click check-in.
- Duplicate check-in protection using a Firestore transaction.
- Support comment per guest.
- Status values: `open`, `checked_in`, `no_show`, shown in German.
- Category totals and dashboard.
- Audit log.

## Agent Workflow

Before editing:

1. Read the files directly involved in the task.
2. Check `git status --short --branch`.
3. For non-trivial work, read `CODEX_START_HERE.md` and `docs/handoff/KNOWLEDGE_TRANSFER_DE.md`.
4. Identify whether the task touches app code, Firestore rules, deployment, documentation, or agent process.
5. Keep the change scoped to the request and the MVP.

While editing:

- Preserve user changes. Never reset, revert, or overwrite work you did not make unless explicitly asked.
- Prefer targeted reliability fixes over redesign.
- Keep code dependency-free and GitHub-Pages compatible.
- Keep asset paths relative.
- Do not add network calls beyond Firebase SDK usage already required by the architecture.
- Do not add analytics, trackers, or third-party embeds without explicit approval.

After editing:

- Run the cheapest relevant verification.
- For JavaScript changes, run a module syntax check for `app.js`.
- For Firestore rule changes, review field names against `app.js` and `docs/handoff/FIRESTORE_DATA_MODEL_DE.md`.
- For deployment changes, review `docs/agents/github-pages-operations.md`.
- Report files touched and checks run.

## Development Priorities

1. Reliability for the event.
2. Correct check-in state changes.
3. Duplicate check-in safety.
4. Simple deployment.
5. Clear German documentation.
6. Low Firestore read/write usage.
7. Good mobile usability.

## Testing Priorities

- Setup flow with `?setup=1`.
- Role entry with Admin PIN and Check-in PIN.
- CSV import of 1200 guests.
- Search speed with 1200 guests.
- Check-in from two browser windows or devices.
- Duplicate check-in warning and transaction behavior.
- Admin override or correction behavior where supported.
- Support comment update.
- Mark open guests as No Show.
- Export all guests and checked-in guests.
- Firestore Security Rules compatibility.

## Git Rules

- Default branch: `main`.
- Commit style: conventional commits, for example `fix(checkin): prevent duplicate guest import`.
- Do not push, force-push, merge, or create pull requests unless the user asks.
- Do not edit `.git/` internals directly.

## GitHub Pages

The MVP deploys from the repository root on `main` using GitHub Pages branch publishing:

```text
Settings -> Pages -> Deploy from branch -> main -> /root
```

Read `docs/agents/github-pages-operations.md` before changing deployment behavior.

Do not push or maintain a `gh-pages` branch for this repository. Do not reintroduce the old `site/` deployment workflow unless the user explicitly asks to switch to GitHub Actions.

## Multi-Agent Collaboration

- If the user assigns a role, read `docs/agents/multi-agent-collaboration.md`.
- If work is incomplete, leave a compact handoff using `.claude/skills/handoff/SKILL.md`.
- Use `docs/agents/role-learnings.md` for durable notes that are likely to help future agents.
- Do not add broad process rules unless they apply to this repository.

## Local Skills

Repo-local skills live under `.claude/skills/`. Use them when their description matches the task:

- `github-pages`: static Pages deployment and root asset path changes.
- `guest-list-ui`: guest-list UI, CSV, import/export, check-in flow, mobile usability.
- `firebase-firestore`: Firebase config, Firestore data model, rules, and transaction behavior.
- `handoff`: compact task handoffs for another agent.

