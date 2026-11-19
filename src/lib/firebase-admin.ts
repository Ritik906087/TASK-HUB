import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

function resolveProjectId(): string | undefined {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }

  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../firebase-applet-config.json'),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { projectId?: string };
        if (parsed.projectId) return parsed.projectId;
      }
    } catch {
      // ignore missing/unreadable config and continue
    }
  }

  return undefined;
}

let cachedAuth: Auth | null = null;

export function getAdminAuth(): Auth {
  if (cachedAuth) return cachedAuth;

  if (!getApps().length) {
    const projectId = resolveProjectId();
    initializeApp(projectId ? { projectId } : {});
  }

  cachedAuth = getAuth();
  return cachedAuth;
}

export const adminAuth = {
  verifyIdToken: async (idToken: string) => getAdminAuth().verifyIdToken(idToken),
};
