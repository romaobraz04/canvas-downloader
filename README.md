# Canvas Downloader

A small personal web app that syncs files from active Erasmus University Rotterdam Canvas courses into folders on your computer.

This repository was refactored from the original Python/Tkinter desktop package into a static browser app plus one stateless Canvas proxy.

## What it keeps from the desktop app

- Canvas access-token authentication
- Active-course discovery
- Select only the courses you want
- Course → module → file folder structure
- Update-only mode (skip files already present)
- Optional ESE `BLOK1`–`BLOK5` grouping
- Per-course block assignment
- Ability to skip an entire block
- Windows-safe folder/file names

The old `ONLY_COURSES` and `EXCLUDED` text fields are replaced by a course checklist. It is the same behavior with less configuration.

## Architecture

- `web/` — dependency-free HTML/CSS/JavaScript app
- `supabase/functions/canvas-proxy/` — stateless Supabase Edge Function that forwards only the Canvas endpoints this app needs
- `.github/workflows/deploy-pages.yml` — deploys the static app to GitHub Pages

The Canvas token is never stored in Supabase or a database. It is sent in an HTTPS request header only when the app needs to call Canvas. The browser can optionally remember the token in local storage if you explicitly enable **Remember token on this device**.

## Browser support

Direct folder sync uses the File System Access API. Use a current desktop Chromium browser such as Chrome or Edge.

The user must explicitly choose a folder and grant write access. A normal website cannot silently write anywhere on the computer.

## Local development

Serve the `web` directory from localhost rather than opening `index.html` directly:

```bash
python -m http.server 5173 --directory web
```

Then open `http://localhost:5173`.

The deployed proxy currently allows:

- `https://romaobraz04.github.io`
- `http://localhost:*`
- `http://127.0.0.1:*`

## Deployment

### Frontend

Push or merge to `main`. The GitHub Pages workflow uploads only `web/`.

Expected project-site URL:

```text
https://romaobraz04.github.io/canvas-downloader/
```

GitHub Pages may need to be enabled once in **Repository Settings → Pages → Source: GitHub Actions**.

### Canvas proxy

The Edge Function source is versioned in this repo. Deploy `canvas-proxy` to the configured Supabase project.

The function:

- accepts only this app's configured origins
- accepts only the four Canvas GET endpoint shapes used by the downloader
- accepts file downloads only from `https://canvas.eur.nl`
- validates the Supabase publishable key
- does not persist Canvas tokens or file contents

## Personal-use note

Canvas documents manually generated access tokens as appropriate for testing/personal use; multi-user third-party applications should use Canvas OAuth with a registered Developer Key. Do not turn this into a public multi-user service without replacing manual token entry with OAuth.

## Legacy version

The repository history still contains the previous Python/Tkinter implementation and Windows executable artifacts. They are intentionally removed from the web-app branch rather than carried forward.
