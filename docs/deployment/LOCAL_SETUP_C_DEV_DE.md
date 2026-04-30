# Lokales Setup unter C:\DEV\Guest-List

## 1. ZIP entpacken

Die bereitgestellte ZIP-Datei in einen temporären Ordner entpacken, z. B.:

```text
C:\TEMP\Guest-List-Handoff
```

Dann den Inhalt des entpackten Ordners in das bereits vorhandene Repository kopieren:

```text
C:\DEV\Guest-List
```

Danach sollte z. B. diese Datei existieren:

```text
C:\DEV\Guest-List\CODEX_START_HERE.md
```

Wichtig: Nicht versehentlich einen doppelten Ordner erzeugen wie:

```text
C:\DEV\Guest-List\Guest-List\index.html
```

## 2. Git Repository prüfen

Das Repository existiert laut Benutzer bereits. Prüfen:

```powershell
cd C:\DEV\Guest-List
git status
git remote -v
```

Dann die neuen Dateien committen:

```powershell
git add .
git commit -m "Add guest list MVP handoff and app files"
```

## 3. Codex Windows App

1. Codex Windows App öffnen.
2. Ordner `C:\DEV\Guest-List` als Projekt/Workspace öffnen.
3. Als ersten Kontext diese Dateien nennen:
   - `CODEX_START_HERE.md`
   - `AGENTS.md`
   - `docs/handoff/CODEX_PROMPT.md`
   - `docs/handoff/KNOWLEDGE_TRANSFER_DE.md`

## 4. VS Code + Codex Extension

1. VS Code öffnen.
2. Ordner `C:\DEV\Guest-List` öffnen.
3. Codex Extension starten.
4. Prompt aus `docs/handoff/CODEX_PROMPT.md` verwenden.

## 5. GitHub Push

Falls Remote vorhanden:

```powershell
git push
```

Falls Remote fehlt:

```powershell
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

## 6. Deployment

Danach GitHub Pages aktivieren und Firebase gemäß Deployment-Dokument konfigurieren:

```text
docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md
```
