# Deployment-Checkliste für den Eventtag

## Firebase

- [ ] Firebase-Projekt erstellt
- [ ] Web-App in Firebase erstellt
- [ ] Firebase-Konfiguration in `app-config.js` eingefügt
- [ ] Firestore Database aktiviert
- [ ] Authentication → Anonymous aktiviert
- [ ] Firestore Rules aus `firebase.rules` veröffentlicht

## GitHub Pages

- [ ] Repository erstellt
- [ ] Dateien hochgeladen
- [ ] GitHub Pages auf `main / root` aktiviert
- [ ] GitHub-Pages-URL erreichbar

## Event vorbereiten

- [ ] URL `?setup=1` geöffnet
- [ ] Event erstellt
- [ ] Eventname, Datum und Event-Link ID geprüft
- [ ] Globaler Admin-PIN gespeichert
- [ ] Check-in-PIN gespeichert
- [ ] Event-Link kopiert
- [ ] `Event-Zugang für Check-in Staff` im Tab `Event verwalten` geprüft
- [ ] In-App-Anleitungen im Tab `Anleitung` geprüft und bei Bedarf angepasst
- [ ] Admin-Kurzanleitung, Check-in-Kurzanleitung und Notfallkarte bereitgelegt

## Logins definieren und informieren

- [ ] Master Admins festgelegt
- [ ] Benannte Admins angelegt, falls nötig
- [ ] Check-in-PINs pro Event definiert
- [ ] Check-in-Team über Event-Link, Rolle, Name/Position und Check-in-PIN informiert
- [ ] Ansprechperson für Problemfälle kommuniziert
- [ ] Admin-PINs getrennt vom Check-in-Team gehalten

## Gästeliste

- [ ] CSV mit 1200 Gästen vorbereitet
- [ ] 30er-Test CSV in Test-Event importiert
- [ ] Semikolon-Test CSV in Test-Event geprüft
- [ ] Vor finalem 1200er Import Testdaten bewusst ersetzt oder separater Live-Event verwendet
- [ ] 1200er CSV im Live-Event importiert
- [ ] Duplicate-Guest-ID-Schutz getestet
- [ ] Kategorien geprüft
- [ ] Summen geprüft
- [ ] Backup CSV exportiert
- [ ] Audit-Log CSV exportiert
- [ ] Manueller Gast angelegt und bearbeitet

## Test vor Ort

- [ ] Gerät 1 mit Check-in-PIN verbunden
- [ ] Gerät 2 mit Check-in-PIN verbunden
- [ ] Testgast eingecheckt
- [ ] Doppel-Check-in getestet
- [ ] Support-Kommentar getestet
- [ ] Admin-Übersicht geprüft
- [ ] Export geprüft
- [ ] Leeres Event zeigt 0-Gäste-Warnung

## Event-Tag Backup

- [ ] Aktuelle CSV auf Laptop gespeichert
- [ ] Aktuelle Audit-Log CSV auf Laptop gespeichert
- [ ] Optional ausgedruckte Liste vorhanden
- [ ] Globaler Admin-PIN bei Verantwortlichem
- [ ] Check-in-PIN bei Eingangsteam
