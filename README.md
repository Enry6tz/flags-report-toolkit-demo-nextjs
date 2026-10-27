# e6tz integration workspace

A browser-local Next.js reference host for **@e6tz/reports 0.1.1**, **@e6tz/flags 0.1.1** and **@e6tz/toolkit 0.9.4**. The integrations use the actual published packages, not simulated SDK implementations.

[Source repository](https://github.com/Enry6tz/flags-report-toolkit-demo-nextjs) · [Deployment guide](docs/deployment.md) · [MIT license](LICENSE)

## Run locally

Requires Node.js **22.23+** and npm.

```sh
npm ci
npm run dev
```

Open [http://localhost:5600](http://localhost:5600). For the production server, run `npm run build`, then `npm start`. No credentials or database service are required.

The production launcher uses Next.js standalone output, copies its static/public assets into place and defaults to port 5600. Set `PORT` to override that port; `NEXT_LISTEN_HOST` overrides its default `0.0.0.0` bind address. Docker starts its packaged standalone server directly on port 3000.

## Try the three workflows

- **Reports:** create a report with optional image and explicitly selected page context. The SDK validates it and calls the local transport. Read, search, mark unread and archive reports in the inbox.
- **QA recordings:** use the actual floating Toolkit toolbar to start recording, interact with the application and add marks. Stop, choose **Copy JSON**, then open **Save recording JSON**. The public Toolkit importer validates the export before it enters the library. Inspect its steps and download JSON or SDK-generated Markdown.
- **Flags:** create, describe, toggle and remove boolean flags. Click **Load provider** or **Refresh provider** to evaluate the saved configuration with the actual SDK. Try an unknown key or wait for expiry to inspect fallback behavior.

No sample data, accounts or remote backend are preconfigured. The interface keeps the warm e6tz identity without alternate modes or decorative motion.

## What browser-local means

The host stores records under the versioned `localStorage` key `e6tz.workspace.v1`. Records belong only to this browser profile and origin. A different browser, device or port has a separate workspace. Clearing site data removes the records. Scripts on the same origin can read them: **do not store secrets or sensitive production information here**.

Writes must succeed before the UI announces success or the Reports transport acknowledges a submission. Invalid saved JSON or unsupported data is not silently reset. Use **Export raw backup** before repairing browser data. Read, quota and write failures are visible.

Reference limits are 4 MiB per workspace, 500 reports, 100 recordings and 2 MiB per recording JSON. The Flags SDK permits at most 64 flags. Browser quotas and string encoding vary; writes can fail before the reference limit.

Other tabs receive storage events and refresh the host's records. A loaded Flags client still requires an explicit provider refresh. LocalStorage read/modify/write is **not a transaction across tabs**; simultaneous writers can overwrite each other. Local acknowledgements are not durable server receipts or multi-user idempotency guarantees.

Toolkit's internal draft persistence is explicitly disabled. Its current recording remains in memory until exported; the host library stores only exports you explicitly import. Save before reloading or leaving. Network recording and body capture start disabled. No wiki, live configuration or document-save backend is configured.

## Connect an existing backend

Read [the backend integration guide](docs/backend-integration.md). Keep your existing users, permissions and database; replace the local transport/provider/persistence adapters. Suggested tables are examples, not SDK requirements.

Authoritative package contracts:

- [Reports HTTP contract](https://github.com/Enry6tz/reports#contrato-http)
- [Flags HTTP contract](https://github.com/Enry6tz/Flags#contrato-http)
- [Toolkit host integration](https://github.com/Enry6tz/Toolkit/blob/main/docs/host-integration.md)

This project does **not** implement a receiving HTTP API, authentication or a server database. It includes a production container definition and CI workflow; an actual hosting deployment must be configured and verified separately. The toolbar deliberately uses `environment="preview"` in this reference. Visibility is not authorization. No NPM republication is needed to run the app.

## Docker and continuous delivery

```sh
docker build --tag e6tz-reference:local .
docker run --rm --publish 5600:3000 e6tz-reference:local
```

The container runs the Next.js standalone server as a non-root user, listening on port **3000**. No database, application volume or secrets are required. Browser records stay in each visitor's localStorage, not on the VPS.

GitHub Actions validates the application, browser flows and container. Only after those checks pass on `main` does its publishing job upload `main` and `sha-<commit>` tags to `ghcr.io/enry6tz/flags-report-toolkit-demo-nextjs`. It uses the built-in GitHub token; there is no NPM publication or hardcoded deployment webhook. Dokploy source builds or image deployment are a separate operation. See [deployment and rollback](docs/deployment.md).

## Verify

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Tests exercise the installed SDKs, local persistence failures, receipts, deduplication, explicit flag loading and valid recording roundtrips. Browser tests run in an isolated Playwright Chromium instance against the built app on port 5600. If its matching test browser is unavailable, install it with `npx playwright install chromium`.

## Source map

| File | Responsibility |
| --- | --- |
| `src/lib/storage.ts` | Versioned persistence, shape/size validation and failure semantics. |
| `src/lib/integrations.ts` | Local SDK transport/provider and recording import/export. |
| `src/components/workspace-shell.tsx` | Browser-only hydration, cross-tab refresh and raw backup. |
| `src/components/reports-inbox.tsx` | Report creation, reading, search and archive controls. |
| `src/components/flags-workspace.tsx` | Flag management and real SDK evaluation. |
| `src/components/recordings-library.tsx` | Explicit recording import, inspection and export. |

UI state, feature flags and hidden controls never substitute for backend authorization.
