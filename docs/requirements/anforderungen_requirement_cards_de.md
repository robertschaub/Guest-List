# Gästeliste Web-App — Anforderungsdokument

Requirement Cards mit Job Stories, Akzeptanzkriterien, Geschäftsregeln, Datenfeldern und Rollenrechten.

**Version:** 1.0  
**Stand:** 29.04.2026

## 1. Zweck und Umfang

Dieses Dokument beschreibt die Anforderungen für eine Web-App zur Verwaltung von Event-Gästelisten und Check-ins. Es basiert auf der bisherigen Google-Sheets-Lösung mit zentraler Gästeliste, fünf Check-in Ansichten, Kategorie-Listen, Summen pro Kategorie, Mitarbeiter-Kategorie und Support-Kommentar pro Gast.

## 2. Empfohlenes Anforderungsformat

- **Requirement ID:** eindeutige Kennung, z. B. CHK-002.
- **Priorität:** MVP, Soll oder Kann.
- **Akteur:** primäre Rolle.
- **Job Story:** Wenn <Kontext>, möchte ich <Fähigkeit>, damit <Nutzen>.
- **Akzeptanzkriterien:** testbare Szenarien im Format Gegeben / Wenn / Dann.
- **Geschäftsregeln:** Regeln, die unabhängig von der Oberfläche gelten.
- **Datenfelder:** benötigte Felder oder Objekte.
- **Rechte:** Berechtigungen pro Rolle.
- **Edge Cases / Notizen:** Sonderfälle und Risiken.

## 3. Rollen

- **Event Manager:** Richtet Events ein, verwaltet Gäste, Kategorien, Imports/Exports, Reports und Zugriffsrechte.
- **Check-in Mitarbeiter:** Sucht Gäste am Eingang, prüft Kategorie/Status, checkt Gäste ein und ergänzt Support-Kommentare.
- **Door Manager / Event Lead:** Überwacht Live-Status, Kategorie-Summen, Problemfälle und Team-Aktivität während des Events.
- **Viewer:** Sieht Dashboards und Listen, ohne Gäste oder Einstellungen zu verändern.
- **System Administrator:** Betreibt die Web-App, verwaltet Deployment, technische Konfiguration, Monitoring und Backups.

## 4. Datenobjekte

- **Event:** Name, Datum, optionaler Ort, aktiv/inaktiv, Konfiguration.
- **Gast:** Guest ID, Name, Kategorie, Check-in Status, Check-in Zeit, Check-in durch, Support Kommentar.
- **Kategorie:** Name, Beschreibung optional, Reihenfolge, aktiv/inaktiv. Standard: GA, Member GA, Member VIP, On Stage, Mitarbeiter.
- **Status:** Offen, Eingecheckt, No Show.
- **Check-in Station:** Station oder Session, z. B. Check-in 1 bis Check-in 5; wird bei Aktionen gespeichert.
- **Audit Log Eintrag:** Gast, Aktion, alter Wert, neuer Wert, Zeitstempel, User/Station.

## 5. Requirement Übersicht

| ID | Titel | Priorität | Bereich |
|---|---|---|---|
| EVT-001 | Event anlegen und konfigurieren | MVP | Event Setup und Zugriff |
| EVT-002 | Teammitglieder einladen und Rollen vergeben | MVP | Event Setup und Zugriff |
| EVT-003 | Check-in Stationen/Sessions verwenden | MVP | Event Setup und Zugriff |
| GST-001 | Gäste anlegen und bearbeiten | MVP | Gästeverwaltung |
| GST-002 | Eindeutige Guest ID vergeben | MVP | Gästeverwaltung |
| GST-003 | Gäste aus CSV oder Excel importieren | MVP | Gästeverwaltung |
| GST-004 | Gästeliste exportieren | MVP | Gästeverwaltung |
| GST-005 | Support Kommentar pro Gast pflegen | MVP | Gästeverwaltung |
| CAT-001 | Vordefinierte Kategorien zuordnen | MVP | Kategorien und Status |
| CAT-002 | Kategorien verwalten | MVP | Kategorien und Status |
| STA-001 | Check-in Status führen | MVP | Kategorien und Status |
| CHK-001 | Gäste schnell suchen | MVP | Check-in Workflow |
| CHK-002 | Gast mit einer Aktion einchecken | MVP | Check-in Workflow |
| CHK-003 | Doppel-Check-ins verhindern | MVP | Check-in Workflow |
| CHK-004 | Check-in zurücksetzen oder korrigieren | MVP | Check-in Workflow |
| CHK-005 | No Show markieren | MVP | Check-in Workflow |
| CHK-006 | Mobile und Tablet optimierte Oberfläche | MVP | Check-in Workflow |
| LST-001 | Live Dashboard mit Gesamtsummen | MVP | Listen, Summen und Reporting |
| LST-002 | Kategorie-Listen mit Summe Personen | MVP | Listen, Summen und Reporting |
| LST-003 | Filter, Suche und Sortierung in Listen | Soll | Listen, Summen und Reporting |
| LST-004 | Post-Event Report erstellen | Soll | Listen, Summen und Reporting |
| COL-001 | Multi-User Synchronisation | MVP | Kollaboration und Datenintegrität |
| COL-002 | Sichere parallele Statusänderungen | MVP | Kollaboration und Datenintegrität |
| AUD-001 | Audit Log für Check-in und Korrekturen | MVP | Kollaboration und Datenintegrität |
| BKP-001 | Backups und Wiederherstellung | Soll | Kollaboration und Datenintegrität |
| OPS-001 | Browserbasierte Web-App bereitstellen | MVP | Betrieb, Sicherheit und Performance |
| OPS-002 | Sicher anmelden und Zugriff schützen | MVP | Betrieb, Sicherheit und Performance |
| OPS-003 | Stabile Hosting- und Datenbankumgebung | MVP | Betrieb, Sicherheit und Performance |
| OPS-004 | Schnelle Suche und Check-in Antwortzeiten | MVP | Betrieb, Sicherheit und Performance |
| OPS-005 | Fehlermeldungen und Monitoring | Soll | Betrieb, Sicherheit und Performance |
| OPS-006 | Datenschutz und Datenaufbewahrung | Soll | Betrieb, Sicherheit und Performance |

## 6. Requirement Cards

### Event Setup und Zugriff

#### EVT-001 — Event anlegen und konfigurieren

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn ich ein neues Event vorbereite, möchte ich Event-Name und Event-Datum erfassen, damit alle Gäste, Listen und Check-ins eindeutig dem richtigen Event zugeordnet sind.

**Akzeptanzkriterien:**
- Gegeben ein Event Manager erstellt oder bearbeitet ein Event, wenn Name und Datum gespeichert werden, dann sind diese Daten in Admin und Check-in sichtbar.
- Gegeben das MVP ist im Einsatz, dann unterstützt das System mindestens ein aktives Event.
- Gegeben Eventdaten werden geändert, dann aktualisieren sich betroffene Eventanzeigen ohne Verwechslung mit anderen Events.

**Geschäftsregeln:** Im MVP reicht ein aktives Event gleichzeitig. Ein archiviertes Event darf nicht versehentlich für Live-Check-in genutzt werden.

**Datenfelder:** Event ID, Event Name, Event Datum, Ort optional, aktiv/inaktiv

**Rechte:** Event Manager: erstellen/bearbeiten; Check-in Mitarbeiter und Viewer: lesen

**Edge Cases / Notizen:** Falsches Event geöffnet; Event ohne Datum; Archiviertes Event

#### EVT-002 — Teammitglieder einladen und Rollen vergeben

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn mehrere Personen am Event arbeiten, möchte ich Teammitglieder einladen und Rollen vergeben, damit jede Person nur die Funktionen nutzen kann, die sie für ihre Aufgabe braucht.

**Akzeptanzkriterien:**
- Gegeben ein Teammitglied wird eingeladen, wenn es sich anmeldet, dann erhält es Zugriff auf das richtige Event.
- Gegeben ein User hat die Rolle Check-in Mitarbeiter, dann kann er Gäste suchen, einchecken und Support-Kommentare bearbeiten.
- Gegeben ein Zugriff wird entfernt, dann kann der User keine Eventdaten mehr sehen oder ändern.

**Geschäftsregeln:** Mindestens 5 gleichzeitige Mitarbeiter müssen unterstützt werden. Rollen sind pro Event definierbar.

**Datenfelder:** User ID, Name/E-Mail, Rolle, Event-Zugriff, Status eingeladen/aktiv/deaktiviert

**Rechte:** Event Manager: einladen/entfernen/Rollen ändern; System Administrator: technische Userverwaltung

**Edge Cases / Notizen:** Geteilte Accounts; Verlorenes Gerät; Rolle während laufendem Event geändert

#### EVT-003 — Check-in Stationen/Sessions verwenden

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn ich mit einem bestimmten Tablet oder Mobile am Eingang arbeite, möchte ich eine Station wie Check-in 1 bis Check-in 5 auswählen, damit später klar ist, welche Station einen Gast eingecheckt hat.

**Akzeptanzkriterien:**
- Gegeben ein Mitarbeiter startet den Check-in Screen, wenn er eine Station auswählt, dann wird diese Station sichtbar angezeigt.
- Gegeben ein Gast wird eingecheckt, dann speichert das System Station oder User als 'Check-in durch'.
- Gegeben mehrere Geräte sind aktiv, dann überschreiben sich Suchfelder und Filter nicht gegenseitig.

**Geschäftsregeln:** Standardstationen: Check-in 1 bis Check-in 5. Eine Station ist kein Ersatz für Benutzerrechte.

**Datenfelder:** Station ID, Station Name, aktiver User, letzter Check-in Zeitpunkt

**Rechte:** Check-in Mitarbeiter: Station wählen; Event Manager: Stationen konfigurieren

**Edge Cases / Notizen:** Zwei Geräte wählen dieselbe Station; Station wird mitten im Event geändert

### Gästeverwaltung

#### GST-001 — Gäste anlegen und bearbeiten

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn ich die Gästeliste vorbereite, möchte ich Gäste mit Name, Kategorie, Status und Kommentar anlegen und bearbeiten, damit am Event eine zentrale und aktuelle Gästedatenbank verfügbar ist.

**Akzeptanzkriterien:**
- Gegeben ein Gast wird mit Name gespeichert, dann erscheint er in Suche, Listen und Summen.
- Gegeben Name, Kategorie, Status oder Kommentar wird geändert, dann sind die Änderungen sofort in Check-in und Reports sichtbar.
- Gegeben Pflichtfelder fehlen oder Werte ungültig sind, dann verhindert die App das Speichern mit verständlicher Fehlermeldung.

**Geschäftsregeln:** Leere Gäste werden nicht in Summen gezählt. Jeder Gast gehört genau zu einem Event.

**Datenfelder:** Guest ID, Name, Kategorie, Status, Check-in Zeit, Check-in durch, Support Kommentar

**Rechte:** Event Manager: erstellen/bearbeiten/löschen; Check-in Mitarbeiter: Status und Kommentar bearbeiten; Viewer: lesen

**Edge Cases / Notizen:** Doppelter Name; Sehr langer Name; Gast ohne Kategorie

#### GST-002 — Eindeutige Guest ID vergeben

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn mehrere Gäste gleiche oder ähnliche Namen haben, möchte ich eine eindeutige Guest ID pro Gast, damit am Eingang keine Person verwechselt wird.

**Akzeptanzkriterien:**
- Gegeben ein neuer Gast wird erstellt, dann generiert das System automatisch eine eindeutige Guest ID.
- Gegeben ein Gast wird später bearbeitet, dann bleibt die Guest ID stabil.
- Gegeben ein Check-in Mitarbeiter sucht nach der Guest ID, dann wird der passende Gast gefunden.

**Geschäftsregeln:** Guest IDs dürfen innerhalb eines Events nicht doppelt vorkommen. Guest IDs werden nicht aus dem Namen abgeleitet, wenn Kollisionen möglich sind.

**Datenfelder:** Guest ID, Event ID, externer Import-Schlüssel optional

**Rechte:** System: generieren; Event Manager: anzeigen/exportieren; Check-in Mitarbeiter: anzeigen/suchen

**Edge Cases / Notizen:** Import mit vorhandener ID; ID-Kollision; Namensänderung nach Import

#### GST-003 — Gäste aus CSV oder Excel importieren

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn bereits eine Gästeliste in Excel oder Google Sheets existiert, möchte ich sie importieren, damit der Wechsel zur Web-App ohne manuelle Neueingabe möglich ist.

**Akzeptanzkriterien:**
- Gegeben eine CSV- oder Excel-Datei wird hochgeladen, dann zeigt das System eine Import-Vorschau.
- Gegeben die Datei enthält ungültige Kategorien oder fehlende Namen, dann markiert die Vorschau die betroffenen Zeilen.
- Gegeben der Event Manager bestätigt den Import, dann werden gültige Gäste gespeichert und in Suche, Listen und Dashboard sichtbar.

**Geschäftsregeln:** Import soll bestehende Daten nicht ohne Bestätigung überschreiben. Importierte Gäste erhalten bei fehlender ID automatisch eine Guest ID.

**Datenfelder:** Guest ID, Name, Kategorie, Status, Check-in Zeit, Check-in durch, Support Kommentar

**Rechte:** Event Manager: importieren; Viewer/Check-in Mitarbeiter: kein Import

**Edge Cases / Notizen:** Falsche Spaltennamen; Duplikate; Sehr große Datei; gemischte Status-Sprache

#### GST-004 — Gästeliste exportieren

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn ich vor oder nach dem Event eine Sicherung oder einen Report brauche, möchte ich die Gästeliste als CSV oder Excel exportieren, damit Daten extern archiviert oder geteilt werden können.

**Akzeptanzkriterien:**
- Gegeben ein Event Manager exportiert die Gästeliste, dann enthält der Export alle MVP-Felder inklusive Check-in Zeit und Support Kommentar.
- Gegeben Filter sind gesetzt, dann kann der Export optional auf Kategorie oder Status begrenzt werden.
- Gegeben ein Export enthält interne Kommentare, dann ist der Export klar als intern gekennzeichnet.

**Geschäftsregeln:** Exporte sind rollenbasiert geschützt. Exportierte Zeitstempel verwenden ein konsistentes Format.

**Datenfelder:** Alle Gastfelder, Export-Zeitpunkt, Export-User

**Rechte:** Event Manager: exportieren; Viewer: optional Report-Export; Check-in Mitarbeiter: kein Voll-Export im MVP

**Edge Cases / Notizen:** Export während laufendem Check-in; Export mit personenbezogenen Kommentaren

#### GST-005 — Support Kommentar pro Gast pflegen

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn ein Gast besondere Hinweise oder Support-Bedarf hat, möchte ich pro Gast einen internen Kommentar erfassen, damit das Team die Information am Eingang sofort sieht.

**Akzeptanzkriterien:**
- Gegeben ein Check-in Mitarbeiter öffnet einen Gast, wenn er einen Support Kommentar eingibt, dann wird dieser Kommentar am Gast gespeichert.
- Gegeben der Kommentar wurde gespeichert, dann sehen andere aktive Benutzer den aktualisierten Kommentar.
- Gegeben ein Kommentar ist lang, dann bleibt er auf Mobile/Tablet lesbar oder kann erweitert geöffnet werden.

**Geschäftsregeln:** Support Kommentare sind intern und dürfen Gästen nicht angezeigt werden. Leere Kommentare sind erlaubt. Kommentare sind im Export enthalten, wenn der User berechtigt ist.

**Datenfelder:** Support Kommentar, letzter Bearbeiter optional, Änderungszeit optional

**Rechte:** Event Manager und Check-in Mitarbeiter: bearbeiten; Viewer: je nach Freigabe lesen; Gäste: nie sehen

**Edge Cases / Notizen:** Zwei Personen bearbeiten Kommentar gleichzeitig; vertrauliche Notiz; sehr langer Kommentar

### Kategorien und Status

#### CAT-001 — Vordefinierte Kategorien zuordnen

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn ich Gäste vorbereite, möchte ich jedem Gast eine vordefinierte Kategorie zuordnen, damit das Team am Eingang die richtige Zugangsgruppe erkennt.

**Akzeptanzkriterien:**
- Gegeben ein Gast wird erstellt oder bearbeitet, dann stehen standardmäßig GA, Member GA, Member VIP, On Stage und Mitarbeiter zur Auswahl.
- Gegeben ein Gast erscheint im Check-in Screen, dann ist seine Kategorie klar sichtbar.
- Gegeben Kategorie-Summen werden angezeigt, dann wird jeder Gast genau einmal in seiner Kategorie gezählt.

**Geschäftsregeln:** Jeder Gast hat im MVP genau eine Hauptkategorie. Kategorien sind konfigurierbar, aber Standardkategorien sind initial vorhanden.

**Datenfelder:** Kategorie ID, Kategorie Name, Reihenfolge, aktiv/inaktiv

**Rechte:** Event Manager: Kategorie zuordnen und konfigurieren; Check-in Mitarbeiter: anzeigen

**Edge Cases / Notizen:** Kategorie später umbenannt; Gast ohne Kategorie; Mitarbeiter als Kategorie statt Benutzerrolle

#### CAT-002 — Kategorien verwalten

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn sich Event-Struktur oder Gästeklassen ändern, möchte ich Kategorien hinzufügen, umbenennen, deaktivieren und sortieren, damit die App für zukünftige Events flexibel bleibt.

**Akzeptanzkriterien:**
- Gegeben die Kategorieverwaltung ist geöffnet, dann kann der Event Manager Kategorien hinzufügen, umbenennen, deaktivieren und sortieren.
- Gegeben eine Kategorie hat zugeordnete Gäste, dann darf sie nicht ohne Re-Zuordnung unkontrolliert gelöscht werden.
- Gegeben Kategorien wurden geändert, dann aktualisieren sich Filter, Listen und Summen entsprechend.

**Geschäftsregeln:** Kategorien mit aktiven Gästen dürfen nicht unkontrolliert gelöscht werden. Die Reihenfolge steuert Anzeige in Reports und Check-in.

**Datenfelder:** Kategorie ID, Name, Beschreibung, Reihenfolge, aktiv/inaktiv

**Rechte:** Event Manager: verwalten; System Administrator: globale Defaults optional

**Edge Cases / Notizen:** Kategorie wird während Check-in geändert; alte importierte Kategorie; leerer Kategoriename

#### STA-001 — Check-in Status führen

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn ich am Eingang arbeite, möchte ich pro Gast den Status Offen, Eingecheckt oder No Show sehen und ändern, damit der aktuelle Einlasszustand eindeutig ist.

**Akzeptanzkriterien:**
- Gegeben ein neuer Gast wird erstellt, dann ist sein Standardstatus Offen.
- Gegeben ein Gast wird eingecheckt, dann ändert sich der Status auf Eingecheckt.
- Gegeben ein Gast erscheint nicht, dann kann er als No Show markiert werden und wird separat gezählt.

**Geschäftsregeln:** Ein Gast hat immer genau einen Check-in Status. Statuswechsel werden im Audit Log erfasst.

**Datenfelder:** Status, Status-Zeitpunkt optional, Check-in Zeit, Check-in durch

**Rechte:** Check-in Mitarbeiter: Status ändern; Event Manager: Status ändern und korrigieren; Viewer: lesen

**Edge Cases / Notizen:** No Show wird später doch eingecheckt; Status versehentlich geändert

### Check-in Workflow

#### CHK-001 — Gäste schnell suchen

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn ein Gast am Eingang seinen Namen nennt, möchte ich ihn über Name, Guest ID, Kategorie, Status oder Kommentar schnell finden, damit die Warteschlange kurz bleibt.

**Akzeptanzkriterien:**
- Gegeben ein Mitarbeiter tippt einen Suchbegriff, dann zeigt die App passende Gäste mit Teiltreffern an.
- Gegeben die Suche verwendet Groß- oder Kleinschreibung, dann liefert sie dieselben relevanten Treffer.
- Gegeben Treffer vorhanden sind, dann zeigt jeder Treffer Guest ID, Name, Kategorie, Status, Check-in Zeit, Check-in durch und Support Kommentar.

**Geschäftsregeln:** Such- und Filterstatus ist pro Benutzer/Session und beeinflusst keine anderen Geräte. Doppelte Namen müssen durch Guest ID und Kategorie unterscheidbar sein.

**Datenfelder:** Suchbegriff, Trefferliste, Guest ID, Name, Kategorie, Status, Support Kommentar

**Rechte:** Check-in Mitarbeiter: suchen; Viewer: suchen/filtern je nach Ansicht

**Edge Cases / Notizen:** Doppelte Namen; Tippfehler; keine Treffer; mehrdeutiger Treffer

#### CHK-002 — Gast mit einer Aktion einchecken

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn der richtige Gast gefunden ist, möchte ich ihn mit einer klaren Aktion einchecken, damit der Einlass schnell und ohne Spreadsheet-Bearbeitung funktioniert.

**Akzeptanzkriterien:**
- Gegeben ein Gast hat Status Offen, wenn der Mitarbeiter 'Einchecken' auslöst, dann setzt das System den Status auf Eingecheckt.
- Gegeben der Check-in erfolgreich ist, dann speichert das System aktuellen Zeitstempel und User/Station.
- Gegeben der Check-in erfolgreich ist, dann aktualisieren sich Suche, Listen und Dashboard ohne vollständigen Seiten-Reload.

**Geschäftsregeln:** Der Check-in ist eine atomare Aktion: Status, Zeit und User/Station werden zusammen gespeichert. Die UI muss deutlich zeigen, ob die Aktion erfolgreich war.

**Datenfelder:** Status, Check-in Zeit, Check-in durch, Aktionstyp

**Rechte:** Check-in Mitarbeiter und Event Manager: einchecken

**Edge Cases / Notizen:** Netzwerkfehler während Aktion; Gast wurde parallel von anderer Station eingecheckt

#### CHK-003 — Doppel-Check-ins verhindern

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn ein Gast bereits eingecheckt wurde, möchte ich sofort eine Warnung sehen, damit dieselbe Person nicht versehentlich zweimal eingelassen wird.

**Akzeptanzkriterien:**
- Gegeben ein Gast ist bereits Eingecheckt, wenn erneut eingecheckt wird, dann zeigt das System eine Warnung mit Zeit und User/Station des ersten Check-ins.
- Gegeben zwei Geräte versuchen denselben Gast gleichzeitig einzuchecken, dann akzeptiert das System nur eine Aktion.
- Gegeben eine autorisierte Korrektur ist nötig, dann kann der Check-in über Reset/Undo korrigiert werden, ohne den ursprünglichen Audit Log zu löschen.

**Geschäftsregeln:** Check-in darf nicht stillschweigend überschrieben werden. Der erste erfolgreiche Check-in bleibt nachvollziehbar.

**Datenfelder:** Status, Check-in Zeit, Check-in durch, Audit Log ID

**Rechte:** Check-in Mitarbeiter: Warnung sehen; Event Manager: Korrektur durchführen

**Edge Cases / Notizen:** Parallelaktion; Refresh veraltet; Gast behauptet nicht eingecheckt zu sein

#### CHK-004 — Check-in zurücksetzen oder korrigieren

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn ein Gast versehentlich eingecheckt wurde, möchte ich den Check-in zurücksetzen können, damit Status und Reports wieder korrekt sind.

**Akzeptanzkriterien:**
- Gegeben ein Gast ist Eingecheckt, wenn ein autorisierter User den Reset ausführt, dann wird der Status auf Offen oder einen gewählten Zielstatus gesetzt.
- Gegeben ein Reset wurde ausgeführt, dann wird die Korrektur im Audit Log gespeichert.
- Gegeben andere Geräte sind aktiv, dann sehen sie den korrigierten Status zeitnah.

**Geschäftsregeln:** Reset darf nicht ohne Berechtigung möglich sein. Audit Log Einträge werden nicht gelöscht, sondern ergänzt.

**Datenfelder:** Alter Status, neuer Status, Reset-Zeit, Reset durch, Grund optional

**Rechte:** Event Manager: Reset; Check-in Mitarbeiter: optional nur mit besonderer Berechtigung

**Edge Cases / Notizen:** Reset eines No Show; Reset nach parallelem Check-in; fehlerhafter Reset

#### CHK-005 — No Show markieren

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn ein Gast bis zum relevanten Zeitpunkt nicht erscheint, möchte ich ihn als No Show markieren, damit die Event-Auswertung nachher stimmt.

**Akzeptanzkriterien:**
- Gegeben ein Gast ist Offen, wenn er als No Show markiert wird, dann ändert sich der Status auf No Show.
- Gegeben ein Gast ist No Show, dann wird er in Kategorie- und Gesamtsummen separat gezählt.
- Gegeben ein No-Show-Gast erscheint später doch, wenn er eingecheckt werden soll, dann verlangt das System eine bewusste Bestätigung.

**Geschäftsregeln:** No Show ist ein Check-in Status, kein Löschvorgang. No Show kann korrigiert werden.

**Datenfelder:** Status, No-Show-Zeit optional, geändert durch

**Rechte:** Check-in Mitarbeiter und Event Manager: setzen; Viewer: lesen

**Edge Cases / Notizen:** Gast erscheint spät; Massenmarkierung am Eventende

#### CHK-006 — Mobile und Tablet optimierte Oberfläche

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn ich am Eingang auf Mobile oder Tablet arbeite, möchte ich eine touch-freundliche Oberfläche, damit Suche, Prüfung und Check-in ohne kleine Spreadsheet-Zellen funktionieren.

**Akzeptanzkriterien:**
- Gegeben die App wird auf Tablet oder Mobile geöffnet, dann sind Suche, Trefferliste und Check-in Aktion gut lesbar und per Touch bedienbar.
- Gegeben der Bildschirm ist im Hoch- oder Querformat, dann bleibt die Kernfunktion nutzbar.
- Gegeben ein Kommentar oder Name ist lang, dann kann der Inhalt gelesen werden, ohne die Hauptaktion zu verdecken.

**Geschäftsregeln:** Check-in ist primäre Aktion und darf nicht versteckt sein. Die Oberfläche darf nicht von anderen Benutzern beeinflusst werden.

**Datenfelder:** Session-View-State, Suchbegriff, gewählte Filter

**Rechte:** Alle angemeldeten Rollen entsprechend ihrer Funktion

**Edge Cases / Notizen:** Kleines Smartphone; Handschuhe/Touch-Probleme; helles Umgebungslicht

### Listen, Summen und Reporting

#### LST-001 — Live Dashboard mit Gesamtsummen

**Priorität:** MVP  
**Akteur:** Door Manager / Event Lead

**Job Story:** Wenn das Event läuft, möchte ich Live-Summen zu Total, Eingecheckt, Offen und No Show sehen, damit ich den Einlassstatus sofort beurteilen kann.

**Akzeptanzkriterien:**
- Gegeben Gäste werden importiert, bearbeitet oder eingecheckt, dann aktualisiert das Dashboard Total, Eingecheckt, Offen und No Show.
- Gegeben ein Viewer öffnet das Dashboard, dann kann er Summen sehen, ohne Gästedaten zu bearbeiten.
- Gegeben Daten ändern sich auf anderen Geräten, dann werden die Dashboard-Werte zeitnah aktualisiert.

**Geschäftsregeln:** Leere oder archivierte Gäste werden nicht gezählt. Summen basieren auf aktueller Datenbank, nicht auf lokalem Cache.

**Datenfelder:** Total Gäste, Eingecheckt, Offen, No Show, letzte Aktualisierung

**Rechte:** Event Manager/Door Manager/Viewer: sehen; Check-in Mitarbeiter: optional sehen

**Edge Cases / Notizen:** Statuswechsel während Dashboard offen ist; Import während Event läuft

#### LST-002 — Kategorie-Listen mit Summe Personen

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn ich wissen möchte, wie viele Personen pro Kategorie erwartet oder anwesend sind, möchte ich Kategorie-Listen mit Summe Personen, Eingecheckt, Offen und No Show, damit Zugangsgruppen separat steuerbar sind.

**Akzeptanzkriterien:**
- Gegeben die Standardkategorien GA, Member GA, Member VIP, On Stage und Mitarbeiter existieren, dann gibt es pro Kategorie eine gefilterte Liste oder Ansicht.
- Gegeben eine Kategorie-Liste wird geöffnet, dann zeigt sie Summe Personen, Eingecheckt, Offen und No Show.
- Gegeben ein Gast wird eingecheckt oder umkategorisiert, dann ändern sich die zugehörigen Kategorie-Summen automatisch.

**Geschäftsregeln:** Ein Gast zählt im MVP in genau einer Kategorie. Kategorie-Listen zeigen dieselben Gast-Kernfelder wie die Hauptliste.

**Datenfelder:** Kategorie, Summe Personen, Eingecheckt, Offen, No Show, Gastfelder

**Rechte:** Event Manager/Door Manager/Viewer: sehen; Check-in Mitarbeiter: sehen je nach Rolle

**Edge Cases / Notizen:** Kategorie deaktiviert; Gast ohne Kategorie; Mitarbeiter getrennt von regulären Gästen

#### LST-003 — Filter, Suche und Sortierung in Listen

**Priorität:** Soll  
**Akteur:** Event Manager

**Job Story:** Wenn die Gästeliste größer wird, möchte ich Listen filtern, durchsuchen und sortieren, damit ich Gäste, Kategorien und Problemfälle schnell überprüfen kann.

**Akzeptanzkriterien:**
- Gegeben ein User sortiert eine Liste, dann kann er nach Name, Kategorie, Status, Check-in Zeit oder Check-in durch sortieren.
- Gegeben ein User filtert eine Ansicht, dann betrifft der Filter nur seine eigene Session und nicht andere Geräte.
- Gegeben ein Export aus einer gefilterten Liste ausgelöst wird, dann ist klar, ob alle Gäste oder nur der Filter exportiert werden.

**Geschäftsregeln:** View-State ist benutzerspezifisch. Datenänderungen bleiben gemeinsam, Filter nicht.

**Datenfelder:** Filter, Sortierung, Suchbegriff, gespeicherte Ansicht optional

**Rechte:** Alle Rollen nach Ansicht; Export nur berechtigte Rollen

**Edge Cases / Notizen:** Filter versteckt aktuelle Änderungen; Sortierung auf Mobile

#### LST-004 — Post-Event Report erstellen

**Priorität:** Soll  
**Akteur:** Event Manager

**Job Story:** Wenn das Event vorbei ist, möchte ich einen Report über Anwesenheit und Kategorien exportieren, damit Nachbereitung und Abrechnung einfacher werden.

**Akzeptanzkriterien:**
- Gegeben das Event ist beendet, dann kann der Event Manager einen Report mit Total, Eingecheckt, Offen und No Show erzeugen.
- Gegeben der Report wird exportiert, dann enthält er Kategorie-Breakdown und Check-in Zeiten.
- Gegeben Support Kommentare interne Details enthalten, dann entscheidet die Berechtigung, ob sie im Report enthalten sind.

**Geschäftsregeln:** Report-Daten sollen aus finalem Status und Audit Log ableitbar sein.

**Datenfelder:** Report-Zeitpunkt, Summen, Kategorien, Gastdetails optional

**Rechte:** Event Manager: erzeugen; Viewer: optional nur lesen/exportieren ohne Kommentare

**Edge Cases / Notizen:** Status wird nach Report korrigiert; Report ohne interne Kommentare

### Kollaboration und Datenintegrität

#### COL-001 — Multi-User Synchronisation

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn mehrere Geräte gleichzeitig am Eingang arbeiten, möchte ich Änderungen von anderen Geräten zeitnah sehen, damit alle mit demselben aktuellen Gästestatus arbeiten.

**Akzeptanzkriterien:**
- Gegeben ein Gast wird auf Gerät A eingecheckt, dann sieht Gerät B den Status zeitnah als Eingecheckt.
- Gegeben die Verbindung fällt aus oder Sync schlägt fehl, dann zeigt die App einen klaren Verbindungs- oder Sync-Hinweis.
- Gegeben eine Aktion ist noch nicht bestätigt, dann zeigt die App einen Lade- oder Pending-Zustand.

**Geschäftsregeln:** Datenintegrität hat Priorität vor optischer Schnelligkeit. Die App darf veraltete Zustände nicht als sicher darstellen.

**Datenfelder:** Sync-Status, letzter Server-Stand, lokaler Pending-Zustand

**Rechte:** Alle aktiven Rollen profitieren von Sync; System Administrator überwacht Fehler

**Edge Cases / Notizen:** Kurzzeitiger Verbindungsverlust; mehrere Eingänge; Browser-Tab lange offen

#### COL-002 — Sichere parallele Statusänderungen

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn zwei Personen denselben Gast gleichzeitig bearbeiten, möchte ich konsistente Regeln für parallele Änderungen, damit Status, Zeit und Kommentare nicht beschädigt werden.

**Akzeptanzkriterien:**
- Gegeben zwei Check-in Aktionen treffen gleichzeitig ein, dann wird nur eine als erfolgreich gespeichert.
- Gegeben ein Kommentar wurde parallel geändert, dann verhindert oder kennzeichnet das System ein unbemerktes Überschreiben.
- Gegeben eine Aktion wird abgelehnt, dann sieht der User den aktuellen Serverstand und eine verständliche Erklärung.

**Geschäftsregeln:** Check-in Statusänderungen müssen atomar gespeichert werden. Kommentaränderungen brauchen entweder Versionierung oder Konfliktbehandlung.

**Datenfelder:** Version/Revision, Zeitstempel, User, geänderter Feldname

**Rechte:** System: Konfliktprüfung; Event Manager: Konflikte korrigieren

**Edge Cases / Notizen:** Gleichzeitiger Check-in; Kommentar parallel editiert; Reset parallel zu Check-in

#### AUD-001 — Audit Log für Check-in und Korrekturen

**Priorität:** MVP  
**Akteur:** Door Manager / Event Lead

**Job Story:** Wenn es Fragen zu Check-ins, Korrekturen oder Doppelversuchen gibt, möchte ich ein Audit Log sehen, damit Aktionen nachvollziehbar bleiben.

**Akzeptanzkriterien:**
- Gegeben ein Status wird geändert, dann schreibt das System Gast, Aktion, alten Wert, neuen Wert, Zeitstempel und User/Station ins Audit Log.
- Gegeben ein Reset oder eine Korrektur erfolgt, dann bleibt der ursprüngliche Eintrag erhalten und ein neuer Korrektureintrag wird ergänzt.
- Gegeben ein Event Manager filtert das Audit Log, dann kann er nach Gast, Aktion, User/Station und Zeitraum suchen.

**Geschäftsregeln:** Normale User können Audit Log Einträge nicht verändern oder löschen. Audit Log ist Grundlage für Konfliktklärung und Post-Event Analyse.

**Datenfelder:** Audit ID, Event ID, Guest ID, Aktion, alter Wert, neuer Wert, Zeit, User/Station, Kommentar optional

**Rechte:** Event Manager/Door Manager: lesen; System Administrator: Wartung; Check-in Mitarbeiter: optional eingeschränkt

**Edge Cases / Notizen:** Audit Log sehr groß; fehlerhafte Aktion; Datenschutz bei Kommentaren

#### BKP-001 — Backups und Wiederherstellung

**Priorität:** Soll  
**Akteur:** System Administrator

**Job Story:** Wenn Daten versehentlich importiert, gelöscht oder falsch geändert werden, möchte ich Backups oder Wiederherstellungspunkte, damit die Gästeliste gerettet werden kann.

**Akzeptanzkriterien:**
- Gegeben ein technischer oder Bedienfehler passiert, dann gibt es eine dokumentierte Möglichkeit zur Wiederherstellung aktueller Daten.
- Gegeben eine Wiederherstellung wird ausgeführt, dann ist sie auf autorisierte Personen beschränkt.
- Gegeben ein Restore verändert Daten, dann wird der Vorgang nachvollziehbar protokolliert.

**Geschäftsregeln:** Backup-Strategie muss zum Hosting passen. Restore darf Live-Check-in nicht unbeabsichtigt überschreiben.

**Datenfelder:** Backup-Zeitpunkt, Backup-Status, Restore-User, Restore-Zeit

**Rechte:** System Administrator: Restore; Event Manager: Anfrage oder eingeschränkter Restore

**Edge Cases / Notizen:** Restore während laufendem Event; Teilrestore nur eines Events

### Betrieb, Sicherheit und Performance

#### OPS-001 — Browserbasierte Web-App bereitstellen

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn ich am Eingang arbeite, möchte ich die App über eine URL im Browser öffnen, damit keine Google-Sheets- oder Apps-Script-Einrichtung auf den Geräten nötig ist.

**Akzeptanzkriterien:**
- Gegeben ein berechtigter User öffnet die Produktions-URL, dann kann er sich anmelden und das Event öffnen.
- Gegeben die App wird auf aktuellen Mobile-, Tablet- und Desktop-Browsern genutzt, dann funktionieren Check-in und Admin-Grundfunktionen.
- Gegeben ein Gerät wird neu gestartet, dann kann der User die App erneut über dieselbe URL öffnen.

**Geschäftsregeln:** Die Web-App nutzt persistente Server-/Datenbank-Speicherung, nicht nur lokalen Browser-Speicher. Deployment trennt Entwicklung/Test und Produktion.

**Datenfelder:** App URL, Umgebung, Release-Version, Event ID

**Rechte:** Alle User nach Login; System Administrator verwaltet Deployment

**Edge Cases / Notizen:** Browser-Cache veraltet; falsche Umgebung geöffnet

#### OPS-002 — Sicher anmelden und Zugriff schützen

**Priorität:** MVP  
**Akteur:** Event Manager

**Job Story:** Wenn die Gästeliste personenbezogene Daten und interne Kommentare enthält, möchte ich sicheren Login und rollenbasierten Zugriff, damit nur autorisierte Personen Daten sehen oder ändern können.

**Akzeptanzkriterien:**
- Gegeben ein User ist nicht angemeldet, dann kann er keine Gästedaten sehen.
- Gegeben ein User hat eine Rolle, dann sieht und bearbeitet er nur die dafür freigegebenen Funktionen.
- Gegeben ein Zugang wird widerrufen, dann kann der User keine weiteren Eventdaten abrufen.

**Geschäftsregeln:** Support Kommentare sind intern. Export und Benutzerverwaltung sind besonders zu schützen.

**Datenfelder:** User, Rolle, Session, Berechtigungen, Login-Zeit

**Rechte:** Event Manager: Rollen für Event; System Administrator: technische Zugriffskontrolle

**Edge Cases / Notizen:** Geteiltes Passwort; offenes Tablet am Eingang; Session läuft ab

#### OPS-003 — Stabile Hosting- und Datenbankumgebung

**Priorität:** MVP  
**Akteur:** System Administrator

**Job Story:** Wenn die App produktiv am Event genutzt wird, möchte ich sie in einer stabilen Webumgebung mit persistenter Datenbank deployen, damit der Check-in zuverlässig erreichbar ist.

**Akzeptanzkriterien:**
- Gegeben die App ist produktiv, dann hat sie eine stabile URL und nutzt eine persistente Datenbank.
- Gegeben ein Deployment erfolgt, dann gibt es getrennte Entwicklungs- und Produktionsumgebungen.
- Gegeben ein Fehler tritt auf, dann kann der System Administrator Logs oder Monitoring einsehen.

**Geschäftsregeln:** Lokaler Browser-Speicher ist höchstens Cache, nicht primäre Datenquelle. Datenbank-Updates müssen migrationsfähig sein.

**Datenfelder:** Umgebung, Datenbank, Release, Logs, Health Status

**Rechte:** System Administrator: deployen/verwalten; Event Manager: Produktionsnutzung

**Edge Cases / Notizen:** Deployment kurz vor Event; Datenbank-Migration; Hosting-Ausfall

#### OPS-004 — Schnelle Suche und Check-in Antwortzeiten

**Priorität:** MVP  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn viele Gäste gleichzeitig ankommen, möchte ich schnelle Suche und schnelle Check-in Aktionen, damit sich keine unnötigen Schlangen bilden.

**Akzeptanzkriterien:**
- Gegeben eine Liste mit mindestens 1.000 Gästen, dann liefert die Suche unter normalen Bedingungen schnell Treffer.
- Gegeben ein Check-in wird ausgelöst, dann bestätigt die App die Aktion schnell oder zeigt einen Ladezustand.
- Gegeben eine Aktion dauert länger, dann bleibt sichtbar, dass das System arbeitet und keine zweite Aktion nötig ist.

**Geschäftsregeln:** Performance-Ziele müssen vor dem Event mit realistischen Daten getestet werden. Die UI soll Mehrfachklicks vermeiden.

**Datenfelder:** Antwortzeit, Suchindex optional, Pending-Aktion, Fehlerstatus

**Rechte:** Alle operativen Nutzer profitieren; System Administrator misst und optimiert

**Edge Cases / Notizen:** Langsame Mobilfunkverbindung; viele gleichzeitige Suchen; Doppelklick auf Check-in

#### OPS-005 — Fehlermeldungen und Monitoring

**Priorität:** Soll  
**Akteur:** System Administrator

**Job Story:** Wenn während des Events ein Problem auftritt, möchte ich klare Fehlermeldungen und technisches Monitoring, damit das Team schnell reagieren kann.

**Akzeptanzkriterien:**
- Gegeben ein Check-in schlägt fehl, dann sieht der Mitarbeiter eine verständliche Meldung und den aktuellen Gaststatus.
- Gegeben ein technischer Fehler tritt auf, dann wird er mit relevanten Details geloggt.
- Gegeben die Verbindung ist gestört, dann unterscheidet die App zwischen Netzwerkproblem, Berechtigungsproblem und Datenkonflikt.

**Geschäftsregeln:** Fehlermeldungen dürfen keine sensiblen internen Details offenlegen. Admin-Logs müssen zur Diagnose ausreichend sein.

**Datenfelder:** Fehlercode, Fehlertyp, User/Session, Zeit, Request ID optional

**Rechte:** Check-in Mitarbeiter: einfache Meldungen; System Administrator: Logs/Monitoring

**Edge Cases / Notizen:** Login abgelaufen; Backend nicht erreichbar; Konflikt bei paralleler Änderung

#### OPS-006 — Datenschutz und Datenaufbewahrung

**Priorität:** Soll  
**Akteur:** Event Manager

**Job Story:** Wenn die App personenbezogene Gästedaten und interne Kommentare speichert, möchte ich kontrollierte Aufbewahrung, Export- und Löschmöglichkeiten, damit Daten verantwortungsvoll behandelt werden.

**Akzeptanzkriterien:**
- Gegeben ein User hat keine Berechtigung, dann kann er personenbezogene Gästedaten und Kommentare nicht abrufen.
- Gegeben ein Event ist abgeschlossen, dann kann der Event Manager Daten archivieren oder löschen, falls vorgesehen.
- Gegeben ein Export personenbezogene Daten enthält, dann ist der Export rollenbasiert geschützt.

**Geschäftsregeln:** Support Kommentare gelten als interne Informationen. Aufbewahrungsdauer muss als offene Entscheidung festgelegt werden.

**Datenfelder:** Archivstatus, Löschdatum optional, Exportprotokoll optional

**Rechte:** Event Manager/System Administrator: Archiv/Löschung; Viewer/Check-in Mitarbeiter: keine Löschung

**Edge Cases / Notizen:** Person verlangt Auskunft/Löschung; Kommentare enthalten sensible Angaben

## 7. Phase 2 / optionale Erweiterungen

#### P2-001 — QR- oder Barcode-Scan

**Priorität:** Kann  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn Gäste Tickets oder QR-Codes erhalten, möchte ich Codes scannen, damit Check-in schneller als Namenssuche ist.

**Akzeptanzkriterien:**
- Scan findet den Gast eindeutig.
- Manuelle Suche bleibt als Fallback verfügbar.
- Doppelte Scans zeigen dieselbe Doppel-Check-in-Warnung.

**Geschäftsregeln:** QR-Code muss auf Guest ID oder sicheren Check-in Token verweisen.

**Datenfelder:** QR/Barcode Token, Guest ID, Scan-Zeit

**Rechte:** Check-in Mitarbeiter: scannen; Event Manager: Codes erzeugen

**Edge Cases / Notizen:** Code unlesbar; falsches Ticket; Gast ohne Code

#### P2-002 — Offline Check-in

**Priorität:** Kann  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn Internet am Veranstaltungsort instabil ist, möchte ich temporär offline weiter einchecken, damit der Einlass nicht stoppt.

**Akzeptanzkriterien:**
- Offline-Aktionen werden lokal zwischengespeichert.
- Beim Reconnect werden Aktionen synchronisiert.
- Konflikte werden erkannt und sicher aufgelöst.

**Geschäftsregeln:** Offline erhöht Komplexität bei Doppel-Check-ins und muss bewusst geplant werden.

**Datenfelder:** Offline Queue, lokaler Zeitstempel, Sync-Status

**Rechte:** Check-in Mitarbeiter: offline nutzen; System Administrator: Konflikte überwachen

**Edge Cases / Notizen:** Zwei Geräte offline checken denselben Gast ein; langer Offline-Zeitraum

#### P2-003 — RSVP Tracking

**Priorität:** Kann  
**Akteur:** Event Manager

**Job Story:** Wenn Einladungen vor dem Event beantwortet werden, möchte ich RSVP-Status separat vom Check-in Status führen, damit Zusagen, Absagen und Anwesenheit vergleichbar sind.

**Akzeptanzkriterien:**
- RSVP Status ist getrennt von Check-in Status.
- RSVP kann importiert oder manuell gepflegt werden.
- Reports können RSVP und tatsächlichen Check-in vergleichen.

**Geschäftsregeln:** RSVP darf Check-in Status nicht ersetzen.

**Datenfelder:** RSVP Status: Eingeladen, Zugesagt, Abgesagt, Offen; RSVP Zeitpunkt

**Rechte:** Event Manager: pflegen; Viewer: sehen; Check-in Mitarbeiter: optional sehen

**Edge Cases / Notizen:** Gast ohne RSVP erscheint; Zusage aber No Show

#### P2-004 — E-Mail Einladungen und Updates

**Priorität:** Kann  
**Akteur:** Event Manager

**Job Story:** Wenn Gäste informiert oder eingeladen werden sollen, möchte ich E-Mail Einladungen und Updates versenden, damit Kommunikation aus demselben System möglich ist.

**Akzeptanzkriterien:**
- E-Mails können an ausgewählte Gäste gesendet werden.
- Versandstatus ist sichtbar.
- Gäste ohne E-Mail bleiben manuell verwaltbar.

**Geschäftsregeln:** Opt-in, Absender und Datenschutz müssen separat geklärt werden.

**Datenfelder:** E-Mail, Versandstatus, Versandzeit, Vorlage

**Rechte:** Event Manager: senden; System Administrator: E-Mail-Konfiguration

**Edge Cases / Notizen:** Bounces; falsche E-Mail; Spam-Einstufung

#### P2-005 — Badge- oder Labeldruck

**Priorität:** Kann  
**Akteur:** Check-in Mitarbeiter

**Job Story:** Wenn VIP, Mitarbeiter oder On-Stage Personen physische Kennzeichnung brauchen, möchte ich beim Check-in Badges oder Labels drucken, damit Zugangsrechte sichtbar sind.

**Akzeptanzkriterien:**
- Badge enthält mindestens Name und Kategorie.
- Druck kann beim Check-in ausgelöst werden.
- Check-in funktioniert weiter, auch wenn Druck fehlschlägt.

**Geschäftsregeln:** Druck ist optional und darf den Check-in nicht blockieren.

**Datenfelder:** Badge Vorlage, Druckstatus, Druckzeit

**Rechte:** Check-in Mitarbeiter: drucken; Event Manager: Vorlagen konfigurieren

**Edge Cases / Notizen:** Drucker offline; falscher Badge; Nachdruck

#### P2-006 — Mehrere Events pro Account

**Priorität:** Kann  
**Akteur:** Event Manager

**Job Story:** Wenn das System für wiederkehrende Events genutzt wird, möchte ich mehrere Events in einem Account verwalten, damit Kategorien und Teamstrukturen wiederverwendet werden können.

**Akzeptanzkriterien:**
- User können zwischen Events wechseln.
- Gästelisten und Reports bleiben strikt pro Event getrennt.
- Kategorien können optional von einem Event kopiert werden.

**Geschäftsregeln:** Event-Kontext muss in jeder Ansicht eindeutig sein.

**Datenfelder:** Account ID, Event ID, kopierte Kategorie-Sets

**Rechte:** Event Manager: Events verwalten; System Administrator: Account-Verwaltung

**Edge Cases / Notizen:** Falsches Event bearbeitet; Teammitglied nur für ein Event berechtigt

#### P2-007 — Begleitpersonen / Plus-One

**Priorität:** Kann  
**Akteur:** Event Manager

**Job Story:** Wenn Gäste Begleitpersonen mitbringen dürfen, möchte ich erlaubte und eingecheckte Begleitungen erfassen, damit Personensummen korrekt sind.

**Akzeptanzkriterien:**
- Pro Gast kann eine erlaubte Anzahl Begleitpersonen definiert werden.
- Beim Check-in kann erfasst werden, wie viele Begleitpersonen tatsächlich eintreten.
- Kategorie-Summen berücksichtigen auf Wunsch Personen statt nur Gastdatensätze.

**Geschäftsregeln:** Im MVP zählt ein Gastdatensatz als eine Person; Plus-One ist separate Erweiterung.

**Datenfelder:** Erlaubte Begleitungen, eingecheckte Begleitungen, Personenanzahl

**Rechte:** Event Manager: konfigurieren; Check-in Mitarbeiter: beim Check-in erfassen

**Edge Cases / Notizen:** Mehr Begleitungen als erlaubt; Begleitung kommt später separat

## 8. Offene Entscheidungen

- **Authentifizierung:** E-Mail/Passwort, Magic Link, Single Sign-on oder Event-Zugangscode festlegen.
- **Offline im MVP:** Entscheiden, ob Offline Check-in MVP ist oder Phase 2 bleibt.
- **Gast-Self-Service:** Entscheiden, ob Gäste sich selbst registrieren, RSVP abgeben oder QR-Codes erhalten sollen.
- **Datenaufbewahrung:** Festlegen, wie lange Gästedaten und Support Kommentare nach dem Event gespeichert werden.
- **Mehrere Kategorien pro Gast:** Aktueller Stand: genau eine Hauptkategorie. Zukünftig eventuell zusätzliche Tags.
- **Begleitpersonen:** Aktueller Stand: ein Gastdatensatz zählt als eine Person. Plus-One separat entscheiden.
- **Korrekturrechte:** Festlegen, ob Check-in Mitarbeiter Check-ins zurücksetzen dürfen oder nur Event Manager.
- **Deployment-Ziel:** Hosting und Datenbank wählen, z. B. eigener Server, Cloud PaaS oder managed Backend.

## 9. MVP-Abgrenzung

Der MVP ersetzt die aktuelle Google-Sheets-Lösung durch eine Web-App. Zum MVP gehören: zentrale Gästedatenbank, Kategorien, Mitarbeiter-Kategorie, Status Offen/Eingecheckt/No Show, mobile Check-in Suche, One-Tap Check-in, Doppel-Check-in-Schutz, Support Kommentar pro Gast, Kategorie-Listen mit Summen, Multi-User Synchronisation, Audit Log, Import/Export, Login und hosted Deployment. Phase 2 umfasst QR-Code-Scan, Offline Check-in, RSVP, E-Mail-Einladungen, Badge-Druck, mehrere Events pro Account und Plus-One/Begleitpersonen.
