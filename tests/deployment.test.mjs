import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deploy } from '../scripts/deploy.mjs';

const sha = 'a'.repeat(40);
const webhook = 'https://dokploy.6tz.tech/api/deploy/test-only-token';
const response = (status, body) => ({ status, json: async () => body });

test('deployment requires successful publication and keeps the webhook out of source', () => {
  const raw = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  // Windows checkouts and archive export filters may materialize CRLF.
  for (const source of [raw, raw.replace(/\r?\n/g, '\r\n')]) {
    const workflow = source.replace(/\r\n/g, '\n');
    assert.match(workflow, /deploy:\s*\n\s+name:.*\n\s+needs: publish-container/);
    assert.match(workflow, /DOKPLOY_DEPLOY_WEBHOOK: \$\{\{ secrets\.DOKPLOY_DEPLOY_WEBHOOK \}\}/);
    assert.match(workflow, /SOURCE_REVISION=\$\{\{ github.sha \}\}/);
    assert.match(workflow, /needs: verify/);
    assert.match(workflow.split('  deploy:')[1], /if: github.ref == 'refs\/heads\/main' && github.event_name != 'pull_request'/);
    assert.match(workflow, /cancel-in-progress: false/);
    assert.doesNotMatch(workflow, /https:\/\/dokploy\.6tz\.tech\/api\/deploy\//);
  }
});

test('successful enqueue is followed by matching live release and application checks', async () => {
  const calls = [];
  const replies = [response(200, { message: 'Application deployed successfully' }), response(200, { revision: 'b'.repeat(40) }), response(200, { revision: sha }), response(200, {})];
  await deploy({ webhook, sha, fetchImpl: async (url, init) => { calls.push({ url, init }); return replies.shift(); }, sleep: async () => {}, attempts: 3 });
  assert.equal(calls.length, 4);
  assert.equal(calls[0].init.redirect, 'error');
  const payload = JSON.parse(calls[0].init.body);
  assert.equal(payload.head_commit.id, sha);
  assert.equal(payload.registry_package.package_version.package_url, 'ghcr.io/enry6tz/flags-report-toolkit-demo-nextjs:main');
  assert.equal(calls[0].init.headers['X-GitHub-Event'], 'registry_package');
  assert.match(calls[3].url, /\/reports$/);
});

test('mismatch redirects and invalid acknowledgements never become rollout success', async () => {
  for (const reply of [response(301, {}), response(200, { message: 'pong' })]) {
    let calls = 0;
    await assert.rejects(deploy({ webhook, sha, fetchImpl: async () => { calls++; return reply; } }), /Webhook was not accepted/);
    assert.equal(calls, 1);
  }
});

test('old releases and unavailable application fail bounded verification without reposting', async () => {
  for (const revision of ['b'.repeat(40), sha]) {
    let posts = 0;
    await assert.rejects(deploy({ webhook, sha, attempts: 2, sleep: async () => {}, fetchImpl: async (_url, init) => {
      if (init.method === 'POST') { posts++; return response(200, { message: 'Application deployed successfully' }); }
      if (_url.endsWith('/reports')) return response(503, {});
      return response(200, { revision });
    } }), /Live release did not become healthy/);
    assert.equal(posts, 1);
  }
});

test('missing or wrong destination credentials fail before network and errors do not leak secrets', async () => {
  for (const value of ['', 'http://dokploy.6tz.tech/api/deploy/test-only-token', 'https://example.com/api/deploy/token']) {
    await assert.rejects(deploy({ webhook: value, sha, fetchImpl: async () => { throw Error('must not fetch'); } }), /Invalid deployment configuration/);
  }
  await assert.rejects(deploy({ webhook, sha, fetchImpl: async () => { throw Error(`secret URL: ${webhook}`); } }), error => {
    assert.equal(error.message, 'Webhook request failed; inspect Dokploy before retrying.');
    return true;
  });
});
