---
name: guest-list-ui
description: Use when changing guest-list features, German UI text, mobile check-in workflow, CSV import/export, filtering/search, dashboard totals, accessibility, or responsive UI in the static app.
---

# Guest List UI Skill

Use this workflow for app behavior and interface changes.

## Principles

- Preserve the German, mobile-first check-in workflow.
- Keep common event actions fast: role entry, search, check-in, support comment update, CSV import, CSV export, dashboard review.
- Keep search client-side over loaded guests; do not query Firestore on each keystroke.
- Preserve accessibility labels and keyboard-friendly controls where present.
- Keep layout stable on narrow mobile screens and tablet-sized devices.
- Avoid decorative complexity that makes the tool harder to scan at the event entrance.

## MVP Data

Guest records should remain compatible with `firebase.rules` and `docs/handoff/FIRESTORE_DATA_MODEL_DE.md`.

Core guest fields:

- `guestId`
- `name`
- `searchName`
- `category`
- `status`
- `supportComment`
- `internalNote`
- `checkedInAt`
- `checkedInByUid`
- `checkedInByName`
- `checkedInDevice`
- `createdAt`
- `updatedAt`

Status values:

- `open`
- `checked_in`
- `no_show`

## Verification

After JavaScript edits:

```powershell
Get-Content app.js -Raw | node --check --input-type=module
```

Manual checks should cover setup, role join, CSV import, search, duplicate check-in behavior, support comments, No Show, export, and reload behavior.

