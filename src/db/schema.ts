import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// 1. Users table
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    firebaseUid: text('firebase_uid').unique(),
    phone: text('phone').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull().default('Task Hub Member'),
    email: text('email'),
    referralCode: text('referral_code').notNull().unique(),
    referredByUserId: integer('referred_by_user_id'),
    referralValid: boolean('referral_valid').notNull().default(false),
    status: text('status').notNull().default('active'), // 'active' | 'blocked'
    lastLoginIp: text('last_login_ip'),
    deviceFingerprint: text('device_fingerprint'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_phone_idx').on(table.phone),
    index('users_referral_code_idx').on(table.referralCode),
    index('users_referred_by_idx').on(table.referredByUserId),
  ]
);

// 2. Admin Users table (separate authentication boundary)
export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('super_admin'),
  status: text('status').notNull().default('active'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. Tasks table
export const tasks = pgTable(
  'tasks',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    category: text('category').notNull(), // 'video_watching' | 'photo_viewing' | 'website_visiting' | 'social_media' | 'other'
    iconUrl: text('icon_url'),
    description: text('description').notNull(),
    instructions: text('instructions').notNull(),
    externalLink: text('external_link').notNull(),
    rewardAmount: numeric('reward_amount', { precision: 12, scale: 2 }).notNull(),
    videoUrls: jsonb('video_urls').$type<string[]>().notNull().default([]),
    photoUrls: jsonb('photo_urls').$type<string[]>().notNull().default([]),
    dailyLimit: integer('daily_limit').notNull().default(100),
    totalLimit: integer('total_limit').notNull().default(5000),
    completedCount: integer('completed_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdByAdminId: integer('created_by_admin_id').references(() => adminUsers.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('tasks_category_idx').on(table.category),
    index('tasks_active_idx').on(table.isActive),
  ]
);

// 4. Task Submissions table
export const taskSubmissions = pgTable(
  'task_submissions',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull().default('submitted'), // 'submitted' | 'pending_verification' | 'approved' | 'rejected' | 'completed'
    proofText: text('proof_text'),
    proofFileUrl: text('proof_file_url'),
    linkVisited: boolean('link_visited').notNull().default(false),
    rewardCredited: numeric('reward_credited', { precision: 12, scale: 2 }).notNull().default('0.00'),
    adminRemarks: text('admin_remarks'),
    reviewedByAdminId: integer('reviewed_by_admin_id').references(() => adminUsers.id),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
  },
  (table) => [
    uniqueIndex('task_submissions_task_user_uniq').on(table.taskId, table.userId),
    index('task_submissions_user_idx').on(table.userId),
    index('task_submissions_status_idx').on(table.status),
  ]
);

// 5. Task Comments / Discussion table
export const taskComments = pgTable(
  'task_comments',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id')
      .references(() => tasks.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('task_comments_task_idx').on(table.taskId)]
);

// 6. Referrals table
export const referrals = pgTable(
  'referrals',
  {
    id: serial('id').primaryKey(),
    sponsorUserId: integer('sponsor_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    referredUserId: integer('referred_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    referralCodeUsed: text('referral_code_used').notNull(),
    isValid: boolean('is_valid').notNull().default(false),
    invalidReason: text('invalid_reason'),
    validatedAt: timestamp('validated_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('referrals_sponsor_idx').on(table.sponsorUserId)]
);

// 7. Referral Commissions table
export const referralCommissions = pgTable(
  'referral_commissions',
  {
    id: serial('id').primaryKey(),
    sponsorUserId: integer('sponsor_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sourceUserId: integer('source_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sourceType: text('source_type').notNull(), // 'referral_commission' | 'team_task_commission' | 'registration_bonus'
    taskSubmissionId: integer('task_submission_id').references(() => taskSubmissions.id),
    level: integer('level').notNull().default(1),
    ratePercent: numeric('rate_percent', { precision: 5, scale: 2 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').notNull().default('credited'), // 'credited' | 'reversed'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ref_comm_sponsor_idx').on(table.sponsorUserId),
    index('ref_comm_source_idx').on(table.sourceUserId),
  ]
);

// 8. Wallets table
export const wallets = pgTable('wallets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  balance: numeric('balance', { precision: 12, scale: 2 }).notNull().default('0.00'),
  lockedBalance: numeric('locked_balance', { precision: 12, scale: 2 }).notNull().default('0.00'),
  totalTaskEarnings: numeric('total_task_earnings', { precision: 12, scale: 2 }).notNull().default('0.00'),
  totalReferralEarnings: numeric('total_referral_earnings', { precision: 12, scale: 2 }).notNull().default('0.00'),
  totalTeamEarnings: numeric('total_team_earnings', { precision: 12, scale: 2 }).notNull().default('0.00'),
  totalOtherRewards: numeric('total_other_rewards', { precision: 12, scale: 2 }).notNull().default('0.00'),
  totalWithdrawn: numeric('total_withdrawn', { precision: 12, scale: 2 }).notNull().default('0.00'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 9. Transactions table
export const transactions = pgTable(
  'transactions',
  {
    id: serial('id').primaryKey(),
    txCode: text('tx_code').notNull().unique(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    direction: text('direction').notNull(), // 'credit' | 'debit'
    category: text('category').notNull(), // 'money_adding' | 'task_reward' | 'referral_commission' | 'team_task_commission' | 'other_reward' | 'withdrawal' | 'withdrawal_refund' | 'admin_deduction'
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    balanceBefore: numeric('balance_before', { precision: 12, scale: 2 }).notNull(),
    balanceAfter: numeric('balance_after', { precision: 12, scale: 2 }).notNull(),
    relatedUid: text('related_uid'),
    referenceId: text('reference_id'),
    status: text('status').notNull().default('completed'), // 'completed' | 'pending' | 'failed' | 'refunded'
    description: text('description').notNull(),
    createdByAdminId: integer('created_by_admin_id').references(() => adminUsers.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('transactions_user_idx').on(table.userId),
    index('transactions_direction_idx').on(table.direction),
    index('transactions_category_idx').on(table.category),
    index('transactions_created_idx').on(table.createdAt),
  ]
);

// 10. Withdrawals table
export const withdrawals = pgTable(
  'withdrawals',
  {
    id: serial('id').primaryKey(),
    requestCode: text('request_code').notNull().unique(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    method: text('method').notNull(), // 'bank' | 'upi'
    accountSnapshot: jsonb('account_snapshot').$type<{
      accountHolderName?: string;
      bankName?: string;
      accountNumber?: string;
      accountNumberMasked?: string;
      ifscCode?: string;
      upiId?: string;
    }>().notNull(),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'processing' | 'paid' | 'rejected'
    adminRemarks: text('admin_remarks'),
    processedByAdminId: integer('processed_by_admin_id').references(() => adminUsers.id),
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('withdrawals_user_idx').on(table.userId),
    index('withdrawals_status_idx').on(table.status),
  ]
);

// 11. Bank Accounts table
export const bankAccounts = pgTable('bank_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  accountHolderName: text('account_holder_name').notNull(),
  bankName: text('bank_name').notNull(),
  accountNumberEncrypted: text('account_number_encrypted').notNull(),
  accountNumberLast4: text('account_number_last4').notNull(),
  ifscCode: text('ifsc_code').notNull(),
  isVerified: boolean('is_verified').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 12. UPI Accounts table
export const upiAccounts = pgTable('upi_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  upiId: text('upi_id').notNull(),
  holderName: text('holder_name').notNull(),
  isVerified: boolean('is_verified').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 13. App Settings table
export const appSettings = pgTable('app_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: jsonb('value').notNull(),
  updatedByAdminId: integer('updated_by_admin_id').references(() => adminUsers.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 14. Notifications table
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull().default('system'), // 'task' | 'withdrawal' | 'referral' | 'system'
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_idx').on(table.userId)]
);

// 15. Audit Logs table
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorType: text('actor_type').notNull(), // 'user' | 'admin'
    actorId: integer('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('audit_logs_created_idx').on(table.createdAt)]
);

// 16. OTP Recovery table
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: serial('id').primaryKey(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: text('purpose').notNull().default('forgot_password'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('otp_codes_phone_idx').on(table.phone)]
);

// 17. Media Files table (persists uploaded icons/photos/videos/proofs in PostgreSQL)
export const mediaFiles = pgTable('media_files', {
  id: serial('id').primaryKey(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  dataBase64: text('data_base64').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  bankAccount: one(bankAccounts, {
    fields: [users.id],
    references: [bankAccounts.userId],
  }),
  upiAccount: one(upiAccounts, {
    fields: [users.id],
    references: [upiAccounts.userId],
  }),
  submissions: many(taskSubmissions),
  transactions: many(transactions),
  withdrawals: many(withdrawals),
  notifications: many(notifications),
}));

export const tasksRelations = relations(tasks, ({ many }) => ({
  submissions: many(taskSubmissions),
  comments: many(taskComments),
}));

export const taskSubmissionsRelations = relations(taskSubmissions, ({ one }) => ({
  task: one(tasks, {
    fields: [taskSubmissions.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskSubmissions.userId],
    references: [users.id],
  }),
}));
