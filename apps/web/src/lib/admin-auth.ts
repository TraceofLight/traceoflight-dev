import { createHash, timingSafeEqual } from 'node:crypto';

import {
  createAdminAuthCore,
  type RotateResult as CoreRotateResult,
  type RotateKind,
  type TokenPair,
} from './admin-auth-core';

export const ADMIN_ACCESS_COOKIE = 'traceoflight_admin_access';
export const ADMIN_REFRESH_COOKIE = 'traceoflight_admin_refresh';

const DEFAULT_ACCESS_MAX_AGE_SECONDS = 60 * 15;
const DEFAULT_REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

interface AdminAuthConfig {
  loginId: string;
  loginPassword?: string;
  loginPasswordHash?: string;
  sessionSecret: string;
  accessMaxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
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

interface RotateResult extends CoreRotateResult {}

let cachedCore:
  | {
      key: string;
      core: ReturnType<typeof createAdminAuthCore>;
    }
  | undefined;

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

function getConfig(): AdminAuthConfig | null {
  const loginId = process.env.ADMIN_LOGIN_ID?.trim() ?? '';
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() ?? '';
  const loginPasswordHash = process.env.ADMIN_LOGIN_PASSWORD_HASH?.trim() ?? '';
  const loginPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim() ?? '';

  const hasCredential = Boolean(loginPasswordHash || loginPassword);
  if (!loginId || !sessionSecret || !hasCredential) return null;

  return {
    loginId,
    loginPassword: loginPassword || undefined,
    loginPasswordHash: loginPasswordHash || undefined,
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
  return getConfig() !== null;
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const config = getConfig();
  if (!config) return false;
  if (!safeCompare(username, config.loginId)) return false;

  if (config.loginPasswordHash) {
    return verifyHashPassword(config.loginPasswordHash, password);
  }

  if (!config.loginPassword) return false;
  return safeCompare(password, config.loginPassword);
}

export function issueLoginTokenPair(): TokenPair | null {
  const config = getConfig();
  if (!config) return null;
  return getCore(config).issueLoginPair();
}

export function verifyAccessToken(token: string): boolean {
  const config = getConfig();
  if (!config) return false;
  return getCore(config).verifyAccessToken(token);
}

export function rotateRefreshToken(refreshToken: string): RotateResult {
  const config = getConfig();
  if (!config) return { kind: 'invalid' };
  return getCore(config).rotateRefresh(refreshToken);
}

export function revokeRefreshTokenFamily(refreshToken: string): void {
  const config = getConfig();
  if (!config) return;
  getCore(config).revokeRefreshFamily(refreshToken);
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
