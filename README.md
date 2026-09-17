# Canvas Downloader

A small personal web app that streams files from active Erasmus University Rotterdam Canvas courses into folders on your computer.

Live app: [canvas-downloader.romao-braz.workers.dev](https://canvas-downloader.romao-braz.workers.dev/).

## Workflow

- Paste a manually generated Canvas access token.
- Load and select active courses.
- Optionally group Erasmus School of Economics courses into `BLOK1`–`BLOK5`, assign each course, and skip whole blocks.
- Choose a destination folder explicitly in Chrome or Edge.
- Sync into `BLOK (optional) / Course / Module / File`.
- In update-only mode, skip files that already exist.

The browser writes each download stream directly into the chosen folder through the File System Access API. File contents are not buffered in application memory.

## Architecture

This is one dependency-free Cloudflare Worker application:

- `web/` contains the static HTML, CSS, and JavaScript.
- `worker/index.js` contains a stateless, same-origin Canvas proxy.
- `wrangler.jsonc` deploys both together with Cloudflare Workers Static Assets.

There is no database, user-account system, frontend framework, or server-side token storage. The Worker code does not log request headers, bodies, signed URLs, or Canvas tokens.

The frontend can remember a token only when the user explicitly selects that option. That value stays in that browser's local storage and is never stored by the Worker.

## Proxy boundaries

The browser can call only these fixed same-origin routes:

- `GET /api/health`
- `GET /api/courses`
- `GET /api/courses/:courseId/modules`
- `GET /api/courses/:courseId/modules/:moduleId/items`
- `GET /api/files/:fileId`
- `GET /api/files/:fileId/download`

The Worker maps them to only the four Canvas API endpoint shapes needed by the downloader. IDs must be numeric, client query strings are rejected, pagination links must stay on the exact EUR Canvas origin and API path, and API redirects are rejected.

For downloads, the browser supplies only a numeric file ID. The Worker resolves its URL from `https://canvas.eur.nl`, requires the initial file URL to be the matching EUR Canvas download path, and streams the response. Canvas may redirect the file to its HTTPS storage provider; the Worker follows that server-selected redirect without the Canvas token. The token is attached only to requests whose exact origin is `https://canvas.eur.nl`.

API responses have `Cache-Control: private, no-store` and do not grant cross-origin access.

Upstream requests identify the app with a fixed User-Agent, as required by Canvas. Paginated metadata is limited to 30 pages and 5 MB in total. File downloads remain streamed without a file-size buffer.

## Browser support

Direct folder sync requires a current desktop Chromium browser such as Chrome or Edge. The user must choose the folder and grant write access; the site cannot silently write elsewhere.

## Local development

Node.js 22 or later is recommended.

```bash
npm install
npm run dev
```

Wrangler serves the frontend and API together, normally at `http://localhost:8787`.

Run the automated proxy checks and a deployment build check with:

```bash
npm test
npm run check
```

## Deployment

Authenticate Wrangler with the intended Cloudflare account once, then deploy the Worker and its static assets:

```bash
npx wrangler login
npm run deploy
```

The default deployment uses the Cloudflare-provided `workers.dev` domain and does not require a paid service.

The current deployment uses Cloudflare Workers Static Assets for the frontend and disables Worker logging. It was published through the connected Cloudflare account's API with the same routing configuration as Wrangler.

Deployment verification confirmed that all three frontend files match the repository, health responds successfully, missing and invalid tokens return 401, unknown routes return 404, client query strings return 400, unsupported methods return 405, and foreign browser origins return 403 without CORS access. Twelve automated proxy tests and the Wrangler packaging check pass. A full sync with a real Canvas token and chosen folder remains a manual browser check.

The previous Supabase `canvas-proxy` is disabled and returns HTTP 410 Gone. The connected tooling cannot delete the function object; the unrelated QuantRush database and schema were left untouched. Supabase and GitHub Pages are no longer used by this app.

## Personal-use note

Canvas documents manually generated access tokens as appropriate for testing and personal use. A public multi-user service should use Canvas OAuth with a registered Developer Key instead.

## Legacy version

The repository history still contains the original Python/Tkinter implementation and Windows build artifacts. They remain in Git history rather than in the web branch.
