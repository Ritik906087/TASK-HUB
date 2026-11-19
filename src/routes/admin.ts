import express from 'express';
import bcrypt from 'bcryptjs';
import { and, count, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adminUsers,
  bankAccounts,
  notifications,
  referralCommissions,
  referrals,
  taskSubmissions,
  tasks,
  transactions,
  upiAccounts,
  users,
  wallets,
  withdrawals,
} from '../db/schema.ts';
import {
  ensureDatabaseBootstrapped,
  getAppSettings,
  logAudit,
  sanitizeDbError,
  updateAppSetting,
  type AppSettingsMap,
} from '../db/bootstrap.ts';
import { approveSubmissionAtomic } from '../lib/rewards.ts';
import {
  createRateLimiter,
  decryptSensitive,
  generateTxCode,
  issueAdminToken,
  maskAccountNumber,
  roundMoney,
} from '../lib/security.ts';
import { requireAdminAuth, type AdminRequest } from '../middleware/auth.ts';

const router = express.Router();
const adminLoginLimiter = createRateLimiter(60_000, 15, 'admin-login');

// Separate Admin Login
router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    await ensureDatabaseBootstrapped();
    const { username, password } = req.body as { username?: string; password?: string };

    if (!username?.trim() || !password) {
      return res.status(400).json({ error: 'Admin username/email and password are required.' });
    }

    const identifier = username.trim();
    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(or(eq(adminUsers.username, identifier), eq(adminUsers.email, identifier)))
      .limit(1);

    if (!admin) {
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    if (admin.status !== 'active') {
      return res.status(403).json({ error: 'Administrator account is disabled.' });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    await db
      .update(adminUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    const token = issueAdminToken(admin.id, admin.username, admin.role);
    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error('Admin login error:', err);
    const cleaned = sanitizeDbError(err);
    const isDbErr =
      cleaned.includes('not configured') ||
      cleaned.includes('connect') ||
      cleaned.includes('ECONN') ||
      cleaned.includes('ENOTFOUND') ||
      cleaned.includes('ETIMEDOUT') ||
      cleaned.includes('password authentication') ||
      cleaned.includes('does not exist') ||
      cleaned.includes('SSL') ||
      cleaned.includes('Failed query');
    res.status(500).json({
      error: isDbErr ? `Database error: ${cleaned}` : 'Admin login failed',
    });
  }
});

// Protected Admin Routes
router.use(requireAdminAuth);

// 1. Admin Dashboard Overview + Charts
router.get('/dashboard', async (_req: AdminRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalUsersRow] = await db.select({ total: count() }).from(users);
    const [todayRegsRow] = await db
      .select({ total: count() })
      .from(users)
      .where(gte(users.createdAt, today));

    const [validRefsRow] = await db
      .select({ total: count() })
      .from(referrals)
      .where(eq(referrals.isValid, true));

    const [totalTasksRow] = await db.select({ total: count() }).from(tasks);
    const [activeTasksRow] = await db
      .select({ total: count() })
      .from(tasks)
      .where(eq(tasks.isActive, true));

    const [completedTasksRow] = await db
      .select({ total: count() })
      .from(taskSubmissions)
      .where(inArray(taskSubmissions.status, ['approved', 'completed']));

    const [pendingSubmissionsRow] = await db
      .select({ total: count() })
      .from(taskSubmissions)
      .where(inArray(taskSubmissions.status, ['submitted', 'pending_verification']));

    const [taskRewardsRow] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${transactions.amount} AS numeric)), 0)`,
      })
      .from(transactions)
      .where(and(eq(transactions.category, 'task_reward'), eq(transactions.status, 'completed')));

    const [refCommRow] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${referralCommissions.amount} AS numeric)), 0)`,
      })
      .from(referralCommissions)
      .where(eq(referralCommissions.status, 'credited'));

    const [totalWdrCountRow] = await db.select({ total: count() }).from(withdrawals);
    const [pendingWdrRow] = await db
      .select({ total: count() })
      .from(withdrawals)
      .where(inArray(withdrawals.status, ['pending', 'processing']));

    const [approvedWdrRow] = await db
      .select({ total: count() })
      .from(withdrawals)
      .where(inArray(withdrawals.status, ['approved', 'paid']));

    const [totalWdrAmountRow] = await db
      .select({
        total: sql<string>`COALESCE(SUM(CAST(${withdrawals.amount} AS numeric)), 0)`,
      })
      .from(withdrawals)
      .where(inArray(withdrawals.status, ['approved', 'paid']));

    // 7-day chart activity
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const recentUsers = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(gte(users.createdAt, sevenDaysAgo));

    const recentSubs = await db
      .select({ submittedAt: taskSubmissions.submittedAt, status: taskSubmissions.status })
      .from(taskSubmissions)
      .where(gte(taskSubmissions.submittedAt, sevenDaysAgo));

    const recentWdrs = await db
      .select({ createdAt: withdrawals.createdAt, amount: withdrawals.amount })
      .from(withdrawals)
      .where(gte(withdrawals.createdAt, sevenDaysAgo));

    const chartDays: {
      date: string;
      label: string;
      registrations: number;
      submissions: number;
      withdrawalAmount: number;
    }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      chartDays.push({
        date: iso,
        label,
        registrations: recentUsers.filter((u) => new Date(u.createdAt).toISOString().slice(0, 10) === iso).length,
        submissions: recentSubs.filter((s) => new Date(s.submittedAt).toISOString().slice(0, 10) === iso).length,
        withdrawalAmount: recentWdrs
          .filter((w) => new Date(w.createdAt).toISOString().slice(0, 10) === iso)
          .reduce((acc, w) => acc + parseFloat(w.amount), 0),
      });
    }

    const categoryRows = await db
      .select({
        category: tasks.category,
        total: count(),
      })
      .from(tasks)
      .groupBy(tasks.category);

    res.json({
      kpis: {
        totalUsers: totalUsersRow?.total ?? 0,
        todayRegistrations: todayRegsRow?.total ?? 0,
        totalValidReferrals: validRefsRow?.total ?? 0,
        totalTasks: totalTasksRow?.total ?? 0,
        activeTasks: activeTasksRow?.total ?? 0,
        completedTasks: completedTasksRow?.total ?? 0,
        pendingSubmissions: pendingSubmissionsRow?.total ?? 0,
        totalTaskRewards: roundMoney(taskRewardsRow?.total ?? '0'),
        totalReferralCommission: roundMoney(refCommRow?.total ?? '0'),
        totalWithdrawalRequests: totalWdrCountRow?.total ?? 0,
        pendingWithdrawals: pendingWdrRow?.total ?? 0,
        approvedWithdrawals: approvedWdrRow?.total ?? 0,
        totalWithdrawalAmount: roundMoney(totalWdrAmountRow?.total ?? '0'),
      },
      chartSeries: chartDays,
      categoryBreakdown: categoryRows,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Unable to load admin metrics' });
  }
});

// 2. Users Management
router.get('/users', async (req: AdminRequest, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || 'all');

    const rows = await db
      .select({
        id: users.id,
        uid: users.uid,
        phone: users.phone,
        fullName: users.fullName,
        referralCode: users.referralCode,
        referredByUserId: users.referredByUserId,
        referralValid: users.referralValid,
        status: users.status,
        createdAt: users.createdAt,
        balance: wallets.balance,
        lockedBalance: wallets.lockedBalance,
        totalTaskEarnings: wallets.totalTaskEarnings,
        totalReferralEarnings: wallets.totalReferralEarnings,
        totalTeamEarnings: wallets.totalTeamEarnings,
        totalWithdrawn: wallets.totalWithdrawn,
      })
      .from(users)
      .leftJoin(wallets, eq(users.id, wallets.userId))
      .orderBy(desc(users.createdAt));

    const filtered = rows
      .filter((u) => (statusFilter === 'all' ? true : u.status === statusFilter))
      .filter((u) =>
        search
          ? u.uid.toLowerCase().includes(search) ||
            u.phone.toLowerCase().includes(search) ||
            u.referralCode.toLowerCase().includes(search) ||
            u.fullName.toLowerCase().includes(search)
          : true
      )
      .map((u) => ({
        ...u,
        balance: roundMoney(u.balance ?? '0'),
        lockedBalance: roundMoney(u.lockedBalance ?? '0'),
        totalEarnings: roundMoney(
          parseFloat(u.totalTaskEarnings ?? '0') +
            parseFloat(u.totalReferralEarnings ?? '0') +
            parseFloat(u.totalTeamEarnings ?? '0')
        ),
        totalWithdrawn: roundMoney(u.totalWithdrawn ?? '0'),
      }));

    res.json({ users: filtered });
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Unable to load users' });
  }
});

router.get('/users/:id', async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid user ID' });

    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, id)).limit(1);
    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, id)).limit(1);
    const [upi] = await db.select().from(upiAccounts).where(eq(upiAccounts.userId, id)).limit(1);

    let sponsorUid: string | null = null;
    if (user.referredByUserId) {
      const [sp] = await db
        .select({ uid: users.uid })
        .from(users)
        .where(eq(users.id, user.referredByUserId))
        .limit(1);
      sponsorUid = sp?.uid ?? null;
    }

    const team = await db
      .select({
        uid: users.uid,
        phone: users.phone,
        isValid: referrals.isValid,
        createdAt: referrals.createdAt,
      })
      .from(referrals)
      .innerJoin(users, eq(referrals.referredUserId, users.id))
      .where(eq(referrals.sponsorUserId, id))
      .orderBy(desc(referrals.createdAt));

    const completedTasks = await db
      .select({
        id: taskSubmissions.id,
        taskTitle: tasks.title,
        status: taskSubmissions.status,
        rewardCredited: taskSubmissions.rewardCredited,
        submittedAt: taskSubmissions.submittedAt,
      })
      .from(taskSubmissions)
      .innerJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .where(eq(taskSubmissions.userId, id))
      .orderBy(desc(taskSubmissions.submittedAt))
      .limit(30);

    const userTx = await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, id))
      .orderBy(desc(transactions.createdAt))
      .limit(30);

    const userWithdrawals = await db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, id))
      .orderBy(desc(withdrawals.createdAt))
      .limit(30);

    res.json({
      user: {
        id: user.id,
        uid: user.uid,
        phone: user.phone,
        fullName: user.fullName,
        referralCode: user.referralCode,
        sponsorUid,
        referralValid: user.referralValid,
        status: user.status,
        createdAt: user.createdAt,
      },
      wallet: {
        balance: roundMoney(wallet?.balance ?? '0'),
        lockedBalance: roundMoney(wallet?.lockedBalance ?? '0'),
        totalTaskEarnings: roundMoney(wallet?.totalTaskEarnings ?? '0'),
        totalReferralEarnings: roundMoney(wallet?.totalReferralEarnings ?? '0'),
        totalTeamEarnings: roundMoney(wallet?.totalTeamEarnings ?? '0'),
        totalOtherRewards: roundMoney(wallet?.totalOtherRewards ?? '0'),
        totalWithdrawn: roundMoney(wallet?.totalWithdrawn ?? '0'),
      },
      bank: bank
        ? {
            accountHolderName: bank.accountHolderName,
            bankName: bank.bankName,
            accountNumberMasked: maskAccountNumber(bank.accountNumberLast4),
            ifscCode: bank.ifscCode,
          }
        : null,
      upi: upi ? { upiId: upi.upiId, holderName: upi.holderName } : null,
      team,
      completedTasks,
      transactions: userTx,
      withdrawals: userWithdrawals,
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ error: 'Unable to load user details' });
  }
});

router.patch('/users/:id/status', async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body as { status?: string };
    if (status !== 'active' && status !== 'blocked') {
      return res.status(400).json({ error: 'Status must be active or blocked' });
    }

    await db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, id));

    await logAudit({
      actorType: 'admin',
      actorId: req.authAdmin!.id,
      action: status === 'blocked' ? 'block_user' : 'unblock_user',
      targetType: 'users',
      targetId: String(id),
      ipAddress: req.ip,
    });

    res.json({ success: true, status });
  } catch (err) {
    console.error('Toggle user status error:', err);
    res.status(500).json({ error: 'Unable to update user status' });
  }
});

// Manual Balance Add / Deduct (Audited)
router.post('/users/:id/balance', async (req: AdminRequest, res) => {
  try {
    const userId = Number(req.params.id);
    const { type, amount: rawAmount, reason } = req.body as {
      type?: 'add' | 'deduct';
      amount?: number;
      reason?: string;
    };

    const amount = Number(rawAmount);
    if ((type !== 'add' && type !== 'deduct') || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Provide valid adjustment type (add/deduct) and positive amount.' });
    }
    if (!reason?.trim()) {
      return res.status(400).json({ error: 'Adjustment reason is required for audit trail.' });
    }

    const result = await db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) throw new Error('User not found');

      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
      const before = parseFloat(wallet?.balance ?? '0');

      if (type === 'deduct' && before < amount) {
        throw new Error(`Cannot deduct ₹${roundMoney(amount)}. User balance is ₹${roundMoney(before)}.`);
      }

      const after = type === 'add' ? before + amount : before - amount;

      await tx
        .update(wallets)
        .set({
          balance: roundMoney(after),
          totalOtherRewards:
            type === 'add'
              ? roundMoney(parseFloat(wallet?.totalOtherRewards ?? '0') + amount)
              : wallet?.totalOtherRewards ?? '0.00',
          updatedAt: new Date(),
        })
        .where(eq(wallets.userId, userId));

      const txCode = generateTxCode(type === 'add' ? 'ADM' : 'ADJ');

      await tx.insert(transactions).values({
        txCode,
        userId,
        direction: type === 'add' ? 'credit' : 'debit',
        category: type === 'add' ? 'money_adding' : 'admin_deduction',
        amount: roundMoney(amount),
        balanceBefore: roundMoney(before),
        balanceAfter: roundMoney(after),
        relatedUid: user.uid,
        status: 'completed',
        description: `Admin adjustment: ${reason.trim()}`,
        createdByAdminId: req.authAdmin!.id,
      });

      await tx.insert(notifications).values({
        userId,
        title: type === 'add' ? 'Wallet Credited by Admin' : 'Wallet Adjusted by Admin',
        message: `${type === 'add' ? '+' : '-'}₹${roundMoney(amount)} (${reason.trim()})`,
        type: 'system',
      });

      return { balance: roundMoney(after), txCode };
    });

    await logAudit({
      actorType: 'admin',
      actorId: req.authAdmin!.id,
      action: `balance_${type}`,
      targetType: 'wallets',
      targetId: String(userId),
      details: { amount, reason: reason.trim(), txCode: result.txCode },
      ipAddress: req.ip,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Manual balance adjustment error:', err);
    res.status(400).json({ error: err.message || 'Balance adjustment failed' });
  }
});

// 3. Task Management
router.get('/tasks', async (_req: AdminRequest, res) => {
  try {
    const rows = await db.select().from(tasks).orderBy(desc(tasks.createdAt));
    res.json({
      tasks: rows.map((t) => ({
        ...t,
        rewardAmount: roundMoney(t.rewardAmount),
      })),
    });
  } catch (err) {
    console.error('Admin list tasks error:', err);
    res.status(500).json({ error: 'Unable to fetch tasks' });
  }
});

router.post('/tasks', async (req: AdminRequest, res) => {
  try {
    const {
      title,
      category,
      iconUrl,
      description,
      instructions,
      externalLink,
      rewardAmount,
      videoUrls,
      photoUrls,
      dailyLimit,
      totalLimit,
      isActive,
    } = req.body;

    if (!title?.trim() || !category || !description?.trim() || !externalLink?.trim()) {
      return res.status(400).json({ error: 'Title, category, description, and external link are required.' });
    }

    const rewardNum = Number(rewardAmount);
    if (!Number.isFinite(rewardNum) || rewardNum <= 0) {
      return res.status(400).json({ error: 'Reward amount must be greater than 0.' });
    }

    const [created] = await db
      .insert(tasks)
      .values({
        title: title.trim(),
        category,
        iconUrl: iconUrl || '/icon.svg',
        description: description.trim(),
        instructions: (instructions || description).trim(),
        externalLink: externalLink.trim(),
        rewardAmount: roundMoney(rewardNum),
        videoUrls: Array.isArray(videoUrls) ? videoUrls.filter(Boolean) : [],
        photoUrls: Array.isArray(photoUrls) ? photoUrls.filter(Boolean) : [],
        dailyLimit: Number(dailyLimit) || 100,
        totalLimit: Number(totalLimit) || 5000,
        isActive: isActive !== false,
        createdByAdminId: req.authAdmin!.id,
      })
      .returning();

    await logAudit({
      actorType: 'admin',
      actorId: req.authAdmin!.id,
      action: 'create_task',
      targetType: 'tasks',
      targetId: String(created.id),
      details: { title: created.title, reward: created.rewardAmount },
      ipAddress: req.ip,
    });

    res.status(201).json({ task: created });
  } catch (err) {
    console.error('Admin create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

router.put('/tasks/:id', async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    const {
      title,
      category,
      iconUrl,
      description,
      instructions,
      externalLink,
      rewardAmount,
      videoUrls,
      photoUrls,
      dailyLimit,
      totalLimit,
      isActive,
    } = req.body;

    const [updated] = await db
      .update(tasks)
      .set({
        title: title?.trim(),
        category,
        iconUrl: iconUrl || '/icon.svg',
        description: description?.trim(),
        instructions: (instructions || description || '').trim(),
        externalLink: externalLink?.trim(),
        rewardAmount: roundMoney(Number(rewardAmount)),
        videoUrls: Array.isArray(videoUrls) ? videoUrls.filter(Boolean) : [],
        photoUrls: Array.isArray(photoUrls) ? photoUrls.filter(Boolean) : [],
        dailyLimit: Number(dailyLimit) || 100,
        totalLimit: Number(totalLimit) || 5000,
        isActive: Boolean(isActive),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Task not found' });

    await logAudit({
      actorType: 'admin',
      actorId: req.authAdmin!.id,
      action: 'update_task',
      targetType: 'tasks',
      targetId: String(id),
      ipAddress: req.ip,
    });

    res.json({ task: updated });
  } catch (err) {
    console.error('Admin update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.patch('/tasks/:id/toggle', async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const [updated] = await db
      .update(tasks)
      .set({ isActive: !existing.isActive, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();

    res.json({ task: updated });
  } catch (err) {
    console.error('Toggle task error:', err);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
});

router.delete('/tasks/:id', async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(tasks).where(eq(tasks.id, id));
    await logAudit({
      actorType: 'admin',
      actorId: req.authAdmin!.id,
      action: 'delete_task',
      targetType: 'tasks',
      targetId: String(id),
      ipAddress: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// 4. Task Submissions Verification Queue
router.get('/submissions', async (req: AdminRequest, res) => {
  try {
    const statusFilter = String(req.query.status || 'all');
    const rows = await db
      .select({
        id: taskSubmissions.id,
        status: taskSubmissions.status,
        proofText: taskSubmissions.proofText,
        proofFileUrl: taskSubmissions.proofFileUrl,
        linkVisited: taskSubmissions.linkVisited,
        rewardCredited: taskSubmissions.rewardCredited,
        adminRemarks: taskSubmissions.adminRemarks,
        submittedAt: taskSubmissions.submittedAt,
        reviewedAt: taskSubmissions.reviewedAt,
        taskId: tasks.id,
        taskTitle: tasks.title,
        taskReward: tasks.rewardAmount,
        userUid: users.uid,
        userPhone: users.phone,
        userName: users.fullName,
      })
      .from(taskSubmissions)
      .innerJoin(tasks, eq(taskSubmissions.taskId, tasks.id))
      .innerJoin(users, eq(taskSubmissions.userId, users.id))
      .orderBy(desc(taskSubmissions.submittedAt))
      .limit(150);

    const filtered = rows.filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter));
    res.json({ submissions: filtered });
  } catch (err) {
    console.error('Admin submissions error:', err);
    res.status(500).json({ error: 'Unable to load submissions' });
  }
});

router.post('/submissions/:id/review', async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action, remarks } = req.body as { action?: 'approve' | 'reject'; remarks?: string };

    if (action === 'approve') {
      const result = await approveSubmissionAtomic({
        submissionId: id,
        adminId: req.authAdmin!.id,
        remarks: remarks || 'Verified by administrator',
      });
      await logAudit({
        actorType: 'admin',
        actorId: req.authAdmin!.id,
        action: 'approve_submission',
        targetType: 'task_submissions',
        targetId: String(id),
        details: result,
        ipAddress: req.ip,
      });
      return res.json({ success: true, ...result });
    }

    if (action === 'reject') {
      const [sub] = await db
        .select()
        .from(taskSubmissions)
        .where(eq(taskSubmissions.id, id))
        .limit(1);

      if (!sub) return res.status(404).json({ error: 'Submission not found' });
      if (sub.status === 'approved' || sub.status === 'completed') {
        return res.status(400).json({ error: 'Cannot reject an already approved submission' });
      }

      await db
        .update(taskSubmissions)
        .set({
          status: 'rejected',
          adminRemarks: remarks || 'Submission proof did not meet task instructions',
          reviewedByAdminId: req.authAdmin!.id,
          reviewedAt: new Date(),
        })
        .where(eq(taskSubmissions.id, id));

      await db.insert(notifications).values({
        userId: sub.userId,
        title: 'Task Submission Rejected',
        message: remarks || 'Your task proof could not be verified. Review instructions and resubmit.',
        type: 'task',
      });

      return res.json({ success: true });
    }

    res.status(400).json({ error: 'Invalid review action' });
  } catch (err: any) {
    console.error('Review submission error:', err);
    res.status(400).json({ error: err.message || 'Review failed' });
  }
});

// 5. Withdrawal Management
router.get('/withdrawals', async (req: AdminRequest, res) => {
  try {
    const statusFilter = String(req.query.status || 'all');
    const search = String(req.query.search || '').trim().toLowerCase();

    const rows = await db
      .select({
        id: withdrawals.id,
        requestCode: withdrawals.requestCode,
        amount: withdrawals.amount,
        method: withdrawals.method,
        accountSnapshot: withdrawals.accountSnapshot,
        status: withdrawals.status,
        adminRemarks: withdrawals.adminRemarks,
        createdAt: withdrawals.createdAt,
        processedAt: withdrawals.processedAt,
        userId: users.id,
        userUid: users.uid,
        userPhone: users.phone,
        userName: users.fullName,
        bankEncrypted: bankAccounts.accountNumberEncrypted,
        bankHolder: bankAccounts.accountHolderName,
        bankName: bankAccounts.bankName,
        bankIfsc: bankAccounts.ifscCode,
        upiId: upiAccounts.upiId,
      })
      .from(withdrawals)
      .innerJoin(users, eq(withdrawals.userId, users.id))
      .leftJoin(bankAccounts, eq(users.id, bankAccounts.userId))
      .leftJoin(upiAccounts, eq(users.id, upiAccounts.userId))
      .orderBy(desc(withdrawals.createdAt))
      .limit(200);

    const filtered = rows
      .filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter))
      .filter((r) =>
        search
          ? r.userUid.toLowerCase().includes(search) ||
            r.userPhone.toLowerCase().includes(search) ||
            r.requestCode.toLowerCase().includes(search)
          : true
      )
      .map((r) => {
        let payoutDetails = '';
        if (r.method === 'upi') {
          payoutDetails = `UPI: ${r.accountSnapshot.upiId || r.upiId || 'N/A'}`;
        } else {
          const decryptedAcct = r.bankEncrypted ? decryptSensitive(r.bankEncrypted) : '';
          payoutDetails = `${r.accountSnapshot.bankName || r.bankName || 'Bank'} · A/C: ${
            decryptedAcct || r.accountSnapshot.accountNumberMasked || 'N/A'
          } · IFSC: ${r.accountSnapshot.ifscCode || r.bankIfsc || 'N/A'} · Holder: ${
            r.accountSnapshot.accountHolderName || r.bankHolder || r.userName
          }`;
        }
        return {
          id: r.id,
          requestCode: r.requestCode,
          userId: r.userId,
          userUid: r.userUid,
          userPhone: r.userPhone,
          userName: r.userName,
          amount: roundMoney(r.amount),
          method: r.method,
          payoutDetails,
          status: r.status,
          adminRemarks: r.adminRemarks,
          createdAt: r.createdAt,
          processedAt: r.processedAt,
        };
      });

    res.json({ withdrawals: filtered });
  } catch (err) {
    console.error('Admin withdrawals error:', err);
    res.status(500).json({ error: 'Unable to fetch withdrawals' });
  }
});

router.post('/withdrawals/:id/process', async (req: AdminRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action, remarks } = req.body as {
      action?: 'approve' | 'processing' | 'paid' | 'reject';
      remarks?: string;
    };

    if (!action || !['approve', 'processing', 'paid', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid withdrawal action' });
    }

    const updated = await db.transaction(async (tx) => {
      const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, id)).limit(1);
      if (!w) throw new Error('Withdrawal request not found');

      if (w.status === 'paid' || w.status === 'rejected') {
        throw new Error(`Withdrawal is already finalized (${w.status}).`);
      }

      const amount = parseFloat(w.amount);
      const [user] = await tx.select().from(users).where(eq(users.id, w.userId)).limit(1);

      if (action === 'approve' || action === 'processing') {
        const nextStatus = action === 'approve' ? 'approved' : 'processing';
        const [resW] = await tx
          .update(withdrawals)
          .set({
            status: nextStatus,
            adminRemarks: remarks?.trim() || w.adminRemarks,
            processedByAdminId: req.authAdmin!.id,
            updatedAt: new Date(),
          })
          .where(eq(withdrawals.id, id))
          .returning();

        await tx.insert(notifications).values({
          userId: w.userId,
          title: `Withdrawal ${nextStatus === 'approved' ? 'Approved' : 'Processing'}`,
          message: `Request ${w.requestCode} (₹${roundMoney(w.amount)}) is now ${nextStatus}.`,
          type: 'withdrawal',
        });

        return resW;
      }

      if (action === 'paid') {
        // Never mark paid without explicit admin authorization (verified by middleware + this action)
        const [resW] = await tx
          .update(withdrawals)
          .set({
            status: 'paid',
            adminRemarks: remarks?.trim() || 'Payout transferred successfully',
            processedByAdminId: req.authAdmin!.id,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(withdrawals.id, id))
          .returning();

        await tx
          .update(wallets)
          .set({
            lockedBalance: sql`GREATEST(0, ROUND((CAST(${wallets.lockedBalance} AS numeric) - ${amount})::numeric, 2))::text`,
            totalWithdrawn: sql`ROUND((CAST(${wallets.totalWithdrawn} AS numeric) + ${amount})::numeric, 2)::text`,
            updatedAt: new Date(),
          })
          .where(eq(wallets.userId, w.userId));

        await tx
          .update(transactions)
          .set({ status: 'completed' })
          .where(eq(transactions.referenceId, w.requestCode));

        await tx.insert(notifications).values({
          userId: w.userId,
          title: 'Withdrawal Paid',
          message: `₹${roundMoney(w.amount)} for ${w.requestCode} has been paid via ${w.method.toUpperCase()}.`,
          type: 'withdrawal',
        });

        return resW;
      }

      // action === 'reject' -> refund reserved balance back to user atomically
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, w.userId)).limit(1);
      const beforeBal = parseFloat(wallet?.balance ?? '0');
      const afterBal = beforeBal + amount;

      const [resW] = await tx
        .update(withdrawals)
        .set({
          status: 'rejected',
          adminRemarks: remarks?.trim() || 'Withdrawal rejected and refunded to wallet',
          processedByAdminId: req.authAdmin!.id,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(withdrawals.id, id))
        .returning();

      await tx
        .update(wallets)
        .set({
          balance: roundMoney(afterBal),
          lockedBalance: sql`GREATEST(0, ROUND((CAST(${wallets.lockedBalance} AS numeric) - ${amount})::numeric, 2))::text`,
          updatedAt: new Date(),
        })
        .where(eq(wallets.userId, w.userId));

      await tx
        .update(transactions)
        .set({ status: 'refunded' })
        .where(eq(transactions.referenceId, w.requestCode));

      await tx.insert(transactions).values({
        txCode: generateTxCode('RFD'),
        userId: w.userId,
        direction: 'credit',
        category: 'withdrawal_refund',
        amount: roundMoney(amount),
        balanceBefore: roundMoney(beforeBal),
        balanceAfter: roundMoney(afterBal),
        relatedUid: user?.uid ?? null,
        referenceId: w.requestCode,
        status: 'completed',
        description: `Refund for rejected withdrawal ${w.requestCode}${remarks ? `: ${remarks}` : ''}`,
        createdByAdminId: req.authAdmin!.id,
      });

      await tx.insert(notifications).values({
        userId: w.userId,
        title: 'Withdrawal Rejected & Refunded',
        message: `Request ${w.requestCode} was rejected (${remarks || 'Verification issue'}). ₹${roundMoney(amount)} has been refunded to your wallet.`,
        type: 'withdrawal',
      });

      return resW;
    });

    await logAudit({
      actorType: 'admin',
      actorId: req.authAdmin!.id,
      action: `withdrawal_${action}`,
      targetType: 'withdrawals',
      targetId: String(id),
      details: { remarks },
      ipAddress: req.ip,
    });

    res.json({ withdrawal: updated });
  } catch (err: any) {
    console.error('Process withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Unable to process withdrawal' });
  }
});

// 6. Referral Management
router.get('/referrals', async (_req: AdminRequest, res) => {
  try {
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const refRows = await db.select().from(referrals).orderBy(desc(referrals.createdAt)).limit(200);
    const commRows = await db
      .select()
      .from(referralCommissions)
      .orderBy(desc(referralCommissions.createdAt))
      .limit(200);

    const relationships = refRows.map((r) => {
      const sponsor = userMap.get(r.sponsorUserId);
      const member = userMap.get(r.referredUserId);
      return {
        id: r.id,
        sponsorUid: sponsor?.uid ?? 'Unknown',
        sponsorPhone: sponsor?.phone ?? '',
        memberUid: member?.uid ?? 'Unknown',
        memberPhone: member?.phone ?? '',
        referralCodeUsed: r.referralCodeUsed,
        isValid: r.isValid,
        invalidReason: r.invalidReason,
        createdAt: r.createdAt,
      };
    });

    const commissions = commRows.map((c) => {
      const sponsor = userMap.get(c.sponsorUserId);
      const source = userMap.get(c.sourceUserId);
      return {
        id: c.id,
        sponsorUid: sponsor?.uid ?? 'Unknown',
        sourceUid: source?.uid ?? 'Unknown',
        sourceType: c.sourceType,
        level: c.level,
        ratePercent: c.ratePercent,
        amount: roundMoney(c.amount),
        status: c.status,
        createdAt: c.createdAt,
      };
    });

    res.json({ relationships, commissions });
  } catch (err) {
    console.error('Admin referrals error:', err);
    res.status(500).json({ error: 'Unable to load referral data' });
  }
});

// 7. Transaction Management
router.get('/transactions', async (req: AdminRequest, res) => {
  try {
    const direction = String(req.query.direction || 'all');
    const category = String(req.query.category || 'all');
    const search = String(req.query.search || '').trim().toLowerCase();

    const rows = await db
      .select({
        id: transactions.id,
        txCode: transactions.txCode,
        direction: transactions.direction,
        category: transactions.category,
        amount: transactions.amount,
        balanceBefore: transactions.balanceBefore,
        balanceAfter: transactions.balanceAfter,
        relatedUid: transactions.relatedUid,
        referenceId: transactions.referenceId,
        status: transactions.status,
        description: transactions.description,
        createdAt: transactions.createdAt,
        userUid: users.uid,
        userPhone: users.phone,
      })
      .from(transactions)
      .innerJoin(users, eq(transactions.userId, users.id))
      .orderBy(desc(transactions.createdAt))
      .limit(300);

    const filtered = rows
      .filter((r) => (direction === 'all' ? true : r.direction === direction))
      .filter((r) => (category === 'all' ? true : r.category === category))
      .filter((r) =>
        search
          ? r.txCode.toLowerCase().includes(search) ||
            r.userUid.toLowerCase().includes(search) ||
            r.userPhone.toLowerCase().includes(search) ||
            r.description.toLowerCase().includes(search)
          : true
      )
      .map((r) => ({
        ...r,
        amount: roundMoney(r.amount),
      }));

    res.json({ transactions: filtered });
  } catch (err) {
    console.error('Admin transactions error:', err);
    res.status(500).json({ error: 'Unable to load transactions' });
  }
});

// 8. Admin Settings
router.get('/settings', async (_req: AdminRequest, res) => {
  try {
    const settings = await getAppSettings();
    res.json({ settings });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Unable to load settings' });
  }
});

router.put('/settings', async (req: AdminRequest, res) => {
  try {
    const incoming = req.body as Partial<AppSettingsMap>;
    const allowedKeys: (keyof AppSettingsMap)[] = [
      'minWithdrawal',
      'maxWithdrawal',
      'withdrawalAmounts',
      'referralRequired',
      'referralCommissionPercent',
      'teamCommissionPercent',
      'validReferralMinTasks',
      'signupBonus',
      'registrationEnabled',
      'maintenanceMode',
      'autoApproveTasks',
    ];

    for (const key of allowedKeys) {
      if (incoming[key] !== undefined) {
        await updateAppSetting(key, incoming[key], req.authAdmin!.id);
      }
    }

    await logAudit({
      actorType: 'admin',
      actorId: req.authAdmin!.id,
      action: 'update_settings',
      targetType: 'app_settings',
      targetId: 'global',
      details: incoming as Record<string, unknown>,
      ipAddress: req.ip,
    });

    const updated = await getAppSettings();
    res.json({ settings: updated });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Unable to save settings' });
  }
});

export default router;
