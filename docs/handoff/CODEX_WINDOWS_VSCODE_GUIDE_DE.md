# Codex Windows App + VS Code Codex Extension — Vorgehen

## Ziel

Codex soll im bestehenden lokalen Repository arbeiten:

```text
C:\DEV\Guest-List
```

Das Repository existiert bereits. Dieses Paket enthält daher kein `.git`-Verzeichnis.

## Empfohlener Ablauf

### 1. Dateien ins Repository kopieren

Option A: ZIP direkt nach `C:\DEV\Guest-List` entpacken.  
Option B: ZIP in temporären Ordner entpacken und dann aus PowerShell kopieren:

```powershell
cd C:\TEMP\Guest-List-Handoff
.\COPY_TO_EXISTING_REPO.ps1 -Target "C:\DEV\Guest-List"
```

### 2. VS Code öffnen

```powershell
cd C:\DEV\Guest-List
code .
```

### 3. Git Status prüfen

```powershell
git status
```

### 4. Ersten Commit erstellen

```powershell
git add .
git commit -m "Add guest list MVP handoff and app files"
```

### 5. Codex Windows App öffnen

In der Codex Windows App den Ordner öffnen:

```text
C:\DEV\Guest-List
```

Codex soll zuerst lesen:

```text
CODEX_START_HERE.md
AGENTS.md
docs/handoff/KNOWLEDGE_TRANSFER_DE.md
docs/handoff/CODEX_PROMPT.md
```

### 6. Prompt an Codex geben

Den kompletten Prompt aus `docs/handoff/CODEX_PROMPT.md` verwenden.

Wichtig: Codex soll nicht neu planen und nicht die Architektur wechseln.

### 7. Nach Codex-Änderungen

```powershell
git status
git diff
git add .
git commit -m "Stabilize guest list MVP for deployment"
git push
```

## Wichtige Bitte an Codex

Codex soll zuerst die bestehenden Dateien analysieren, dann die wichtigsten Risiken nennen, und erst danach Änderungen machen.

Besonders prüfen:

- GitHub Pages relative Pfade.
- Firebase Config in `app-config.js`.
- Firestore Rules.
- CSV Import mit Umlauten und Semikolon.
- Firestore Transaction für Doppel-Check-in.
- 1200-Gäste-Performance.
