# Firestore Datenmodell — MVP

Dieses Datenmodell beschreibt die aktuelle Zielstruktur. `app.js` und `firebase.rules` müssen dazu konsistent bleiben.

## Collections

```text
events/{eventId}
events/{eventId}/private/security
events/{eventId}/members/{uid}
events/{eventId}/guests/{guestDocId}
events/{eventId}/auditLog/{logId}
```

## events/{eventId}

Öffentliche Event-Metadaten. Enthält keine PIN-Hashes.

Erwartete Felder:

- `name`
- `date`
- `categories`
- `statuses`
- `createdAt`
- `updatedAt`
- `createdByUid`

## events/{eventId}/private/security

Privates Security-Dokument. Nur Admins dürfen es lesen oder aktualisieren.

Erwartete Felder:

- `adminPinHash`
- `checkinPinHash`
- `createdAt`
- `updatedAt` optional nach PIN-Reset

## events/{eventId}/members/{uid}

Temporäre Rollen-/Sessiondaten für anonym authentifizierte Clients.

Erwartete Felder:

- `uid`
- `role`: `admin` oder `checkin`
- `pinHash`
- `displayName`
- `deviceLabel`
- `createdAt`
- `updatedAt`

## events/{eventId}/guests/{guestDocId}

Erwartete Felder:

- `guestId`
- `name`
- `searchName`
- `category`
- `status`: `open`, `checked_in`, `no_show`
- `supportComment`: Info von Check-in Staff für alle
- `adminStaffInfo`: Info von Administratoren an Check-in Staff
- `checkedInAt`
- `checkedInByUid`
- `checkedInByName`
- `checkedInDevice`
- `createdAt`
- `updatedAt`
- `createdByUid`
- `createdByName`
- `lastActionAt`
- `lastActionByName`

## events/{eventId}/guestAdminNotes/{guestDocId}

Admin-geschützte Zusatzdaten pro Gast. Diese Daten liegen bewusst nicht im normalen Gast-Dokument, weil Check-in Staff `guests` lesen darf.

Erwartete Felder:

- `internalNote`: Info nur für Administratoren
- `updatedAt`
- `updatedByName`

## events/{eventId}/auditLog/{logId}

Erwartete Felder:

- `action`
- `guestDocId`
- `guestId`
- `guestName`
- `category`
- `details`
- `actorUid`
- `actorName`
- `deviceLabel`
- `createdAt`

## Wichtige Datenregeln

- Ein Gast gehört zu genau einem Event.
- `guestId` soll innerhalb eines Events eindeutig sein. Der CSV Import blockiert doppelte IDs in der Datei und bei Zusatzimporten auch IDs, die bereits im Event existieren.
- `status` darf nur `open`, `checked_in`, `no_show` sein.
- Doppel-Check-in-Schutz muss per Firestore Transaction geschehen.
- Check-in Staff darf Status auf `checked_in` setzen und `supportComment` ändern, aber keine Admin-Infos ändern und keine Gäste löschen.
- Admin darf Import, Export, Massen-No-Show, PIN-Reset und Korrekturen durchführen.
- Admin-only Infos liegen unter `guestAdminNotes` und dürfen nur von Admins gelesen und geschrieben werden.

## Zu prüfen

- Firestore Security Rules erlauben Setup-Flow.
- Firestore Security Rules erlauben `members` Schreibvorgang nach PIN-Verifikation.
- Firestore Security Rules erlauben `guests` Update für Check-in Staff.
- Firestore Security Rules blockieren Staff-Überschreiben eines bereits eingecheckten Gasts.
- Aktuelle Rules passen zum PIN-basierten MVP.
