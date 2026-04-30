---
name: firebase-firestore
description: Use when changing Firebase configuration, Firestore data model, security rules, Anonymous Auth flow, transaction behavior, audit log writes, or Firestore read/write efficiency.
---

# Firebase Firestore Skill

Use this workflow for Firebase and Firestore changes.

## Required Reads

1. `AGENTS.md`
2. `app.js`
3. `firebase.rules`
4. `docs/handoff/FIRESTORE_DATA_MODEL_DE.md`
5. `docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md`

## Rules

- Keep Firebase client config in `app-config.js`.
- Do not add service-account keys, Admin SDK usage, Cloud Functions, or server code for the MVP.
- Keep Anonymous Auth.
- Access control is Event ID + role + PIN hash + Firestore Security Rules.
- Duplicate check-in protection must use Firestore transaction behavior, not only disabled buttons.
- Staff writes must remain narrowly scoped: check-in status changes and support comments only.
- Admin writes may import, edit, delete, mark No Show, and export.
- Keep Firestore reads low enough for about 1200 guests and about 5 devices.

## Verification

- Compare every changed Firestore field with `firebase.rules`.
- Check that event setup creates the public event document, private security document, and admin member record expected by the rules.
- Check that member join writes satisfy `validMemberWrite`.
- Check that check-in updates satisfy `staffGuestUpdateAllowed`.
- Run JavaScript syntax check:

```powershell
Get-Content app.js -Raw | node --check --input-type=module
```

Do not deploy rules unless the user explicitly asks.

