# Prompt für Codex GPT-5.5

Diesen Prompt kannst du in Codex verwenden, nachdem das Repository lokal unter `C:\DEV\Guest-List` liegt.

```text
You are working on a time-critical MVP web app for event guestlist check-in.

Context:
- The app must be usable tomorrow.
- Hosting must be free or near-free.
- Frontend is static and should be deployed to GitHub Pages.
- Backend is Firebase Firestore.
- Authentication is Firebase Anonymous Auth.
- No real user accounts are required for the MVP.
- Access control is via Event ID + role + PIN.
- Expected guest count: about 1200 guests.
- Expected check-in devices: around 5 mobile/tablet devices.
- The app must support German UI.
- QR/barcode scan is out of scope for the MVP.
- Offline multi-device sync is out of scope for the MVP.

MVP features:
- Initialize an event
- Set Admin PIN and Check-in PIN
- Import guests from CSV
- Add/edit guests manually if supported by current code
- Categories: GA, Member GA, Member VIP, On Stage, Mitarbeiter
- Guest fields: Guest ID, Name, Category, Status, Check-in Time, Checked in By, Device/Station, Support Comment, Internal Note
- Search guests by name or Guest ID
- Check in a guest
- Prevent duplicate check-ins using a Firestore transaction
- Show warning if guest is already checked in
- Allow support comment editing
- Status values: Offen, Eingecheckt, No Show
- Category lists with totals
- Overview: total, checked in, open, no show
- CSV export
- Audit log
- Mobile-first UI

Your task:
1. Review the existing codebase.
2. Do not redesign the architecture unless absolutely necessary.
3. Make the app production-usable for a small real event tomorrow.
4. Fix obvious bugs.
5. Add missing safety checks.
6. Ensure Firebase config is separated in app-config.js.
7. Ensure the app works on GitHub Pages, including relative paths and repository subpaths.
8. Ensure Firestore reads/writes are efficient for about 1200 guests and 5 devices.
9. Ensure duplicate check-in protection uses a Firestore transaction and is not only frontend logic.
10. Ensure CSV import/export works with German umlauts and ideally comma, semicolon, and tab delimiters.
11. Create or update README_DE.md with exact deployment steps.
12. Create/update a sample CSV with at least 30 guests across all categories.
13. Add or update a manual test checklist for the event operator.
14. Do not add paid services.
15. Do not add user login/accounts.
16. Do not commit real Firebase credentials, real PINs, or real guest data.

Before changing files:
- Summarize the current app structure.
- Identify the top 5 risks for tomorrow’s deployment.
- Then implement fixes.

After changing files:
- Summarize exactly what changed.
- List remaining known limitations.
- Give the exact deployment steps for GitHub Pages + Firebase.
```

## Zusätzliche harte Leitplanken

```text
Do not replace the MVP with React, Next.js, Supabase, Express, Docker, Vercel, or a new architecture.
Keep it static GitHub Pages + Firebase Firestore.
```
