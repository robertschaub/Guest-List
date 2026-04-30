# Research Notes — Alternativen und Entscheidungen

Dieses Dokument fasst die Recherchen aus dem Chat zusammen. Es ist kein Ersatz für eine neue aktuelle Webrecherche, sondern Knowledge-Transfer für Codex und Entwickler.

## Eventfrog

### Unterstützt gut

- Gehostete Plattform, kein eigenes Hosting.
- Ticketkategorien, die GA / VIP / Mitarbeiter abbilden können.
- QR-Code-Check-in.
- Manuelles Einchecken / Suche nach Name.
- Multi-Device Entry App.
- Doppel-Check-in-Warnung.
- Kategorie-Statistiken.
- Export.

### Einschränkungen für unseren Use Case

- Eventfrog ist stark ticket-/anmeldungsbasiert.
- Nicht primär eine frei editierbare interne Gästedatenbank.
- Bestehende Namensliste als einfacher Import war nicht klar als Free-Feature belegt.
- Interner Support-Kommentar pro Gast am Check-in ist nicht sauber als Free-/MVP-Funktion abgedeckt.
- Geschützte/private Kategorien oder Personalisierungsfelder können kostenpflichtige Funktionen sein.

### Fazit

Eventfrog wäre für Ticketing/Entry sehr stark, aber die eigene App bleibt sinnvoll, wenn eine interne Gästeliste mit Support-Kommentaren, freiem CSV-Import und einfacher PIN-Nutzung gewünscht ist.

## Open-Source-Kandidaten

### Hi.Events

Pros:

- Moderne Open-Source Event-App.
- Cloud oder self-hosted.
- QR-Check-in.
- Manuelle Attendees.
- Tickettypen/Kategorien.
- Exporte.

Contra / zu prüfen:

- Support-Kommentar pro Gast am Check-in.
- Setup- und Deployment-Aufwand im Vergleich zur sehr einfachen MVP-App.

### pretix

Pros:

- Sehr robustes Ticketing- und Check-in-System.
- Multi-Device und Offline-Scanning stark.
- Produkte/Tickettypen für Kategorien.

Contra:

- Komplexer als benötigt.
- Mehr Ticketshop-Logik als interne Gästeliste.

### alf.io

Pros:

- CSV Import für Attendees.
- Custom Fields.
- Check-in App.

Contra:

- Java/PostgreSQL Setup.
- Technischer als der MVP.

### Attendize

Pros:

- Open Source.
- Tickets, Attendees, QR-Scanner, Export.

Contra:

- Projekt wirkt älter.
- Nicht erste Wahl für neuen zeitkritischen MVP.

### Indico

Pros:

- Mächtiges Event-/Konferenzsystem.
- Check-in PWA.

Contra:

- Overkill für einfache Gästeliste.

## Gewählte Lösung trotz Alternativen

Für morgen wurde entschieden:

```text
Statische App + Firebase Firestore + GitHub Pages
```

Gründe:

- Sehr schnelles Deployment.
- Keine klassischen Hostingkosten.
- Keine Serverwartung.
- Keine App Store Veröffentlichung.
- Einfache Bedienung per Browser.
- Anpassbar an die exakten Gästelisten-Anforderungen.

## Spätere Alternativen

Wenn die App nach dem Event weiterentwickelt wird, prüfen:

- Hi.Events statt Eigenentwicklung, falls dessen Support-Kommentar/Import ausreichend ist.
- pretix, wenn professionelles Ticketing/QR/Offline sehr wichtig wird.
- Eigene App mit echten Accounts, falls Datenschutz/Rollen/Audit wichtiger werden.
