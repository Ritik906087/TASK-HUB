import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { adminUsers, users } from '../db/schema.ts';
import { ensureDatabaseBootstrapped } from '../db/bootstrap.ts';
import { verifyAdminToken, verifyUserToken } from '../lib/security.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  phone: string;
  fullName: string;
  referralCode: string;
  status: string;
}

export interface AuthenticatedAdmin {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface UserRequest extends Request {
  authUser?: AuthenticatedUser;
}

export interface AdminRequest extends Request {
  authAdmin?: AuthenticatedAdmin;
}

function extractBearer(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export const requireUserAuth = async (req: UserRequest, res: Response, next: NextFunction) => {
  try {
    await ensureDatabaseBootstrapped();
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    }

    let userRow: typeof users.$inferSelect | undefined;

    // 1. Check signed TASK HUB session token
    const session = verifyUserToken(token);
    if (session) {
      const [found] = await db.select().from(users).where(eq(users.id, session.sub)).limit(1);
      userRow = found;
    } else {
      // 2. Fallback: verify Firebase Auth ID token
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        const [found] = await db
          .select()
          .from(users)
          .where(eq(users.firebaseUid, decoded.uid))
          .limit(1);
        userRow = found;
      } catch {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
      }
    }

    if (!userRow) {
      return res.status(401).json({ error: 'Unauthorized: Account not found' });
    }

    if (userRow.status === 'blocked') {
      return res.status(403).json({ error: 'Your account has been suspended by an administrator.' });
    }

    req.authUser = {
      id: userRow.id,
      uid: userRow.uid,
      phone: userRow.phone,
      fullName: userRow.fullName,
      referralCode: userRow.referralCode,
      status: userRow.status,
    };
    next();
  } catch (error) {
    console.error('User auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication verification failed' });
  }
};

export const requireAdminAuth = async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await ensureDatabaseBootstrapped();
    const token = extractBearer(req);
    if (!token) {
      return res.status(401).json({ error: 'Admin authentication required' });
    }

    const session = verifyAdminToken(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired admin session' });
    }

    const [adminRow] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, session.sub))
      .limit(1);

    if (!adminRow || adminRow.status !== 'active') {
      return res.status(403).json({ error: 'Admin access denied' });
    }

    req.authAdmin = {
      id: adminRow.id,
      username: adminRow.username,
      email: adminRow.email,
      role: adminRow.role,
    };
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    return res.status(500).json({ error: 'Admin verification failed' });
  }
};
