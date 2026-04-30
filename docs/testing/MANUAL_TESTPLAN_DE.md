# Manueller Testplan — Gästelisten MVP

## Ziel

Vor dem Event sicherstellen, dass Setup, Import, Check-in, Multi-Device, Export und Backup funktionieren.

## Testdaten

Verwende:

```text
data/samples/sample_guests_30.csv
```

Für deutsche Excel-CSV mit Semikolon:

```text
data/samples/sample_guests_30_semicolon.csv
```

Für Lasttest optional:

```text
data/samples/sample_guests_1200.csv
```

## Test 1 — App startet

**Gegeben** GitHub Pages ist aktiviert und Firebase Config ist eingetragen.  
**Wenn** die App URL geöffnet wird.  
**Dann** lädt die App ohne dauerhafte Fehlermeldung.

Prüfen:

- Keine Browser-Console-Fehler bei Start.
- Verbindung/Firebase Status ist plausibel.
- `app-config.js` enthält keine Platzhalter mehr.

## Test 2 — Setup Flow

**Gegeben** App wird mit `?setup=1` geöffnet.  
**Wenn** Eventname, globaler Admin-PIN und Check-in-PIN gesetzt werden.
**Dann** wird ein Event erstellt und ein Event-Link angezeigt.

Prüfen:

- Event-Link enthält `?event=...`.
- Globalen Admin-PIN und Check-in-PIN sicher notieren.
- Kategorien enthalten GA, Member GA, Member VIP, On Stage, Mitarbeiter.

## Test 3 — Admin Login

**Gegeben** Event-Link ist geöffnet.  
**Wenn** Rolle Admin und globaler Admin-PIN eingegeben werden.
**Dann** sind Admin-Funktionen sichtbar.

Prüfen:

- Import sichtbar.
- Export sichtbar.
- Gast hinzufügen sichtbar.
- Gast bearbeiten in der Check-in-Liste sichtbar.
- Massenaktion No Show sichtbar.

## Test 4 — Check-in Staff Login

**Gegeben** Event-Link ist geöffnet.  
**Wenn** Rolle Check-in Staff und Check-in-PIN eingegeben werden.  
**Dann** ist Check-in Oberfläche sichtbar.

Prüfen:

- Suchfeld sichtbar.
- Mitarbeitername wird gespeichert/angezeigt; Gerätename ist optional.
- Admin-Funktionen sind nicht sichtbar.
- Tabs `Übersicht`, `Listen`, `Admin` und `Log` sind für Check-in Staff nicht sichtbar.
- Nur `Check-in`, `Event wechseln` und `Rolle/PIN wechseln` sind sichtbar.

## Test 5 — CSV Import

**Gegeben** Admin ist eingeloggt.  
**Wenn** `sample_guests_30.csv` importiert wird.  
**Dann** werden 30 Gäste erkannt und gespeichert.

Prüfen:

- Umlaute funktionieren: Müller, Zürich, François.
- Alle Kategorien sind vorhanden.
- Support-Kommentare werden übernommen.
- Interne Notizen werden übernommen.

## Test 5a — Semikolon-CSV und Duplicate-Schutz

**Gegeben** Admin ist eingeloggt.  
**Wenn** `data/samples/sample_guests_30_semicolon.csv` geprüft wird.  
**Dann** erkennt die App 30 Gäste.

Prüfen:

- Semikolon-Trennzeichen wird automatisch erkannt.
- Umlaute funktionieren.
- Eine Testdatei mit doppelter `Guest ID` wird vor dem Import blockiert.
- Zusätzlicher Import derselben Datei ohne Löschen wird wegen vorhandener `Guest ID`s blockiert.
- Vollständiger Neuimport funktioniert nur mit aktivierter Option `Vorhandene Gäste vor Import löschen`.

## Test 6 — Suche

**Gegeben** Gäste sind importiert.  
**Wenn** nach Namen, Teilnamen oder Guest ID gesucht wird.  
**Dann** erscheinen passende Treffer.

Prüfen:

- Suche nach `Müller`.
- Suche nach `G-0010`.
- Suche ist bei größerer Liste ausreichend schnell.

## Test 6a — Manueller Gast und Korrektur

**Gegeben** Admin ist eingeloggt.  
**Wenn** ein Gast manuell hinzugefügt und anschließend in der Check-in-Liste bearbeitet wird.  
**Dann** werden Name, Kategorie, Support-Kommentar und interne Notiz gespeichert.

Prüfen:

- Automatische Guest ID ist nicht doppelt.
- Bearbeitung aktualisiert die Suche.
- Audit Log enthält die Änderung.

## Test 7 — Einfacher Check-in

**Gegeben** ein Gast ist Status Offen.  
**Wenn** Check-in Staff auf Einchecken klickt.  
**Dann** wird Status Eingecheckt gesetzt.

Prüfen:

- Status ändert sich.
- Check-in Zeit wird angezeigt.
- Check-in durch Name/Gerät wird angezeigt.
- Dashboard-Zahlen aktualisieren sich.

## Test 8 — Doppel-Check-in

**Gegeben** ein Gast ist bereits eingecheckt.  
**Wenn** derselbe Gast erneut von Check-in Staff eingecheckt werden soll.  
**Dann** erscheint Warnung oder Button ist deaktiviert.

Prüfen:

- Original Check-in-Zeit wird nicht unbemerkt überschrieben.
- Admin kann, falls vorgesehen, überschreiben.
- Parallelversuch aus zwei Fenstern führt nur zu einem erfolgreichen Check-in; das zweite Fenster zeigt Warnung.
- Audit Log enthält `Doppel-Check-in verhindert`.

## Test 9 — Multi-Device

**Gegeben** zwei Browserfenster oder zwei Geräte sind mit demselben Event verbunden.  
**Wenn** Gerät A einen Gast eincheckt.  
**Dann** sieht Gerät B die Änderung nach kurzer Zeit.

Prüfen:

- Dashboard-Zahlen auf beiden Geräten.
- Trefferliste zeigt aktualisierten Status.
- Parallelversuch auf demselben Gast verhindert Doppel-Check-in.

## Test 10 — Support-Kommentar

**Gegeben** Gast hat einen Support-Kommentar.  
**Wenn** Check-in Staff Kommentar ergänzt oder ändert.  
**Dann** bleibt Kommentar gespeichert und ist auf anderen Geräten sichtbar.

Prüfen:

- Umlaute/Sonderzeichen im Kommentar.
- Kein versehentliches Löschen durch leere Eingabe.

## Test 11 — Kategorie-Summen

**Gegeben** Gäste sind in Kategorien verteilt.  
**Wenn** Check-ins durchgeführt werden.  
**Dann** ändern sich Total/Eingecheckt/Offen/No Show korrekt je Kategorie.

Prüfen alle Kategorien:

- GA
- Member GA
- Member VIP
- On Stage
- Mitarbeiter

## Test 12 — No Show

**Gegeben** offene Gäste existieren.  
**Wenn** Admin offene Gäste auf No Show setzt.  
**Dann** werden Status und Summen korrekt aktualisiert.

Prüfen:

- Vor der Massenaktion muss die aktuelle Event-ID eingetippt werden.
- Bereits eingecheckte Gäste bleiben eingecheckt.
- Nur offene Gäste ändern Status.

## Test 13 — Export / Backup

**Gegeben** Gästeliste enthält Gäste mit verschiedenen Status.  
**Wenn** Admin Gäste-CSV und Audit-Log-CSV exportiert.
**Dann** enthalten die CSVs erwartete Daten und der Backup-Hinweis zeigt Dateiname, Anzahl und Uhrzeit.

Prüfen:

- Alle Gäste CSV.
- Eingecheckte CSV.
- Offene CSV.
- No Show CSV.
- Audit Log CSV.
- Backup-Hinweis nach Export sichtbar.
- Umlaute in Export.
- Datei lässt sich in Excel/Google Sheets öffnen.
- Audit Log enthält `CSV Export` und `Audit Log Export`.

## Test 14 — Firestore Rules Smoke Test

**Gegeben** Rules sind veröffentlicht.  
**Wenn** Setup, Login, Import, Check-in und Export durchgeführt werden.  
**Dann** keine Permission-Denied Fehler.

Prüfen:

- Browser Console.
- Firebase Console Logs.
- Audit Log Writes.

## Test 15 — Event-Probe mit realistischen Daten

**Gegeben** echte oder generierte Liste mit ca. 1200 Gästen.  
**Wenn** Import und Check-in Tests laufen.  
**Dann** App bleibt bedienbar.

Prüfen:

- Ladezeit.
- Suchgeschwindigkeit.
- Dashboard-Aktualisierung.
- Firestore Usage in Firebase Console.

## Abnahmekriterien für morgen

Die App ist einsatzbereit, wenn:

- Setup abgeschlossen.
- 1200 Gäste importiert.
- Export-Backup erstellt.
- 2–5 Geräte erfolgreich verbunden.
- Test-Check-ins funktionieren.
- Doppel-Check-in verhindert wird.
- Semikolon-CSV und Umlaut-Import geprüft sind.
- Support-Kommentar sichtbar/bearbeitbar ist.
- Kategorie-Summen plausibel sind.
