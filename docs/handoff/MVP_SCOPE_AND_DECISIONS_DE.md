# MVP Scope & Entscheidungen

## Benutzerentscheidungen

Der Benutzer hat folgende Optionen für die Implementierung gewählt:

```text
1 B  = Statische App + Firebase
3    = ca. 1200 Gäste
10   = Check-in Workflow: Ja
20 D = GitHub Pages
Rest = Defaults
```

## Konsequenzen

### Architektur

```text
GitHub Pages
  └─ statische Dateien: index.html, app.js, styles.css, app-config.js
Firebase
  ├─ Anonymous Auth
  └─ Cloud Firestore
```

### Kein klassisches Hosting

- Kein VPS.
- Kein Docker-Server.
- Keine kostenpflichtigen Functions.
- Kein Backend-Server, der gewartet werden muss.

### Keine App-User-Accounts im MVP

Die breiteren Requirements enthalten Rollen und Teammitglieder. Für den MVP gilt jedoch:

- Keine echten Nutzerkonten.
- Keine E-Mail-Logins.
- Keine Rollenverwaltung mit Accounts.
- Zugriff über Event-Link + PIN.
- Firebase Anonymous Auth nur als technische Grundlage für Firestore Rules.

## MVP-Modi

### Admin

Darf:

- Event erstellen.
- PINs setzen.
- Gäste importieren.
- Gäste manuell hinzufügen.
- Gäste exportieren.
- Offene Gäste auf No Show setzen.
- Check-ins überschreiben/korrigieren.

### Check-in Staff

Darf:

- Gäste suchen.
- Gäste einchecken.
- Support-Kommentar sehen und bearbeiten.
- Kategorie und Status sehen.

Darf nicht:

- Gäste löschen.
- Event konfigurieren.
- PINs ändern.
- Massenaktionen ausführen.

## Kategorien

Finale MVP-Kategorien:

- GA
- Member GA
- Member VIP
- On Stage
- Mitarbeiter

## Datenfelder

### Gast

- Firestore Document ID
- Guest ID
- Name
- Search Name
- Kategorie
- Status
- Check-in-Zeit
- Check-in durch UID
- Check-in durch Name
- Check-in Gerät
- Support-Kommentar
- Interne Notiz
- Created At
- Updated At
- Created By

### Event

- Event ID
- Name
- Kategorien
- Admin PIN Hash
- Check-in PIN Hash
- Created At
- Updated At

### Audit Log

- Aktion
- Gast-ID
- Gastname
- Alter Wert
- Neuer Wert
- Actor UID
- Actor Name
- Timestamp

## Out of Scope für morgen

- QR-/Barcode-Scan.
- Offline-Synchronisation zwischen Geräten.
- Echte Benutzer-Accounts.
- E-Mail-Einladungen.
- RSVP.
- Badge-/Label-Druck.
- Mehrere Events je Account mit vollwertiger Organisation.
- Zahlung/Ticketverkauf.
- DSGVO-Löschkonzept über MVP hinaus.

## Qualitätsziel für morgen

Die App muss für einen realen Event brauchbar sein:

- Setup machbar ohne Programmierer vor Ort.
- Check-in auf 5 Geräten möglich.
- Suche schnell genug bei 1200 Gästen.
- Doppelte Check-ins werden verhindert oder klar gewarnt.
- Export/Backup funktioniert.
- Dokumentation reicht für Deployment.

Perfektion ist nicht Ziel. Stabilität und einfache Bedienung sind wichtiger als neue Features.
