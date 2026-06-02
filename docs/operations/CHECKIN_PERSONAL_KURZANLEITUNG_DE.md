# Kurzanleitung Check-in-Personal

## Konzepte für Check-in Staff

- **Event-Link:** Du öffnest immer den vollständigen Link für deinen Event. Die App wählt nie automatisch nach Datum.
- **Check-in-PIN:** Der PIN verbindet dich mit genau diesem Event. Er ist nicht der Admin-PIN.
- **Event-Gültigkeit:** Der Check-in-Zugang ist nur im freigegebenen Zeitfenster aktiv. Wenn der Zugang noch nicht aktiv oder abgelaufen ist, muss ein Admin das Zeitfenster prüfen.
- **Header:** Eventname, Datum und `Online` zeigen, ob du im richtigen und verbundenen Event arbeitest.
- **Suche:** Suche nach Name oder Guest ID. Prüfe den richtigen Gast vor dem Check-in.
- **Doppel-Check-in:** Wenn eine Warnung erscheint, nicht erneut klicken. Verantwortliche Person holen.

## Offizieller Event-Link

Verwende den Link, den du vom Admin- oder Einlass-Team erhalten hast. Beispiel:

```text
https://robertschaub.github.io/Guest-List/?event=02-05-2026-main-event
```

Die Basis-URL ohne `?event=...` nicht verwenden.

## Start am Gerät

1. Richtigen Event-Link öffnen.
2. Im Header Eventname, Datum und Status `Online` prüfen.
3. Rolle `Check-in Staff` wählen.
4. Check-in-PIN eingeben.
5. Eigenen Namen oder Position eintragen, z.B. `Eingang 1`.
6. Gerätename optional eintragen. Das Feld darf leer bleiben.

Nach dem Verbinden sieht Check-in-Personal den Check-in-Modus, eine Übersicht und die Anmeldung. Admin-Bereiche wie Import, Export, PINs und Audit Log sind ausgeblendet.

## Gast einchecken

1. Name oder Guest ID suchen.
2. Bei Namen reichen meist 2-3 Buchstaben.
3. Richtigen Gast anhand Name, Guest ID und Kategorie prüfen.
4. Button `Einchecken` nur einmal tippen.
5. Bei versehentlichem Check-in sofort `Rückgängig` nutzen, solange die App es anbietet, in der Regel innerhalb von 1 Minute. Danach Admin holen.
6. Wenn der Gast schon eingecheckt ist, erscheint eine Warnung. Nicht weiter versuchen, sondern Admin fragen.

## Support-Kommentar

Nutze den Support-Kommentar für kurze Hinweise:

- Name abweichend
- Zugang oder Kategorie klären
- Gast wartet auf Admin

Keine privaten oder unnötigen Notizen eintragen.

## Problemfälle

Sofort Admin oder verantwortliche Person fragen bei:

- Gast nicht gefunden
- falscher Event im Header
- falsche Kategorie
- Gast ist bereits eingecheckt, behauptet aber das Gegenteil
- App zeigt `Offline`
- Suche oder Check-in wirkt verzögert

Bei `Offline`: nicht weiter einchecken. WLAN/Mobilfunk prüfen, Seite neu laden, danach Eventname und Datum erneut kontrollieren.

Bei längerem Ausfall entscheidet der Admin, ob mit CSV- oder Papier-Backup weitergearbeitet wird.

## Nach Mitternacht

Das Gerät bleibt auf dem geöffneten Event-Link. Es wechselt nicht automatisch auf den nächsten Tag. Wenn nach Mitternacht weiter für denselben Event eingecheckt wird, nichts umstellen.

## Nicht machen

- Nicht die Basis-URL öffnen.
- Nicht weiterarbeiten, wenn Event, Datum oder `Online`-Status nicht stimmen.
- PIN nicht weitergeben oder sichtbar liegen lassen.
