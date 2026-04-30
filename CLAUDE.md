# Claude Code Instructions

Primary repository rules live in [AGENTS.md](AGENTS.md). Read that file first; it is authoritative for this project.

## Quick Context

- App entry point: `index.html`
- Browser app logic: `app.js`
- Firebase config placeholder: `app-config.js`
- Styles: `styles.css`
- Firestore rules: `firebase.rules`
- Start-here handoff: `CODEX_START_HERE.md`
- German README: `README_DE.md`
- Deployment guide: `docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md`
- Manual test plan: `docs/testing/MANUAL_TESTPLAN_DE.md`
- Agent knowledge: `docs/agents/`
- Repo-local skills: `.claude/skills/`

## Verification

- Syntax-check `app.js` as an ES module.
- Check Pages compatibility by keeping root-relative deployment assumptions out of code; use relative paths.
- Do not run Firebase deploy commands unless asked.

## Deployment Model

GitHub Pages branch publishing from `main` and `/root`. Firebase Firestore provides live data. Do not introduce a build step or backend unless the user explicitly changes the MVP architecture.

