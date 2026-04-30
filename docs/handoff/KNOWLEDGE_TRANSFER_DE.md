# Knowledge Transfer — Gästelisten-Web-App

## Ausgangslage

Der Benutzer benötigte zunächst eine kostenlose Lösung für Event-Management und Gästelistenverwaltung. Es wurde eine Google-Sheets-Lösung erstellt und mehrfach erweitert. Später wurde entschieden, daraus eine Web-App zu machen, da der Check-in über mehrere Geräte stabiler und einfacher bedienbar sein soll.

## Bisherige Entwicklung im Chat

### 1. Tool-Recherche

Es wurden zunächst Freeware-/kostenlose Optionen für Gästelisten geprüft:

- Eventfrog
- Let’s Meet
- guestoo
- GuestlistOnline
- Google Forms + Google Sheets
- pretix
- Indico

Ergebnis: Google Sheets war für einen schnellen Start okay, Eventfrog und Open-Source-Apps wurden später erneut betrachtet.

### 2. Google-Sheets-Prototyp

Der erste Prototyp hatte:

- Tab `Gäste`
- Gäste-Namen
- Kategorien
- Check-in Status
- Check-in Tabs
- Kategorie-Listen
- Summen

Kategorien:

- GA
- Member GA
- Member VIP
- On Stage

Später ergänzt:

- Mitarbeiter
- Support-Kommentar pro Gast

### 3. Multi-User-Anforderung

Der Benutzer fragte, ob ca. 5 Mobile/Tablets gleichzeitig arbeiten können. Ergebnis:

- Google Sheets ist grundsätzlich multi-user-fähig.
- Gemeinsame Suchfelder/Filter sind problematisch.
- Deshalb wurden separate Check-in Tabs 1–5 erstellt.

### 4. Problem mit Checkboxen

Der Benutzer meldete, dass Checkboxen in den Check-in Tabs nicht funktionieren.

Einschätzung:

- Checkboxen in gefilterten/gespiegelten Check-in Tabs können nicht automatisch zuverlässig in den zentralen Gäste-Tab zurückschreiben.
- Dafür wurde ein Google Apps Script Fix vorbereitet.
- Dieser Weg wurde später zugunsten einer Web-App verlassen.

Referenzdateien liegen unter:

```text
docs/legacy/google-sheets/
```

### 5. Requirements-Dokument

Der Benutzer wollte ein Requirements-Dokument für eine Web-App. Zuerst wurde das klassische Format verwendet:

```text
As a <User> I want to <demand>, so that <purpose>.
```

Danach wurde ein besseres Format empfohlen und auf Deutsch umgesetzt:

```text
Requirement Card
- Requirement ID
- Priorität
- Akteur
- Job Story: Wenn ..., möchte ich ..., damit ...
- Akzeptanzkriterien: Gegeben / Wenn / Dann
- Geschäftsregeln
- Datenfelder
- Rechte
- Edge Cases / Notizen
```

Das deutsche Requirements-Dokument liegt hier:

```text
docs/requirements/anforderungen_requirement_cards_de.md
```

Wichtig: Dieses Dokument ist breiter als der aktuelle MVP. Im MVP sind echte User-Accounts ausdrücklich nicht vorgesehen.

### 6. Hosting-Entscheidung

Der Benutzer möchte möglichst keine Hostingkosten. Gewünscht war einfaches Deployment, im Wesentlichen Dateien hochladen.

Zuerst wurden Optionen diskutiert:

- Google Apps Script + Google Sheet Backend
- Firebase + statisches Frontend
- Cloudflare Pages/Workers/D1
- Supabase/Vercel
- GitHub Pages

Benutzerentscheidung:

```text
1 B  = Statische App + Firebase
3    = ca. 1200 Gäste
10   = Check-in Workflow ja
20 D = GitHub Pages
Rest = Default
```

Daraus folgt:

- GitHub Pages für Frontend.
- Firebase Firestore als Live-Datenbank.
- Firebase Anonymous Auth.
- Kein klassisches Hosting.
- Keine App-Accounts im MVP.
- PIN-basierter Zugriff.

### 7. Eventfrog-Prüfung

Eventfrog wurde gegen die wichtigsten Anforderungen geprüft.

Eventfrog unterstützt stark:

- Ticketkategorien
- QR-Check-in
- Namenssuche
- Multi-Device Entry App
- Offline-Scanning mit Einschränkungen
- Export
- Kategorie-Statistiken

Einschränkungen für unseren Use Case:

- Eventfrog ist ticket-/anmeldungsbasiert, nicht frei editierbare interne Gästedatenbank.
- Support-Kommentar pro Gast ist nicht sauber als internes Check-in-Feature im Free-Modell abgedeckt.
- Bestehende Gästeliste als einfache CSV importieren war nicht sauber belegt.
- Private/geschützte Kategorien können kostenpflichtig sein.

Vorläufiges Urteil: Eventfrog ist gut für Ticketing/Einlass, aber für diese spezifische interne Gästeliste mit Support-Kommentaren und freiem Import ist eine eigene App weiterhin sinnvoll.

### 8. Open-Source-Recherche

Es wurde nach Open-Source-Alternativen gesucht:

- Hi.Events
- pretix
- alf.io
- Attendize
- Indico

Ranking aus dem Chat:

1. Hi.Events — beste externe Option, modern, QR-Check-in, manuelle Gäste, Export.
2. pretix — sehr robust, aber komplexer.
3. alf.io — gut bei CSV-Import und Custom Fields, aber technischer.
4. Attendize — funktional, aber älter.
5. Indico — mächtig, aber Overkill.

Trotzdem wurde wegen Zeitdruck und spezifischem MVP eine eigene statische Firebase-App vorbereitet.

## Aktuelle MVP-Anforderungen

### Muss morgen einsatzbereit sein

- Kein perfektes Produkt, aber brauchbar.
- Kompromisse sind akzeptabel.
- Deployment einfach.
- Keine laufenden Hostingkosten im Normalfall.

### Fixe Kategorien

- GA
- Member GA
- Member VIP
- On Stage
- Mitarbeiter

### Gastfelder

- Guest ID
- Name
- Kategorie
- Status
- Check-in-Zeit
- Check-in durch / Mitarbeitername
- Gerät / Check-in Station
- Support-Kommentar
- Interne Notiz

### Statuswerte

Technisch:

- `open`
- `checked_in`
- `no_show`

Deutsch angezeigt:

- Offen
- Eingecheckt
- No Show

### Rollen im MVP

Keine echten Accounts, sondern Modi:

- Admin
- Check-in Staff

Optional später:

- Viewer
- Door Manager
- echte User-Accounts

### Zugriff im MVP

- Event-Link enthält Event-ID.
- Admin-PIN für Admin-Funktionen.
- Check-in-PIN für Check-in Staff.
- Firebase Anonymous Auth für technische Authentifizierung.

### Check-in Workflow

1. Mitarbeiter öffnet Event-Link.
2. Rolle Check-in Staff wählen.
3. Check-in PIN eingeben.
4. Namen/Gerät eingeben.
5. Gast nach Name oder Guest ID suchen.
6. Trefferliste zeigt Name, Kategorie, Status, Support-Kommentar.
7. Klick auf Einchecken.
8. App schreibt Status zentral in Firestore.
9. Bereits eingecheckte Gäste erzeugen Warnung.
10. Admin kann Check-in überschreiben/korrigieren.

### Doppel-Check-in

Muss serverseitig/datenbankseitig geschützt werden, nicht nur im UI.

Im aktuellen Code ist eine Firestore Transaction vorgesehen. Codex soll prüfen, dass dies wirklich robust ist.

### Import/Export

MVP:

- CSV Import.
- CSV Export für Backup.
- Excel-Dateien müssen vorher als CSV exportiert werden.

Wichtig für Codex:

- Deutsche Excel-CSV verwendet häufig Semikolon.
- UTF-8/Umlaute müssen sauber funktionieren.
- Import sollte bei ca. 1200 Gästen funktionieren.

### Performance

Ziel:

- ca. 1200 Gäste
- ca. 5 Geräte
- Suche möglichst clientseitig auf geladenen Gästen
- Keine Firestore-Abfrage bei jedem Tastendruck
- Live-Sync über Snapshot Listener okay, aber Reads im Blick behalten

### Backup

Vor Eventbeginn:

- komplette Gästeliste exportieren.
- Nach Import und Test Backup ziehen.

Bei Internetausfall:

- CSV Backup als Notfall-Liste verwenden.
- Vollwertiger Offline-Multi-Device-Modus ist nicht Teil des MVP.

## Was Codex jetzt tun soll

Codex soll nicht neu planen, sondern:

1. Aktuelle App prüfen.
2. GitHub-Pages-Kompatibilität sicherstellen.
3. Firebase-Konfiguration prüfen.
4. Firestore Rules prüfen.
5. CSV Import robust machen.
6. 1200-Gäste-Testdaten/Simulation vorbereiten.
7. Manuelle Testcheckliste finalisieren.
8. Dokumentation für Deployment vervollständigen.
9. Wenn möglich offensichtliche Bugs beheben.
10. Repo nach GitHub pushbar machen.

## Wichtigste Risiken

1. Firestore Rules blockieren legitime App-Aktionen.
2. CSV Import scheitert bei Semikolon oder Umlauten.
3. GitHub Pages Pfade funktionieren nicht im Repository-Subpfad.
4. Doppelte Check-ins werden bei parallelen Geräten nicht sicher verhindert.
5. Keine echte Offline-Fähigkeit bei Internetausfall.
6. Free-Tier Limits können bei vielen Reloads/Tests belastet werden.
7. PIN-basierter Zugriff ist pragmatisch, aber kein vollwertiges Account-/Audit-System.

## Dateien im Repo

### App-Code

```text
index.html
app.js
styles.css
app-config.js
manifest.webmanifest
firebase.rules
sample_guests.csv
```

### Wichtige Handoff-Dokumente

```text
CODEX_START_HERE.md
AGENTS.md
docs/handoff/KNOWLEDGE_TRANSFER_DE.md
docs/handoff/CODEX_PROMPT.md
docs/handoff/MVP_SCOPE_AND_DECISIONS_DE.md
```

### Requirements

```text
docs/requirements/anforderungen_requirement_cards_de.md
```

### Deployment & Test

```text
docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md
docs/testing/MANUAL_TESTPLAN_DE.md
```
