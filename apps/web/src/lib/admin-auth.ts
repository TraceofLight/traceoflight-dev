import { createHash, timingSafeEqual } from 'node:crypto';

import {
  createAdminAuthCore,
  type RotateKind,
  type TokenPair,
} from './admin-auth-core';
import { requestBackend, requestBackendPublic } from './backend-api';
import { readJsonSafe } from './http';

export const ADMIN_ACCESS_COOKIE = 'traceoflight_admin_access';
export const ADMIN_REFRESH_COOKIE = 'traceoflight_admin_refresh';

const DEFAULT_ACCESS_MAX_AGE_SECONDS = 60 * 15;
const DEFAULT_REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

interface AdminAuthConfig {
  sessionSecret: string;
  accessMaxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
}

interface AdminCredentialConfig {
  loginId: string;
  loginPassword?: string;
  loginPasswordHash?: string;
}

interface CookieWriter {
  set: (
    name: string,
    value: string,
    options: {
      path: string;
      httpOnly: boolean;
      sameSite: 'lax';
      secure: boolean;
      maxAge: number;
    },
  ) => void;
  delete: (name: string, options: { path: string }) => void;
}

interface RotateResult {
  kind: RotateKind;
  pair?: TokenPair;
}

interface OperationalCredentialVerifyResult {
  ok: boolean;
  credentialSource?: 'operational' | 'master';
  credentialRevision: number;
  tokenPair?: TokenPair;
}

interface ActiveCredentialRevisionCache {
  credentialRevision: number;
  expiresAt: number;
}

let cachedCore:
  | {
      key: string;
      core: ReturnType<typeof createAdminAuthCore>;
    }
  | undefined;
let activeCredentialRevisionCache: ActiveCredentialRevisionCache | undefined;

const ACTIVE_CREDENTIAL_REVISION_TTL_MS = 5_000;

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseMaxAge(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(60, Math.floor(parsed));
}

function getSessionConfig(): AdminAuthConfig | null {
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() ?? '';
  if (!sessionSecret) return null;

  return {
    sessionSecret,
    accessMaxAgeSeconds: parseMaxAge(
      process.env.ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS,
      DEFAULT_ACCESS_MAX_AGE_SECONDS,
    ),
    refreshMaxAgeSeconds: parseMaxAge(
      process.env.ADMIN_REFRESH_TOKEN_MAX_AGE_SECONDS,
      DEFAULT_REFRESH_MAX_AGE_SECONDS,
    ),
  };
}

function getMasterCredentialConfig(): AdminCredentialConfig | null {
  const loginId = process.env.ADMIN_LOGIN_ID?.trim() ?? '';
  const loginPasswordHash = process.env.ADMIN_LOGIN_PASSWORD_HASH?.trim() ?? '';
  const loginPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim() ?? '';
  const hasCredential = Boolean(loginPasswordHash || loginPassword);
  if (!loginId || !hasCredential) return null;
  return {
    loginId,
    loginPassword: loginPassword || undefined,
    loginPasswordHash: loginPasswordHash || undefined,
  };
}

function getCore(config: AdminAuthConfig) {
  const key = `${config.sessionSecret}:${config.accessMaxAgeSeconds}:${config.refreshMaxAgeSeconds}`;
  if (!cachedCore || cachedCore.key !== key) {
    cachedCore = {
      key,
      core: createAdminAuthCore({
        secret: config.sessionSecret,
        accessMaxAgeSeconds: config.accessMaxAgeSeconds,
        refreshMaxAgeSeconds: config.refreshMaxAgeSeconds,
      }),
    };
  }
  return cachedCore.core;
}

async function verifyHashPassword(hashValue: string, password: string): Promise<boolean> {
  if (hashValue.startsWith('$argon2')) {
    try {
      const { verify } = await import('@node-rs/argon2');
      return await verify(hashValue, password);
    } catch {
      return false;
    }
  }

  if (hashValue.startsWith('sha256:')) {
    const expectedHash = hashValue.slice('sha256:'.length);
    const actualHash = createHash('sha256').update(password).digest('hex');
    return safeCompare(expectedHash, actualHash);
  }

  return false;
}

export function isAdminAuthConfigured(): boolean {
  return getSessionConfig() !== null;
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const config = getMasterCredentialConfig();
  if (!config) return false;
  if (!safeCompare(username, config.loginId)) return false;

  if (config.loginPasswordHash) {
    return verifyHashPassword(config.loginPasswordHash, password);
  }

  if (!config.loginPassword) return false;
  return safeCompare(password, config.loginPassword);
}

function mapBackendTokenPair(
  payload:
    | {
        access_token?: unknown;
        refresh_token?: unknown;
        access_max_age_seconds?: unknown;
        refresh_max_age_seconds?: unknown;
      }
    | null,
): TokenPair | null {
  if (!payload) return null;
  if (typeof payload.access_token !== 'string') return null;
  if (typeof payload.refresh_token !== 'string') return null;
  if (typeof payload.access_max_age_seconds !== 'number') return null;
  if (typeof payload.refresh_max_age_seconds !== 'number') return null;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessMaxAgeSeconds: payload.access_max_age_seconds,
    refreshMaxAgeSeconds: payload.refresh_max_age_seconds,
  };
}

function setActiveAdminCredentialRevisionCache(credentialRevision: number): void {
  activeCredentialRevisionCache = {
    credentialRevision,
    expiresAt: Date.now() + ACTIVE_CREDENTIAL_REVISION_TTL_MS,
  };
}

function getCachedActiveAdminCredentialRevision(): number | null {
  if (!activeCredentialRevisionCache) return null;
  if (activeCredentialRevisionCache.expiresAt <= Date.now()) return null;
  return activeCredentialRevisionCache.credentialRevision;
}

export async function getActiveAdminCredentialRevision(forceRefresh = false): Promise<number | null> {
  if (!forceRefresh) {
    const cachedRevision = getCachedActiveAdminCredentialRevision();
    if (cachedRevision !== null) return cachedRevision;
  }

  try {
    const response = await requestBackend('/admin/auth/revision', { method: 'GET' });
    if (!response.ok) return null;
    const payload = (await readJsonSafe(response)) as { credential_revision?: unknown } | null;
    const credentialRevision =
      typeof payload?.credential_revision === 'number' ? payload.credential_revision : null;
    if (credentialRevision === null) return null;
    setActiveAdminCredentialRevisionCache(credentialRevision);
    return credentialRevision;
  } catch {
    return getCachedActiveAdminCredentialRevision();
  }
}

export async function verifyOperationalAdminCredentials(
  loginId: string,
  password: string,
): Promise<OperationalCredentialVerifyResult> {
  try {
    const response = await requestBackendPublic('/admin/auth/login', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        login_id: loginId.trim(),
        password,
      }),
    });
    if (!response.ok) {
      return { ok: false, credentialRevision: 0 };
    }

    const payload = (await readJsonSafe(response)) as
      | {
          credential_source?: 'operational' | 'master';
          credential_revision?: number;
          access_token?: string;
          refresh_token?: string;
          access_max_age_seconds?: number;
          refresh_max_age_seconds?: number;
        }
      | null;
    const credentialRevision = typeof payload?.credential_revision === 'number' ? payload.credential_revision : 0;
    const tokenPair = mapBackendTokenPair(payload);
    if (credentialRevision >= 0) {
      setActiveAdminCredentialRevisionCache(credentialRevision);
    }
    return {
      ok: tokenPair !== null,
      credentialSource: payload?.credential_source,
      credentialRevision,
      tokenPair: tokenPair ?? undefined,
    };
  } catch {
    return { ok: false, credentialRevision: 0 };
  }
}

export async function verifyAccessToken(token: string): Promise<boolean> {
  const config = getSessionConfig();
  if (!config) return false;
  const activeCredentialRevision = await getActiveAdminCredentialRevision();
  if (activeCredentialRevision === null) return false;
  return getCore(config).verifyAccessToken(token, activeCredentialRevision);
}

export async function rotateRefreshToken(refreshToken: string): Promise<RotateResult> {
  try {
    const response = await requestBackendPublic('/admin/auth/refresh', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });
    const payload = (await readJsonSafe(response)) as
      | {
          credential_revision?: unknown;
          detail?: unknown;
          access_token?: unknown;
          refresh_token?: unknown;
          access_max_age_seconds?: unknown;
          refresh_max_age_seconds?: unknown;
        }
      | null;
    if (response.ok) {
      const tokenPair = mapBackendTokenPair(payload);
      const credentialRevision =
        typeof payload?.credential_revision === 'number' ? payload.credential_revision : 0;
      setActiveAdminCredentialRevisionCache(credentialRevision);
      if (tokenPair) {
        return { kind: 'rotated', pair: tokenPair };
      }
    }
    const detail = typeof payload?.detail === 'string' ? payload.detail.toLowerCase() : '';
    if (response.status === 409 || detail.includes('stale')) {
      return { kind: 'stale' };
    }
    if (detail.includes('expired')) {
      return { kind: 'expired' };
    }
    if (detail.includes('reuse_detected') || detail.includes('reuse')) {
      return { kind: 'reuse_detected' };
    }
    return { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

export async function revokeRefreshTokenFamily(refreshToken: string): Promise<void> {
  try {
    await requestBackendPublic('/admin/auth/logout', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });
  } catch {
    // Logout should still clear browser cookies even if backend revocation fails.
  }
}

export function setAdminAuthCookies(cookies: CookieWriter, pair: TokenPair, secure: boolean): void {
  cookies.set(ADMIN_ACCESS_COOKIE, pair.accessToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: pair.accessMaxAgeSeconds,
  });

  cookies.set(ADMIN_REFRESH_COOKIE, pair.refreshToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: pair.refreshMaxAgeSeconds,
  });
}

export function clearAdminAuthCookies(cookies: CookieWriter): void {
  cookies.delete(ADMIN_ACCESS_COOKIE, { path: '/' });
  cookies.delete(ADMIN_REFRESH_COOKIE, { path: '/' });
}

export type { RotateKind };
