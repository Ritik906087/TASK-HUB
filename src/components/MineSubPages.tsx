import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCircle2,
  Search,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { apiFetch, formatDateOnly, formatDateTime, formatInr } from '../lib/api.ts';
import { StatusLabel } from './BrandMark.tsx';

const BackBar: React.FC<{ title: string; subtitle?: string; onBack: () => void }> = ({
  title,
  subtitle,
  onBack,
}) => (
  <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
    <button
      type="button"
      onClick={onBack}
      className="h-11 w-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 shrink-0"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
    <div className="min-w-0">
      <h1 className="font-display text-xl font-bold text-slate-900 truncate">{title}</h1>
      {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
    </div>
  </div>
);

// 1. TEAM DETAILS
export const TeamDetailsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [search, setSearch] = useState('');
  const [validity, setValidity] = useState<'all' | 'valid' | 'invalid'>('all');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalTeamMembers: 0,
    validTeamMembers: 0,
    todayRegistrations: 0,
  });
  const [members, setMembers] = useState<
    {
      uid: string;
      maskedPhone: string;
      fullName: string;
      registeredAt: string;
      isToday: boolean;
      isValid: boolean;
      invalidReason: string | null;
      completedTasks: number;
      totalTaskEarnings: string;
      commissionEarnedFromUser: string;
      status: string;
    }[]
  >([]);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (validity !== 'all') qs.set('validity', validity);
      if (date) qs.set('date', date);
      const res = await apiFetch<{ summary: typeof summary; members: typeof members }>(
        `/api/user/team?${qs.toString()}`
      );
      setSummary(res.summary);
      setMembers(res.members);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, [validity, date]);

  return (
    <div className="space-y-5">
      <BackBar
        title="Team Details"
        subtitle="Track invited members, validity status, and earned commissions"
        onBack={onBack}
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Total Team</p>
          <p className="font-mono-num text-2xl font-bold text-slate-900 mt-1">
            {summary.totalTeamMembers}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Valid Team</p>
          <p className="font-mono-num text-2xl font-bold text-emerald-700 mt-1">
            {summary.validTeamMembers}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Today Joined</p>
          <p className="font-mono-num text-2xl font-bold text-blue-700 mt-1">
            {summary.todayRegistrations}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTeam()}
              placeholder="Search by UID or Phone..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 min-h-[44px]"
            />
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 min-h-[44px]"
          />
          <button
            type="button"
            onClick={fetchTeam}
            className="px-4 py-2.5 rounded-xl bg-blue-700 text-white text-xs font-semibold min-h-[44px]"
          >
            Search
          </button>
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'valid', 'invalid'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setValidity(v)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize min-h-[36px] ${
                validity === v
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {v === 'all' ? 'All Members' : `${v} Referrals`}
            </button>
          ))}
          {date && (
            <button
              type="button"
              onClick={() => setDate('')}
              className="text-xs font-semibold text-blue-700 ml-auto"
            >
              Clear Date
            </button>
          )}
        </div>
      </div>

      {/* Team List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading team members...</div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No team members match your filters.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map((m) => (
              <div
                key={m.uid}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-slate-900">{m.uid}</span>
                    <span className="text-xs text-slate-500">· {m.maskedPhone}</span>
                    {m.isToday && (
                      <span className="text-xs font-semibold text-blue-700">· Joined Today</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Registered: {formatDateOnly(m.registeredAt)} · Tasks Completed:{' '}
                    <span className="font-mono font-semibold text-slate-800">{m.completedTasks}</span> ·
                    Task Earnings:{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {formatInr(m.totalTaskEarnings)}
                    </span>
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <StatusLabel status={m.isValid ? 'valid' : 'invalid'} />
                    <StatusLabel status={m.status} />
                  </div>
                  <p className="text-xs font-semibold text-emerald-700 font-mono-num">
                    Commission Earned: {formatInr(m.commissionEarnedFromUser)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 2. EARNING DETAILS
export const EarningDetailsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState({ daily: '0.00', weekly: '0.00', lifetime: '0.00' });
  const [earnings, setEarnings] = useState<
    {
      id: number;
      txCode: string;
      createdAt: string;
      category: string;
      relatedUid: string;
      amount: string;
      status: string;
      description: string;
    }[]
  >([]);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ summaries: typeof summaries; earnings: typeof earnings }>(
      `/api/user/earnings?category=${category}`
    )
      .then((res) => {
        setSummaries(res.summaries);
        setEarnings(res.earnings);
      })
      .finally(() => setLoading(false));
  }, [category]);

  const cats = [
    { id: 'all', label: 'All Earnings' },
    { id: 'task_reward', label: 'Task Rewards' },
    { id: 'referral_commission', label: 'Referral Commission' },
    { id: 'team_task_commission', label: 'Team Commission' },
    { id: 'other_reward', label: 'Other Rewards' },
  ];

  return (
    <div className="space-y-5">
      <BackBar
        title="Earning Details"
        subtitle="Daily, weekly, and lifetime itemized income ledger"
        onBack={onBack}
      />

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Today</p>
          <p className="font-mono-num text-xl sm:text-2xl font-bold text-blue-700 mt-1">
            {formatInr(summaries.daily)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Last 7 Days</p>
          <p className="font-mono-num text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            {formatInr(summaries.weekly)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Lifetime</p>
          <p className="font-mono-num text-xl sm:text-2xl font-bold text-emerald-700 mt-1">
            {formatInr(summaries.lifetime)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 min-h-[40px] ${
              category === c.id
                ? 'bg-blue-700 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading earnings...</div>
        ) : earnings.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No earnings recorded in this category yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {earnings.map((e) => (
              <div key={e.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{e.description}</p>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    {e.txCode} · UID: {e.relatedUid} · {formatDateTime(e.createdAt)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-num text-base font-bold text-emerald-700">
                    +{formatInr(e.amount)}
                  </p>
                  <StatusLabel status={e.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 3. BIND BANK & UPI
export const PayoutBindingPage: React.FC<{
  initialTab?: 'bank' | 'upi';
  onBack: () => void;
  onSaved: () => void;
}> = ({ initialTab = 'bank', onBack, onSaved }) => {
  const [tab, setTab] = useState<'bank' | 'upi'>(initialTab);
  const [savedBank, setSavedBank] = useState<{
    accountHolderName: string;
    bankName: string;
    accountNumberMasked: string;
    ifscCode: string;
  } | null>(null);
  const [savedUpi, setSavedUpi] = useState<{ upiId: string; holderName: string } | null>(null);

  const [holderName, setHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');

  const [upiId, setUpiId] = useState('');
  const [upiHolder, setUpiHolder] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAccounts = async () => {
    const res = await apiFetch<{ bank: typeof savedBank; upi: typeof savedUpi }>(
      '/api/user/payout-accounts'
    );
    setSavedBank(res.bank);
    setSavedUpi(res.upi);
    if (res.upi) {
      setUpiId(res.upi.upiId);
      setUpiHolder(res.upi.holderName);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (accountNumber !== confirmAccountNumber) {
      setError('Account Number and Confirm Account Number do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/user/payout-accounts/bank', {
        method: 'POST',
        body: JSON.stringify({
          accountHolderName: holderName,
          bankName,
          accountNumber,
          confirmAccountNumber,
          ifscCode,
        }),
      });
      setSuccess(res.message);
      setAccountNumber('');
      setConfirmAccountNumber('');
      await loadAccounts();
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to save bank account');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/user/payout-accounts/upi', {
        method: 'POST',
        body: JSON.stringify({ upiId, holderName: upiHolder }),
      });
      setSuccess(res.message);
      await loadAccounts();
      onSaved();
    } catch (err: any) {
      setError(err.message || 'Failed to bind UPI ID');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <BackBar
        title="Bind Withdrawal Account"
        subtitle="Encrypted payout details for Bank Transfer & UPI withdrawals"
        onBack={onBack}
      />

      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-xl max-w-md">
        <button
          type="button"
          onClick={() => {
            setTab('bank');
            setError(null);
            setSuccess(null);
          }}
          className={`py-2.5 rounded-lg text-xs font-bold min-h-[44px] ${
            tab === 'bank' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
          }`}
        >
          Bank Account
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('upi');
            setError(null);
            setSuccess(null);
          }}
          className={`py-2.5 rounded-lg text-xs font-bold min-h-[44px] ${
            tab === 'upi' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
          }`}
        >
          UPI ID
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {tab === 'bank' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {savedBank && (
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-2 h-fit">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Current Bound Bank</span>
                <StatusLabel status="active" />
              </div>
              <p className="font-display text-lg font-bold text-slate-900">{savedBank.bankName}</p>
              <p className="text-sm text-slate-700">{savedBank.accountHolderName}</p>
              <p className="font-mono text-sm text-slate-900">{savedBank.accountNumberMasked}</p>
              <p className="font-mono text-xs text-slate-500">IFSC: {savedBank.ifscCode}</p>
            </div>
          )}

          <form
            onSubmit={handleSaveBank}
            className={`${savedBank ? 'lg:col-span-7' : 'lg:col-span-8'} bg-white rounded-2xl border border-slate-200 p-6 space-y-4`}
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Building2 className="h-4 w-4 text-blue-700" />
              <span>{savedBank ? 'Update Bank Account' : 'Bind Bank Account'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Account Holder Name *
                </label>
                <input
                  type="text"
                  required
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                  placeholder="As per bank passbook"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Bank Name *
                </label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. State Bank of India"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Account Number *
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="9-18 digit account number"
                  className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Confirm Account Number *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={confirmAccountNumber}
                  onChange={(e) => setConfirmAccountNumber(e.target.value)}
                  placeholder="Re-enter account number"
                  className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                IFSC Code *
              </label>
              <input
                type="text"
                required
                maxLength={11}
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="e.g. SBIN0001234"
                className="w-full px-3.5 py-2.5 text-sm font-mono uppercase rounded-xl border border-slate-200"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 text-sm font-semibold min-h-[48px]"
            >
              {saving ? 'Saving Securely...' : 'Save Bank Account'}
            </button>
          </form>
        </div>
      ) : (
        <div className="max-w-xl bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          {savedUpi && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-700 font-semibold">Verified UPI ID</p>
                <p className="font-mono text-base font-bold text-slate-900">{savedUpi.upiId}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
          )}

          <form onSubmit={handleSaveUpi} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                UPI ID *
              </label>
              <input
                type="text"
                required
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. yourname@okicici or 9876543210@ybl"
                className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-slate-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Account Holder Name
              </label>
              <input
                type="text"
                value={upiHolder}
                onChange={(e) => setUpiHolder(e.target.value)}
                placeholder="Name registered with UPI"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 text-sm font-semibold min-h-[48px]"
            >
              {saving ? 'Verifying...' : 'Verify & Save UPI ID'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

// 4. WITHDRAWAL SYSTEM
export const WithdrawalPage: React.FC<{
  onBack: () => void;
  onOpenBinding: (tab: 'bank' | 'upi') => void;
  onWithdrawn: () => void;
}> = ({ onBack, onOpenBinding, onWithdrawn }) => {
  const [balance, setBalance] = useState('0.00');
  const [lockedBalance, setLockedBalance] = useState('0.00');
  const [amounts, setAmounts] = useState<number[]>([10, 20, 50, 100, 150, 200, 300, 500]);
  const [minW, setMinW] = useState(10);
  const [maxW, setMaxW] = useState(500);
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [payoutAccounts, setPayoutAccounts] = useState<{
    bank: { bankName: string; accountNumberMasked: string; ifscCode: string } | null;
    upi: { upiId: string; holderName: string } | null;
  }>({ bank: null, upi: null });
  const [history, setHistory] = useState<
    {
      id: number;
      requestCode: string;
      amount: string;
      method: string;
      accountLabel: string;
      status: string;
      adminRemarks: string | null;
      createdAt: string;
    }[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [wRes, pRes] = await Promise.all([
        apiFetch<{
          balance: string;
          lockedBalance: string;
          config: { minWithdrawal: number; maxWithdrawal: number; withdrawalAmounts: number[] };
          withdrawals: typeof history;
        }>('/api/user/withdrawals'),
        apiFetch<typeof payoutAccounts>('/api/user/payout-accounts'),
      ]);
      setBalance(wRes.balance);
      setLockedBalance(wRes.lockedBalance);
      setMinW(wRes.config.minWithdrawal);
      setMaxW(wRes.config.maxWithdrawal);
      if (wRes.config.withdrawalAmounts?.length) {
        setAmounts(wRes.config.withdrawalAmounts);
        setSelectedAmount(wRes.config.withdrawalAmounts[0]);
      }
      setHistory(wRes.withdrawals);
      setPayoutAccounts(pRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/user/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ amount: selectedAmount, method }),
      });
      setSuccess(res.message);
      await loadAll();
      onWithdrawn();
    } catch (err: any) {
      setError(err.message || 'Withdrawal request failed');
    } finally {
      setSubmitting(false);
    }
  };

  const activeBound = method === 'upi' ? payoutAccounts.upi : payoutAccounts.bank;

  return (
    <div className="space-y-6">
      <BackBar
        title="Withdraw Earnings"
        subtitle={`Min ₹${minW} · Max ₹${maxW} per request · Bank Transfer or UPI`}
        onBack={onBack}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between rounded-xl bg-blue-700 text-white p-4">
            <div>
              <p className="text-xs text-blue-100">Available for Withdrawal</p>
              <p className="font-mono-num text-2xl font-bold mt-0.5">{formatInr(balance)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-200">In Pending Payouts</p>
              <p className="font-mono-num text-sm font-semibold">{formatInr(lockedBalance)}</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <form onSubmit={handleWithdraw} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Withdrawal Amount
              </label>
              <div className="grid grid-cols-4 gap-2.5">
                {amounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setSelectedAmount(amt)}
                    className={`py-3 rounded-xl font-mono-num text-sm font-bold border transition-colors min-h-[44px] ${
                      selectedAmount === amt
                        ? 'bg-blue-700 border-blue-700 text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-blue-300'
                    }`}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Payment Method
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMethod('upi')}
                  className={`p-3.5 rounded-xl border text-left transition-colors min-h-[56px] ${
                    method === 'upi'
                      ? 'border-blue-700 bg-blue-50/70'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900">UPI Transfer</p>
                  <p className="text-xs text-slate-500 mt-0.5">Instant UPI ID payout</p>
                </button>
                <button
                  type="button"
                  onClick={() => setMethod('bank')}
                  className={`p-3.5 rounded-xl border text-left transition-colors min-h-[56px] ${
                    method === 'bank'
                      ? 'border-blue-700 bg-blue-50/70'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <p className="text-sm font-bold text-slate-900">Bank Transfer</p>
                  <p className="text-xs text-slate-500 mt-0.5">IMPS / NEFT to bound bank</p>
                </button>
              </div>
            </div>

            {/* Bound Payout Preview */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-3">
              {activeBound ? (
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-500">
                    Bound {method === 'upi' ? 'UPI Account' : 'Bank Account'}
                  </p>
                  {method === 'upi' && payoutAccounts.upi ? (
                    <p className="font-mono text-sm font-bold text-slate-900 mt-0.5 truncate">
                      {payoutAccounts.upi.upiId}
                    </p>
                  ) : payoutAccounts.bank ? (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {payoutAccounts.bank.bankName} ·{' '}
                      <span className="font-mono">{payoutAccounts.bank.accountNumberMasked}</span>
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-700 text-xs font-medium">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>No {method.toUpperCase()} account bound yet.</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => onOpenBinding(method)}
                className="text-xs font-bold text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 px-3 py-2 rounded-lg bg-white border border-slate-200"
              >
                {activeBound ? 'Change' : 'Bind Now'}
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting || !activeBound || parseFloat(balance) < selectedAmount}
              className="w-full py-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold transition-colors disabled:opacity-50 min-h-[48px]"
            >
              {submitting
                ? 'Submitting Request...'
                : `Submit Withdrawal (₹${selectedAmount})`}
            </button>
          </form>
        </div>

        {/* Withdrawal History */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">
              Withdrawal Requests
            </h2>
            <Wallet className="h-4 w-4 text-blue-700" />
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading history...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              No withdrawal requests submitted yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((w) => (
                <div key={w.id} className="py-3.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {w.requestCode}
                    </span>
                    <span className="font-mono-num text-sm font-bold text-slate-900">
                      {formatInr(w.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 truncate">
                      {w.method.toUpperCase()} · {w.accountLabel}
                    </span>
                    <StatusLabel status={w.status} />
                  </div>
                  <p className="text-[11px] text-slate-400">{formatDateTime(w.createdAt)}</p>
                  {w.adminRemarks && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 mt-1">
                      Note: {w.adminRemarks}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 5. TRANSACTION HISTORY
export const TransactionHistoryPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [direction, setDirection] = useState<'all' | 'credit' | 'debit'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<
    {
      id: number;
      txCode: string;
      direction: 'credit' | 'debit';
      category: string;
      amount: string;
      balanceAfter: string;
      status: string;
      description: string;
      createdAt: string;
    }[]
  >([]);

  const loadTx = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ direction });
      if (search.trim()) qs.set('search', search.trim());
      const res = await apiFetch<{ transactions: typeof rows }>(
        `/api/user/transactions?${qs.toString()}`
      );
      setRows(res.transactions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTx();
  }, [direction]);

  return (
    <div className="space-y-5">
      <BackBar
        title="Transaction History"
        subtitle="Complete audit log of credits, rewards, and withdrawals"
        onBack={onBack}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {(['all', 'credit', 'debit'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize min-h-[40px] ${
                direction === d
                  ? 'bg-blue-700 text-white'
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {d === 'all' ? 'All Transactions' : `${d}s`}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadTx()}
            placeholder="Search TX ID or note..."
            className="px-3.5 py-2 text-sm bg-white rounded-xl border border-slate-200 min-h-[40px]"
          />
          <button
            type="button"
            onClick={loadTx}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold min-h-[40px]"
          >
            Filter
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading transactions...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No transactions found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((t) => (
              <div key={t.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center ${
                      t.direction === 'credit'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {t.direction === 'credit' ? (
                      <ArrowDownLeft className="h-4 w-4" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{t.description}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {t.txCode} · {t.category.replace('_', ' ')} · {formatDateTime(t.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p
                    className={`font-mono-num text-base font-bold ${
                      t.direction === 'credit' ? 'text-emerald-700' : 'text-slate-900'
                    }`}
                  >
                    {t.direction === 'credit' ? '+' : '-'}
                    {formatInr(t.amount)}
                  </p>
                  <StatusLabel status={t.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 6. NOTIFICATIONS
export const NotificationsPage: React.FC<{ onBack: () => void; onMarkedRead: () => void }> = ({
  onBack,
  onMarkedRead,
}) => {
  const [items, setItems] = useState<
    { id: number; title: string; message: string; type: string; isRead: boolean; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: typeof items }>('/api/user/notifications');
      setItems(res.notifications);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    await apiFetch('/api/user/notifications/read-all', { method: 'POST' });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onMarkedRead();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <BackBar title="Notifications" onBack={onBack} />
        <button
          type="button"
          onClick={markAllRead}
          className="text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap px-3 py-2"
        >
          Mark all read
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading notifications...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((n) => (
              <div
                key={n.id}
                className={`p-4 flex items-start gap-3 ${n.isRead ? 'bg-white' : 'bg-blue-50/40'}`}
              >
                <Bell className="h-4 w-4 text-blue-700 mt-1 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{n.title}</p>
                    <span className="text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{n.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 7. ANDROID WEBVIEW & APK GUIDE
export const AndroidGuidePage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const appUrl = window.location.origin;

  return (
    <div className="space-y-5">
      <BackBar
        title="Android WebView & APK Integration"
        subtitle="Package TASK HUB as a native Android APK in Android Studio"
        onBack={onBack}
      />

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Smartphone className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              WebView Compatibility Checklist
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              TASK HUB supports hardware Back navigation via <code className="font-mono text-xs">history.pushState</code>, HTML5 inline video playback, <code className="font-mono text-xs">&lt;input type=&quot;file&quot;&gt;</code> proof uploads, WhatsApp deep links, and persistent localStorage sessions.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-900 text-slate-100 p-4 overflow-x-auto text-xs font-mono leading-relaxed">
          <pre>{`// MainActivity.kt (Android Studio - Kotlin)
val webView = findViewById<WebView>(R.id.webView)
webView.settings.apply {
    javaScriptEnabled = true
    domStorageEnabled = true
    allowFileAccess = true
    mediaPlaybackRequiresUserGesture = false
    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
}

webView.webViewClient = object : WebViewClient() {
    override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
        val url = req.url.toString()
        if (url.startsWith("${appUrl}")) return false
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) // WhatsApp & external task links
        return true
    }
}

// Handle hardware Back button
onBackPressedDispatcher.addCallback(this) {
    if (webView.canGoBack()) webView.goBack() else finish()
}

webView.loadUrl("${appUrl}")`}</pre>
        </div>
      </div>
    </div>
  );
};
