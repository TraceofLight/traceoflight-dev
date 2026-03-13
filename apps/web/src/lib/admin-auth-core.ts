import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type RotateKind = 'rotated' | 'stale' | 'reuse_detected' | 'invalid' | 'expired';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
}

export interface RotateResult {
  kind: RotateKind;
  pair?: TokenPair;
}

export interface CreateAdminAuthCoreOptions {
  secret: string;
  accessMaxAgeSeconds: number;
  refreshMaxAgeSeconds: number;
  now?: () => number;
}

interface TokenPayload {
  sub: 'admin';
  type: 'access' | 'refresh';
  jti: string;
  exp: number;
  iat: number;
  credentialRevision: number;
}

interface RefreshState {
  jti: string;
  familyId: string;
  tokenHash: string;
  expiresAt: number;
  credentialRevision: number;
  parentJti?: string;
  rotatedToJti?: string;
  used: boolean;
  revoked: boolean;
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function decodePayloadUnsafe(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  try {
    const raw = Buffer.from(parts[0], 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as TokenPayload;
    if (parsed?.sub !== 'admin') return null;
    if (parsed?.type !== 'access' && parsed?.type !== 'refresh') return null;
    if (typeof parsed?.jti !== 'string' || parsed.jti.length === 0) return null;
    if (typeof parsed?.exp !== 'number') return null;
    if (typeof parsed?.iat !== 'number') return null;
    if (typeof parsed?.credentialRevision !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createAdminAuthCore(options: CreateAdminAuthCoreOptions) {
  const refreshStore = new Map<string, RefreshState>();

  function nowEpochSeconds(): number {
    return options.now ? options.now() : Math.floor(Date.now() / 1000);
  }

  function signEncodedPayload(encodedPayload: string): string {
    return createHmac('sha256', options.secret).update(encodedPayload).digest('base64url');
  }

  function hashToken(token: string): string {
    return createHmac('sha256', options.secret).update(token).digest('hex');
  }

  function verifyToken(token: string, expectedType: TokenPayload['type']): TokenPayload | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [encodedPayload, signature] = parts;
    const expectedSignature = signEncodedPayload(encodedPayload);
    if (!safeCompare(signature, expectedSignature)) return null;

    const payload = decodePayloadUnsafe(token);
    if (!payload) return null;
    if (payload.type !== expectedType) return null;
    return payload;
  }

  function issueToken(payload: TokenPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = signEncodedPayload(encodedPayload);
    return `${encodedPayload}.${signature}`;
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

  function createTokenPair(previousRefresh?: RefreshState): TokenPair {
    cleanupExpiredRefreshState();

    const issuedAt = nowEpochSeconds();
    const credentialRevision = previousRefresh?.credentialRevision ?? 0;
    const accessPayload: TokenPayload = {
      sub: 'admin',
      type: 'access',
      jti: randomUUID(),
      iat: issuedAt,
      exp: issuedAt + options.accessMaxAgeSeconds,
      credentialRevision,
    };

    const refreshJti = randomUUID();
    const familyId = previousRefresh?.familyId ?? randomUUID();
    const refreshPayload: TokenPayload = {
      sub: 'admin',
      type: 'refresh',
      jti: refreshJti,
      iat: issuedAt,
      exp: issuedAt + options.refreshMaxAgeSeconds,
      credentialRevision,
    };

    const accessToken = issueToken(accessPayload);
    const refreshToken = issueToken(refreshPayload);

    refreshStore.set(refreshJti, {
      jti: refreshJti,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshPayload.exp,
      parentJti: previousRefresh?.jti,
      credentialRevision,
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
      accessMaxAgeSeconds: options.accessMaxAgeSeconds,
      refreshMaxAgeSeconds: options.refreshMaxAgeSeconds,
    };
  }

  function issueLoginPair(credentialRevision = 0): TokenPair {
    cleanupExpiredRefreshState();

    const issuedAt = nowEpochSeconds();
    const accessPayload: TokenPayload = {
      sub: 'admin',
      type: 'access',
      jti: randomUUID(),
      iat: issuedAt,
      exp: issuedAt + options.accessMaxAgeSeconds,
      credentialRevision,
    };

    const refreshJti = randomUUID();
    const familyId = randomUUID();
    const refreshPayload: TokenPayload = {
      sub: 'admin',
      type: 'refresh',
      jti: refreshJti,
      iat: issuedAt,
      exp: issuedAt + options.refreshMaxAgeSeconds,
      credentialRevision,
    };

    const accessToken = issueToken(accessPayload);
    const refreshToken = issueToken(refreshPayload);

    refreshStore.set(refreshJti, {
      jti: refreshJti,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshPayload.exp,
      credentialRevision,
      used: false,
      revoked: false,
    });

    return {
      accessToken,
      refreshToken,
      accessMaxAgeSeconds: options.accessMaxAgeSeconds,
      refreshMaxAgeSeconds: options.refreshMaxAgeSeconds,
    };
  }

  function verifyAccessToken(accessToken: string, activeCredentialRevision: number): boolean {
    const payload = verifyToken(accessToken, 'access');
    if (!payload) return false;
    if (payload.credentialRevision !== activeCredentialRevision) return false;
    return payload.exp > nowEpochSeconds();
  }

  function rotateRefresh(refreshToken: string, activeCredentialRevision = 0): RotateResult {
    cleanupExpiredRefreshState();

    const unsafePayload = decodePayloadUnsafe(refreshToken);
    const stateFromUnsafe = unsafePayload ? refreshStore.get(unsafePayload.jti) : undefined;

    const payload = verifyToken(refreshToken, 'refresh');
    if (!payload) {
      if (stateFromUnsafe) {
        revokeFamily(stateFromUnsafe.familyId);
        return { kind: 'reuse_detected' };
      }
      return { kind: 'invalid' };
    }

    const now = nowEpochSeconds();
    if (payload.exp <= now) {
      if (stateFromUnsafe) {
        stateFromUnsafe.revoked = true;
      }
      return { kind: 'expired' };
    }

    const state = refreshStore.get(payload.jti);
    if (!state) return { kind: 'invalid' };
    if (payload.credentialRevision !== activeCredentialRevision) {
      state.revoked = true;
      return { kind: 'invalid' };
    }

    if (state.expiresAt <= now) {
      state.revoked = true;
      return { kind: 'expired' };
    }

    const tokenHash = hashToken(refreshToken);
    if (!safeCompare(tokenHash, state.tokenHash)) {
      revokeFamily(state.familyId);
      return { kind: 'reuse_detected' };
    }

    if (state.used) {
      const childState = state.rotatedToJti ? refreshStore.get(state.rotatedToJti) : undefined;
      if (childState && !childState.revoked && childState.expiresAt > now) {
        return { kind: 'stale' };
      }
      revokeFamily(state.familyId);
      return { kind: 'reuse_detected' };
    }

    if (state.revoked) {
      revokeFamily(state.familyId);
      return { kind: 'reuse_detected' };
    }

    state.credentialRevision = activeCredentialRevision;
    return { kind: 'rotated', pair: createTokenPair(state) };
  }

  function revokeRefreshFamily(refreshToken: string): void {
    const payload = verifyToken(refreshToken, 'refresh');
    if (!payload) return;

    const state = refreshStore.get(payload.jti);
    if (!state) return;
    revokeFamily(state.familyId);
  }

  return {
    issueLoginPair,
    verifyAccessToken,
    rotateRefresh,
    revokeRefreshFamily,
  };
}
