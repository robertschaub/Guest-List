# Firestore Datenmodell — MVP

Dieses Datenmodell beschreibt die aktuelle Zielstruktur. `app.js` und `firebase.rules` müssen dazu konsistent bleiben.

## Collections

```text
appSecurity/admin
appGuides/{guideId}
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
- `adminPinHash`: Hash des versteckten technischen Notfall-Admin-PIN
- `adminPinHashes`: Liste der technischen Notfall-Admin-PIN-Hashes, maximal ein Eintrag
- `adminMasterNamedPinHashes`: Liste persönlicher Admin-PIN+Name-Hashes, die zusätzlich als Master Admin berechtigt sind
- `adminNamedPinHashes`: Liste der persönlichen Admin-PIN+Name-Hashes
- `adminNamedPins`: Liste persönlicher Admin-PIN-Einträge zur Master-Admin-Anzeige, Änderung und Löschung. Der Admin-PIN-Klartext wird nicht dauerhaft gespeichert; Kopieren ist nur direkt nach dem Erstellen oder Ändern aus der aktuellen Eingabe möglich.
- `createdAt`
- `updatedAt` optional nach PIN-Änderungen

## appGuides/{guideId}

Globale Anleitungstexte für die In-App-Anleitung. Sie gelten für alle Events.

Erlaubte Dokument-IDs:

- `admin`: Anleitung für Administratoren
- `checkin`: Anleitung für Check-in Staff
- `emergency`: Notfallkarte

Erwartete Felder:

- `title`
- `body`: einfacher Text mit optionalen Überschriften und Listen; HTML wird durch die App nicht übernommen
- `updatedAt`
- `updatedByName`

## events/{eventId}

Öffentliche Event-Metadaten. Enthält keine PIN-Hashes.

Erwartete Felder:

- `name`
- `date`
- `checkinAccessStartsAt`: Beginn des Check-in-Staff-Zugriffs als Firestore Timestamp, durch Admins im Event bearbeitbar
- `checkinAccessEndsAt`: Ende des Check-in-Staff-Zugriffs als Firestore Timestamp, durch Admins im Event verlängerbar oder verkürzbar
- `categories`
- `statuses`
- `hidden`: optionaler Boolean; `true` blendet das Event aus normalen Eventlisten aus
- `hiddenAt`, `hiddenByUid`, `hiddenByName`: optionale Audit-Metadaten zum Verstecken
- `createdAt`
- `updatedAt`
- `createdByUid`

## events/{eventId}/private/security

Privates Security-Dokument pro Event. Nur Admins dürfen es lesen oder aktualisieren. Es enthält Check-in-PINs für genau diesen Event. Ältere Dokumente können noch Admin-PIN-Felder enthalten; diese gelten nur als Legacy-Daten.

Erwartete Felder:

- `checkinNamedPinHashes`: Liste der Check-in-PIN+Name-Hashes
- `checkinNamedPins`: Liste der Check-in-PIN-Einträge mit Name oder Position zur Admin-Anzeige, Anzeige/Verbergen und Löschung
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
- `status`: `open`, `checked_in`
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
- `status` darf nur `open`, `checked_in` sein. Offene Gäste entsprechen am Eventende den No-Shows.
- Doppel-Check-in-Schutz muss per Firestore Transaction geschehen.
- Check-in Staff darf Status auf `checked_in` setzen, eigene Check-ins während 1 Minute wieder auf `open` zurücksetzen und `supportComment` ändern, aber keine Admin-Infos ändern und keine Gäste löschen. Die App hält eigene rückgängig machbare Check-ins während dieses Zeitfensters in der Check-in-Liste sichtbar, auch wenn Suche, Status- oder Kategorie-Filter sie sonst ausblenden würden.
- Check-in Staff darf nur innerhalb des Firestore-geprüften Zeitfensters `checkinAccessStartsAt` bis `checkinAccessEndsAt` lesen und schreiben. Admins können dieses Zeitfenster pro Event ändern, um Test- oder Demo-Events kontrolliert weiterzuverwenden.
- Die In-App-Anleitungen sind global gespeichert. Die UI zeigt Check-in Staff `checkin` und `emergency`; Admins sehen zusätzlich `admin`. Nur Master Admins dürfen Anleitungstexte erstellen, ändern oder löschen.
- Admin darf Import, Export, PIN-Reset und Korrekturen durchführen.
- Admin darf auch vergangene und versteckte Events über die Eventliste oder direkte Event-Links öffnen und bearbeiten.
- Admin darf Event-Metadaten auflisten, damit aktive, vergangene und inaktive/versteckte Events im Adminbereich zum Bearbeiten auswählbar sind.
- Nur Master Admins dürfen Events verstecken oder wieder sichtbar machen. Nicht-Master-Admins sehen diese Aktion nicht. Versteckte Events sind für Check-in Staff gesperrt, bleiben für Admins aber sichtbar und bearbeitbar.
- Nur Master Admins dürfen ein komplettes Event löschen. Nicht-Master-Admins sehen die Löschaktion nicht. Dabei müssen Gäste, Admin-Notizen, Geräte/Sessions, Event-PINs und Audit Log vor bzw. mit dem Event entfernt werden. Globale Anleitungen bleiben bei Event-Löschung erhalten.
- Admin darf angemeldete Geräte über deren `members/{uid}` Dokument abmelden; Benutzer dürfen ihr eigenes Member-Dokument zum Abmelden löschen.
- Benutzer geben beim Anmelden keinen Gerätenamen ein. Die App erzeugt lokal eine Geräte-ID; Admins dürfen den Gerätenamen im Admin-Tab ändern.
- Bei Anmeldung mit gleichem Rollennamen auf mehreren Geräten fragt die App, ob andere Geräte mit gleicher Rolle und gleichem `displayNameKey` abgemeldet werden sollen. Check-in Staff darf dafür nur solche eigenen Namens-Sessions lesen und löschen.
- Admin-only Infos liegen unter `guestAdminNotes` und dürfen nur von Admins gelesen und geschrieben werden.
- Admin-PINs sind global. Der feste technische Notfall-Admin bleibt im UI verborgen und wird nur mit `displayNameKey = main` akzeptiert. Master Admins dürfen Admins zusätzlich als Master Admin berechtigen oder diese Berechtigung wieder entziehen. Nur Master Admins dürfen persönliche Admin-PINs erstellen, die eigene PIN ändern und PINs von Nicht-Master-Admins ändern oder löschen. PINs anderer Master Admins sind geschützt; zum Verwalten muss zuerst die Master-Berechtigung entzogen werden. Nicht-Master-Admins sehen diese Controls nicht. Die UI nutzt ein gemeinsames Admin-PIN-Formular für persönliche Admin-Logins; der reservierte technische Admin-Name kann dort nicht erstellt oder geändert werden. Beim Erstellen und Ändern wird der eigene Master-Admin-PIN verlangt. Technischer Notfall-PIN und persönliche Admin-PINs dürfen nicht denselben PIN-Wert verwenden. Der eigene Admin-PIN darf geändert, aber nicht aus der laufenden Sitzung heraus gelöscht werden. Nach dem Erstellen oder Ändern bietet die UI einmalig das Kopieren von Name und PIN an, ohne den PIN später auslesbar zu speichern.
- Check-in-PINs sind event-spezifisch und haben immer Name oder Position. Pro Event darf es mehrere Check-in-PINs geben, z.B. `Check-in Team`, `Eingang 1`, `Guest Support`.
- Beim Check-in-Login muss der Name case-insensitive zum Check-in-PIN passen, der PIN bleibt case-sensitive.

## Zu prüfen

- Firestore Security Rules erlauben Setup-Flow.
- Firestore Security Rules erlauben `members` Schreibvorgang nach PIN-Verifikation.
- Firestore Security Rules erlauben `guests` Update für Check-in Staff.
- Firestore Security Rules blockieren Staff-Überschreiben eines bereits eingecheckten Gasts.
- Aktuelle Rules passen zum PIN-basierten MVP.
