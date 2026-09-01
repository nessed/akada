import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

type TokenKind = 'client' | 'code' | 'access' | 'refresh';

type TokenEnvelope = {
  v: 1;
  kind: TokenKind;
  iat: number;
  exp: number;
  [key: string]: unknown;
};

export type McpClient = {
  redirectUris: string[];
};

export type McpAuthorizationCode = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  userId: string;
  supabaseAccessToken: string;
  supabaseRefreshToken: string;
};

export type McpAccessToken = {
  clientId: string;
  scope: string;
  userId: string;
  supabaseAccessToken: string;
};

export type McpRefreshToken = {
  clientId: string;
  scope: string;
  userId: string;
  supabaseRefreshToken: string;
};

function base64url(value: Buffer) {
  return value.toString('base64url');
}

function decodeBase64url(value: string) {
  return Buffer.from(value, 'base64url');
}

function key() {
  const secret = process.env.AKADA_MCP_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Akada MCP is not configured. Set AKADA_MCP_TOKEN_SECRET to a random value of at least 32 characters.');
  }
  return createHash('sha256').update(secret).digest();
}

function seal<T extends object>(kind: TokenKind, payload: T, lifetimeSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const plaintext = Buffer.from(JSON.stringify({ v: 1, kind, iat: now, exp: now + lifetimeSeconds, ...payload } satisfies TokenEnvelope));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return `akm1.${base64url(iv)}.${base64url(encrypted)}.${base64url(cipher.getAuthTag())}`;
}

function open<T extends object>(token: string, expectedKind: TokenKind): T & TokenEnvelope {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'akm1') throw new Error('Invalid token.');

  try {
    const [iv, encrypted, tag] = parts.slice(1).map(decodeBase64url);
    if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid token.');
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const decoded = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')) as TokenEnvelope;
    if (decoded.v !== 1 || decoded.kind !== expectedKind || typeof decoded.exp !== 'number' || decoded.exp <= Math.floor(Date.now() / 1000)) {
      throw new Error('Expired token.');
    }
    return decoded as T & TokenEnvelope;
  } catch {
    throw new Error('Invalid or expired token.');
  }
}

export function registerMcpClient(redirectUris: string[]) {
  return seal('client', { redirectUris }, 365 * 24 * 60 * 60);
}

export function readMcpClient(token: string) {
  return open<McpClient>(token, 'client');
}

export function issueAuthorizationCode(payload: McpAuthorizationCode) {
  return seal('code', payload, 5 * 60);
}

export function readAuthorizationCode(token: string) {
  return open<McpAuthorizationCode>(token, 'code');
}

export function issueAccessToken(payload: McpAccessToken) {
  return seal('access', payload, 60 * 60);
}

export function readAccessToken(token: string) {
  return open<McpAccessToken>(token, 'access');
}

export function issueRefreshToken(payload: McpRefreshToken) {
  return seal('refresh', payload, 30 * 24 * 60 * 60);
}

export function readRefreshToken(token: string) {
  return open<McpRefreshToken>(token, 'refresh');
}

export function pkceChallenge(verifier: string) {
  return base64url(createHash('sha256').update(verifier).digest());
}

export function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
