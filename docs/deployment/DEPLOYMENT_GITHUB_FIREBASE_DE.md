# Deployment — GitHub Pages + Firebase

## Ziel

Die App soll ohne klassischen Server betrieben werden:

```text
GitHub Pages       = statische Web-App
Firebase Firestore = zentrale Live-Daten
Firebase Auth      = Anonymous Auth, keine App-Accounts
```

## Voraussetzungen

- GitHub Account.
- Firebase/Google Account.
- Lokales Repository unter `C:\DEV\Guest-List`.
- Internet am Event-Eingang.

## 1. Firebase-Projekt erstellen

1. Firebase Console öffnen.
2. Neues Projekt erstellen.
3. Google Analytics kann für MVP deaktiviert werden.
4. Projekt erstellen.

## 2. Firebase Web App erstellen

1. Im Firebase-Projekt auf Web-App `</>` klicken.
2. App registrieren, z. B. `guest-list-web`.
3. Firebase Hosting muss hier nicht aktiviert werden.
4. Firebase-Konfigurationsobjekt kopieren.

## 3. Firestore aktivieren

1. Build → Firestore Database.
2. Datenbank erstellen.
3. Production Mode wählen.
4. Region wählen.

## 4. Anonymous Auth aktivieren

1. Build → Authentication.
2. Sign-in method.
3. Anonymous aktivieren.

## 5. Firestore Security Rules veröffentlichen

1. Firestore Database → Rules.
2. Inhalt aus `firebase.rules` einfügen.
3. Publish / Veröffentlichen.

Wichtig: Nach Änderungen an `app.js` immer prüfen, ob die Rules noch zu den verwendeten Collections/Feldern passen.

## 6. Firebase Config eintragen

In `app-config.js` Platzhalter ersetzen:

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
    categories: ["GA", "Member GA", "Member VIP", "On Stage", "Mitarbeiter"],
    statuses: ["open", "checked_in", "no_show"]
  }
};
```

## 7. GitHub Repository verwenden

Das lokale Repository existiert bereits. Danach:

```powershell
cd C:\DEV\Guest-List
git status
git add .
git commit -m "Initial guest list MVP handoff"
git branch -M main
git remote -v
```

Falls noch kein Remote gesetzt ist:

```powershell
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

Falls Remote bereits gesetzt ist:

```powershell
git push
```

## 8. GitHub Pages aktivieren

1. Repository → Settings → Pages.
2. Source: Deploy from branch.
3. Branch: `main`.
4. Folder: `/root`.
5. Speichern.
6. GitHub Pages URL öffnen.

Die URL hat typischerweise dieses Format:

```text
https://<github-user>.github.io/<repo>/
```

## 9. Event initialisieren

App mit Setup-Parameter öffnen:

```text
https://<github-user>.github.io/<repo>/?setup=1
```

Dann Eventname, globalen Admin-PIN und event-spezifischen Check-in-PIN setzen und Event-Link kopieren.

## 10. Gäste importieren und testen

1. Als Admin einloggen.
2. Zuerst `data/samples/sample_guests_30.csv` importieren.
3. Danach optional `data/samples/sample_guests_30_semicolon.csv` testen, um deutsche Excel-CSV mit Semikolon zu prüfen.
4. Für die Eventprobe `data/samples/sample_guests_1200.csv` importieren.
5. Import prüfen: Kategorien, Umlaute, Support-Kommentare, doppelte Guest IDs.
6. Export-Backup herunterladen: `Alle Gäste CSV` und `Audit Log CSV`.
7. Mindestens zwei Geräte verbinden und Test-Check-ins durchführen.

## 11. Pflichtprüfung vor Eventbeginn

- Zwei Browserfenster oder Geräte mit demselben Event-Link öffnen.
- Auf Gerät A einen Gast einchecken.
- Auf Gerät B prüfen, dass Status und Übersicht aktualisiert werden.
- Denselben Gast parallel oder erneut einchecken und prüfen, dass Doppel-Check-in verhindert wird.
- Als Admin `Alle Gäste CSV` und `Audit Log CSV` exportieren und lokal speichern.
- Bei Import mit Löschen oder Massen-No-Show prüfen, dass die App die Event-ID als Bestätigung verlangt.
