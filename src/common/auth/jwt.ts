import crypto from 'crypto';

export type JwtVerifyOptions = {
  issuer?: string;
  audience?: string;
  clockSkewSeconds?: number;
};

export type JwtPayload = Record<string, unknown> & {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  userId?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
};

function base64UrlToBuffer(input: string): Buffer {
  // Node soporta 'base64url' pero aquí mantenemos compatibilidad.
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function extractBearerToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  if (v.toLowerCase().startsWith('bearer ')) return v.slice(7).trim() || null;
  return v; // permitimos enviar token "crudo"
}

export function verifyJwtHs256(token: string, secret: string, opts: JwtVerifyOptions = {}): JwtPayload {
  if (!token?.trim()) throw new Error('missing_token');
  if (!secret?.trim()) throw new Error('missing_jwt_secret');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid_jwt_format');
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error('invalid_jwt_format');

  const headerRaw = base64UrlToBuffer(headerB64).toString('utf8');
  const payloadRaw = base64UrlToBuffer(payloadB64).toString('utf8');

  const header = safeJsonParse<{ alg?: string; typ?: string }>(headerRaw);
  const payload = safeJsonParse<JwtPayload>(payloadRaw);
  if (!header || !payload) throw new Error('invalid_jwt_json');

  if (header.alg !== 'HS256') throw new Error('unsupported_jwt_alg');

  const signingInput = `${headerB64}.${payloadB64}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  if (!timingSafeEqual(expected, sigB64)) throw new Error('invalid_jwt_signature');

  const nowSec = Math.floor(Date.now() / 1000);
  const skew = opts.clockSkewSeconds ?? 30;

  if (typeof payload.nbf === 'number' && nowSec + skew < payload.nbf) {
    throw new Error('jwt_not_active');
  }
  if (typeof payload.exp === 'number' && nowSec - skew >= payload.exp) {
    throw new Error('jwt_expired');
  }

  if (opts.issuer && payload.iss && payload.iss !== opts.issuer) {
    throw new Error('jwt_invalid_issuer');
  }

  if (opts.audience) {
    const aud = payload.aud;
    const ok =
      typeof aud === 'string'
        ? aud === opts.audience
        : Array.isArray(aud)
          ? aud.includes(opts.audience)
          : false;
    if (!ok) throw new Error('jwt_invalid_audience');
  }

  return payload;
}

export function getUserIdFromJwtPayload(payload: JwtPayload): string | null {
  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (sub) return sub;
  const userId = typeof payload.userId === 'string' ? payload.userId.trim() : '';
  return userId || null;
}
