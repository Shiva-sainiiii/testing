// Simple signed-cookie auth (demo ke liye). Production me proper auth provider use karo.
import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || 'dev-only-secret-change-me';
export const COOKIE = 'cs_session';

export function hashPassword(pw, salt) {
  return crypto.scryptSync(pw, salt, 32).toString('hex');
}

export function verifyPassword(pw, user) {
  const a = Buffer.from(hashPassword(pw, user.salt), 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

export function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function readSession(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}
