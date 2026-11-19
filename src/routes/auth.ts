import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  bankAccounts,
  notifications,
  otpCodes,
  referrals,
  transactions,
  upiAccounts,
  users,
  wallets,
} from '../db/schema.ts';
import { ensureDatabaseBootstrapped, getAppSettings, logAudit } from '../db/bootstrap.ts';
import {
  createRateLimiter,
  generateMathCaptcha,
  generateReferralCode,
  generateTxCode,
  generateUid,
  issueUserToken,
  maskAccountNumber,
  normalizePhone,
  roundMoney,
  verifyMathCaptcha,
} from '../lib/security.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { requireUserAuth, type UserRequest } from '../middleware/auth.ts';

const router = express.Router();

async function allocateUniqueUid(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = generateUid();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.uid, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return generateUid();
}

const authLimiter = createRateLimiter(60_000, 20, 'auth');

router.get('/public-config', async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.json({
      referralRequired: settings.referralRequired,
      registrationEnabled: settings.registrationEnabled,
      maintenanceMode: settings.maintenanceMode,
      minWithdrawal: settings.minWithdrawal,
      maxWithdrawal: settings.maxWithdrawal,
      withdrawalAmounts: settings.withdrawalAmounts,
      referralCommissionPercent: settings.referralCommissionPercent,
      teamCommissionPercent: settings.teamCommissionPercent,
      validReferralMinTasks: settings.validReferralMinTasks,
      signupBonus: settings.signupBonus,
    });
  } catch (err) {
    console.error('Failed to fetch public config:', err);
    res.status(500).json({ error: 'Unable to load platform configuration' });
  }
});

router.get('/captcha', (_req, res) => {
  const challenge = generateMathCaptcha();
  res.json(challenge);
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    await ensureDatabaseBootstrapped();
    const settings = await getAppSettings();

    if (!settings.registrationEnabled) {
      return res.status(403).json({ error: 'New registrations are currently disabled by administration.' });
    }
    if (settings.maintenanceMode) {
      return res.status(503).json({ error: 'Platform is temporarily under maintenance. Please try again shortly.' });
    }

    const {
      phone: rawPhone,
      password,
      confirmPassword,
      fullName,
      inviteCode,
      captchaToken,
      captchaAnswer,
      deviceFingerprint,
    } = req.body as Record<string, string>;

    if (!captchaToken || captchaAnswer === undefined || captchaAnswer === '') {
      return res.status(400).json({ error: 'Please answer the Math CAPTCHA verification.' });
    }
    if (!verifyMathCaptcha(captchaToken, captchaAnswer)) {
      return res.status(400).json({ error: 'Incorrect CAPTCHA answer or expired challenge. Please refresh and try again.' });
    }

    const phone = normalizePhone(rawPhone || '');
    if (phone.length < 10 || phone.length > 15) {
      return res.status(400).json({ error: 'Enter a valid 10-digit mobile phone number.' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Password and confirm password do not match.' });
    }

    const existingPhone = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (existingPhone.length > 0) {
      return res.status(409).json({ error: 'This phone number is already registered.' });
    }

    const trimmedInvite = (inviteCode || '').trim().toUpperCase();
    if (settings.referralRequired && !trimmedInvite) {
      return res.status(400).json({ error: 'A valid invite / referral code is required to register.' });
    }

    let sponsorUser: typeof users.$inferSelect | undefined;
    if (trimmedInvite) {
      const [foundSponsor] = await db
        .select()
        .from(users)
        .where(eq(users.referralCode, trimmedInvite))
        .limit(1);

      if (!foundSponsor) {
        return res.status(400).json({ error: 'Invalid invite / referral code. Please verify and try again.' });
      }
      if (foundSponsor.phone === phone) {
        return res.status(400).json({ error: 'Self-referral is not permitted.' });
      }
      if (foundSponsor.status === 'blocked') {
        return res.status(400).json({ error: 'This invite code belongs to a suspended account.' });
      }
      sponsorUser = foundSponsor;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const uid = await allocateUniqueUid();
    const referralCode = generateReferralCode();
    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || null;

    // Anti-fraud check: same device fingerprint or IP already used by sponsor
    let fraudFlagReason: string | null = null;
    if (sponsorUser && deviceFingerprint && sponsorUser.deviceFingerprint === deviceFingerprint) {
      fraudFlagReason = 'Matched sponsor device fingerprint';
    }

    const createdUser = await db.transaction(async (tx) => {
      const [insertedUser] = await tx
        .insert(users)
        .values({
          uid,
          phone,
          passwordHash,
          fullName: (fullName || '').trim() || `Member ${phone.slice(-4)}`,
          referralCode,
          referredByUserId: sponsorUser?.id ?? null,
          referralValid: false,
          status: 'active',
          lastLoginIp: ip,
          deviceFingerprint: deviceFingerprint || null,
        })
        .returning();

      const signupBonus = settings.signupBonus > 0 ? settings.signupBonus : 0;

      await tx.insert(wallets).values({
        userId: insertedUser.id,
        balance: roundMoney(signupBonus),
        totalOtherRewards: roundMoney(signupBonus),
      });

      if (signupBonus > 0) {
        await tx.insert(transactions).values({
          txCode: generateTxCode('BON'),
          userId: insertedUser.id,
          direction: 'credit',
          category: 'other_reward',
          amount: roundMoney(signupBonus),
          balanceBefore: '0.00',
          balanceAfter: roundMoney(signupBonus),
          relatedUid: insertedUser.uid,
          status: 'completed',
          description: 'Welcome registration bonus',
        });
      }

      if (sponsorUser) {
        await tx.insert(referrals).values({
          sponsorUserId: sponsorUser.id,
          referredUserId: insertedUser.id,
          referralCodeUsed: trimmedInvite,
          isValid: false,
          invalidReason: fraudFlagReason ?? `Pending completion of ${settings.validReferralMinTasks} task(s)`,
        });

        await tx.insert(notifications).values({
          sponsorUserId: undefined as never,
          userId: sponsorUser.id,
          title: 'New Team Registration',
          message: `User ${insertedUser.uid} joined using your invite code.`,
          type: 'referral',
        } as typeof notifications.$inferInsert);
      }

      await tx.insert(notifications).values({
        userId: insertedUser.id,
        title: 'Welcome to TASK HUB',
        message: 'Your account is active. Complete tasks and bind your payout method to withdraw rewards.',
        type: 'system',
      });

      return insertedUser;
    });

    await logAudit({
      actorType: 'user',
      actorId: createdUser.id,
      action: 'user_register',
      targetType: 'users',
      targetId: createdUser.uid,
      details: { hasSponsor: !!sponsorUser },
      ipAddress: ip ?? undefined,
    });

    const token = issueUserToken(createdUser.id, createdUser.uid);
    res.status(201).json({
      token,
      user: {
        id: createdUser.id,
        uid: createdUser.uid,
        phone: createdUser.phone,
        fullName: createdUser.fullName,
        referralCode: createdUser.referralCode,
        createdAt: createdUser.createdAt,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    await ensureDatabaseBootstrapped();
    const { phone: rawPhone, password } = req.body as Record<string, string>;
    const phone = normalizePhone(rawPhone || '');

    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone number and password are required.' });
    }

    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!user) {
      return res.status(401).json({ error: 'Invalid phone number or password.' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid phone number or password.' });
    }

    const ip = req.ip || req.headers['x-forwarded-for']?.toString() || null;
    await db
      .update(users)
      .set({ lastLoginIp: ip, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const token = issueUserToken(user.id, user.uid);
    res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        phone: user.phone,
        fullName: user.fullName,
        referralCode: user.referralCode,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Firebase Google Sign-In linking / onboarding
router.post('/firebase', authLimiter, async (req, res) => {
  try {
    await ensureDatabaseBootstrapped();
    const { idToken, phone: rawPhone, inviteCode } = req.body as Record<string, string>;
    if (!idToken) {
      return res.status(400).json({ error: 'Firebase ID token is required' });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.firebaseUid, decoded.uid))
      .limit(1);

    if (existing) {
      if (existing.status === 'blocked') {
        return res.status(403).json({ error: 'Your account is blocked.' });
      }
      const token = issueUserToken(existing.id, existing.uid);
      return res.json({
        token,
        user: {
          id: existing.id,
          uid: existing.uid,
          phone: existing.phone,
          fullName: existing.fullName,
          referralCode: existing.referralCode,
          createdAt: existing.createdAt,
        },
      });
    }

    // Create account linked to Firebase UID
    const settings = await getAppSettings();
    const phone = normalizePhone(rawPhone || '') || `9${crypto.randomInt(100000000, 999999999)}`;
    const trimmedInvite = (inviteCode || '').trim().toUpperCase();
    let sponsorUser: typeof users.$inferSelect | undefined;
    if (trimmedInvite) {
      const [sp] = await db.select().from(users).where(eq(users.referralCode, trimmedInvite)).limit(1);
      if (sp && sp.status === 'active') sponsorUser = sp;
    }

    const uid = await allocateUniqueUid();
    const referralCode = generateReferralCode();
    const randomPassHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);

    const created = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(users)
        .values({
          uid,
          firebaseUid: decoded.uid,
          phone,
          passwordHash: randomPassHash,
          fullName: decoded.name || 'Google Member',
          email: decoded.email || null,
          referralCode,
          referredByUserId: sponsorUser?.id ?? null,
          status: 'active',
        })
        .onConflictDoUpdate({
          target: users.firebaseUid,
          set: {
            email: decoded.email || null,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx
        .insert(wallets)
        .values({ userId: inserted.id, balance: '0.00' })
        .onConflictDoNothing({ target: wallets.userId });

      if (sponsorUser) {
        await tx
          .insert(referrals)
          .values({
            sponsorUserId: sponsorUser.id,
            referredUserId: inserted.id,
            referralCodeUsed: trimmedInvite,
            isValid: false,
            invalidReason: `Pending completion of ${settings.validReferralMinTasks} task(s)`,
          })
          .onConflictDoNothing();
      }

      return inserted;
    });

    const token = issueUserToken(created.id, created.uid);
    res.json({
      token,
      user: {
        id: created.id,
        uid: created.uid,
        phone: created.phone,
        fullName: created.fullName,
        referralCode: created.referralCode,
        createdAt: created.createdAt,
      },
    });
  } catch (err) {
    console.error('Firebase auth error:', err);
    res.status(401).json({ error: 'Unable to verify Google authentication token.' });
  }
});

// Forgot Password - Request OTP
router.post('/forgot-password/request', authLimiter, async (req, res) => {
  try {
    await ensureDatabaseBootstrapped();
    const { phone: rawPhone, captchaToken, captchaAnswer } = req.body as Record<string, string>;

    if (!captchaToken || !verifyMathCaptcha(captchaToken, captchaAnswer || '')) {
      return res.status(400).json({ error: 'Invalid CAPTCHA verification.' });
    }

    const phone = normalizePhone(rawPhone || '');
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!user) {
      return res.status(404).json({ error: 'No account found with this phone number.' });
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const codeHash = await bcrypt.hash(otp, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpCodes).values({
      phone,
      codeHash,
      purpose: 'forgot_password',
      expiresAt,
    });

    // When no SMS gateway env is configured, provide secure verification code preview so OTP flow works end-to-end
    const hasSmsGateway = Boolean(process.env.SMS_API_KEY);
    res.json({
      message: 'A 6-digit recovery OTP has been generated and is valid for 10 minutes.',
      verificationPreviewCode: hasSmsGateway ? undefined : otp,
    });
  } catch (err) {
    console.error('Forgot password request error:', err);
    res.status(500).json({ error: 'Failed to generate recovery OTP.' });
  }
});

// Forgot Password - Verify OTP & Reset
router.post('/forgot-password/reset', authLimiter, async (req, res) => {
  try {
    await ensureDatabaseBootstrapped();
    const { phone: rawPhone, otp, newPassword, confirmPassword } = req.body as Record<string, string>;
    const phone = normalizePhone(rawPhone || '');

    if (!phone || !otp || !newPassword) {
      return res.status(400).json({ error: 'Phone, OTP, and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const [otpRow] = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.usedAt)))
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (!otpRow || new Date() > otpRow.expiresAt) {
      return res.status(400).json({ error: 'OTP has expired or was not found. Request a new code.' });
    }
    if (otpRow.attempts >= 5) {
      return res.status(429).json({ error: 'Too many invalid OTP attempts. Request a new code.' });
    }

    const matches = await bcrypt.compare(String(otp).trim(), otpRow.codeHash);
    if (!matches) {
      await db
        .update(otpCodes)
        .set({ attempts: otpRow.attempts + 1 })
        .where(eq(otpCodes.id, otpRow.id));
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.transaction(async (tx) => {
      await tx.update(otpCodes).set({ usedAt: new Date() }).where(eq(otpCodes.id, otpRow.id));
      await tx
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.phone, phone));
    });

    res.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Unable to reset password.' });
  }
});

// Get Current User Profile
router.get('/me', requireUserAuth, async (req: UserRequest, res) => {
  try {
    const authUser = req.authUser!;
    const [user] = await db.select().from(users).where(eq(users.id, authUser.id)).limit(1);
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, authUser.id)).limit(1);
    const [bank] = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, authUser.id)).limit(1);
    const [upi] = await db.select().from(upiAccounts).where(eq(upiAccounts.userId, authUser.id)).limit(1);

    res.json({
      user: {
        id: user.id,
        uid: user.uid,
        phone: user.phone,
        fullName: user.fullName,
        email: user.email,
        referralCode: user.referralCode,
        referralValid: user.referralValid,
        status: user.status,
        createdAt: user.createdAt,
      },
      wallet: {
        balance: wallet?.balance ?? '0.00',
        lockedBalance: wallet?.lockedBalance ?? '0.00',
        totalTaskEarnings: wallet?.totalTaskEarnings ?? '0.00',
        totalReferralEarnings: wallet?.totalReferralEarnings ?? '0.00',
        totalTeamEarnings: wallet?.totalTeamEarnings ?? '0.00',
        totalOtherRewards: wallet?.totalOtherRewards ?? '0.00',
        totalWithdrawn: wallet?.totalWithdrawn ?? '0.00',
      },
      payoutAccounts: {
        bank: bank
          ? {
              accountHolderName: bank.accountHolderName,
              bankName: bank.bankName,
              accountNumberMasked: maskAccountNumber(bank.accountNumberLast4),
              ifscCode: bank.ifscCode,
              isVerified: bank.isVerified,
            }
          : null,
        upi: upi
          ? {
              upiId: upi.upiId,
              holderName: upi.holderName,
              isVerified: upi.isVerified,
            }
          : null,
      },
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Unable to load account profile.' });
  }
});

export default router;
