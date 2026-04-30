# Codex Start Here — Guest-List MVP

Dieses Repository ist für die Weiterarbeit mit Codex vorgesehen und soll lokal unter folgendem Pfad liegen:

```text
C:\DEV\Guest-List
```

Der Benutzer verwendet dort die **Codex Windows App** und **VS Code mit Codex Extension**. Das lokale Git-Repository existiert bereits. Dieses Paket enthält deshalb **kein eigenes `.git`-Verzeichnis** und soll in das bestehende Repository kopiert werden.

## Wichtigste Zielsetzung

Bis morgen soll eine brauchbare, deploybare Event-Gästelisten-Web-App einsatzbereit sein.

**Nicht neu planen. Nicht Architektur wechseln. MVP stabilisieren.**

## Feste Entscheidungen aus dem Chat

- Frontend: statische Web-App, kein Build-Schritt zwingend erforderlich.
- Hosting: GitHub Pages.
- Backend: Firebase Firestore.
- Auth: Firebase Anonymous Auth, keine App-User-Accounts im MVP.
- Zugriff: Event-Link + Rollenwahl + PIN.
- Eventgröße: ca. 1200 Gäste.
- Check-in-Geräte: ca. 5 Mobile/Tablets parallel.
- Sprache/UI: Deutsch, funktional, mobile-first.
- QR-Code: für MVP weglassen.
- Offline-Multi-Device: für MVP weglassen; Internet am Eingang wird angenommen.
- Keine kostenpflichtigen Dienste hinzufügen.
- Keine echten Gästedaten, PINs oder Firebase-Secrets committen.

## Must-have Features

- Event initialisieren.
- Admin-PIN und Check-in-PIN setzen.
- Check-in Staff ohne Account verbinden.
- CSV-Gästeimport.
- Gäste manuell hinzufügen.
- Kategorien: GA, Member GA, Member VIP, On Stage, Mitarbeiter.
- Gastfelder: Guest ID, Name, Kategorie, Status, Check-in-Zeit, Check-in durch, Support-Kommentar, interne Notiz.
- Suche nach Name oder Guest ID.
- Gast einchecken.
- Doppel-Check-in per Firestore Transaction verhindern.
- Warnung bei bereits eingechecktem Gast.
- Support-Kommentar anzeigen und bearbeiten.
- Status: Offen, Eingecheckt, No Show.
- Kategorie-Listen und Summen.
- Dashboard: Total, eingecheckt, offen, No Show.
- CSV-Export / Backup.
- Audit Log.

## Bekannte MVP-Kompromisse

- Keine echten User-Accounts.
- Kein QR-Code-Scan.
- Kein vollwertiger Offline-Multi-Device-Modus.
- Kein Badge-/Label-Druck.
- Keine E-Mail-Einladungen / RSVP.
- Firestore Free-Tier reicht voraussichtlich, aber vor dem Event CSV-Backup exportieren.

## Erste Aufgaben für Codex

1. Codebasis lesen und kurz strukturieren.
2. Top-5-Risiken für morgiges Deployment benennen.
3. Keine neue Architektur einführen.
4. GitHub-Pages-Kompatibilität prüfen, insbesondere relative Pfade.
5. Firebase Config in `app-config.js` sauber belassen.
6. Firestore Rules gegen App-Funktionen testen/prüfen.
7. CSV Import robuster machen, besonders deutsche CSVs mit Umlauten und Semikolon-Trennzeichen.
8. 1200-Gäste-Testdaten/Simulation vorbereiten.
9. Manuellen Testplan aktualisieren.
10. README/Deployment-Anleitung finalisieren.

Aktueller Stand: Import erkennt Komma/Semikolon/Tab, blockiert doppelte Guest IDs, exportiert UTF-8 mit Semikolon, und Audit Log enthält Check-in, Doppel-Check-in-Versuch, Kommentar, Gaständerung, Import, Export, No Show und PIN-Reset.

## Ordnerstruktur

```text
/
  index.html
  app.js
  styles.css
  app-config.js
  firebase.rules
  manifest.webmanifest
  sample_guests.csv
  README.md
  README_DE.md
  CODEX_START_HERE.md
  AGENTS.md
  docs/
    requirements/
    handoff/
    deployment/
    testing/
    research/
    legacy/
  data/
    samples/
      sample_guests_30.csv
      sample_guests_30_semicolon.csv
      sample_guests_1200.csv
```

## Deployment-Kurzform

1. Firebase-Projekt erstellen.
2. Firestore Database aktivieren.
3. Anonymous Auth aktivieren.
4. `firebase.rules` veröffentlichen.
5. Firebase Web Config in `app-config.js` eintragen.
6. Repo zu GitHub pushen.
7. GitHub Pages: Deploy from branch, `main`, `/root`.
8. App mit `?setup=1` öffnen.
9. Event + PINs erstellen.
10. CSV importieren und mit zwei Geräten testen.

## Bitte vermeiden

- Kein Next.js, React, Vite, Express, Docker, Supabase, Vercel oder neuer Stack, außer der Benutzer fordert das explizit.
- Keine kostenpflichtigen Cloud Functions.
- Keine Firebase Admin SDKs oder Server-Backends im MVP.
- Keine echten persönlichen Daten im Repo.
