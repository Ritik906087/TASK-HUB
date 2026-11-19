import bcrypt from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { adminUsers, appSettings, tasks, transactions, users } from './schema.ts';
import { generateUid } from '../lib/security.ts';

export interface AppSettingsMap {
  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalAmounts: number[];
  referralRequired: boolean;
  referralCommissionPercent: number;
  teamCommissionPercent: number;
  validReferralMinTasks: number;
  signupBonus: number;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  autoApproveTasks: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettingsMap = {
  minWithdrawal: 10,
  maxWithdrawal: 500,
  withdrawalAmounts: [10, 20, 50, 100, 150, 200, 300, 500],
  referralRequired: false,
  referralCommissionPercent: 10,
  teamCommissionPercent: 5,
  validReferralMinTasks: 1,
  signupBonus: 0,
  registrationEnabled: true,
  maintenanceMode: false,
  autoApproveTasks: false,
};

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureDatabaseBootstrapped(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      if (!process.env.SQL_HOST && !process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
        throw new Error(
          'PostgreSQL database is not configured. Set DATABASE_URL (or SQL_HOST) in environment variables.'
        );
      }

      // 1. Ensure default admin user exists
      const existingAdmins = await db.select({ total: count() }).from(adminUsers);
      if ((existingAdmins[0]?.total ?? 0) === 0) {
        const defaultPass = process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@123456';
        const hash = await bcrypt.hash(defaultPass, 10);
        await db
          .insert(adminUsers)
          .values({
            username: 'admin',
            email: 'admin@taskhub.app',
            passwordHash: hash,
            role: 'super_admin',
            status: 'active',
          })
          .onConflictDoNothing();
      }

      // 2. Ensure default app_settings exist
      const entries = Object.entries(DEFAULT_APP_SETTINGS) as [keyof AppSettingsMap, unknown][];
      for (const [key, value] of entries) {
        await db
          .insert(appSettings)
          .values({ key, value })
          .onConflictDoNothing({ target: appSettings.key });
      }

      // 3. Seed starter tasks only when tasks table is empty
      const existingTasks = await db.select({ total: count() }).from(tasks);
      if ((existingTasks[0]?.total ?? 0) === 0) {
        const [adminRow] = await db.select().from(adminUsers).limit(1);
        await db.insert(tasks).values([
          {
            title: 'Watch Product Showcase Video (60s)',
            category: 'video_watching',
            iconUrl: '/src/assets/images/task_video_preview_1795093528064.jpg',
            description:
              'Watch the short product showcase clip completely and verify the featured release code shown on screen.',
            instructions:
              '1. Tap "Get Link" or watch the embedded showcase video for at least 30 seconds.\n2. Take note of the final frame or capture a screenshot.\n3. Enter your observation note and upload proof below.',
            externalLink: 'https://www.w3schools.com/html/mov_bbb.mp4',
            rewardAmount: '15.00',
            videoUrls: ['https://www.w3schools.com/html/mov_bbb.mp4'],
            photoUrls: ['/src/assets/images/task_video_preview_1795093528064.jpg'],
            dailyLimit: 250,
            totalLimit: 5000,
            isActive: true,
            createdByAdminId: adminRow?.id ?? null,
          },
          {
            title: 'Review Curated Architectural Gallery',
            category: 'photo_viewing',
            iconUrl: '/src/assets/images/task_photo_preview_1795093529376.jpg',
            description:
              'Inspect the high-resolution photo collection and submit a brief quality verification review.',
            instructions:
              '1. View all attached architectural gallery photos in the task viewer.\n2. Confirm image clarity and lighting quality.\n3. Submit a short review note to claim your reward.',
            externalLink: 'https://example.com',
            rewardAmount: '12.00',
            videoUrls: [],
            photoUrls: [
              '/src/assets/images/task_photo_preview_1795093529376.jpg',
              '/src/assets/images/invite_reward_banner_1795093529732.jpg',
            ],
            dailyLimit: 300,
            totalLimit: 5000,
            isActive: true,
            createdByAdminId: adminRow?.id ?? null,
          },
          {
            title: 'Visit Partner Portal & Verify Homepage',
            category: 'website_visiting',
            iconUrl: '/icon.svg',
            description:
              'Visit our partner web portal, browse two sections, and submit a screenshot or confirmation note.',
            instructions:
              '1. Click the "Get Link" button to open the partner portal.\n2. Browse the homepage for 20 seconds.\n3. Return to TASK HUB and submit your confirmation details.',
            externalLink: 'https://developer.android.com/develop/ui/views/layout/webapps/webview',
            rewardAmount: '20.00',
            videoUrls: [],
            photoUrls: [],
            dailyLimit: 200,
            totalLimit: 3000,
            isActive: true,
            createdByAdminId: adminRow?.id ?? null,
          },
          {
            title: 'Community Channel Follow & Engagement',
            category: 'social_media',
            iconUrl: '/icon.svg',
            description:
              'Follow the official announcement channel and upload a screenshot of your subscription.',
            instructions:
              '1. Open the external channel link via "Get Link".\n2. Tap Follow / Subscribe on the official page.\n3. Upload a screenshot and enter your handle below.',
            externalLink: 'https://whatsapp.com/channel/0029Va4',
            rewardAmount: '25.00',
            videoUrls: [],
            photoUrls: [],
            dailyLimit: 150,
            totalLimit: 2500,
            isActive: true,
            createdByAdminId: adminRow?.id ?? null,
          },
          {
            title: 'Quick App Experience Survey',
            category: 'other',
            iconUrl: '/icon.svg',
            description:
              'Share honest feedback about TASK HUB mobile navigation and payout experience.',
            instructions:
              '1. Test browsing tasks and checking your wallet balance.\n2. Write a 1-2 sentence usability note below.\n3. Submit for verification.',
            externalLink: 'https://taskhub.app/survey',
            rewardAmount: '10.00',
            videoUrls: [],
            photoUrls: [],
            dailyLimit: 500,
            totalLimit: 10000,
            isActive: true,
            createdByAdminId: adminRow?.id ?? null,
          },
        ]);
      }

      // 4. Normalize any legacy non-8-digit numeric UIDs to unique 8-digit numbers
      const allUsers = await db.select({ id: users.id, uid: users.uid }).from(users);
      const usedUids = new Set(allUsers.map((u) => u.uid));
      for (const u of allUsers) {
        if (!/^\d{8}$/.test(u.uid)) {
          let nextUid = generateUid();
          while (usedUids.has(nextUid)) {
            nextUid = generateUid();
          }
          usedUids.add(nextUid);
          await db.update(users).set({ uid: nextUid }).where(eq(users.id, u.id));
          await db
            .update(transactions)
            .set({ relatedUid: nextUid })
            .where(eq(transactions.relatedUid, u.uid));
        }
      }

      initialized = true;
    } catch (err) {
      initPromise = null;
      console.error('Database bootstrap failed:', err);
      throw err;
    }
  })();

  return initPromise;
}

export async function getAppSettings(): Promise<AppSettingsMap> {
  await ensureDatabaseBootstrapped();
  const rows = await db.select().from(appSettings);
  const result: AppSettingsMap = { ...DEFAULT_APP_SETTINGS };
  for (const row of rows) {
    if (row.key in result) {
      (result as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return result;
}

export async function updateAppSetting(key: keyof AppSettingsMap, value: unknown, adminId?: number) {
  await db
    .insert(appSettings)
    .values({
      key,
      value,
      updatedByAdminId: adminId ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedByAdminId: adminId ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function logAudit(params: {
  actorType: 'user' | 'admin';
  actorId: number;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  const { auditLogs } = await import('./schema.ts');
  await db.insert(auditLogs).values({
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    details: params.details ?? null,
    ipAddress: params.ipAddress ?? null,
  });
}

export async function getAdminById(adminId: number) {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, adminId)).limit(1);
  return row ?? null;
}
