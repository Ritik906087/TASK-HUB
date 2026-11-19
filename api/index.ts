import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

let cachedApp: ApiHandler | null = null;

function loadBundledApp(): ApiHandler {
  if (cachedApp) return cachedApp;

  const metaUrl =
    typeof import.meta !== 'undefined' && typeof import.meta.url === 'string'
      ? import.meta.url
      : pathToFileURL(path.resolve(process.cwd(), 'api/index.ts')).href;

  const currentDir = path.dirname(fileURLToPath(metaUrl));
  const candidates = [
    path.resolve(currentDir, '_server.cjs'),
    path.resolve(process.cwd(), 'api/_server.cjs'),
    path.resolve(process.cwd(), '_server.cjs'),
  ];

  const bundlePath = candidates.find((p) => fs.existsSync(p));
  if (!bundlePath) {
    throw new Error(`Server bundle not found. Checked: ${candidates.join(', ')}`);
  }

  const localRequire = createRequire(metaUrl);
  const serverModule = localRequire(bundlePath) as { createApiApp?: () => ApiHandler };
  if (typeof serverModule?.createApiApp !== 'function') {
    throw new Error('Invalid server bundle: createApiApp export is missing');
  }

  cachedApp = serverModule.createApiApp();
  return cachedApp;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = loadBundledApp();
    return app(req, res);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('Vercel API handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify({ error: message }));
  }
}
