# Deploy the integration reference

The source is [Enry6tz/flags-report-toolkit-demo-nextjs](https://github.com/Enry6tz/flags-report-toolkit-demo-nextjs). The public reference is [demo.6tz.tech](https://demo.6tz.tech). GitHub Actions verifies the application, publishes the container, triggers the configured Dokploy application and checks the live revision. A fork must configure its own hosting and secret; source files do not provision a VPS or DNS.

## Runtime contract

| Setting | Value |
| --- | --- |
| Build definition | Root `Dockerfile`, repository-root build context |
| Runtime | Next.js standalone server on pinned Node 22.23.4 |
| Container port | `3000` |
| Bind address | `0.0.0.0` |
| Runtime user | Non-root `node` user from the official Node image |
| Health probe | Node fetch of `http://127.0.0.1:3000/reports` |
| Persistent server volume | None required |
| Database | None; records remain in each visitor's browser |
| Required secrets | None for this reference application |

The Dockerfile pins the official Node image by version and manifest digest. Its dependency stage installs the exact npm lockfile, its builder creates the standalone output, and its runtime includes the traced server, static files and public assets. Update the pinned image deliberately when applying runtime security updates.

## Build and inspect locally

With a running Docker engine:

```sh
docker build --tag e6tz-reference:local .
docker run --detach --name e6tz-reference --publish 5600:3000 e6tz-reference:local
docker inspect --format '{{.State.Health.Status}}' e6tz-reference
docker logs e6tz-reference
```

Open [http://localhost:5600](http://localhost:5600). The healthcheck has a startup grace period and runs every 30 seconds. Stop and remove the named test container when finished with it. A successful image build is not proof that a public domain or remote deployment works.

## What GitHub Actions does

The **CI** workflow runs on pushes to `main`, pull requests targeting `main` and manual dispatch:

1. Install dependencies with `npm ci` on Node 22.23.4.
2. Run deterministic SDK/storage tests and TypeScript checks.
3. Create the production build and run isolated Chromium workflows.
4. Build the production Docker image.
5. Start that image, check non-root execution and wait for its health probe.

Only after verification succeeds, pushes or manual dispatches on `main` may publish:

```text
ghcr.io/enry6tz/flags-report-toolkit-demo-nextjs:main
ghcr.io/enry6tz/flags-report-toolkit-demo-nextjs:sha-<full-commit-sha>
```

Pull requests cannot publish. Workflow permissions default to `contents: read`; only the publishing job receives `packages: write`. The built-in `GITHUB_TOKEN` authenticates publication, so no separate registry password is embedded in this repository. Account/package policies can still reject publication; check the actual run result.

GHCR package visibility is separate from repository visibility: verify access before configuring an anonymous image pull, or supply authorized registry access in the hosting platform.

## CI-gated image rollout

The configured demo uses Dokploy's **Docker** provider with the public GHCR `:main` image, port **3000**, and Auto Deploy enabled. DNS points `demo.6tz.tech` at the VPS and Dokploy manages its Let's Encrypt certificate. No source-push webhook is installed: rollout happens only after this workflow's successful verification and publication jobs.

The repository secret **`DOKPLOY_DEPLOY_WEBHOOK`** contains the existing application-scoped webhook, not a server-wide API key. Obtain it from that application's Deployments tab and store it under **Settings → Secrets and variables → Actions**. Never commit it, print it, put it in an Actions variable or share it in an issue. The application itself still needs no secrets. Anyone allowed to change trusted workflows can potentially use repository secrets; keep write access restricted.

The deployment job sends a GHCR `registry_package` JSON event with the exact image/tag and commit SHA. For Dokploy v0.30.8 it requires **HTTP 200** and the exact acceptance message; a 301 image/tag mismatch is an error, not success. Acceptance means queued, not healthy. The script sends one POST only: an uncertain request fails with a sanitized error so an operator can inspect Dokploy before retrying.

Docker builds generate **`/release.json`** containing only the public source revision supplied by `SOURCE_REVISION`. CI checks that marker in the healthy test container. After triggering rollout, it waits up to five minutes for the HTTPS marker to match the triggering commit and for `/reports` to respond with 200. A stale page or an accepted webhook alone cannot pass deployment. Local Docker builds default to revision `local`; no browser records or secrets are included in the marker.

Workflow runs for the same branch are serialized rather than cancelling an in-flight rollout. GitHub may replace a pending run with a newer pending run; the running release completes before the next one publishes. Failed verification cannot publish or deploy. Failed rollout leaves the workflow failed and must be investigated; there is no automatic destructive rollback.

Run deterministic deployment checks with `node --test tests/deployment.test.mjs`. Do not run `node scripts/deploy.mjs` with production credentials just to test syntax: that command triggers a real deployment. Forks need to adapt the fixed public site/image allowlist in the script as well as their secret. The [Dokploy webhook documentation](https://docs.dokploy.com/docs/core/auto-deploy) describes the provider setup.

## Dokploy source-build configuration

For a source-based application, select this GitHub repository and branch `main`, choose the root Dockerfile and repository-root context, and route the domain to **container port 3000**. Do not configure a database or application data volume for this reference. The Dockerfile already sets `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0` and disables Next telemetry.

Use Dokploy's existing reverse proxy/TLS configuration for the public domain. Confirm the build, container health and public HTTPS response in Dokploy before calling the deployment successful. Verify all three workflows in a browser at that exact domain.

Source auto-deploy is a Dokploy/provider setting, not an effect of adding CI. If enabled directly on pushes, it may build independently of GitHub checks. Configure the intended release policy explicitly rather than assuming the CI job gates Dokploy.

Alternatively, configure image deployment from GHCR using the immutable `sha-<commit>` tag after the verified image exists. This avoids rebuilding on the VPS, but image pull permissions and rollout must still be configured in Dokploy. Do not mix source auto-build and image rollout without choosing which system owns releases.

## Persistence and public-access limitations

The deployed application is still a browser-local reference, not a shared backend. The VPS hosts the UI; it does not receive reports or persist QA/flag records. Public access does not create accounts or authorization. Do not enter production secrets or sensitive information.

Browser data is scoped to scheme, hostname and port. A new domain or an HTTP-to-HTTPS move has separate localStorage; deploying the same container cannot migrate those records automatically. Export records before changing origins when you need to keep them.

The real Toolkit toolbar is intentionally enabled with `environment="preview"` here. Network/body capture starts disabled, and no remote wiki, configuration or save service is configured. For a real backend follow [the integration guide](backend-integration.md), including independent authentication and permission checks.

## Rollback and verification

Retain the previous successful commit/image identifier. Roll back by selecting that commit in source deployment or its immutable GHCR SHA tag, then verify health and the public application again. Do not rewrite `main` or assume the floating image tag identifies the previous version.

The reference's storage schema has a fixed version and rejects unsupported saved shapes instead of silently resetting them. A future storage-format change needs a deliberate browser-data migration plan; container rollback alone cannot undo localStorage changes on visitors' devices.

## References

- [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Docker build best practices](https://docs.docker.com/build/building/best-practices/)
- [Publishing container images with GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
