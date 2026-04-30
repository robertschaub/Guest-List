# Chat Decisions Summary

## Finale Benutzerantwort für Umsetzung

```text
1 B
3 ca. 1200 Gäste
10 Ja
20 D (falls keine Nachteile)
Rest ist default
```

## Interpretation

### 1 B — Statische App + Firebase

Die App soll als statisches Frontend laufen. Live-Daten kommen aus Firebase Firestore.

### 3 — ca. 1200 Gäste

Performance, Import, Suche und Firestore-Nutzung müssen auf etwa 1200 Gäste ausgelegt sein.

### 10 — Check-in Workflow ja

Workflow:

1. Mitarbeiter öffnet Web-App.
2. Sucht nach Name oder Guest ID.
3. Trefferliste zeigt Name, Kategorie, Status, Support-Kommentar.
4. Klick auf Check-in.
5. App warnt bei bereits eingechecktem Gast.
6. Status/Summen aktualisieren sich zentral.

### 20 D — GitHub Pages

Frontend-Deployment über GitHub Pages, solange keine Nachteile entstehen. Wichtigster bekannter Punkt: GitHub Pages bietet keine Datenbank, darum Firebase Firestore.

## Defaults, die gelten

- Bestehendes Gästelisten-Schema übernehmen.
- Mobile-first für Phones und Tablets.
- Stabiles Internet am Eingang wird angenommen.
- Geheimer Event-Link + Admin-PIN / Check-in-PIN.
- Check-in Modus + Admin Modus.
- Kategorien final: GA, Member GA, Member VIP, On Stage, Mitarbeiter.
- Gastfelder: Guest ID, Name, Kategorie, Status, Check-in-Zeit, Check-in durch/Gerät, Support-Kommentar, interne Notiz.
- Doppel-Check-in: Warnung; Admin kann überschreiben.
- No Show: Manuell pro Gast und Admin-Bulk für offene Gäste.
- Support-Kommentar: sichtbar und editierbar für Check-in Staff.
- Import: CSV/Excel vorher als CSV; App importiert CSV.
- Export: komplette Gästeliste, eingecheckte Gäste, offene Gäste, Audit Log bzw. Backup.
- Audit Log: Aktionen protokollieren.
- Check-in durch: Mitarbeitername plus Gerät/Station.
- QR-Code: weglassen für morgen.
- Design: Deutsch, schlicht, funktional, mobile-first, kein Logo.
