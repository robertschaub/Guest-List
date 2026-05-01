# Firestore Datenmodell — MVP

Dieses Datenmodell beschreibt die aktuelle Zielstruktur. `app.js` und `firebase.rules` müssen dazu konsistent bleiben.

## Collections

```text
appSecurity/admin
events/{eventId}
events/{eventId}/private/security
events/{eventId}/members/{uid}
events/{eventId}/guests/{guestDocId}
events/{eventId}/guestAdminNotes/{guestDocId}
events/{eventId}/auditLog/{logId}
```

## appSecurity/admin

Globales Security-Dokument für Admin-Zugänge. Es ist nicht event-spezifisch.

Erwartete Felder:

- `authorizingEventId`: Event-ID, über die Master-Admin-Schreibrechte für dieses globale Dokument geprüft werden
- `createdByUid`
- `adminPinHash`: Hash des namenlosen Master Admin-PIN
- `adminPinHashes`: Liste der namenlosen Master Admin-PIN-Hashes, maximal ein Eintrag
- `adminNamedPinHashes`: Liste der benannten Admin-PIN+Name-Hashes
- `adminNamedPins`: Liste benannter Admin-PIN-Einträge zur Master-Admin-Anzeige und Löschung
- `createdAt`
- `updatedAt` optional nach PIN-Änderungen

## events/{eventId}

Öffentliche Event-Metadaten. Enthält keine PIN-Hashes.

Erwartete Felder:

- `name`
- `date`
- `checkinAccessStartsAt`: Beginn des Check-in-Staff-Zugriffs als Firestore Timestamp
- `checkinAccessEndsAt`: Ende des Check-in-Staff-Zugriffs als Firestore Timestamp, Eventtag plus Folgetag 02:00 Uhr
- `categories`
- `statuses`
- `createdAt`
- `updatedAt`
- `createdByUid`

## events/{eventId}/private/security

Privates Security-Dokument pro Event. Nur Admins dürfen es lesen oder aktualisieren. Es enthält Check-in-PINs für genau diesen Event. Ältere Dokumente können noch Admin-PIN-Felder enthalten; diese gelten nur als Legacy-Daten.

Erwartete Felder:

- `checkinPinHash`
- `checkinPinHashes`: Liste der namenlosen Check-in-PIN-Hashes, maximal ein Eintrag
- `checkinPinValue`: admin-lesbarer Check-in-PIN ohne Namen für Anzeige/Verbergen im Adminbereich
- `checkinNamedPinHashes`: Liste der Check-in-PIN+Name-Hashes
- `checkinNamedPins`: Liste benannter Check-in-PIN-Einträge zur Admin-Anzeige, Anzeige/Verbergen und Löschung
- `createdAt`
- `updatedAt` optional nach PIN-Reset

## events/{eventId}/members/{uid}

Temporäre Rollen-/Sessiondaten für anonym authentifizierte Clients.

Erwartete Felder:

- `uid`
- `role`: `admin` oder `checkin`
- `pinHash`
- `pinNameHash`
- `displayNameKey`: normalisierter Name für case-insensitive PIN+Name-Prüfung
- `displayName`
- `deviceLabel`: automatisch lokal erzeugte Geräte-ID bzw. Admin-gepflegter Gerätename
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
- Check-in Staff darf nur innerhalb des Firestore-geprüften Zeitfensters `checkinAccessStartsAt` bis `checkinAccessEndsAt` lesen und schreiben.
- Admin darf Import, Export, Massen-No-Show, PIN-Reset und Korrekturen durchführen.
- Nur der namenlose Master Admin-PIN darf ein komplettes Event löschen. Dabei müssen Gäste, Admin-Notizen, Geräte/Sessions, Event-PINs und Audit Log vor bzw. mit dem Event entfernt werden.
- Admin darf angemeldete Geräte über deren `members/{uid}` Dokument abmelden; Benutzer dürfen ihr eigenes Member-Dokument zum Abmelden löschen.
- Benutzer geben beim Anmelden keinen Gerätenamen ein. Die App erzeugt lokal eine Geräte-ID; Admins dürfen den Gerätenamen im Admin-Tab ändern.
- Bei Anmeldung mit gleichem Rollennamen auf mehreren Geräten fragt die App, ob andere Geräte mit gleicher Rolle und gleichem `displayNameKey` abgemeldet werden sollen. Check-in Staff darf dafür nur solche eigenen Namens-Sessions lesen und löschen.
- Admin-only Infos liegen unter `guestAdminNotes` und dürfen nur von Admins gelesen und geschrieben werden.
- Admin-PINs sind global. Der namenlose Admin-PIN ist der Master Admin-PIN; nur Master Admins dürfen benannte Admin-PINs erstellen, ändern oder löschen.
- Check-in-PINs sind event-spezifisch. Pro Event darf es mehrere benannte Check-in-PINs geben und maximal einen namenlosen Check-in-PIN.
- Bei benannten PINs muss beim Anmelden der Name case-insensitive passen, der PIN bleibt case-sensitive.

## Zu prüfen

- Firestore Security Rules erlauben Setup-Flow.
- Firestore Security Rules erlauben `members` Schreibvorgang nach PIN-Verifikation.
- Firestore Security Rules erlauben `guests` Update für Check-in Staff.
- Firestore Security Rules blockieren Staff-Überschreiben eines bereits eingecheckten Gasts.
- Aktuelle Rules passen zum PIN-basierten MVP.
