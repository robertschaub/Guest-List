# Admin-Kurzanleitung für Vorbereitung und Einlass

## Konzepte für Administratoren

### Administrator-Rollen

- **Anmeldung:** Admins melden sich mit Rolle `Admin`, Name und Admin-PIN an.
- **Admin:** Betreibt Events und verwaltet Zugänge.
- **Check-in Staff:** Nutzt keinen Admin-PIN. Zugriff nur mit Check-in-PIN und nur innerhalb des Event-Zeitfensters.

### Admin Logins

1. Admins sind global, nicht pro Event.
2. Admins betreiben Events operativ: Gäste, Check-in-PINs, Zeitfenster, Korrekturen und Exporte.
3. Master Admins dürfen zusätzlich Admin-PINs verwalten, Events verstecken oder löschen und Master-Rechte vergeben oder entziehen.
4. `Main` plus Main-PIN ist immer Master Admin. Der Main Admin soll nur im Notfall verwendet werden.

### Events und Gültigkeit

- **Event-Link:** Jedes Event wird über einen vollständigen Link mit `?event=...` geöffnet. Die App wählt nie automatisch nach Datum.
- **Event-Link ID:** Sichtbarer Teil im Link, z.B. `02-05-2026-main-event`.
- **Aktueller Event:** CSV-Import, CSV-Export, Übersicht und Check-in gelten immer nur für den Event, der im Header angezeigt wird.
- **Event-Zeitfenster:** Legt fest, wann Check-in Staff Zugriff hat. Admins können es im Tab `Event verwalten` anpassen.
- **Nach Ablauf:** Check-in Staff ist gesperrt, Admins können den Event weiterhin bearbeiten.
- **Versteckte Events:** Für Check-in Staff nicht sichtbar oder nutzbar. Admins sehen sie weiter.

## Offizieller Event-Link

Verwende immer den offiziellen Link für den Event. Beispiel:

```text
https://robertschaub.github.io/Guest-List/?event=02-05-2026-main-event
```

Im Header müssen Eventname, Datum und Status `Online` passen.

## Neuen Event erstellen

1. Als Admin anmelden und Tab `Events` öffnen.
2. Eventname, Datum und stabilen Event-Link Name setzen.
3. Check-in Name und PIN setzen.
4. Event erstellen und den offiziellen Event-Link kopieren.

## Event vorbereiten

1. Event erstellen oder vorhandenen Event über den offiziellen Event-Link öffnen.
2. Header prüfen: Eventname, Datum, Status `Online`.
3. Im Tab `Events` prüfen, dass der richtige Event markiert ist.
4. Im Tab `Event verwalten` den Eventnamen und die Event-Link ID prüfen.
5. `Event-Zugang für Check-in Staff` setzen: Start und Ende müssen Testphase und Einlass abdecken.
6. Gäste-CSV für genau diesen Event importieren.
7. Stichprobe suchen: Name, Guest ID, Kategorie und Kommentare.
8. Übersicht prüfen: Total, Offen, Eingecheckt, No Show.
9. Unter `Backup & Export` mindestens `Alle Gäste CSV` und `Audit Log CSV` herunterladen.
10. Check-in mit zwei Geräten testen.

## Check-in Logins definieren und informieren

1. Check-in-Logins für den Event anlegen: Name/Position und PIN, z.B. `Check-in Team` oder `Eingang 1`.
2. Check-in-Logins gelten immer nur für einen Event.
3. Dem Check-in-Team nur diese Informationen geben: Event-Link, Rolle `Check-in Staff`, Name/Position, Check-in-PIN, Startzeit und Ansprechperson.
4. Admin-PINs getrennt vom Check-in-Team halten.
5. Kurz kommunizieren: richtigen Header prüfen, bei Problemen Admin holen.

## Vor dem Einlass

1. Richtigen Event-Link öffnen und als `Admin` anmelden.
2. Header prüfen: Eventname, Datum, Status `Online`.
3. `Event-Zugang für Check-in Staff` nochmals prüfen.
4. Check-in-Geräte verbinden lassen.
5. Übersicht und Gästeliste kontrollieren.
6. Backup-Dateien griffbereit halten.

## Während des Einlasses

- Übersicht und Kategorien regelmäßig kontrollieren.
- Bei Problemen Gast über Name oder Guest ID suchen.
- Kommentare lesen und bei Bedarf aktualisieren.
- Falsche Check-ins bewusst korrigieren; offene Gäste bei Bedarf auf `No Show` setzen.
- Falls Check-in Staff sich nicht anmelden kann: Event-Zugang im Tab `Event verwalten` prüfen.

## Event wechseln

- Nur über `Events` oder den vollständigen offiziellen Event-Link wechseln.
- Nach dem Wechsel immer Header und Event-Link ID prüfen.
- CSV-Import und CSV-Export gelten immer nur für den aktuell geöffneten Event.
- Für Betrieb und Kommunikation nur den offiziellen, freigegebenen Event-Link nutzen.

## Nach dem Einlass

1. `Alle Gäste CSV` exportieren.
2. `Audit Log CSV` exportieren.
3. Optional `Eingecheckte CSV`, `Offene CSV` und `No Show CSV` exportieren.
4. Dateien außerhalb der App sichern.
5. Bei offenen Fragen Audit Log und Support-Kommentare prüfen.

## Nicht machen

- Nicht die Basis-URL ohne `?event=...` verwenden.
- Nicht weiterarbeiten, wenn Event, Datum oder `Online`-Status nicht stimmen.
- Keine PINs, Gästedaten oder Exporte öffentlich teilen.
