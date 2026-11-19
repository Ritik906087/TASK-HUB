import bcrypt from 'bcryptjs';
import { count, eq } from 'drizzle-orm';
import { db, pool } from './index.ts';
import { adminUsers, appSettings, tasks, transactions, users } from './schema.ts';
import { generateUid } from '../lib/security.ts';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "uid" text NOT NULL UNIQUE,
  "firebase_uid" text UNIQUE,
  "phone" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "full_name" text DEFAULT 'Task Hub Member' NOT NULL,
  "email" text,
  "referral_code" text NOT NULL UNIQUE,
  "referred_by_user_id" integer,
  "referral_valid" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_login_ip" text,
  "device_fingerprint" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "users_phone_idx" ON "users" ("phone");
CREATE INDEX IF NOT EXISTS "users_referral_code_idx" ON "users" ("referral_code");
CREATE INDEX IF NOT EXISTS "users_referred_by_idx" ON "users" ("referred_by_user_id");

CREATE TABLE IF NOT EXISTS "admin_users" (
  "id" serial PRIMARY KEY NOT NULL,
  "username" text NOT NULL UNIQUE,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" text DEFAULT 'super_admin' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "last_login_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "icon_url" text,
  "description" text NOT NULL,
  "instructions" text NOT NULL,
  "external_link" text NOT NULL,
  "reward_amount" numeric(12, 2) NOT NULL,
  "video_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "daily_limit" integer DEFAULT 100 NOT NULL,
  "total_limit" integer DEFAULT 5000 NOT NULL,
  "completed_count" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_admin_id" integer REFERENCES "admin_users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "tasks_category_idx" ON "tasks" ("category");
CREATE INDEX IF NOT EXISTS "tasks_active_idx" ON "tasks" ("is_active");

CREATE TABLE IF NOT EXISTS "task_submissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'submitted' NOT NULL,
  "proof_text" text,
  "proof_file_url" text,
  "link_visited" boolean DEFAULT false NOT NULL,
  "reward_credited" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "admin_remarks" text,
  "reviewed_by_admin_id" integer REFERENCES "admin_users"("id"),
  "submitted_at" timestamp DEFAULT now() NOT NULL,
  "reviewed_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "task_submissions_task_user_uniq" ON "task_submissions" ("task_id", "user_id");
CREATE INDEX IF NOT EXISTS "task_submissions_user_idx" ON "task_submissions" ("user_id");
CREATE INDEX IF NOT EXISTS "task_submissions_status_idx" ON "task_submissions" ("status");

CREATE TABLE IF NOT EXISTS "task_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "task_id" integer NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "task_comments_task_idx" ON "task_comments" ("task_id");

CREATE TABLE IF NOT EXISTS "referrals" (
  "id" serial PRIMARY KEY NOT NULL,
  "sponsor_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "referred_user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "referral_code_used" text NOT NULL,
  "is_valid" boolean DEFAULT false NOT NULL,
  "invalid_reason" text,
  "validated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "referrals_sponsor_idx" ON "referrals" ("sponsor_user_id");

CREATE TABLE IF NOT EXISTS "referral_commissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "sponsor_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "task_submission_id" integer REFERENCES "task_submissions"("id"),
  "level" integer DEFAULT 1 NOT NULL,
  "rate_percent" numeric(5, 2) NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "status" text DEFAULT 'credited' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ref_comm_sponsor_idx" ON "referral_commissions" ("sponsor_user_id");
CREATE INDEX IF NOT EXISTS "ref_comm_source_idx" ON "referral_commissions" ("source_user_id");

CREATE TABLE IF NOT EXISTS "wallets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "locked_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "total_task_earnings" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "total_referral_earnings" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "total_team_earnings" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "total_other_rewards" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "total_withdrawn" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "tx_code" text NOT NULL UNIQUE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "direction" text NOT NULL,
  "category" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "balance_before" numeric(12, 2) NOT NULL,
  "balance_after" numeric(12, 2) NOT NULL,
  "related_uid" text,
  "reference_id" text,
  "status" text DEFAULT 'completed' NOT NULL,
  "description" text NOT NULL,
  "created_by_admin_id" integer REFERENCES "admin_users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "transactions_user_idx" ON "transactions" ("user_id");
CREATE INDEX IF NOT EXISTS "transactions_direction_idx" ON "transactions" ("direction");
CREATE INDEX IF NOT EXISTS "transactions_category_idx" ON "transactions" ("category");
CREATE INDEX IF NOT EXISTS "transactions_created_idx" ON "transactions" ("created_at");

CREATE TABLE IF NOT EXISTS "withdrawals" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_code" text NOT NULL UNIQUE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" numeric(12, 2) NOT NULL,
  "method" text NOT NULL,
  "account_snapshot" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "admin_remarks" text,
  "processed_by_admin_id" integer REFERENCES "admin_users"("id"),
  "processed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "withdrawals_user_idx" ON "withdrawals" ("user_id");
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" ("status");

CREATE TABLE IF NOT EXISTS "bank_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "account_holder_name" text NOT NULL,
  "bank_name" text NOT NULL,
  "account_number_encrypted" text NOT NULL,
  "account_number_last4" text NOT NULL,
  "ifsc_code" text NOT NULL,
  "is_verified" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "upi_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "upi_id" text NOT NULL,
  "holder_name" text NOT NULL,
  "is_verified" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "value" jsonb NOT NULL,
  "updated_by_admin_id" integer REFERENCES "admin_users"("id"),
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "type" text DEFAULT 'system' NOT NULL,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id");

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" integer NOT NULL,
  "action" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "details" jsonb,
  "ip_address" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" ("created_at");

CREATE TABLE IF NOT EXISTS "otp_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "phone" text NOT NULL,
  "code_hash" text NOT NULL,
  "purpose" text DEFAULT 'forgot_password' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "otp_codes_phone_idx" ON "otp_codes" ("phone");

CREATE TABLE IF NOT EXISTS "media_files" (
  "id" serial PRIMARY KEY NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "data_base64" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "uploaded_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
`;

export function unwrapDbError(err: unknown): { code?: string; message: string } {
  let cur: unknown = err;
  const messages: string[] = [];
  let code: string | undefined;

  for (let depth = 0; depth < 4 && cur && typeof cur === 'object'; depth++) {
    const obj = cur as { code?: unknown; message?: unknown; cause?: unknown };
    if (!code && typeof obj.code === 'string') {
      code = obj.code;
    }
    if (typeof obj.message === 'string' && obj.message) {
      messages.push(obj.message);
    }
    cur = obj.cause;
  }

  const combined = messages.length > 0 ? messages.join(' | ') : String(err || 'Database error');
  return { code, message: combined };
}

export function sanitizeDbError(err: unknown): string {
  const { code, message } = unwrapDbError(err);
  const cleaned = message.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, '[database-url]');
  return code ? `[${code}] ${cleaned}` : cleaned;
}

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

      // 1. Check if tables exist using to_regclass (avoids CREATE permission errors on Cloud SQL)
      const regCheck = await pool.query<{ tbl: string | null }>(
        `SELECT to_regclass('public.admin_users') AS tbl`
      );
      if (!regCheck.rows[0]?.tbl) {
        await pool.query(SCHEMA_SQL);
      }

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
