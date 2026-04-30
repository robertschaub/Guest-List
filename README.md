# Guest-List — Event Check-in MVP

Mobile-first web app for event guest-list management and live check-in.

The MVP stack is fixed:

```text
Frontend hosting: GitHub Pages
Frontend files:   index.html, app.js, styles.css, app-config.js
Backend:          Firebase Firestore
Auth:             Firebase Anonymous Auth
Accounts:         none in MVP
Access:           Event link + role + PIN
```

## Start Here

Read these first:

1. [CODEX_START_HERE.md](CODEX_START_HERE.md)
2. [AGENTS.md](AGENTS.md)
3. [README_DE.md](README_DE.md)
4. [docs/handoff/KNOWLEDGE_TRANSFER_DE.md](docs/handoff/KNOWLEDGE_TRANSFER_DE.md)
5. [docs/testing/MANUAL_TESTPLAN_DE.md](docs/testing/MANUAL_TESTPLAN_DE.md)

## Repository Layout

- `index.html`, `app.js`, `styles.css`, `app-config.js` - static app
- `firebase.rules` - Firestore Security Rules
- `data/samples/` - synthetic sample CSV files
- `docs/deployment/` - GitHub Pages and Firebase setup
- `docs/handoff/` - imported ChatGPT handoff and decisions
- `docs/testing/` - manual operator test plan
- `docs/agents/` - shared agent knowledge and collaboration rules
- `.claude/skills/` - repo-local workflow skills

## Local Use

Open `index.html` in a browser. With placeholder Firebase config, the app shows setup instructions. For live testing, configure Firebase in `app-config.js`.

## Deployment Summary

1. Create Firebase project.
2. Enable Firestore Database.
3. Enable Anonymous Authentication.
4. Publish `firebase.rules`.
5. Add Firebase web config to `app-config.js`.
6. Push repository to GitHub.
7. Enable GitHub Pages from `main` branch and `/root`.
8. Open app with `?setup=1` to create the event.

Full German deployment steps: [docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md](docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md).

## Do Not Commit

- Real guest data.
- Real PINs.
- Firebase service-account keys.
- Private backup exports.

Use `data/samples/` for test data only.

