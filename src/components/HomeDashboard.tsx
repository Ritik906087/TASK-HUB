import React, { useEffect, useState } from 'react';
import { Award, Gift, Zap } from 'lucide-react';
import { TaskCard, type TaskListItem } from './TaskCard.tsx';

export interface DashboardMetrics {
  balance: string;
  lockedBalance: string;
  todayEarnings: string;
  totalTaskEarnings: string;
  referralCommission: string;
  completedTasks: number;
  availableTasks: number;
  pendingWithdrawals: string;
  pendingWithdrawalsCount: number;
  approvedWithdrawals: string;
  approvedWithdrawalsCount: number;
  unreadNotifications: number;
}

interface HomeDashboardProps {
  metrics?: DashboardMetrics | null;
  tasks: TaskListItem[];
  loading: boolean;
  onSelectTask: (taskId: number) => void;
  onGoToTasks: () => void;
  onGoToInvite: () => void;
}

const PROMO_BANNERS = [
  {
    id: 'rewards',
    gradient: 'from-[#0B663A] via-[#0E8A4D] to-[#16A34A]',
    accentBg: 'bg-amber-400 text-slate-950',
    badge: '+₹50 BONUS',
    headline: 'Daily Task Rewards',
    sub: 'Instant UPI & Bank Cashout',
    Icon: Award,
    target: 'tasks' as const,
  },
  {
    id: 'referral',
    gradient: 'from-[#312E81] via-[#4338CA] to-[#5B46F6]',
    accentBg: 'bg-white text-[#4338CA]',
    badge: '10% COMMISSION',
    headline: 'Team Bonus Program',
    sub: 'Earn on Every Friend Task',
    Icon: Gift,
    target: 'invite' as const,
  },
  {
    id: 'payout',
    gradient: 'from-[#0F172A] via-[#1E293B] to-[#334155]',
    accentBg: 'bg-emerald-400 text-slate-950',
    badge: 'FAST PAYOUT',
    headline: '₹10 – ₹500 Withdrawals',
    sub: 'Verified Direct Settlements',
    Icon: Zap,
    target: 'tasks' as const,
  },
];

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  tasks,
  loading,
  onSelectTask,
  onGoToTasks,
  onGoToInvite,
}) => {
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % PROMO_BANNERS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const currentBanner = PROMO_BANNERS[slideIndex];
  const BannerIcon = currentBanner.Icon;

  return (
    <div className="space-y-5">
      {/* Visual Promotional Banner Carousel */}
      <section className="space-y-2">
        <div
          onClick={() => (currentBanner.target === 'invite' ? onGoToInvite() : onGoToTasks())}
          className={`relative rounded-2xl overflow-hidden bg-gradient-to-r ${currentBanner.gradient} text-white px-5 py-6 sm:px-8 sm:py-7 cursor-pointer shadow-sm transition-all`}
        >
          {/* Decorative geometric circles */}
          <div
            aria-hidden="true"
            className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute right-12 -bottom-10 h-28 w-28 rounded-full bg-white/10"
          />

          <div className="relative flex items-center justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <span
                className={`inline-block rounded-lg px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${currentBanner.accentBg}`}
              >
                {currentBanner.badge}
              </span>
              <h1 className="font-display text-xl sm:text-2xl font-extrabold leading-tight truncate">
                {currentBanner.headline}
              </h1>
              <p className="text-xs sm:text-sm text-white/85 font-medium truncate">
                {currentBanner.sub}
              </p>
            </div>

            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0 backdrop-blur-xs">
              <BannerIcon className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2} />
            </div>
          </div>
        </div>

        {/* Carousel Indicator Dots */}
        <div className="flex items-center justify-center gap-1.5">
          {PROMO_BANNERS.map((b, idx) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSlideIndex(idx)}
              aria-label={`Show banner ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                idx === slideIndex ? 'w-5 bg-[#5B46F6]' : 'w-1.5 bg-slate-300'
              }`}
            />
          ))}
        </div>
      </section>

      {/* Tasks List */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-slate-900">Tasks</h2>

        {loading && tasks.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-2xl bg-white border border-slate-200 animate-pulse"
              />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            No active tasks available right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
