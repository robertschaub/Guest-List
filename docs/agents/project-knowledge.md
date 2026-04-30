# Project Knowledge

## Purpose

This repository hosts a static GitHub Pages guest-list check-in app for a real event MVP. The product direction comes from the ChatGPT handoff imported into root files and `docs/handoff/`.

## Current Architecture

- `index.html` provides the static app shell.
- `styles.css` owns visual layout and responsive behavior.
- `app-config.js` contains Firebase Web App configuration placeholders.
- `app.js` owns Firebase initialization, Anonymous Auth, Firestore reads/writes, event setup, role join, guest import/export, check-in, dashboard, and audit behavior.
- `firebase.rules` contains Firestore Security Rules.
- GitHub Pages publishes from `main` branch `/root`.
- Firebase Firestore stores live event, members, guests, private security hashes, and audit log data.

## Primary Handoff Docs

- `CODEX_START_HERE.md`
- `docs/handoff/KNOWLEDGE_TRANSFER_DE.md`
- `docs/handoff/MVP_SCOPE_AND_DECISIONS_DE.md`
- `docs/handoff/FIRESTORE_DATA_MODEL_DE.md`
- `docs/handoff/KNOWN_LIMITATIONS_DE.md`
- `docs/testing/MANUAL_TESTPLAN_DE.md`
- `docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md`

## Data Model

High-level Firestore structure:

```text
events/{eventId}
events/{eventId}/private/security
events/{eventId}/members/{uid}
events/{eventId}/guests/{guestDocId}
events/{eventId}/auditLog/{logId}
```

Guest status values:

- `open`
- `checked_in`
- `no_show`

Default categories:

- GA
- Member GA
- Member VIP
- On Stage
- Mitarbeiter

## MVP Boundaries

In scope:

- German UI.
- GitHub Pages static frontend.
- Firebase Firestore live sync.
- Anonymous Auth.
- PIN-based role entry.
- CSV import/export.
- 1200 guest target.
- About 5 concurrent check-in devices.

Out of scope:

- Real user accounts.
- QR/barcode scan.
- Full offline multi-device sync.
- Badge printing.
- RSVP.
- Email invitations.
- Server backend or Cloud Functions.

## Verification Notes

Minimum checks after JavaScript edits:

```powershell
Get-Content app.js -Raw | node --check --input-type=module
```

Manual checks should cover:

- Firebase config missing state.
- Setup with `?setup=1`.
- Admin and Check-in Staff role entry.
- CSV import with comma, semicolon, tab, German umlauts.
- Search by name and Guest ID.
- Check-in from two windows/devices.
- Duplicate check-in prevention.
- Support comment update.
- CSV export.
- Firestore Rules smoke test.

