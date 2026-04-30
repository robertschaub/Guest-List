# Gästeliste Check-in Web-App

Statische Web-App für Event-Gästeliste, Check-in auf mehreren Mobile-/Tablet-Geräten und zentrale Live-Daten in Firebase Firestore.

## Was ist drin?

- GitHub-Pages-kompatible statische Dateien: `index.html`, `app.js`, `styles.css`, `app-config.js`
- Firebase Firestore als zentrale Datenbank
- Firebase Anonymous Auth, aber keine Benutzer-Accounts und keine Mitarbeiter-Logins
- Event-Setup direkt in der App
- Geheimer Event-Link plus PIN
- Rollen: Admin und Check-in Staff
- Kategorien: GA, Member GA, Member VIP, On Stage, Mitarbeiter
- ca. 1200 Gäste realistisch nutzbar
- Namenssuche / Guest-ID-Suche
- Multi-Device Check-in
- Doppel-Check-in-Schutz per Firestore-Transaktion
- Support-Kommentar pro Gast
- Status: Offen, Eingecheckt, No Show
- Kategorie-Listen mit Summen
- CSV-Import und CSV-Export
- Audit Log für Check-in, Doppel-Check-in-Versuch, Kommentar, Gaständerung, Import, Export, No Show und PIN-Reset

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
    globalAdminEventId: "the-garden-w-dj-prospa",
    categories: ["GA", "Member GA", "Member VIP", "On Stage", "Mitarbeiter"],
    statuses: ["open", "checked_in", "no_show"]
  }
};
```

Die Firebase-Konfiguration ist kein Passwort. Der Zugriff wird über Anonymous Auth, Event-ID, PIN-Hash und Firestore-Regeln geschützt.

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

1. Eventname eingeben.
2. Globalen Admin-PIN eingeben.
3. Check-in-PIN für dieses Event setzen.
4. Kategorien prüfen.
5. Event erstellen.
6. Check-in-PIN sicher speichern.

Danach erzeugt die App einen Event-Link:

```text
https://DEIN-GITHUB-USER.github.io/DEIN-REPO/?event=evt-...
```

Diesen Link gibst du an die Check-in-Geräte weiter. Die Mitarbeiter:innen brauchen zusätzlich den Check-in-PIN.

### Mehrere Events und Event-Wechsel

Jedes Event hat eine eigene Event-ID und damit eine eigene Gästeliste in Firestore.

Der Admin-PIN ist global und gilt für alle Events. Beim Erstellen eines neuen Events wird dieser globale Admin-PIN geprüft und danach automatisch als Admin-PIN des neuen Events verwendet. Check-in-PINs bleiben pro Event separat.

Für THE GARDEN sind in der App zwei Eventtage vorbereitet:

```text
https://robertschaub.github.io/Guest-List/?event=the-garden-w-dj-prospa
https://robertschaub.github.io/Guest-List/?event=the-garden-w-me
```

Auf der Startseite und im Admin-Tab gibt es eine Liste **Bestehende Events**. Dort können Admins den Freitag- oder Samstag-Event bewusst auswählen. Im laufenden UI führt der Button **Event wechseln** ebenfalls zur Event-Auswahl. Dort kann auch weiterhin eine Event-ID manuell geöffnet oder ein neues Event erstellt werden.

Die App wählt **niemals automatisch nach Datum**. Das ist wichtig, weil ein Freitag-Event nach Mitternacht am 1. Mai sonst versehentlich auf Samstag wechseln könnte. Ein Door-Terminal bleibt immer auf dem Event, dessen vollständiger Link geöffnet wurde.

Die Basis-URL ohne `?event=...` öffnet kein Event automatisch. Dadurch wird verhindert, dass ein Gerät aus Versehen das zuletzt verwendete Freitag-Event am Samstag wieder öffnet.

CSV-Import und CSV-Export gelten immer nur für das aktuell geöffnete Event. Für zwei Eventtage werden daher zwei separate CSV-Dateien empfohlen, z.B. `the-garden-freitag.csv` und `the-garden-samstag.csv`.

## Nutzung am Event

Separate Einweisung für Check-in-Personal:

```text
docs/operations/CHECKIN_PERSONAL_KURZANLEITUNG_DE.md
```

### Check-in Staff

1. Event-Link öffnen.
2. Rolle `Check-in Staff` wählen.
3. Check-in-PIN eingeben.
4. Namen/Gerät eingeben, z.B. `Eingang 1`.
5. Gäste suchen.
6. Gast einchecken.
7. Support-Kommentar bei Bedarf ergänzen.

### Admin

1. Event-Link öffnen.
2. Rolle `Admin` wählen.
3. Globalen Admin-PIN eingeben.
4. Gäste importieren, manuell ergänzen, in der Check-in-Liste bearbeiten, exportieren oder No Shows setzen.

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
- Bei vollständigem Neuimport kann `Vorhandene Gäste vor Import löschen` aktiviert werden.

CSV-Exporte werden als UTF-8 mit BOM und Semikolon-Trennzeichen erzeugt, damit sie in deutschem Excel einfacher geöffnet werden können.

## Empfohlener Event-Workflow

Am Tag vor dem Event:

1. App auf GitHub Pages deployen.
2. Firebase-Regeln testen.
3. Event initialisieren.
4. CSV importieren.
5. Export/Backup herunterladen.
6. Check-in mit 2 Geräten testen.

Am Event:

1. 5 Geräte öffnen denselben Event-Link.
2. Jedes Gerät mit Check-in-PIN verbinden.
3. Jedes Gerät mit eigenem Gerätenamen: `Check-in 1`, `Check-in 2`, etc.
4. Gäste über Name oder Guest ID suchen.
5. Einchecken.
6. Admin beobachtet die Übersicht und Kategorie-Summen.

Nach dem Event:

1. Export `Alle Gäste CSV` herunterladen.
2. Optional offene Gäste auf `No Show` setzen.
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

- Verwende keine kurzen Zahlen-PINs wie `1234`; neue Events erzwingen mindestens 8 Zeichen.
- Check-in-PINs und globalen Admin-PIN unterschiedlich setzen.
- Event-Link nicht öffentlich posten.
- Admin-PIN nur an Verantwortliche geben.
- Vor jedem Event CSV-Backup herunterladen.
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
