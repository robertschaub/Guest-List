# Gästeliste Check-in Web-App

Statische Web-App für Event-Gästeliste, Check-in auf mehreren Mobile-/Tablet-Geräten und zentrale Live-Daten in Firebase Firestore.

## Was ist drin?

- GitHub-Pages-kompatible statische Dateien: `index.html`, `app.js`, `styles.css`, `app-config.js`
- Firebase Firestore als zentrale Datenbank
- Firebase Anonymous Auth, aber keine Benutzer-Accounts und keine Mitarbeiter-Logins
- Event-Setup direkt in der App
- Geheimer Event-Link plus PIN
- Zugänge: Admin und Check-in Staff
- Kategorien: GA, Member GA, Member VIP, On Stage, Mitarbeiter
- ca. 1200 Gäste realistisch nutzbar
- Namenssuche / Guest-ID-Suche
- Multi-Device Check-in
- Doppel-Check-in-Schutz per Firestore-Transaktion
- Letzten eigenen Check-in direkt rückgängig machen, solange keine andere Aktion folgt
- Support-Kommentar pro Gast
- Status: Offen, Eingecheckt, No Show
- Kategorie-Listen mit Summen
- CSV-Import und CSV-Export
- Globale In-App-Anleitungen getrennt für Admins und Check-in Staff, durch Master Admins editierbar
- Audit Log für Check-in, Check-in rückgängig, Doppel-Check-in-Versuch, Kommentar, Gaständerung, Import, Export, No Show, Audit-Export und PIN-Reset

## Technischer Stack

```text
GitHub Pages
  statische Web-App
  index.html / app.js / styles.css

Firebase
  Anonymous Authentication
  Cloud Firestore
```

GitHub Pages hostet nur statische Dateien. Die Live-Daten liegen deshalb in Firebase Firestore.

## Schnell-Setup

### 1. Firebase-Projekt erstellen

1. Öffne die Firebase Console.
2. Erstelle ein neues Projekt.
3. Der kostenlose Spark Plan reicht für den MVP.
4. Erstelle eine Web-App im Firebase-Projekt.
5. Kopiere die Firebase-Web-Konfiguration.

### 2. Firestore aktivieren

1. Firebase Console → Build → Firestore Database.
2. Datenbank erstellen.
3. Production Mode wählen.
4. Region auswählen.

### 3. Anonymous Auth aktivieren

1. Firebase Console → Build → Authentication.
2. Sign-in method.
3. Anonymous aktivieren.

### 4. Firestore Security Rules veröffentlichen

1. Firebase Console → Firestore Database → Rules.
2. Inhalt von `firebase.rules` komplett einfügen.
3. Publish / Veröffentlichen.

### 5. App konfigurieren

Öffne `app-config.js` und ersetze die Platzhalter:

```js
window.GUESTLIST_APP_CONFIG = {
  firebaseConfig: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  },
  app: {
    defaultEventName: "Event Gästeliste",
    globalAdminEventId: "01-05-2026-main-event",
    eventAliases: {
      "alter-event-link": "01-05-2026-main-event"
    },
    publicEventIds: {
      "01-05-2026-main-event": "01-05-2026-main-event"
    },
    categories: ["GA", "Member GA", "Member VIP", "On Stage", "Mitarbeiter"],
    statuses: ["open", "checked_in", "no_show"]
  }
};
```

Die Firebase-Konfiguration ist kein Passwort. Der Zugriff wird über Anonymous Auth, Event-Link ID, PIN-Hash und Firestore-Regeln geschützt.

### 6. Zu GitHub Pages hochladen

1. Neues GitHub Repository erstellen.
2. Diese Dateien in den Root des Repositories hochladen:
   - `.nojekyll`
   - `index.html`
   - `app.js`
   - `styles.css`
   - `app-config.js`
   - `manifest.webmanifest`
   - optional: `sample_guests.csv`, `README_DE.md`
3. Repository → Settings → Pages.
4. Source: Deploy from branch.
5. Branch: `main` und Folder: `/root`.
6. Speichern.
7. GitHub-Pages-URL öffnen.

### 7. Event initialisieren

Öffne:

```text
https://DEIN-GITHUB-USER.github.io/DEIN-REPO/?setup=1
```

Dann:

1. Eventname eingeben, z.B. `Club Event`.
2. Event-Link Name stabil halten und ohne Artist, Line-up oder Sponsor wählen, z.B. `Club Event`.
3. Globalen Admin-PIN eingeben.
4. Check-in Name und PIN für dieses Event setzen.
5. Kategorien prüfen.
6. Event erstellen.
7. Check-in Name und PIN sicher speichern.

Danach erzeugt die App einen Event-Link:

```text
https://DEIN-GITHUB-USER.github.io/DEIN-REPO/?event=02-05-2026-main-event
```

Diesen Link gibst du an die Check-in-Geräte weiter. Die Mitarbeiter:innen brauchen zusätzlich ihren Check-in-Namen bzw. ihre Position und den passenden Check-in-PIN.

### Mehrere Events und Event-Wechsel

Jedes Event hat eine eigene Event-Link ID und damit eine eigene Gästeliste. Technisch kann eine Event-Link ID per Alias auf eine bestehende Firestore Event-ID zeigen, damit alte Links kompatibel bleiben.

Der Admin-PIN ist global und gilt für alle Events. Beim Erstellen eines neuen Events wird dieser globale Admin-PIN geprüft und danach automatisch als Admin-PIN des neuen Events verwendet. Check-in-PINs bleiben pro Event separat.

Neue Events verwenden als Event-Link ID das Format `TT-MM-JJJJ-event-name`, zum Beispiel `02-05-2026-main-event`. Der Event-Link Name soll stabil bleiben und keine Artists, Line-ups, Sponsoren oder temporäre Mottos enthalten. Der sichtbare Eventname kann später geändert werden, die Event-Link ID bleibt gleich.

Bestehende vorbereitete Events nutzen ab sofort saubere offizielle Event-Link IDs. Die alten Links bleiben als Alias kompatibel.

```text
Beispiele:
https://DEIN-GITHUB-USER.github.io/DEIN-REPO/?event=01-05-2026-main-event
https://DEIN-GITHUB-USER.github.io/DEIN-REPO/?event=02-05-2026-main-event
```

Auf der Startseite und im Admin-Tab gibt es eine Liste **Bestehende Events**. Dort können Admins den gewünschten Event bewusst auswählen. Im laufenden UI führt der Button **Event wechseln** ebenfalls zur Event-Auswahl. Direkte Event-Links mit `?event=...` funktionieren weiterhin, werden aber nicht mehr als separates Eingabefeld in der Oberfläche angeboten.

Wenn ein Admin in derselben Browser-Session den Event wechselt, verbindet die App automatisch mit dem Ziel-Event. Nach Reload, neuem Tab oder neuem Gerät muss der globale Admin-PIN erneut eingegeben werden.

Die App wählt **niemals automatisch nach Datum**. Das ist wichtig, weil ein Event nach Mitternacht sonst versehentlich auf einen anderen Tag wechseln könnte. Ein Check-in-Gerät bleibt immer auf dem Event, dessen vollständiger Link geöffnet wurde.

Die Basis-URL ohne `?event=...` öffnet kein Event automatisch. Dadurch wird verhindert, dass ein Gerät aus Versehen einen falschen Event wieder öffnet.

CSV-Import und CSV-Export gelten immer nur für das aktuell geöffnete Event. Für mehrere Eventtage werden separate CSV-Dateien empfohlen, z.B. `event-tag-1.csv` und `event-tag-2.csv`.

## Nutzung am Event

Die README bleibt technische Referenz und Setup-Dokumentation.

Für den Einlass gibt es in der App den Tab `Anleitung`. Check-in Staff sieht die Check-in-Anleitung und Notfallkarte. Admins sehen zusätzlich die Admin-Anleitung. Master Admins können diese globalen Texte direkt in der App bearbeiten; sie gelten für alle Events.

### Grundkonzepte

**Administrator-Rollen:** Admins melden sich mit Name und Admin-PIN an. Check-in Staff nutzt keinen Admin-PIN.

**Events und Gültigkeit:** Jedes Event hat eine eigene Event-Link ID, eigene Gästeliste und eigene Check-in-PINs. Der sichtbare Eventname darf sich ändern, die Event-Link ID bleibt stabil. Check-in Staff hat nur im freigegebenen Zeitfenster Zugriff. Admins können Events auch außerhalb dieses Zeitfensters öffnen und bearbeiten.

### Admin Logins

1. Admins sind global, nicht pro Event.
2. Admins betreiben Events operativ: Gäste, Check-in-PINs, Zeitfenster, Korrekturen und Exporte.
3. Master Admins dürfen zusätzlich Events verstecken oder löschen, Master-Rechte vergeben oder entziehen und PINs von Nicht-Master-Admins verwalten.

### Neuen Event erstellen

1. Als Admin anmelden und Tab `Events` öffnen.
2. Eventname, Datum und stabilen Event-Link Name setzen.
3. Check-in Name und PIN setzen.
4. Event erstellen und den offiziellen Event-Link kopieren.

### Event vorbereiten

1. Event erstellen oder vorhandenen Event über den offiziellen Event-Link öffnen.
2. Eventname, Datum, Event-Link ID und Status `Online` prüfen.
3. `Event-Zugang für Check-in Staff` setzen; Start und Ende müssen Testphase und Einlass abdecken.
4. Gäste-CSV für genau diesen Event importieren.
5. Stichprobe suchen und Übersicht prüfen.
6. `Alle Gäste CSV` und `Audit Log CSV` exportieren.
7. Check-in mit zwei Geräten testen.

### Check-in Logins definieren und informieren

1. Check-in-Logins für den Event anlegen: Name/Position und PIN, z.B. `Check-in Team` oder `Eingang 1`.
2. Check-in-Logins gelten immer nur für einen Event.
3. Check-in-Team informieren: Event-Link, Name/Position, Check-in-PIN, Startzeit und Ansprechperson.
4. Admin-PINs nicht an Check-in Staff weitergeben.

### Check-in Staff

1. Event-Link öffnen.
2. Namen oder Position eingeben.
3. Check-in-PIN eingeben.
4. Gäste suchen.
5. Gast einchecken.
6. Support-Kommentar bei Bedarf ergänzen.

Check-in Staff sieht Check-in, Übersicht und Anmeldung. Admin-Bereiche wie Import, Export, PINs und Audit Log sind Admin-only.

### Admin

1. Event-Link öffnen.
2. Admin-Name und Admin-PIN eingeben.
3. Im Tab `Event verwalten` den `Event-Zugang für Check-in Staff` prüfen.
4. Gäste importieren, manuell ergänzen, in der Check-in-Liste bearbeiten, exportieren oder einzelne No Shows setzen.
5. Der Admin-PIN ist global für alle Events; Check-in-PINs sind pro Event separat.
6. Vor Eventstart unter `Backup & Export` Gäste-CSV und Audit-Log-CSV herunterladen.
7. Event-Link und benötigte Admin-/Check-in-PINs extern sichern.
8. Bei Geräteproblemen: Seite hart neu laden (`Ctrl+F5`), Event-Link neu öffnen, PIN erneut eingeben.

## CSV-Import

Empfohlene CSV-Spalten:

```csv
Name,Kategorie,Guest ID,Support Kommentar,Notiz
Max Muster,GA,G-0001,,
Anna Beispiel,Member VIP,G-0002,VIP-Band abgeben,
DJ Test,On Stage,G-0003,Backstage Zugang,Kommt nach 21:00
```

Die App akzeptiert auch ähnliche Spaltennamen wie:

- `Guest Name`, `Gast`, `Vollständiger Name`
- `Category`, `Ticket Type`, `Typ`
- `Support Comment`, `Kommentar`, `Bemerkung`
- `Note`, `Notiz`, `Interne Notiz`

Excel-Datei zuerst als CSV exportieren. Empfohlen ist **CSV UTF-8**; klassische Windows-CSV wird zusätzlich mit Windows-1252-Fallback gelesen.

Der Import erkennt Komma, Semikolon und Tab als Trennzeichen. Für deutsche Excel-Exporte ist Semikolon häufig; zum Testen liegt zusätzlich `data/samples/sample_guests_30_semicolon.csv` bei. UTF-8/Umlaute werden unterstützt.

Sicherheitsprüfungen beim Import:

- Zeilen ohne Namen werden blockiert.
- Doppelte `Guest ID` innerhalb der CSV werden blockiert.
- Bei zusätzlichem Import werden `Guest ID`s blockiert, die bereits im Event existieren.
- Bei vollständigem Neuimport kann `Vorhandene Gäste vor Import löschen` aktiviert werden. Vor dem Löschen muss die aktuelle Event-Link ID eingetippt werden.

CSV-Exporte werden als UTF-8 mit BOM und Semikolon-Trennzeichen erzeugt, damit sie in deutschem Excel einfacher geöffnet werden können. Der Admin-Bereich zeigt nach dem Export Dateiname, Anzahl und Uhrzeit als Backup-Hinweis. Zusätzlich kann der Admin das Audit Log als CSV exportieren.

## Empfohlener Event-Workflow

Am Tag vor dem Event:

1. App auf GitHub Pages deployen.
2. Firebase-Regeln testen.
3. Event initialisieren.
4. CSV importieren.
5. Export/Backup herunterladen: `Alle Gäste CSV` und `Audit Log CSV`.
6. Check-in mit 2 Geräten testen.

Am Event:

1. 5 Geräte öffnen denselben Event-Link.
2. Jedes Gerät mit Check-in-PIN verbinden.
3. Optional je Gerät einen Gerätenamen eintragen: `Check-in 1`, `Check-in 2`, etc.
4. Gäste über Name oder Guest ID suchen.
5. Einchecken.
6. Admin beobachtet die Übersicht und Kategorie-Summen.

Nach dem Event:

1. Export `Alle Gäste CSV` und `Audit Log CSV` herunterladen.
2. Optional einzelne Gäste in der Check-in-Liste auf `No Show` setzen.
3. Audit Log prüfen.

## Kosten / Limits

Für ca. 1200 Gäste und 5 Geräte sollte der kostenlose Firebase-Bereich normalerweise reichen, wenn nicht ständig neu geladen wird.

Grobe Rechnung:

- Initiales Laden: 1200 Gäste × 5 Geräte = ca. 6000 Reads
- 1200 Check-ins, live an 5 Geräte synchronisiert = ca. 6000 Reads plus ca. 1200 Writes
- Audit Log: ca. 1200 zusätzliche Writes

Das bleibt normalerweise unter den kostenlosen Firestore-Tageslimits. Trotzdem vor dem Event immer CSV-Backup exportieren.

## Wichtige Kompromisse

Diese Version ist für eine schnelle, morgen nutzbare Umsetzung gedacht.

Noch nicht enthalten:

- echte Benutzer-Accounts
- QR-Code-Scan
- vollwertiger Offline-Multi-Device-Modus
- automatische E-Mail-Einladungen
- Badge-Druck
- mehrere Events pro Account mit zentralem Dashboard

Bewusst enthalten:

- keine Hosting-Kosten für GitHub Pages
- kein eigener Server
- einfache Firebase-Datenbank
- PIN-basierter Zugang
- sofort einsetzbarer Check-in

## Sicherheitshinweise

- Verwende keine leicht zu erratenden PINs; neue Events erzwingen mindestens 4 Zeichen.
- Check-in-PINs und globalen Admin-PIN unterschiedlich setzen.
- Event-Link nicht öffentlich posten.
- Admin-PIN nur an Verantwortliche geben.
- Vor jedem Event Gäste-CSV und Audit-Log-CSV herunterladen.
- Bei kritischen Events zusätzlich eine ausgedruckte Liste oder einen CSV-Export bereithalten.

## Lokaler Test

Die App sollte nicht direkt per `file://` geöffnet werden. Für lokalen Test:

```bash
python -m http.server 8080
```

Dann öffnen:

```text
http://localhost:8080/?setup=1
```

## Dateien

```text
index.html              Einstiegspunkt
app.js                  App-Logik
styles.css              Layout und Mobile UI
app-config.js           Firebase-Konfiguration
firebase.rules          Firestore Security Rules
manifest.webmanifest    PWA-Metadaten
sample_guests.csv       Beispielimport
data/samples/           Weitere Testdaten, inkl. 1200-Gäste-CSV
README_DE.md            Diese Anleitung
.nojekyll               GitHub Pages: keine Jekyll-Verarbeitung
```
