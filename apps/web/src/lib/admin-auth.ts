import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const ADMIN_ACCESS_COOKIE = 'traceoflight_admin_access';
export const ADMIN_REFRESH_COOKIE = 'traceoflight_admin_refresh';

const DEFAULT_ACCESS_MAX_AGE_SECONDS = 60 * 15;
const DEFAULT_REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

interface AdminAuthConfig {
  loginId: string;
  loginPassword: string;
  sessionSecret: string;
  accessMaxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
}

interface TokenPayload {
  sub: 'admin';
  type: 'access' | 'refresh';
  jti: string;
  exp: number;
  iat: number;
}

interface RefreshState {
  jti: string;
  familyId: string;
  tokenHash: string;
  expiresAt: number;
  parentJti?: string;
  rotatedToJti?: string;
  used: boolean;
  revoked: boolean;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
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

interface RotateResult {
  pair: TokenPair | null;
  reuseDetected: boolean;
}

const refreshStore = new Map<string, RefreshState>();

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function parseMaxAge(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(60, Math.floor(parsed));
}

function getConfig(): AdminAuthConfig | null {
  const loginId = process.env.ADMIN_LOGIN_ID?.trim() ?? '';
  const loginPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim() ?? '';
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() ?? '';
  if (!loginId || !loginPassword || !sessionSecret) return null;

  return {
    loginId,
    loginPassword,
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

function encodePayload(payload: TokenPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(encoded: string): TokenPayload | null {
  try {
    const raw = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as TokenPayload;
    if (parsed?.sub !== 'admin') return null;
    if (parsed?.type !== 'access' && parsed?.type !== 'refresh') return null;
    if (typeof parsed?.jti !== 'string' || !parsed.jti) return null;
    if (typeof parsed?.exp !== 'number') return null;
    if (typeof parsed?.iat !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function signEncodedPayload(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

function issueToken(payload: TokenPayload, secret: string): string {
  const encodedPayload = encodePayload(payload);
  const signature = signEncodedPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token: string, secret: string, expectedType: TokenPayload['type']): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  const expectedSignature = signEncodedPayload(encodedPayload, secret);
  if (!safeCompare(signature, expectedSignature)) return null;

  const payload = decodePayload(encodedPayload);
  if (!payload) return null;
  if (payload.type !== expectedType) return null;
  if (payload.exp <= nowEpochSeconds()) return null;
  return payload;
}

function cleanupExpiredRefreshState(): void {
  const now = nowEpochSeconds();
  for (const [jti, state] of refreshStore.entries()) {
    if (state.expiresAt <= now) {
      refreshStore.delete(jti);
    }
  }
}

function revokeFamily(familyId: string): void {
  for (const state of refreshStore.values()) {
    if (state.familyId === familyId) {
      state.revoked = true;
    }
  }
}

function createTokenPair(config: AdminAuthConfig, previousRefresh?: RefreshState): TokenPair {
  cleanupExpiredRefreshState();

  const issuedAt = nowEpochSeconds();
  const accessPayload: TokenPayload = {
    sub: 'admin',
    type: 'access',
    jti: randomUUID(),
    iat: issuedAt,
    exp: issuedAt + config.accessMaxAgeSeconds,
  };

  const refreshJti = randomUUID();
  const familyId = previousRefresh?.familyId ?? randomUUID();
  const refreshPayload: TokenPayload = {
    sub: 'admin',
    type: 'refresh',
    jti: refreshJti,
    iat: issuedAt,
    exp: issuedAt + config.refreshMaxAgeSeconds,
  };

  const accessToken = issueToken(accessPayload, config.sessionSecret);
  const refreshToken = issueToken(refreshPayload, config.sessionSecret);

  refreshStore.set(refreshJti, {
    jti: refreshJti,
    familyId,
    tokenHash: hashToken(refreshToken, config.sessionSecret),
    expiresAt: refreshPayload.exp,
    parentJti: previousRefresh?.jti,
    used: false,
    revoked: false,
  });

  if (previousRefresh) {
    previousRefresh.used = true;
    previousRefresh.revoked = true;
    previousRefresh.rotatedToJti = refreshJti;
  }

  return {
    accessToken,
    refreshToken,
    accessMaxAgeSeconds: config.accessMaxAgeSeconds,
    refreshMaxAgeSeconds: config.refreshMaxAgeSeconds,
  };
}

export function isAdminAuthConfigured(): boolean {
  return getConfig() !== null;
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const config = getConfig();
  if (!config) return false;
  return safeCompare(username, config.loginId) && safeCompare(password, config.loginPassword);
}

export function issueLoginTokenPair(): TokenPair | null {
  const config = getConfig();
  if (!config) return null;
  return createTokenPair(config);
}

export function verifyAccessToken(token: string): boolean {
  const config = getConfig();
  if (!config) return false;
  return verifyToken(token, config.sessionSecret, 'access') !== null;
}

export function rotateRefreshToken(refreshToken: string): RotateResult {
  const config = getConfig();
  if (!config) return { pair: null, reuseDetected: false };

  cleanupExpiredRefreshState();

  const payload = verifyToken(refreshToken, config.sessionSecret, 'refresh');
  if (!payload) return { pair: null, reuseDetected: false };

  const state = refreshStore.get(payload.jti);
  if (!state) return { pair: null, reuseDetected: false };

  const expectedHash = hashToken(refreshToken, config.sessionSecret);
  if (!safeCompare(expectedHash, state.tokenHash)) {
    revokeFamily(state.familyId);
    return { pair: null, reuseDetected: true };
  }

  if (state.revoked || state.used) {
    revokeFamily(state.familyId);
    return { pair: null, reuseDetected: true };
  }

  if (state.expiresAt <= nowEpochSeconds()) {
    state.revoked = true;
    return { pair: null, reuseDetected: false };
  }

  const pair = createTokenPair(config, state);
  return { pair, reuseDetected: false };
}

export function revokeRefreshTokenFamily(refreshToken: string): void {
  const config = getConfig();
  if (!config) return;

  const payload = verifyToken(refreshToken, config.sessionSecret, 'refresh');
  if (!payload) return;

  const state = refreshStore.get(payload.jti);
  if (!state) return;
  revokeFamily(state.familyId);
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
