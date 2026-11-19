import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  MessageCircle,
  Play,
  Share2,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, formatDateOnly, formatInr } from '../lib/api.ts';
import { StatusLabel } from './BrandMark.tsx';

interface ReferralOverview {
  referralCode: string;
  totalInvited: number;
  todayRegistrations: number;
  validReferrals: number;
  invalidReferrals: number;
  totalReferralEarnings: string;
  rules: {
    referralCommissionPercent: number;
    teamCommissionPercent: number;
    validReferralMinTasks: number;
  };
  recentReferrals: {
    id: number;
    uid: string;
    maskedPhone: string;
    fullName: string;
    isValid: boolean;
    invalidReason: string | null;
    createdAt: string;
  }[];
}

export const InviteView: React.FC = () => {
  const [data, setData] = useState<ReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    apiFetch<ReferralOverview>('/api/user/referrals/overview')
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const referralLink = data
    ? `${window.location.origin}/register?ref=${data.referralCode}`
    : '';

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInviteNow = async () => {
    if (!data) return;
    const shareText = `Join me on TASK HUB! Complete simple tasks and withdraw earnings directly to Bank or UPI. Use my invite code ${data.referralCode}: ${referralLink}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Invite Friends to TASK HUB',
          text: shareText,
          url: referralLink,
        });
        return;
      } catch {
        // fallback to copy
      }
    }
    copyToClipboard(referralLink);
  };

  const handleWhatsAppShare = () => {
    if (!data) return;
    const msg = encodeURIComponent(
      `Join TASK HUB and earn rewards completing verified tasks! Register with my invite code *${data.referralCode}*: ${referralLink}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return <div className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse" />;
  }

  return (
    <div className="space-y-5">
      {/* Clean Vector Commission Hero Banner */}
      <section className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1E1B4B] via-[#3730A3] to-[#5B46F6] text-white p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-indigo-100">
              {data?.rules.referralCommissionPercent ?? 10}% Direct ·{' '}
              {data?.rules.teamCommissionPercent ?? 5}% Level-2 Team Bonus
            </span>
            <h1 className="font-display text-xl sm:text-2xl font-bold leading-snug text-balance">
              Invite Friends To Complete Tasks And Earn Team Commissions
            </h1>
            <p className="text-xs text-indigo-100/90">
              Every verified friend completion automatically credits commission directly to your wallet.
            </p>
          </div>
          <div className="hidden sm:flex h-16 w-16 rounded-2xl bg-white/15 border border-white/20 items-center justify-center shrink-0">
            <Share2 className="h-7 w-7 text-white" strokeWidth={2} />
          </div>
        </div>
      </section>

      {/* Primary Invite Card matching Screenshot 2 */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={handleInviteNow}
            className="flex-1 h-12 rounded-2xl bg-[#5B46F6] hover:bg-[#4B36E6] text-white text-sm font-bold shadow-sm shadow-indigo-500/20 flex items-center justify-center gap-2 transition-colors"
          >
            <Share2 className="h-4 w-4" />
            <span>Invite Now</span>
          </button>
          <button
            type="button"
            onClick={handleWhatsAppShare}
            className="h-12 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp</span>
          </button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>Rewards follow confirmed friend activity</span>
        </p>

        {/* 3-Step Flow */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-700 pt-1">
          <span className="font-medium">1. Share link</span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="font-medium">2. Friend qualifies</span>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="font-medium">3. You earn</span>
        </div>

        {/* Collapsible How to Share & Earn */}
        <div className="rounded-xl bg-slate-50 border border-slate-100">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="w-full p-3.5 flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#5B46F6] text-white flex items-center justify-center shrink-0">
                <Play className="h-4 w-4 fill-current" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">How to Share &amp; Earn</p>
                <p className="text-xs text-slate-500">A simple guide, from sharing to rewards</p>
              </div>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-slate-500 transition-transform ${
                showGuide ? 'rotate-180' : ''
              }`}
            />
          </button>
          {showGuide && (
            <div className="px-4 pb-4 text-xs text-slate-600 space-y-1.5 border-t border-slate-200/60 pt-3">
              <p>
                1. Share your unique referral link or invite code{' '}
                <strong className="font-mono text-slate-900">{data?.referralCode}</strong>.
              </p>
              <p>
                2. When your friend registers and completes at least{' '}
                {data?.rules.validReferralMinTasks ?? 1} verified task(s), they become a Valid Referral.
              </p>
              <p>
                3. You earn {data?.rules.referralCommissionPercent ?? 10}% direct commission +{' '}
                {data?.rules.teamCommissionPercent ?? 5}% Level-2 team commission automatically.
              </p>
            </div>
          )}
        </div>

        {/* Referral Code & Link Copy */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500">My Referral Code</p>
              <p className="font-mono text-sm font-bold text-[#5B46F6]">{data?.referralCode}</p>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(data?.referralCode || '')}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700"
            >
              Copy
            </button>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500">Referral Link</p>
              <p className="font-mono text-xs text-slate-700 truncate">{referralLink}</p>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(referralLink)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#5B46F6] text-white text-xs font-semibold shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Team Earnings Card matching Screenshot 2 */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-slate-900">Team Earnings</p>
            <p className="font-mono-num text-3xl font-bold text-slate-900 mt-1">
              {formatInr(data?.totalReferralEarnings)}
            </p>
          </div>
          <div className="text-right">
            <span className="font-display text-lg font-extrabold text-indigo-500">
              {data?.validReferrals ?? 0} Valid
            </span>
            <p className="text-[11px] text-slate-400">
              {data?.todayRegistrations ?? 0} joined today
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-500">Direct Rate</p>
            <p className="font-mono-num text-base font-bold text-slate-900">
              {data?.rules.referralCommissionPercent ?? 10}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Level 2 Rate</p>
            <p className="font-mono-num text-base font-bold text-slate-900">
              {data?.rules.teamCommissionPercent ?? 5}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Invited</p>
            <p className="font-mono-num text-base font-bold text-slate-900">
              {data?.totalInvited ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pending / Invalid</p>
            <p className="font-mono-num text-base font-bold text-amber-700">
              {data?.invalidReferrals ?? 0}
            </p>
          </div>
        </div>
      </section>

      {/* Recent Referral Registrations */}
      <section className="bg-white rounded-2xl border border-slate-200/80 p-5">
        <h2 className="font-display text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
          Recent Referral Activity
        </h2>

        {!data || data.recentReferrals.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            No referrals yet. Tap Invite Now above to share your link.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentReferrals.map((r) => (
              <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {r.fullName} · <span className="font-mono text-xs text-slate-500">{r.uid}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.maskedPhone} · {formatDateOnly(r.createdAt)}
                  </p>
                </div>
                <StatusLabel status={r.isValid ? 'valid' : 'invalid'} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
