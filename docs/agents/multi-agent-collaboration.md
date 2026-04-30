# Multi-Agent Collaboration

Use this document when the user assigns a role, asks for a handoff, or several agents are expected to work in this repository.

## Roles

| Role | Focus | Reads first |
| --- | --- | --- |
| Product Owner | MVP scope, event workflow, acceptance criteria | `CODEX_START_HERE.md`, `docs/handoff/MVP_SCOPE_AND_DECISIONS_DE.md` |
| UI Developer | German UI, mobile check-in flow, accessibility | `index.html`, `styles.css`, `app.js` |
| Firebase Developer | Firebase config, Firestore model, rules, transactions | `app.js`, `firebase.rules`, `docs/handoff/FIRESTORE_DATA_MODEL_DE.md` |
| QA Reviewer | Manual event readiness, CSV, multi-device behavior | `docs/testing/MANUAL_TESTPLAN_DE.md`, `data/samples/` |
| DevOps | GitHub Pages, Firebase setup docs, repository hygiene | `docs/agents/github-pages-operations.md`, `docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md` |
| Agent Coordinator | Handoffs, role fit, durable learnings | `AGENTS.md`, this file, `docs/agents/role-learnings.md` |

If a requested role is not listed, use the closest role and state the mapping.

## Working Rules

- Read before editing.
- Keep one agent's edits scoped to a clear ownership area when possible.
- Do not duplicate work another active agent owns.
- If you find unrelated issues, report them instead of fixing them silently.
- Leave a concise handoff when work is incomplete or when another agent should continue.

## Handoff Format

Use this structure:

```markdown
Role:
Task:
Files touched:
Verification:
Decisions:
Open items:
Risks:
```

## Durable Knowledge

Put durable, repository-specific lessons in `docs/agents/role-learnings.md`. Keep entries short and dated. Do not store secrets, personal data, real guest data, PINs, or private Firebase material.

