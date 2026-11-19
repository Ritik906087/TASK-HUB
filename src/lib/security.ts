import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const BASE_SECRET = process.env.SESSION_SECRET || 'taskhub-cloudsql-hmac-secret-2026';
const USER_SECRET = crypto.createHash('sha256').update(`user:${BASE_SECRET}`).digest();
const ADMIN_SECRET = crypto.createHash('sha256').update(`admin:${BASE_SECRET}`).digest();
const CAPTCHA_SECRET = crypto.createHash('sha256').update(`captcha:${BASE_SECRET}`).digest();
const AES_KEY = crypto.createHash('sha256').update(`aes:${BASE_SECRET}`).digest();

export interface UserTokenPayload {
  sub: number;
  uid: string;
  scope: 'user';
  exp: number;
}

export interface AdminTokenPayload {
  sub: number;
  username: string;
  role: string;
  scope: 'admin';
  exp: number;
}

function signPayload(payload: object, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyPayload<T extends { exp: number }>(token: string, key: Buffer): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', key).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (!decoded.exp || Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function issueUserToken(userId: number, uid: string): string {
  return signPayload(
    {
      sub: userId,
      uid,
      scope: 'user',
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days for Android WebView session persistence
    },
    USER_SECRET
  );
}

export function verifyUserToken(token: string): UserTokenPayload | null {
  const payload = verifyPayload<UserTokenPayload>(token, USER_SECRET);
  if (!payload || payload.scope !== 'user') return null;
  return payload;
}

export function issueAdminToken(adminId: number, username: string, role: string): string {
  return signPayload(
    {
      sub: adminId,
      username,
      role,
      scope: 'admin',
      exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
    },
    ADMIN_SECRET
  );
}

export function verifyAdminToken(token: string): AdminTokenPayload | null {
  const payload = verifyPayload<AdminTokenPayload>(token, ADMIN_SECRET);
  if (!payload || payload.scope !== 'admin') return null;
  return payload;
}

// Simple Math CAPTCHA (e.g. "10 + 2")
export function generateMathCaptcha() {
  const a = crypto.randomInt(2, 20);
  const b = crypto.randomInt(1, 15);
  const answer = a + b;

  const nonce = crypto.randomBytes(6).toString('hex');
  const challengeToken = signPayload(
    {
      ans: answer,
      nonce,
      exp: Date.now() + 1000 * 60 * 10, // 10 minutes
    },
    CAPTCHA_SECRET
  );

  return {
    challengeToken,
    question: `${a} + ${b}`,
  };
}

export function verifyMathCaptcha(challengeToken: string, userAnswer: string | number): boolean {
  const parsed = verifyPayload<{ ans: number; nonce: string; exp: number }>(challengeToken, CAPTCHA_SECRET);
  if (!parsed) return false;
  const numericAnswer = Number(String(userAnswer).trim());
  if (!Number.isFinite(numericAnswer)) return false;
  return numericAnswer === parsed.ans;
}

// AES-256-GCM encryption for bank account numbers
export function encryptSensitive(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSensitive(cipherText: string): string {
  const parts = cipherText.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskAccountNumber(last4: string): string {
  return `•••• •••• ${last4}`;
}

export function maskPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length <= 4) return '••••';
  return `${clean.slice(0, 2)}••••${clean.slice(-4)}`;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits;
}

export function generateUid(): string {
  return String(crypto.randomInt(10000000, 100000000));
}

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TH';
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

export function generateTxCode(prefix = 'TXN'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}

export function roundMoney(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  const safe = Number.isFinite(n) ? n : 0;
  return (Math.round(safe * 100) / 100).toFixed(2);
}

// Sliding window rate limiter
const rateBuckets = new Map<string, number[]>();

export function createRateLimiter(windowMs: number, maxRequests: number, keyPrefix: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const history = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
    if (history.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }
    history.push(now);
    rateBuckets.set(key, history);
    next();
  };
}
