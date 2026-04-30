# GitHub Pages Operations

This runbook is for agents changing deployment, public site structure, asset paths, or GitHub Pages settings guidance.

## Deployment Model

- Source directory: repository root
- Entry file: `index.html`
- GitHub Pages source setting: Deploy from branch
- Branch: `main`
- Folder: `/root`
- Jekyll disabled by root `.nojekyll`

This deployment model matches the imported MVP handoff and keeps deployment simple for the event operator.

## Rules for Agents

- Do not push to a `gh-pages` branch.
- Do not add a local deployment script that commits generated output to `gh-pages`.
- Do not reintroduce the obsolete `site/` deployment path unless the user explicitly asks to switch to GitHub Actions.
- Keep asset URLs relative, for example `styles.css`, `app-config.js`, and `app.js`, because project Pages sites are normally served below `/<repository>/`.
- Keep `.nojekyll` in the repository root for this plain static site.
- Do not add analytics, trackers, external embeds, or network calls beyond the Firebase SDK already required by the MVP without explicit approval.
- Do not commit real guest data, private event information, exports, tokens, service-account keys, or secrets.

## Publishing

Normal publish path:

```powershell
git push origin main
```

GitHub Pages setup:

```text
Settings -> Pages -> Build and deployment -> Source: Deploy from branch
Branch: main
Folder: /root
```

The repository owner must perform the Pages settings step on GitHub.

## Troubleshooting

- 404 at site root: confirm Pages source is `Deploy from branch`, branch `main`, folder `/root`, and root `index.html` exists.
- CSS or JS missing: check for absolute paths like `/app.js`; project sites need relative paths unless a custom domain/base path strategy is confirmed.
- Firebase config missing screen: replace placeholders in `app-config.js` with the Firebase Web App config.
- Permission denied in browser console: compare `app.js` collection paths and fields with `firebase.rules`.
- Workflow confusion: this repo does not need a Pages workflow for the MVP; branch publishing owns deployment.
- Stale live content: inspect the latest pushed commit, wait a few minutes, then hard-refresh or clear browser cache.
- Custom domain not active: configure the domain in repository settings or through the GitHub API. If branch publishing is used, GitHub may manage a root `CNAME` file for the custom domain.

## Static Site Constraints

- GitHub Pages serves static files only. Do not design features that need server-side PHP, Ruby, Python, database writes from a private server, background jobs, or private API secrets.
- Firebase client SDK access must be constrained by Firestore Security Rules, not by hiding client config.
- For client-side navigation, use query parameters, normal static pages, hash routing, or generated redirect pages. Do not assume server rewrite support.
- Browser storage is local to each visitor. Live guest data sync comes from Firestore, not local storage.
- A custom `404.html` may be added if missing-page handling matters.

## Practical Limits

Keep this site small. GitHub documents a 1 GB recommended source repository limit, a 1 GB published-site limit, a 10 minute deployment timeout, and a 100 GB/month soft bandwidth limit for Pages sites.

## References

- GitHub Docs: [Configuring a publishing source for GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- GitHub Docs: [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- GitHub Docs: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- GitHub Docs: [Troubleshooting custom domains and GitHub Pages](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)
- Local lesson from neighboring repos: CI-owned Pages deployment avoids stale manual `gh-pages` pushes and branch conflicts, but this MVP currently uses simpler branch-root publishing.

