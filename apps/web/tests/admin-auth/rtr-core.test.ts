import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { verifyAdminCredentials } from '../../src/lib/admin-auth';
import { createAdminAuthCore } from '../../src/lib/admin-auth-core';

function withTemporaryEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> | T {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    previous.set(key, process.env[key]);
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const restore = () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('reused parent refresh token from rotation race is stale, not family revoke', () => {
  const core = createAdminAuthCore({
    secret: 'x'.repeat(32),
    accessMaxAgeSeconds: 900,
    refreshMaxAgeSeconds: 1209600,
  });

  const login = core.issueLoginPair();
  const first = core.rotateRefresh(login.refreshToken);
  assert.equal(first.kind, 'rotated');
  assert.ok(first.pair);

  const second = core.rotateRefresh(login.refreshToken);
  assert.equal(second.kind, 'stale');

  const followUp = core.rotateRefresh(first.pair.refreshToken);
  assert.equal(followUp.kind, 'rotated');
});

test('tampered refresh token revokes family', () => {
  const core = createAdminAuthCore({
    secret: 'x'.repeat(32),
    accessMaxAgeSeconds: 900,
    refreshMaxAgeSeconds: 1209600,
  });

  const login = core.issueLoginPair();
  const tampered = `${login.refreshToken}x`;
  const out = core.rotateRefresh(tampered);
  assert.equal(out.kind, 'reuse_detected');

  const originalReuse = core.rotateRefresh(login.refreshToken);
  assert.equal(originalReuse.kind, 'reuse_detected');
});

test('expired refresh token returns expired outcome', () => {
  let now = 1_700_000_000;
  const core = createAdminAuthCore({
    secret: 'x'.repeat(32),
    accessMaxAgeSeconds: 10,
    refreshMaxAgeSeconds: 20,
    now: () => now,
  });

  const login = core.issueLoginPair();
  now += 21;

  const out = core.rotateRefresh(login.refreshToken);
  assert.equal(out.kind, 'expired');
});

test('verifyAdminCredentials supports hash-first policy', async () => {
  const hash = createHash('sha256').update('correct-password').digest('hex');
  await withTemporaryEnv(
    {
      ADMIN_LOGIN_ID: 'TraceofLight_Admin',
      ADMIN_LOGIN_PASSWORD: 'fallback-plain',
      ADMIN_LOGIN_PASSWORD_HASH: `sha256:${hash}`,
      ADMIN_SESSION_SECRET: 'x'.repeat(32),
      ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS: '900',
      ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS: '1209600',
    },
    async () => {
      const ok = await verifyAdminCredentials('TraceofLight_Admin', 'correct-password');
      assert.equal(ok, true);

      const fallbackTry = await verifyAdminCredentials('TraceofLight_Admin', 'fallback-plain');
      assert.equal(fallbackTry, false);
    },
  );
});
