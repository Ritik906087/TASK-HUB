import express from 'express';
import multer from 'multer';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { mediaFiles } from '../db/schema.ts';
import { ensureDatabaseBootstrapped } from '../db/bootstrap.ts';
import { verifyAdminToken, verifyUserToken } from '../lib/security.ts';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8 MB max per upload
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video uploads are permitted'));
    }
  },
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    await ensureDatabaseBootstrapped();
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const userPayload = token ? verifyUserToken(token) : null;
    const adminPayload = token ? verifyAdminToken(token) : null;

    if (!userPayload && !adminPayload) {
      return res.status(401).json({ error: 'Unauthorized upload request' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file selected for upload' });
    }

    const uploadedBy = adminPayload ? `admin:${adminPayload.username}` : `user:${userPayload?.uid}`;
    const dataBase64 = req.file.buffer.toString('base64');

    const [saved] = await db
      .insert(mediaFiles)
      .values({
        fileName: req.file.originalname.slice(0, 120),
        mimeType: req.file.mimetype,
        dataBase64,
        sizeBytes: req.file.size,
        uploadedBy,
      })
      .returning({
        id: mediaFiles.id,
        fileName: mediaFiles.fileName,
        mimeType: mediaFiles.mimeType,
        sizeBytes: mediaFiles.sizeBytes,
      });

    res.status(201).json({
      id: saved.id,
      url: `/api/media/${saved.id}`,
      fileName: saved.fileName,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    res.status(400).json({ error: err.message || 'File upload failed' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    await ensureDatabaseBootstrapped();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send('Invalid media ID');
    }

    const [file] = await db
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.id, id))
      .limit(1);

    if (!file) {
      return res.status(404).send('Media not found');
    }

    const buffer = Buffer.from(file.dataBase64, 'base64');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (err) {
    console.error('Serve media error:', err);
    res.status(500).send('Failed to load media');
  }
});

export default router;
