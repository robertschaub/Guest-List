# Bekannte Limitierungen — MVP

## Sicherheit

- PIN-basierter Zugriff ist ein pragmatischer MVP-Kompromiss.
- Keine echte individuelle Benutzeridentität.
- Audit Log kann Mitarbeitername/Gerät speichern, aber nicht sicher beweisen, wer physisch geklickt hat.
- Event-Link plus PIN muss vertraulich behandelt werden.

## Offline

- Kein vollwertiger Offline-Multi-Device-Modus.
- Bei Internetverlust sind Live-Sync und Firestore-Transaktionen nicht zuverlässig verfügbar.
- Backup-CSV vor dem Event ist Pflicht.

## CSV

- Excel kann je nach System Komma oder Semikolon verwenden.
- Codex soll Import für Komma, Semikolon und Tab robust machen.
- Sehr große CSVs über 1200 Gäste sollten getestet werden.

## Firestore Free Tier

- Normale Nutzung mit 1200 Gästen und 5 Geräten sollte voraussichtlich passen.
- Häufige Reloads oder sehr viele Tests können Reads erhöhen.
- Vor Livebetrieb Firebase Usage prüfen.

## UI

- Mobile-first, aber nicht vollständig auf alle Browser/Geräte getestet.
- iOS Safari und Android Chrome sollten vor Event getestet werden.

## Funktionen nicht enthalten

- QR-/Barcode-Scan.
- RSVP.
- E-Mail Einladungen.
- Badge-Druck.
- Vollwertige Rollenverwaltung.
- Mehrere Events pro Organisation mit Account-System.
