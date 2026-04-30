---
name: github-pages
description: Use when changing GitHub Pages deployment, root static site files, Pages settings guidance, asset paths, .nojekyll behavior, or public hosting docs for this project.
---

# GitHub Pages Skill

Use this workflow for Pages-related changes in this repository.

## Workflow

1. Read `AGENTS.md`, `docs/agents/github-pages-operations.md`, and `docs/deployment/DEPLOYMENT_GITHUB_FIREBASE_DE.md`.
2. Keep deployable app files at the repository root.
3. Use relative asset paths such as `styles.css`, `app-config.js`, and `app.js`.
4. Avoid build tooling unless the user explicitly asks for it.
5. Verify changed static files. For JavaScript, syntax-check `app.js` as an ES module.

## Deployment Model

The MVP publishes from `main` and `/root` through GitHub Pages branch publishing. Do not create, push, or repair a `gh-pages` branch for this repository unless the user explicitly changes the deployment model.

## Pages Checks

- Root `index.html` must exist.
- Keep `.nojekyll` in the root unless the project intentionally moves to Jekyll.
- For project Pages URLs, assume the app may live under `/<repository>/`; use relative paths or query/hash routing.
- Custom domains are configured in repository settings or the GitHub API.
- Pages sites are public; do not commit sensitive guest data or private event details.

