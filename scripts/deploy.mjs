import { pathToFileURL } from 'node:url';

const site = 'https://demo.6tz.tech';
const image = 'ghcr.io/enry6tz/flags-report-toolkit-demo-nextjs:main';

// An accepted webhook only queues a rollout. Require the expected live revision too.
export async function deploy({ webhook, sha, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 60 }) {
  if (!/^https:\/\/dokploy\.6tz\.tech\/api\/deploy\/[A-Za-z0-9_-]+$/.test(webhook ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '')) {
    throw new Error('Invalid deployment configuration.');
  }
  let accepted;
  try {
    accepted = await fetchImpl(webhook, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'registry_package' },
      body: JSON.stringify({
        registry_package: { package_version: { package_url: image, container_metadata: { tag: { name: 'main' } } } },
        head_commit: { id: sha },
      }),
    });
  } catch {
    // Do not retry an uncertain POST or print an exception containing the secret URL.
    throw new Error('Webhook request failed; inspect Dokploy before retrying.');
  }
  let acknowledgement;
  try { acknowledgement = await accepted.json(); } catch { /* Reject non-JSON acknowledgements. */ }
  if (accepted.status !== 200 || acknowledgement?.message !== 'Application deployed successfully') {
    throw new Error('Webhook was not accepted; inspect Dokploy before retrying.');
  }
  const deadline = Date.now() + 300000;
  for (let attempt = 0; attempt < attempts && Date.now() < deadline; attempt++) {
    try {
      const release = await fetchImpl(`${site}/release.json?expected=${sha}&attempt=${attempt}`, {
        method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000),
      });
      if (release.status === 200 && (await release.json()).revision === sha) {
        const page = await fetchImpl(`${site}/reports`, {
          method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(6000),
        });
        if (page.status === 200) return;
      }
    } catch { /* Transient rollout errors are bounded and never expose request details. */ }
    if (attempt + 1 < attempts) await sleep(5000);
  }
  throw new Error('Live release did not become healthy within the verification window.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await deploy({ webhook: process.env.DOKPLOY_DEPLOY_WEBHOOK, sha: process.env.GITHUB_SHA });
    console.log(`Verified live release ${process.env.GITHUB_SHA} at ${site}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
