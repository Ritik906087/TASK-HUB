import { and, count, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  notifications,
  referralCommissions,
  referrals,
  taskSubmissions,
  tasks,
  transactions,
  users,
  wallets,
} from '../db/schema.ts';
import { getAppSettings } from '../db/bootstrap.ts';
import { generateTxCode, roundMoney } from './security.ts';

export async function approveSubmissionAtomic(params: {
  submissionId: number;
  adminId?: number;
  remarks?: string;
}) {
  const settings = await getAppSettings();

  return await db.transaction(async (tx) => {
    const [submission] = await tx
      .select()
      .from(taskSubmissions)
      .where(eq(taskSubmissions.id, params.submissionId))
      .limit(1);

    if (!submission) {
      throw new Error('Submission not found');
    }

    if (submission.status === 'approved' || submission.status === 'completed') {
      throw new Error('Submission has already been approved and rewarded');
    }

    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, submission.taskId))
      .limit(1);

    if (!task) {
      throw new Error('Associated task not found');
    }

    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, submission.userId))
      .limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    const rewardNum = parseFloat(task.rewardAmount);
    const rewardStr = roundMoney(rewardNum);

    // 1. Update submission
    await tx
      .update(taskSubmissions)
      .set({
        status: 'approved',
        rewardCredited: rewardStr,
        adminRemarks: params.remarks || 'Verified and approved',
        reviewedByAdminId: params.adminId ?? null,
        reviewedAt: new Date(),
      })
      .where(eq(taskSubmissions.id, submission.id));

    // 2. Increment task completed count
    await tx
      .update(tasks)
      .set({
        completedCount: sql`${tasks.completedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));

    // 3. Credit user wallet atomically
    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, user.id))
      .limit(1);

    const beforeBal = parseFloat(wallet?.balance ?? '0');
    const afterBal = beforeBal + rewardNum;

    await tx
      .update(wallets)
      .set({
        balance: roundMoney(afterBal),
        totalTaskEarnings: roundMoney(parseFloat(wallet?.totalTaskEarnings ?? '0') + rewardNum),
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, user.id));

    // 4. Insert credit transaction
    await tx.insert(transactions).values({
      txCode: generateTxCode('TSK'),
      userId: user.id,
      direction: 'credit',
      category: 'task_reward',
      amount: rewardStr,
      balanceBefore: roundMoney(beforeBal),
      balanceAfter: roundMoney(afterBal),
      relatedUid: user.uid,
      referenceId: `TASK-${task.id}`,
      status: 'completed',
      description: `Task reward: ${task.title}`,
      createdByAdminId: params.adminId ?? null,
    });

    // 5. Notify user
    await tx.insert(notifications).values({
      userId: user.id,
      title: 'Task Reward Credited',
      message: `Your submission for "${task.title}" was approved. ₹${rewardStr} added to your wallet.`,
      type: 'task',
    });

    // 6. Check referral validity and pay Level 1 & Level 2 commissions
    const [approvedCountRow] = await tx
      .select({ total: count() })
      .from(taskSubmissions)
      .where(
        and(
          eq(taskSubmissions.userId, user.id),
          eq(taskSubmissions.status, 'approved')
        )
      );

    const completedTasksCount = approvedCountRow?.total ?? 0;

    if (user.referredByUserId) {
      // Mark referral valid if threshold met
      if (!user.referralValid && completedTasksCount >= settings.validReferralMinTasks) {
        await tx
          .update(users)
          .set({ referralValid: true, updatedAt: new Date() })
          .where(eq(users.id, user.id));

        await tx
          .update(referrals)
          .set({ isValid: true, validatedAt: new Date(), invalidReason: null })
          .where(eq(referrals.referredUserId, user.id));
      }

      // Level 1 Sponsor Commission
      const [sponsor] = await tx
        .select()
        .from(users)
        .where(eq(users.id, user.referredByUserId))
        .limit(1);

      if (sponsor && sponsor.status === 'active' && settings.referralCommissionPercent > 0) {
        const l1Amount = (rewardNum * settings.referralCommissionPercent) / 100;
        const l1Str = roundMoney(l1Amount);

        if (parseFloat(l1Str) > 0) {
          const [spWallet] = await tx
            .select()
            .from(wallets)
            .where(eq(wallets.userId, sponsor.id))
            .limit(1);

          const spBefore = parseFloat(spWallet?.balance ?? '0');
          const spAfter = spBefore + parseFloat(l1Str);

          await tx
            .update(wallets)
            .set({
              balance: roundMoney(spAfter),
              totalReferralEarnings: roundMoney(
                parseFloat(spWallet?.totalReferralEarnings ?? '0') + parseFloat(l1Str)
              ),
              updatedAt: new Date(),
            })
            .where(eq(wallets.userId, sponsor.id));

          await tx.insert(referralCommissions).values({
            sponsorUserId: sponsor.id,
            sourceUserId: user.id,
            sourceType: 'referral_commission',
            taskSubmissionId: submission.id,
            level: 1,
            ratePercent: roundMoney(settings.referralCommissionPercent),
            amount: l1Str,
            status: 'credited',
          });

          await tx.insert(transactions).values({
            txCode: generateTxCode('REF'),
            userId: sponsor.id,
            direction: 'credit',
            category: 'referral_commission',
            amount: l1Str,
            balanceBefore: roundMoney(spBefore),
            balanceAfter: roundMoney(spAfter),
            relatedUid: user.uid,
            referenceId: `SUB-${submission.id}`,
            status: 'completed',
            description: `Direct referral commission (${settings.referralCommissionPercent}%) from ${user.uid}`,
          });

          await tx.insert(notifications).values({
            userId: sponsor.id,
            title: 'Referral Commission Earned',
            message: `Earned ₹${l1Str} referral commission from team member ${user.uid}.`,
            type: 'referral',
          });
        }

        // Level 2 Team Commission (sponsor's sponsor)
        if (sponsor.referredByUserId && settings.teamCommissionPercent > 0) {
          const [upline] = await tx
            .select()
            .from(users)
            .where(eq(users.id, sponsor.referredByUserId))
            .limit(1);

          if (upline && upline.status === 'active' && upline.id !== user.id) {
            const l2Amount = (rewardNum * settings.teamCommissionPercent) / 100;
            const l2Str = roundMoney(l2Amount);

            if (parseFloat(l2Str) > 0) {
              const [upWallet] = await tx
                .select()
                .from(wallets)
                .where(eq(wallets.userId, upline.id))
                .limit(1);

              const upBefore = parseFloat(upWallet?.balance ?? '0');
              const upAfter = upBefore + parseFloat(l2Str);

              await tx
                .update(wallets)
                .set({
                  balance: roundMoney(upAfter),
                  totalTeamEarnings: roundMoney(
                    parseFloat(upWallet?.totalTeamEarnings ?? '0') + parseFloat(l2Str)
                  ),
                  updatedAt: new Date(),
                })
                .where(eq(wallets.userId, upline.id));

              await tx.insert(referralCommissions).values({
                sponsorUserId: upline.id,
                sourceUserId: user.id,
                sourceType: 'team_task_commission',
                taskSubmissionId: submission.id,
                level: 2,
                ratePercent: roundMoney(settings.teamCommissionPercent),
                amount: l2Str,
                status: 'credited',
              });

              await tx.insert(transactions).values({
                txCode: generateTxCode('TEAM'),
                userId: upline.id,
                direction: 'credit',
                category: 'team_task_commission',
                amount: l2Str,
                balanceBefore: roundMoney(upBefore),
                balanceAfter: roundMoney(upAfter),
                relatedUid: user.uid,
                referenceId: `SUB-${submission.id}`,
                status: 'completed',
                description: `Team task commission (${settings.teamCommissionPercent}%) from ${user.uid}`,
              });
            }
          }
        }
      }
    }

    return { rewardCredited: rewardStr, userUid: user.uid };
  });
}
