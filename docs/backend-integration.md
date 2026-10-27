# Replace the local adapters with your existing backend

This guide maps the reference host to a real implementation. No server is supplied here. Keep your existing identity provider, user model, database and deployment.

## Reports: replace the local receiver

`createLocalReportsTransport` appends a validated SDK submission to localStorage and returns its receipt only after the write succeeds. Repeated `submissionId` values reuse their receipt; different content under the same ID is rejected. This demonstrates single-browser behavior, not atomic cross-tab or server idempotency.

For a real receiver:

1. Implement an authenticated POST endpoint at a URL you control. Derive identity and authorized project from verified server context, not from the body.
2. Revalidate message/image limits, authorize the operation and apply quotas.
3. Deduplicate `(authorized scope, submissionId)` atomically in a database transaction. Same ID and content returns the existing receipt with `status: "duplicate"`; changed content returns HTTP 409.
4. Persist durably before acknowledging. Return `{data: Acknowledgement}` with the same UUID, a `REP-n` report identifier, positive integer `documentId`, UTC ISO `receivedAt`, and `status` equal to `accepted` or `duplicate`.
5. Replace the local transport with `createHttpReportsTransport` or an authenticated custom transport. A custom transport returns the receipt directly, without the HTTP `data` envelope.

For example, after implementing and authorizing your own route:

```ts
import { createReportsClient, createHttpReportsTransport } from '@e6tz/reports';

const reports = createReportsClient({
  transport: createHttpReportsTransport({
    endpoint: '/api/reports',
    // Supply your approved authentication headers/transport explicitly.
  }),
});
```

Creating the client sends nothing. Call `prepare()` and `send()` from a permitted user action. Reuse the prepared attempt for explicit retries. A timeout or client cancellation does not prove the server rolled back the submission.

A possible SQL design has report records, an authorized project/owner, a unique submission ID within that scope, a payload fingerprint and receipt identifiers. Image bytes can live in protected object storage with a reference in the report. These are implementation choices, not mandatory SDK tables. Define retention, image validation and access policies.

The default HTTP adapter uses `credentials: "omit"`, even for same-origin relative URLs. A relative path does not authenticate the request. Supply your approved transport; if you choose cookies, apply CSRF protection. Do not expose administrative credentials in the browser.

## Flags: replace the projection provider

The local provider reads saved flags and returns the unwrapped projection. Construction and evaluation never fetch; this UI calls `load()` or `refresh()` explicitly. The reference projection expires after 30 seconds.

For the HTTP adapter, implement GET with this response shape:

```ts
const body = {
  data: {
    revision: 'revision-12',
    validUntil: new Date(Date.now() + 30_000).toISOString(),
    flags: [{ key: 'new-checkout', value: true }],
  },
};
```

Compute the expiry for every response; do not copy a fixed example date. Only deliver the project/environment projection authorized by verified server context. Follow the SDK key, count and response limits. A custom provider returns the projection directly; the HTTP adapter unwraps `data`.

Storage can be a configuration file, an existing feature-management system or tables containing definitions and environment values. No database table is required by the SDK. Administrative create/update/delete routes are a separate host concern, not part of the read-only delivery contract. Protect them with permissions and appropriate conflict handling.

The default HTTP adapter omits cookies. Deliberately connect your existing session transport if needed. Keep a boolean fallback at every evaluation. Browser-visible flags contain no secrets and are never authorization guards.

## Toolkit: local first, remote only when implemented

The actual toolbar here runs with `environment="preview"` and `review={{ persistence: false }}`. Network recording and body capture start disabled. No wiki, live configuration or remote document-save callback is configured.

The host library is separate from the current toolbar session:

1. Start recording with the real toolbar and interact with the application.
2. Add a mark or content step, stop and choose **Copy JSON**.
3. Paste or upload that export into the host library.
4. Public `importRecordingJson` validates it before localStorage is written.

Imported views receive new IDs and import timestamps; they are never replayed. The library retains the original JSON for download and generates Markdown from the SDK-validated imported view. Recording JSON is structured text, not a video or screenshot archive. Save before reloading because toolbar draft persistence is off.

For a real library, replace local recording persistence with your authorized service. Alternatively implement the optional wiki contracts before supplying `wiki.manageUrl`. The SDK expects a scoped management URL and specific control/list/detail/create/update/delete responses; an arbitrary recording endpoint is not automatically compatible.

Implement per-operation permissions, bounded JSON, fresh CSRF validation and `expectedVersion` conflict handling where required. A possible storage model has authorized owner/project, opaque record ID, title, version, timestamps and validated recording content. It need not share the Reports schema.

Unlike Reports/Flags defaults, configured Toolkit wiki requests retain cookies and CSRF handling. Never assume identical session behavior across the three adapters. Remote failures must leave local recording/export usable.

## Production verification checklist

- Successful persistence is visible to the authorized user after a new session/device reads it.
- Duplicate report attempts return the original receipt; changed-content conflicts do not mutate stored data.
- Invalid payloads, body limits and storage failures return honest errors, never successful receipts.
- Unauthenticated and forbidden requests are tested separately; one project's records cannot be read or changed through another.
- Cookie-based mutations enforce CSRF independently of UI visibility and CORS.
- Recording updates test optimistic-version conflicts and denied writes.
- Flags are projected by authorized context and return valid fresh expiry timestamps.
- Database transaction and concurrency guarantees replace localStorage's non-atomic read/modify/write behavior.

The included local tests demonstrate SDK integration, not production security certification. Test your real identity and storage implementations independently.

## Authoritative contracts

- [Reports HTTP](https://github.com/Enry6tz/reports#contrato-http)
- [Flags HTTP](https://github.com/Enry6tz/Flags#contrato-http)
- [Toolkit host integration](https://github.com/Enry6tz/Toolkit/blob/main/docs/host-integration.md)
