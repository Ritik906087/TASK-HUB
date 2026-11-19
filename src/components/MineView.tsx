import React, { useState } from 'react';
import {
  ArrowDownUp,
  Bell,
  Building2,
  Check,
  ChevronRight,
  Copy,
  LogOut,
  Smartphone,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { formatDateOnly, formatInr } from '../lib/api.ts';
import {
  AndroidGuidePage,
  EarningDetailsPage,
  NotificationsPage,
  PayoutBindingPage,
  TeamDetailsPage,
  TransactionHistoryPage,
  WithdrawalPage,
} from './MineSubPages.tsx';

export type MineSubView =
  | 'menu'
  | 'team'
  | 'earnings'
  | 'bind_bank'
  | 'bind_upi'
  | 'withdraw'
  | 'transactions'
  | 'notifications'
  | 'android_guide';

interface MineViewProps {
  profile: {
    user: {
      uid: string;
      phone: string;
      fullName: string;
      referralCode: string;
      createdAt: string;
    };
    wallet: {
      balance: string;
      totalTaskEarnings: string;
      totalReferralEarnings: string;
      totalTeamEarnings: string;
      totalOtherRewards: string;
    };
    payoutAccounts: {
      bank: { bankName: string; accountNumberMasked: string } | null;
      upi: { upiId: string } | null;
    };
  } | null;
  subView: MineSubView;
  onChangeSubView: (view: MineSubView) => void;
  onOpenInvite: () => void;
  onRefreshDashboard: () => void;
  onLogout: () => void;
}

export const MineView: React.FC<MineViewProps> = ({
  profile,
  subView,
  onChangeSubView,
  onOpenInvite,
  onRefreshDashboard,
  onLogout,
}) => {
  const [bindingTab, setBindingTab] = useState<'bank' | 'upi'>('bank');
  const [copiedId, setCopiedId] = useState(false);

  if (subView === 'team') {
    return <TeamDetailsPage onBack={() => onChangeSubView('menu')} />;
  }
  if (subView === 'earnings') {
    return <EarningDetailsPage onBack={() => onChangeSubView('menu')} />;
  }
  if (subView === 'bind_bank' || subView === 'bind_upi') {
    return (
      <PayoutBindingPage
        initialTab={subView === 'bind_upi' ? 'upi' : bindingTab}
        onBack={() => onChangeSubView('menu')}
        onSaved={onRefreshDashboard}
      />
    );
  }
  if (subView === 'withdraw') {
    return (
      <WithdrawalPage
        onBack={() => onChangeSubView('menu')}
        onOpenBinding={(tab) => {
          setBindingTab(tab);
          onChangeSubView(tab === 'upi' ? 'bind_upi' : 'bind_bank');
        }}
        onWithdrawn={onRefreshDashboard}
      />
    );
  }
  if (subView === 'transactions') {
    return <TransactionHistoryPage onBack={() => onChangeSubView('menu')} />;
  }
  if (subView === 'notifications') {
    return (
      <NotificationsPage
        onBack={() => onChangeSubView('menu')}
        onMarkedRead={onRefreshDashboard}
      />
    );
  }
  if (subView === 'android_guide') {
    return <AndroidGuidePage onBack={() => onChangeSubView('menu')} />;
  }

  const teamWalletEarnings = profile
    ? parseFloat(profile.wallet.totalReferralEarnings) +
      parseFloat(profile.wallet.totalTeamEarnings)
    : 0;

  const totalEarnings = profile
    ? parseFloat(profile.wallet.totalTaskEarnings) +
      teamWalletEarnings +
      parseFloat(profile.wallet.totalOtherRewards)
    : 0;

  const copyUid = async () => {
    if (!profile?.user.uid) return;
    try {
      await navigator.clipboard.writeText(profile.user.uid);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // ignore
    }
  };

  const menuItems = [
    {
      label: 'Withdraw Funds',
      sub: 'Minimum ₹10 · Bank Transfer or UPI',
      Icon: Wallet,
      action: () => onChangeSubView('withdraw'),
    },
    {
      label: 'Earnings History',
      sub: `Lifetime total: ${formatInr(totalEarnings)}`,
      Icon: TrendingUp,
      action: () => onChangeSubView('earnings'),
    },
    {
      label: 'My Team',
      sub: 'Search & track invited team members',
      Icon: Users,
      action: () => onChangeSubView('team'),
    },
    {
      label: 'Invite Friends',
      sub: `Referral code: ${profile?.user.referralCode ?? ''}`,
      Icon: UserPlus,
      action: onOpenInvite,
    },
    {
      label: 'Bind Bank Account',
      sub: profile?.payoutAccounts.bank
        ? `${profile.payoutAccounts.bank.bankName} · ${profile.payoutAccounts.bank.accountNumberMasked}`
        : 'Add bank details for NEFT/IMPS payouts',
      Icon: Building2,
      action: () => {
        setBindingTab('bank');
        onChangeSubView('bind_bank');
      },
    },
    {
      label: 'Bind UPI ID',
      sub: profile?.payoutAccounts.upi
        ? `Bound: ${profile.payoutAccounts.upi.upiId}`
        : 'Link & verify your UPI ID',
      Icon: Smartphone,
      action: () => {
        setBindingTab('upi');
        onChangeSubView('bind_upi');
      },
    },
    {
      label: 'Transaction History',
      sub: 'All credit & debit wallet entries',
      Icon: ArrowDownUp,
      action: () => onChangeSubView('transactions'),
    },
    {
      label: 'Notifications',
      sub: 'Task approvals, withdrawals & alerts',
      Icon: Bell,
      action: () => onChangeSubView('notifications'),
    },
    {
      label: 'Android APK & WebView Guide',
      sub: 'Android Studio WebView wrapper setup',
      Icon: Smartphone,
      action: () => onChangeSubView('android_guide'),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Top Profile Header matching Screenshot 1 */}
      <section className="flex items-center justify-between gap-4 px-1 pt-1">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#5B46F6] to-indigo-900 text-white font-display text-xl font-bold flex items-center justify-center shrink-0 shadow-sm">
            {(profile?.user.fullName || 'TH').slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold text-slate-900 truncate">
              {profile?.user.fullName ?? 'Member'}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-xs text-slate-600">
                ID:{profile?.user.uid ?? '—'}
              </span>
              <button
                type="button"
                onClick={copyUid}
                className="p-1 text-[#5B46F6] hover:bg-indigo-50 rounded"
                aria-label="Copy UID"
              >
                {copiedId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {profile?.user.phone} · Joined{' '}
              {profile?.user.createdAt ? formatDateOnly(profile.user.createdAt) : '—'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onChangeSubView('earnings')}
          className="p-2 text-slate-400 hover:text-slate-700"
          aria-label="View earnings"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </section>

      {/* 2-Column Personal Wallet & Team Wallet matching Screenshot 1 */}
      <section className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChangeSubView('withdraw')}
          className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center gap-3 text-left hover:border-indigo-300 transition-colors"
        >
          <div className="h-11 w-11 rounded-xl bg-indigo-50 text-[#5B46F6] flex items-center justify-center shrink-0">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-600 truncate">Personal Wallet</p>
            <p className="font-mono-num text-lg font-bold text-[#5B46F6] mt-0.5 truncate">
              {formatInr(profile?.wallet.balance)}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeSubView('team')}
          className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center gap-3 text-left hover:border-indigo-300 transition-colors"
        >
          <div className="h-11 w-11 rounded-xl bg-indigo-50 text-[#5B46F6] flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-600 truncate">Team Wallet</p>
            <p className="font-mono-num text-lg font-bold text-[#5B46F6] mt-0.5 truncate">
              {formatInr(teamWalletEarnings)}
            </p>
          </div>
        </button>
      </section>

      {/* Banner Card matching Screenshot 1 */}
      <section
        onClick={() => onChangeSubView('withdraw')}
        className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-[#4338CA] text-white p-5 flex items-center justify-between gap-4 cursor-pointer"
      >
        <div>
          <p className="text-xs font-semibold text-amber-300">Verified Payouts Active</p>
          <h2 className="font-display text-lg font-bold mt-0.5">
            Withdraw ₹10 – ₹500 Anytime
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Direct transfer to your bound UPI ID or Bank Account
          </p>
        </div>
        <span className="rounded-xl bg-amber-400 text-slate-950 px-3.5 py-2 text-xs font-extrabold whitespace-nowrap shrink-0">
          Withdraw
        </span>
      </section>

      {/* Other Functions List matching Screenshot 1 */}
      <section className="space-y-2.5">
        <h2 className="font-display text-base font-bold text-slate-900 px-1">Other functions</h2>
        <div className="bg-white rounded-2xl border border-slate-200/80 divide-y divide-slate-100 overflow-hidden">
          {menuItems.map((item) => {
            const Icon = item.Icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3.5 hover:bg-slate-50 transition-colors text-left min-h-[58px]"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-9 w-9 rounded-xl bg-indigo-50/80 text-[#5B46F6] flex items-center justify-center shrink-0">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{item.sub}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Logout */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full rounded-2xl border border-red-200 bg-white hover:bg-red-50 text-red-700 py-3.5 px-5 text-sm font-bold flex items-center justify-center gap-2 transition-colors min-h-[48px]"
      >
        <LogOut className="h-4 w-4" />
        <span>Log Out</span>
      </button>
    </div>
  );
};
