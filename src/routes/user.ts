import express from 'express';
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  bankAccounts,
  notifications,
  referralCommissions,
  referrals,
  taskComments,
  taskSubmissions,
  tasks,
  transactions,
  upiAccounts,
  users,
  wallets,
  withdrawals,
} from '../db/schema.ts';
import { getAppSettings, logAudit } from '../db/bootstrap.ts';
import { approveSubmissionAtomic } from '../lib/rewards.ts';
import {
  createRateLimiter,
  encryptSensitive,
  generateTxCode,
  maskAccountNumber,
  maskPhone,
  roundMoney,
} from '../lib/security.ts';
import { requireUserAuth, type UserRequest } from '../middleware/auth.ts';

const router = express.Router();
router.use(requireUserAuth);

const actionLimiter = createRateLimiter(60_000, 30, 'user-action');

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 1. User Home Dashboard
router.get('/dashboard', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const today = startOfToday();

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);

    const [todayEarnRow] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${transactions.amount} AS numeric)), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.direction, 'credit'),
          eq(transactions.status, 'completed'),
          inArray(transactions.category, [
            'task_reward',
            'referral_commission',
            'team_task_commission',
            'other_reward',
            'money_adding',
          ]),
          gte(transactions.createdAt, today)
        )
      );

    const [completedRow] = await db
      .select({ total: count() })
      .from(taskSubmissions)
      .where(
        and(
          eq(taskSubmissions.userId, userId),
          inArray(taskSubmissions.status, ['approved', 'completed'])
        )
      );

    const [activeTasksRow] = await db
      .select({ total: count() })
      .from(tasks)
      .where(eq(tasks.isActive, true));

    const [pendingWdrRow] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${withdrawals.amount} AS numeric)), 0)`,
        count: count(),
      })
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.userId, userId),
          inArray(withdrawals.status, ['pending', 'approved', 'processing'])
        )
      );

    const [approvedWdrRow] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${withdrawals.amount} AS numeric)), 0)`,
        count: count(),
      })
      .from(withdrawals)
      .where(and(eq(withdrawals.userId, userId), inArray(withdrawals.status, ['approved', 'paid'])));

    const [unreadRow] = await db
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    const referralCommissionTotal =
      parseFloat(wallet?.totalReferralEarnings ?? '0') +
      parseFloat(wallet?.totalTeamEarnings ?? '0');

    res.json({
      balance: roundMoney(wallet?.balance ?? '0'),
      lockedBalance: roundMoney(wallet?.lockedBalance ?? '0'),
      todayEarnings: roundMoney(todayEarnRow?.total ?? '0'),
      totalTaskEarnings: roundMoney(wallet?.totalTaskEarnings ?? '0'),
      referralCommission: roundMoney(referralCommissionTotal),
      completedTasks: completedRow?.total ?? 0,
      availableTasks: activeTasksRow?.total ?? 0,
      pendingWithdrawals: roundMoney(pendingWdrRow?.total ?? '0'),
      pendingWithdrawalsCount: pendingWdrRow?.count ?? 0,
      approvedWithdrawals: roundMoney(approvedWdrRow?.total ?? '0'),
      approvedWithdrawalsCount: approvedWdrRow?.count ?? 0,
      unreadNotifications: unreadRow?.total ?? 0,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Unable to load dashboard metrics' });
  }
});

// 2. List Active Tasks with User Status & Counts
router.get('/tasks', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const category = String(req.query.category || 'all');
    const search = String(req.query.search || '').trim().toLowerCase();

    const allTasks = await db
      .select()
      .from(tasks)
      .orderBy(desc(tasks.createdAt));

    const userSubs = await db
      .select()
      .from(taskSubmissions)
      .where(eq(taskSubmissions.userId, userId));

    const subMap = new Map<number, typeof taskSubmissions.$inferSelect>();
    for (const s of userSubs) subMap.set(s.taskId, s);

    const activeTasks = allTasks.filter((t) => t.isActive || subMap.has(t.id));

    const commentCounts = await db
      .select({
        taskId: taskComments.taskId,
        total: count(),
      })
      .from(taskComments)
      .groupBy(taskComments.taskId);

    const commentMap = new Map<number, number>();
    for (const c of commentCounts) commentMap.set(c.taskId, c.total);

    const filtered = activeTasks
      .filter((t) => (category === 'all' ? true : t.category === category))
      .filter((t) =>
        search
          ? t.title.toLowerCase().includes(search) || t.description.toLowerCase().includes(search)
          : true
      )
      .map((t) => {
        const sub = subMap.get(t.id);
        return {
          id: t.id,
          title: t.title,
          category: t.category,
          iconUrl: t.iconUrl,
          description: t.description,
          externalLink: t.externalLink,
          rewardAmount: roundMoney(t.rewardAmount),
          videoCount: Array.isArray(t.videoUrls) ? t.videoUrls.length : 0,
          photoCount: Array.isArray(t.photoUrls) ? t.photoUrls.length : 0,
          commentCount: commentMap.get(t.id) ?? 0,
          dailyLimit: t.dailyLimit,
          totalLimit: t.totalLimit,
          completedCount: t.completedCount,
          userStatus: sub ? sub.status : 'available',
          createdAt: t.createdAt,
        };
      });

    res.json({ tasks: filtered });
  } catch (err) {
    console.error('List tasks error:', err);
    res.status(500).json({ error: 'Unable to load tasks' });
  }
});

// 3. Task Details & Comments
router.get('/tasks/:id', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const [submission] = await db
      .select()
      .from(taskSubmissions)
      .where(and(eq(taskSubmissions.taskId, taskId), eq(taskSubmissions.userId, userId)))
      .limit(1);

    const comments = await db
      .select({
        id: taskComments.id,
        message: taskComments.message,
        createdAt: taskComments.createdAt,
        userUid: users.uid,
        userName: users.fullName,
      })
      .from(taskComments)
      .innerJoin(users, eq(taskComments.userId, users.id))
      .where(eq(taskComments.taskId, taskId))
      .orderBy(desc(taskComments.createdAt))
      .limit(50);

    res.json({
      task: {
        ...task,
        rewardAmount: roundMoney(task.rewardAmount),
      },
      submission: submission ?? null,
      comments,
    });
  } catch (err) {
    console.error('Task detail error:', err);
    res.status(500).json({ error: 'Unable to load task details' });
  }
});

// 4. Submit Task Completion Proof
router.post('/tasks/:id/submit', actionLimiter, async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const { proofText, proofFileUrl, linkVisited } = req.body as {
      proofText?: string;
      proofFileUrl?: string;
      linkVisited?: boolean;
    };

    const settings = await getAppSettings();
    if (settings.maintenanceMode) {
      return res.status(503).json({ error: 'Task submissions are paused during maintenance.' });
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    if (!task || !task.isActive) {
      return res.status(404).json({ error: 'This task is no longer active.' });
    }

    if (task.completedCount >= task.totalLimit) {
      return res.status(400).json({ error: 'This task has reached its maximum completion quota.' });
    }

    if (!proofText?.trim() && !proofFileUrl?.trim()) {
      return res.status(400).json({ error: 'Please provide a completion note or upload proof.' });
    }

    const [existing] = await db
      .select()
      .from(taskSubmissions)
      .where(and(eq(taskSubmissions.taskId, taskId), eq(taskSubmissions.userId, userId)))
      .limit(1);

    if (existing && existing.status !== 'rejected') {
      return res.status(409).json({
        error: `Duplicate submission blocked. Current status: ${existing.status.replace('_', ' ')}.`,
      });
    }

    let submissionRow: typeof taskSubmissions.$inferSelect;

    if (existing && existing.status === 'rejected') {
      const [updated] = await db
        .update(taskSubmissions)
        .set({
          status: 'pending_verification',
          proofText: (proofText || '').trim(),
          proofFileUrl: proofFileUrl || null,
          linkVisited: Boolean(linkVisited),
          adminRemarks: null,
          submittedAt: new Date(),
          reviewedAt: null,
        })
        .where(eq(taskSubmissions.id, existing.id))
        .returning();
      submissionRow = updated;
    } else {
      const [inserted] = await db
        .insert(taskSubmissions)
        .values({
          taskId,
          userId,
          status: 'pending_verification',
          proofText: (proofText || '').trim(),
          proofFileUrl: proofFileUrl || null,
          linkVisited: Boolean(linkVisited),
        })
        .returning();
      submissionRow = inserted;
    }

    // If admin enabled autoApproveTasks, credit atomically
    if (settings.autoApproveTasks) {
      await approveSubmissionAtomic({
        submissionId: submissionRow.id,
        remarks: 'Auto-verified by system policy',
      });
      const [refreshed] = await db
        .select()
        .from(taskSubmissions)
        .where(eq(taskSubmissions.id, submissionRow.id))
        .limit(1);
      submissionRow = refreshed;
    }

    await logAudit({
      actorType: 'user',
      actorId: userId,
      action: 'task_submit',
      targetType: 'task_submissions',
      targetId: String(submissionRow.id),
      details: { taskId },
      ipAddress: req.ip,
    });

    res.status(201).json({
      submission: submissionRow,
      message: settings.autoApproveTasks
        ? 'Task completed and reward credited!'
        : 'Task submitted and awaiting verification.',
    });
  } catch (err) {
    console.error('Submit task error:', err);
    res.status(500).json({ error: 'Unable to submit task' });
  }
});

// 5. Post Task Discussion Comment
router.post('/tasks/:id/comments', actionLimiter, async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const taskId = Number(req.params.id);
    const { message } = req.body as { message?: string };

    if (!Number.isInteger(taskId) || taskId <= 0) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }
    if (!message || message.trim().length < 2) {
      return res.status(400).json({ error: 'Comment message is too short' });
    }

    const [created] = await db
      .insert(taskComments)
      .values({
        taskId,
        userId,
        message: message.trim().slice(0, 500),
      })
      .returning();

    res.status(201).json({
      comment: {
        id: created.id,
        message: created.message,
        createdAt: created.createdAt,
        userUid: req.authUser!.uid,
        userName: req.authUser!.fullName,
      },
    });
  } catch (err) {
    console.error('Post comment error:', err);
    res.status(500).json({ error: 'Unable to post comment' });
  }
});

// 6. Invite / Referral Overview
router.get('/referrals/overview', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const settings = await getAppSettings();
    const today = startOfToday();

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);

    const refRows = await db
      .select({
        id: referrals.id,
        isValid: referrals.isValid,
        invalidReason: referrals.invalidReason,
        createdAt: referrals.createdAt,
        uid: users.uid,
        phone: users.phone,
        fullName: users.fullName,
      })
      .from(referrals)
      .innerJoin(users, eq(referrals.referredUserId, users.id))
      .where(eq(referrals.sponsorUserId, userId))
      .orderBy(desc(referrals.createdAt));

    const totalInvited = refRows.length;
    const todayRegistrations = refRows.filter((r) => new Date(r.createdAt) >= today).length;
    const validReferrals = refRows.filter((r) => r.isValid).length;
    const invalidReferrals = totalInvited - validReferrals;
    const totalReferralEarnings =
      parseFloat(wallet?.totalReferralEarnings ?? '0') +
      parseFloat(wallet?.totalTeamEarnings ?? '0');

    res.json({
      referralCode: req.authUser!.referralCode,
      totalInvited,
      todayRegistrations,
      validReferrals,
      invalidReferrals,
      totalReferralEarnings: roundMoney(totalReferralEarnings),
      rules: {
        referralCommissionPercent: settings.referralCommissionPercent,
        teamCommissionPercent: settings.teamCommissionPercent,
        validReferralMinTasks: settings.validReferralMinTasks,
      },
      recentReferrals: refRows.slice(0, 15).map((r) => ({
        id: r.id,
        uid: r.uid,
        maskedPhone: maskPhone(r.phone),
        fullName: r.fullName,
        isValid: r.isValid,
        invalidReason: r.invalidReason,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('Referral overview error:', err);
    res.status(500).json({ error: 'Unable to load referral overview' });
  }
});

// 7. Team Details
router.get('/team', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const search = String(req.query.search || '').trim().toLowerCase();
    const validity = String(req.query.validity || 'all'); // 'all' | 'valid' | 'invalid'
    const dateFilter = String(req.query.date || ''); // YYYY-MM-DD or ''
    const today = startOfToday();

    const invitedRows = await db
      .select({
        referralId: referrals.id,
        isValid: referrals.isValid,
        invalidReason: referrals.invalidReason,
        memberId: users.id,
        uid: users.uid,
        phone: users.phone,
        fullName: users.fullName,
        status: users.status,
        createdAt: users.createdAt,
        totalTaskEarnings: wallets.totalTaskEarnings,
      })
      .from(referrals)
      .innerJoin(users, eq(referrals.referredUserId, users.id))
      .leftJoin(wallets, eq(users.id, wallets.userId))
      .where(eq(referrals.sponsorUserId, userId))
      .orderBy(desc(users.createdAt));

    const memberIds = invitedRows.map((m) => m.memberId);
    const taskCountsMap = new Map<number, number>();
    const commEarnedMap = new Map<number, number>();

    if (memberIds.length > 0) {
      const subCounts = await db
        .select({
          userId: taskSubmissions.userId,
          total: count(),
        })
        .from(taskSubmissions)
        .where(
          and(
            inArray(taskSubmissions.userId, memberIds),
            inArray(taskSubmissions.status, ['approved', 'completed'])
          )
        )
        .groupBy(taskSubmissions.userId);

      for (const sc of subCounts) taskCountsMap.set(sc.userId, sc.total);

      const commSums = await db
        .select({
          sourceUserId: referralCommissions.sourceUserId,
          total: sql<string>`COALESCE(SUM(CAST(${referralCommissions.amount} AS numeric)), 0)`,
        })
        .from(referralCommissions)
        .where(
          and(
            eq(referralCommissions.sponsorUserId, userId),
            inArray(referralCommissions.sourceUserId, memberIds)
          )
        )
        .groupBy(referralCommissions.sourceUserId);

      for (const cs of commSums) commEarnedMap.set(cs.sourceUserId, parseFloat(cs.total));
    }

    const totalTeamMembers = invitedRows.length;
    const validTeamMembers = invitedRows.filter((m) => m.isValid).length;
    const todayRegistrations = invitedRows.filter((m) => new Date(m.createdAt) >= today).length;

    const members = invitedRows
      .filter((m) => {
        if (validity === 'valid' && !m.isValid) return false;
        if (validity === 'invalid' && m.isValid) return false;
        if (dateFilter) {
          const isoDate = new Date(m.createdAt).toISOString().slice(0, 10);
          if (isoDate !== dateFilter) return false;
        }
        if (search) {
          return (
            m.uid.toLowerCase().includes(search) ||
            m.phone.toLowerCase().includes(search) ||
            m.fullName.toLowerCase().includes(search)
          );
        }
        return true;
      })
      .map((m) => ({
        uid: m.uid,
        maskedPhone: maskPhone(m.phone),
        fullName: m.fullName,
        registeredAt: m.createdAt,
        isToday: new Date(m.createdAt) >= today,
        isValid: m.isValid,
        invalidReason: m.invalidReason,
        completedTasks: taskCountsMap.get(m.memberId) ?? 0,
        totalTaskEarnings: roundMoney(m.totalTaskEarnings ?? '0'),
        commissionEarnedFromUser: roundMoney(commEarnedMap.get(m.memberId) ?? 0),
        status: m.status,
      }));

    res.json({
      summary: {
        totalTeamMembers,
        validTeamMembers,
        todayRegistrations,
      },
      members,
    });
  } catch (err) {
    console.error('Team details error:', err);
    res.status(500).json({ error: 'Unable to load team details' });
  }
});

// 8. Earning Details
router.get('/earnings', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const category = String(req.query.category || 'all');
    const today = startOfToday();
    const weekStart = startOfWeek();

    const earningCategories = [
      'task_reward',
      'referral_commission',
      'team_task_commission',
      'other_reward',
      'money_adding',
    ];

    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.direction, 'credit'),
          inArray(transactions.category, earningCategories)
        )
      )
      .orderBy(desc(transactions.createdAt))
      .limit(200);

    let dailyTotal = 0;
    let weeklyTotal = 0;
    let lifetimeTotal = 0;

    for (const r of rows) {
      if (r.status !== 'completed') continue;
      const amt = parseFloat(r.amount);
      lifetimeTotal += amt;
      if (new Date(r.createdAt) >= weekStart) weeklyTotal += amt;
      if (new Date(r.createdAt) >= today) dailyTotal += amt;
    }

    const filtered = rows
      .filter((r) => {
        if (category === 'all') return true;
        if (category === 'other_reward') {
          return r.category === 'other_reward' || r.category === 'money_adding';
        }
        return r.category === category;
      })
      .map((r) => ({
        id: r.id,
        txCode: r.txCode,
        createdAt: r.createdAt,
        category: r.category,
        relatedUid: r.relatedUid || req.authUser!.uid,
        amount: roundMoney(r.amount),
        status: r.status,
        description: r.description,
      }));

    res.json({
      summaries: {
        daily: roundMoney(dailyTotal),
        weekly: roundMoney(weeklyTotal),
        lifetime: roundMoney(lifetimeTotal),
      },
      earnings: filtered,
    });
  } catch (err) {
    console.error('Earnings detail error:', err);
    res.status(500).json({ error: 'Unable to load earning details' });
  }
});

// 9. Bank & UPI Binding
router.get('/payout-accounts', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)).limit(1);
    const [upi] = await db.select().from(upiAccounts).where(eq(upiAccounts.userId, userId)).limit(1);

    res.json({
      bank: bank
        ? {
            accountHolderName: bank.accountHolderName,
            bankName: bank.bankName,
            accountNumberMasked: maskAccountNumber(bank.accountNumberLast4),
            ifscCode: bank.ifscCode,
            isVerified: bank.isVerified,
            updatedAt: bank.updatedAt,
          }
        : null,
      upi: upi
        ? {
            upiId: upi.upiId,
            holderName: upi.holderName,
            isVerified: upi.isVerified,
            updatedAt: upi.updatedAt,
          }
        : null,
    });
  } catch (err) {
    console.error('Get payout accounts error:', err);
    res.status(500).json({ error: 'Unable to fetch payout accounts' });
  }
});

router.post('/payout-accounts/bank', actionLimiter, async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const { accountHolderName, bankName, accountNumber, confirmAccountNumber, ifscCode } =
      req.body as Record<string, string>;

    if (!accountHolderName?.trim() || !bankName?.trim() || !accountNumber?.trim() || !ifscCode?.trim()) {
      return res.status(400).json({ error: 'All bank account fields are required.' });
    }

    const cleanAcct = accountNumber.replace(/\s+/g, '');
    const cleanConfirm = (confirmAccountNumber || '').replace(/\s+/g, '');
    if (cleanAcct !== cleanConfirm) {
      return res.status(400).json({ error: 'Account number and confirm account number do not match.' });
    }
    if (!/^\d{9,18}$/.test(cleanAcct)) {
      return res.status(400).json({ error: 'Account number must be 9 to 18 digits.' });
    }

    const cleanIfsc = ifscCode.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      return res.status(400).json({ error: 'Enter a valid 11-character IFSC code (e.g. SBIN0001234).' });
    }

    const encrypted = encryptSensitive(cleanAcct);
    const last4 = cleanAcct.slice(-4);

    await db
      .insert(bankAccounts)
      .values({
        userId,
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim(),
        accountNumberEncrypted: encrypted,
        accountNumberLast4: last4,
        ifscCode: cleanIfsc,
        isVerified: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: bankAccounts.userId,
        set: {
          accountHolderName: accountHolderName.trim(),
          bankName: bankName.trim(),
          accountNumberEncrypted: encrypted,
          accountNumberLast4: last4,
          ifscCode: cleanIfsc,
          isVerified: true,
          updatedAt: new Date(),
        },
      });

    await logAudit({
      actorType: 'user',
      actorId: userId,
      action: 'bind_bank',
      targetType: 'bank_accounts',
      targetId: req.authUser!.uid,
      details: { bankName: bankName.trim(), last4 },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Bank account bound securely.',
      bank: {
        accountHolderName: accountHolderName.trim(),
        bankName: bankName.trim(),
        accountNumberMasked: maskAccountNumber(last4),
        ifscCode: cleanIfsc,
        isVerified: true,
      },
    });
  } catch (err) {
    console.error('Bind bank error:', err);
    res.status(500).json({ error: 'Failed to bind bank account' });
  }
});

router.post('/payout-accounts/upi', actionLimiter, async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const { upiId, holderName } = req.body as Record<string, string>;

    const cleanUpi = (upiId || '').trim().toLowerCase();
    if (!/^[a-z0-9.\-_]{2,}@[a-z]{2,}$/.test(cleanUpi)) {
      return res.status(400).json({ error: 'Enter a valid UPI ID (e.g. name@okicici or 9876543210@ybl).' });
    }

    const cleanHolder = (holderName || '').trim() || req.authUser!.fullName;

    await db
      .insert(upiAccounts)
      .values({
        userId,
        upiId: cleanUpi,
        holderName: cleanHolder,
        isVerified: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: upiAccounts.userId,
        set: {
          upiId: cleanUpi,
          holderName: cleanHolder,
          isVerified: true,
          updatedAt: new Date(),
        },
      });

    await logAudit({
      actorType: 'user',
      actorId: userId,
      action: 'bind_upi',
      targetType: 'upi_accounts',
      targetId: req.authUser!.uid,
      details: { upiId: cleanUpi },
      ipAddress: req.ip,
    });

    res.json({
      message: 'UPI ID verified and bound securely.',
      upi: {
        upiId: cleanUpi,
        holderName: cleanHolder,
        isVerified: true,
      },
    });
  } catch (err) {
    console.error('Bind UPI error:', err);
    res.status(500).json({ error: 'Failed to bind UPI ID' });
  }
});

// 10. Withdrawals (Create & List)
router.get('/withdrawals', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const settings = await getAppSettings();
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);

    const rows = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(50);

    res.json({
      balance: roundMoney(wallet?.balance ?? '0'),
      lockedBalance: roundMoney(wallet?.lockedBalance ?? '0'),
      config: {
        minWithdrawal: settings.minWithdrawal,
        maxWithdrawal: settings.maxWithdrawal,
        withdrawalAmounts: settings.withdrawalAmounts,
      },
      withdrawals: rows.map((w) => ({
        id: w.id,
        requestCode: w.requestCode,
        amount: roundMoney(w.amount),
        method: w.method,
        accountLabel:
          w.method === 'upi'
            ? w.accountSnapshot.upiId || 'UPI'
            : `${w.accountSnapshot.bankName || 'Bank'} (${w.accountSnapshot.accountNumberMasked || '••••'})`,
        status: w.status,
        adminRemarks: w.adminRemarks,
        createdAt: w.createdAt,
        processedAt: w.processedAt,
      })),
    });
  } catch (err) {
    console.error('List withdrawals error:', err);
    res.status(500).json({ error: 'Unable to load withdrawal history' });
  }
});

router.post('/withdrawals', actionLimiter, async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const { amount: rawAmount, method } = req.body as { amount?: number; method?: string };
    const amount = Number(rawAmount);

    if (method !== 'bank' && method !== 'upi') {
      return res.status(400).json({ error: 'Select a valid withdrawal method (Bank Transfer or UPI).' });
    }

    const settings = await getAppSettings();
    if (settings.maintenanceMode) {
      return res.status(503).json({ error: 'Withdrawals are paused during maintenance.' });
    }

    if (!Number.isFinite(amount) || amount < settings.minWithdrawal || amount > settings.maxWithdrawal) {
      return res.status(400).json({
        error: `Withdrawal amount must be between ₹${settings.minWithdrawal} and ₹${settings.maxWithdrawal}.`,
      });
    }

    if (
      Array.isArray(settings.withdrawalAmounts) &&
      settings.withdrawalAmounts.length > 0 &&
      !settings.withdrawalAmounts.includes(amount)
    ) {
      return res.status(400).json({
        error: `Please select an allowed withdrawal denomination: ₹${settings.withdrawalAmounts.join(', ₹')}.`,
      });
    }

    const created = await db.transaction(async (tx) => {
      // Prevent duplicate pending withdrawal
      const existingActive = await tx
        .select()
        .from(withdrawals)
        .where(
          and(
            eq(withdrawals.userId, userId),
            inArray(withdrawals.status, ['pending', 'approved', 'processing'])
          )
        )
        .limit(1);

      if (existingActive.length > 0) {
        throw new Error(
          'You already have an active withdrawal request in progress. Wait until it settles before submitting another.'
        );
      }

      let snapshot: {
        accountHolderName?: string;
        bankName?: string;
        accountNumberMasked?: string;
        ifscCode?: string;
        upiId?: string;
      };

      if (method === 'bank') {
        const [bank] = await tx
          .select()
          .from(bankAccounts)
          .where(eq(bankAccounts.userId, userId))
          .limit(1);
        if (!bank) {
          throw new Error('Please bind your Bank Account before requesting a Bank Transfer withdrawal.');
        }
        snapshot = {
          accountHolderName: bank.accountHolderName,
          bankName: bank.bankName,
          accountNumberMasked: maskAccountNumber(bank.accountNumberLast4),
          ifscCode: bank.ifscCode,
        };
      } else {
        const [upi] = await tx
          .select()
          .from(upiAccounts)
          .where(eq(upiAccounts.userId, userId))
          .limit(1);
        if (!upi) {
          throw new Error('Please bind your UPI ID before requesting a UPI withdrawal.');
        }
        snapshot = {
          accountHolderName: upi.holderName,
          upiId: upi.upiId,
        };
      }

      // Atomic conditional balance deduction (prevents race condition double-spend)
      const [currentWallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1);

      const beforeBal = parseFloat(currentWallet?.balance ?? '0');
      if (beforeBal < amount) {
        throw new Error(`Insufficient wallet balance. Available: ₹${roundMoney(beforeBal)}`);
      }

      const updatedWallet = await tx
        .update(wallets)
        .set({
          balance: sql`ROUND((CAST(${wallets.balance} AS numeric) - ${amount})::numeric, 2)::text`,
          lockedBalance: sql`ROUND((CAST(${wallets.lockedBalance} AS numeric) + ${amount})::numeric, 2)::text`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(wallets.userId, userId),
            sql`CAST(${wallets.balance} AS numeric) >= ${amount}`
          )
        )
        .returning();

      if (updatedWallet.length === 0) {
        throw new Error('Insufficient available balance for withdrawal.');
      }

      const requestCode = generateTxCode('WDR');
      const amountStr = roundMoney(amount);
      const afterBal = beforeBal - amount;

      const [wRow] = await tx
        .insert(withdrawals)
        .values({
          requestCode,
          userId,
          amount: amountStr,
          method,
          accountSnapshot: snapshot,
          status: 'pending',
        })
        .returning();

      await tx.insert(transactions).values({
        txCode: generateTxCode('DEB'),
        userId,
        direction: 'debit',
        category: 'withdrawal',
        amount: amountStr,
        balanceBefore: roundMoney(beforeBal),
        balanceAfter: roundMoney(afterBal),
        relatedUid: req.authUser!.uid,
        referenceId: requestCode,
        status: 'pending',
        description: `Withdrawal request via ${method.toUpperCase()} (${requestCode})`,
      });

      await tx.insert(notifications).values({
        userId,
        title: 'Withdrawal Submitted',
        message: `Withdrawal request ${requestCode} for ₹${amountStr} via ${method.toUpperCase()} has been submitted and reserved.`,
        type: 'withdrawal',
      });

      return wRow;
    });

    res.status(201).json({
      message: 'Withdrawal request submitted successfully.',
      withdrawal: {
        id: created.id,
        requestCode: created.requestCode,
        amount: roundMoney(created.amount),
        method: created.method,
        status: created.status,
        createdAt: created.createdAt,
      },
    });
  } catch (err: any) {
    console.error('Create withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Unable to process withdrawal request' });
  }
});

// 11. Transaction History
router.get('/transactions', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const direction = String(req.query.direction || 'all'); // 'all' | 'credit' | 'debit'
    const search = String(req.query.search || '').trim().toLowerCase();

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(200);

    const filtered = rows
      .filter((r) => (direction === 'all' ? true : r.direction === direction))
      .filter((r) =>
        search
          ? r.txCode.toLowerCase().includes(search) ||
            r.description.toLowerCase().includes(search) ||
            r.category.toLowerCase().includes(search)
          : true
      )
      .map((r) => ({
        id: r.id,
        txCode: r.txCode,
        direction: r.direction,
        category: r.category,
        amount: roundMoney(r.amount),
        balanceBefore: roundMoney(r.balanceBefore),
        balanceAfter: roundMoney(r.balanceAfter),
        status: r.status,
        description: r.description,
        createdAt: r.createdAt,
      }));

    res.json({ transactions: filtered });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: 'Unable to load transaction history' });
  }
});

// 12. Notifications
router.get('/notifications', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(40);

    res.json({ notifications: rows });
  } catch (err) {
    console.error('Notifications error:', err);
    res.status(500).json({ error: 'Unable to load notifications' });
  }
});

router.post('/notifications/read-all', async (req: UserRequest, res) => {
  try {
    const userId = req.authUser!.id;
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
    res.json({ success: true });
  } catch (err) {
    console.error('Mark notifications error:', err);
    res.status(500).json({ error: 'Unable to update notifications' });
  }
});

export default router;
