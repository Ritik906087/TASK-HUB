import React, { useEffect, useState } from 'react';
import {
  ArrowDownUp,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  DollarSign,
  Edit3,
  Eye,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Plus,
  Settings,
  Shield,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  apiFetch,
  formatDateOnly,
  formatDateTime,
  formatInr,
  getAdminToken,
  setAdminToken,
  uploadMediaFile,
} from '../lib/api.ts';
import { BrandMark, getCategoryMeta, StatusLabel } from './BrandMark.tsx';

type AdminTab =
  | 'overview'
  | 'tasks'
  | 'submissions'
  | 'withdrawals'
  | 'users'
  | 'referrals'
  | 'transactions'
  | 'settings';

interface AdminPortalProps {
  onExitToUserApp: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onExitToUserApp }) => {
  const [authed, setAuthed] = useState(Boolean(getAdminToken()));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [tab, setTab] = useState<AdminTab>('overview');
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Overview state
  const [overview, setOverview] = useState<{
    kpis: Record<string, number | string>;
    chartSeries: {
      date: string;
      label: string;
      registrations: number;
      submissions: number;
      withdrawalAmount: number;
    }[];
    categoryBreakdown: { category: string; total: number }[];
  } | null>(null);

  // Tasks state
  const [tasksList, setTasksList] = useState<any[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    category: 'video_watching',
    iconUrl: '/icon.svg',
    description: '',
    instructions: '',
    externalLink: '',
    rewardAmount: '15',
    videoUrlsText: '',
    photoUrlsText: '',
    dailyLimit: '100',
    totalLimit: '5000',
    isActive: true,
  });

  // Submissions state
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [subFilter, setSubFilter] = useState('pending_verification');

  // Withdrawals state
  const [withdrawalsList, setWithdrawalsList] = useState<any[]>([]);
  const [wdrFilter, setWdrFilter] = useState('all');
  const [wdrSearch, setWdrSearch] = useState('');
  const [wdrRemarksMap, setWdrRemarksMap] = useState<Record<number, string>>({});

  // Users state
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [balanceForm, setBalanceForm] = useState({
    type: 'add' as 'add' | 'deduct',
    amount: '',
    reason: '',
  });

  // Referrals state
  const [refData, setRefData] = useState<{ relationships: any[]; commissions: any[] }>({
    relationships: [],
    commissions: [],
  });

  // Transactions state
  const [txList, setTxList] = useState<any[]>([]);
  const [txDirFilter, setTxDirFilter] = useState('all');
  const [txCatFilter, setTxCatFilter] = useState('all');
  const [txSearch, setTxSearch] = useState('');

  // Settings state
  const [settingsForm, setSettingsForm] = useState<any>(null);
  const [amountsInput, setAmountsInput] = useState('');

  const notifySuccess = (msg: string) => {
    setBannerMsg(msg);
    setBannerError(null);
    setTimeout(() => setBannerMsg(null), 4000);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/admin/login', {
        method: 'POST',
        tokenType: 'none',
        body: JSON.stringify({ username, password }),
      });
      setAdminToken(res.token);
      setAuthed(true);
    } catch (err: any) {
      setLoginError(err.message || 'Admin login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setAdminToken(null);
    setAuthed(false);
  };

  const loadTabData = async (currentTab = tab) => {
    setBannerError(null);
    try {
      if (currentTab === 'overview') {
        const res = await apiFetch<typeof overview>('/api/admin/dashboard', { tokenType: 'admin' });
        setOverview(res);
      } else if (currentTab === 'tasks') {
        const res = await apiFetch<{ tasks: any[] }>('/api/admin/tasks', { tokenType: 'admin' });
        setTasksList(res.tasks);
      } else if (currentTab === 'submissions') {
        const res = await apiFetch<{ submissions: any[] }>(
          `/api/admin/submissions?status=${subFilter}`,
          { tokenType: 'admin' }
        );
        setSubmissions(res.submissions);
      } else if (currentTab === 'withdrawals') {
        const qs = new URLSearchParams({ status: wdrFilter });
        if (wdrSearch.trim()) qs.set('search', wdrSearch.trim());
        const res = await apiFetch<{ withdrawals: any[] }>(
          `/api/admin/withdrawals?${qs.toString()}`,
          { tokenType: 'admin' }
        );
        setWithdrawalsList(res.withdrawals);
      } else if (currentTab === 'users') {
        const qs = new URLSearchParams({ status: userStatusFilter });
        if (userSearch.trim()) qs.set('search', userSearch.trim());
        const res = await apiFetch<{ users: any[] }>(`/api/admin/users?${qs.toString()}`, {
          tokenType: 'admin',
        });
        setUsersList(res.users);
      } else if (currentTab === 'referrals') {
        const res = await apiFetch<typeof refData>('/api/admin/referrals', { tokenType: 'admin' });
        setRefData(res);
      } else if (currentTab === 'transactions') {
        const qs = new URLSearchParams({ direction: txDirFilter, category: txCatFilter });
        if (txSearch.trim()) qs.set('search', txSearch.trim());
        const res = await apiFetch<{ transactions: any[] }>(
          `/api/admin/transactions?${qs.toString()}`,
          { tokenType: 'admin' }
        );
        setTxList(res.transactions);
      } else if (currentTab === 'settings') {
        const res = await apiFetch<{ settings: any }>('/api/admin/settings', { tokenType: 'admin' });
        setSettingsForm(res.settings);
        setAmountsInput((res.settings.withdrawalAmounts || []).join(', '));
      }
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        handleLogout();
      } else {
        setBannerError(err.message || 'Failed to load admin data');
      }
    }
  };

  useEffect(() => {
    if (authed) {
      loadTabData(tab);
    }
  }, [authed, tab, subFilter, wdrFilter, userStatusFilter, txDirFilter, txCatFilter]);

  const openCreateTask = () => {
    setEditingTaskId(null);
    setTaskForm({
      title: '',
      category: 'video_watching',
      iconUrl: '/icon.svg',
      description: '',
      instructions: '',
      externalLink: '',
      rewardAmount: '15',
      videoUrlsText: '',
      photoUrlsText: '',
      dailyLimit: '100',
      totalLimit: '5000',
      isActive: true,
    });
    setTaskModalOpen(true);
  };

  const openEditTask = (t: any) => {
    setEditingTaskId(t.id);
    setTaskForm({
      title: t.title,
      category: t.category,
      iconUrl: t.iconUrl || '/icon.svg',
      description: t.description,
      instructions: t.instructions || '',
      externalLink: t.externalLink,
      rewardAmount: String(t.rewardAmount),
      videoUrlsText: (t.videoUrls || []).join('\n'),
      photoUrlsText: (t.photoUrls || []).join('\n'),
      dailyLimit: String(t.dailyLimit),
      totalLimit: String(t.totalLimit),
      isActive: Boolean(t.isActive),
    });
    setTaskModalOpen(true);
  };

  const handleUploadTaskAsset = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'iconUrl' | 'photoUrlsText' | 'videoUrlsText'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadMediaFile(file, 'admin');
      if (field === 'iconUrl') {
        setTaskForm((p) => ({ ...p, iconUrl: uploaded.url }));
      } else {
        setTaskForm((p) => ({
          ...p,
          [field]: p[field] ? `${p[field]}\n${uploaded.url}` : uploaded.url,
        }));
      }
      notifySuccess(`Uploaded ${uploaded.fileName}`);
    } catch (err: any) {
      setBannerError(err.message || 'Upload failed');
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title: taskForm.title,
        category: taskForm.category,
        iconUrl: taskForm.iconUrl,
        description: taskForm.description,
        instructions: taskForm.instructions,
        externalLink: taskForm.externalLink,
        rewardAmount: Number(taskForm.rewardAmount),
        videoUrls: taskForm.videoUrlsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        photoUrls: taskForm.photoUrlsText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        dailyLimit: Number(taskForm.dailyLimit),
        totalLimit: Number(taskForm.totalLimit),
        isActive: taskForm.isActive,
      };
      if (editingTaskId) {
        await apiFetch(`/api/admin/tasks/${editingTaskId}`, {
          method: 'PUT',
          tokenType: 'admin',
          body: JSON.stringify(payload),
        });
        notifySuccess('Task updated successfully.');
      } else {
        await apiFetch('/api/admin/tasks', {
          method: 'POST',
          tokenType: 'admin',
          body: JSON.stringify(payload),
        });
        notifySuccess('Task created and published.');
      }
      setTaskModalOpen(false);
      loadTabData('tasks');
    } catch (err: any) {
      setBannerError(err.message || 'Failed to save task');
    }
  };

  const handleToggleTask = async (id: number) => {
    await apiFetch(`/api/admin/tasks/${id}/toggle`, { method: 'PATCH', tokenType: 'admin' });
    loadTabData('tasks');
  };

  const handleDeleteTask = async (id: number) => {
    await apiFetch(`/api/admin/tasks/${id}`, { method: 'DELETE', tokenType: 'admin' });
    notifySuccess('Task deleted.');
    loadTabData('tasks');
  };

  const handleReviewSubmission = async (id: number, action: 'approve' | 'reject') => {
    try {
      await apiFetch(`/api/admin/submissions/${id}/review`, {
        method: 'POST',
        tokenType: 'admin',
        body: JSON.stringify({
          action,
          remarks:
            action === 'approve' ? 'Verified and approved by admin' : 'Proof insufficient',
        }),
      });
      notifySuccess(`Submission ${action}d.`);
      loadTabData('submissions');
    } catch (err: any) {
      setBannerError(err.message);
    }
  };

  const handleProcessWithdrawal = async (
    id: number,
    action: 'approve' | 'processing' | 'paid' | 'reject'
  ) => {
    try {
      await apiFetch(`/api/admin/withdrawals/${id}/process`, {
        method: 'POST',
        tokenType: 'admin',
        body: JSON.stringify({
          action,
          remarks: wdrRemarksMap[id] || undefined,
        }),
      });
      notifySuccess(`Withdrawal updated (${action}).`);
      loadTabData('withdrawals');
    } catch (err: any) {
      setBannerError(err.message);
    }
  };

  const openUserDetail = async (userId: number) => {
    try {
      const res = await apiFetch<any>(`/api/admin/users/${userId}`, { tokenType: 'admin' });
      setSelectedUserDetail(res);
      setBalanceForm({ type: 'add', amount: '', reason: '' });
    } catch (err: any) {
      setBannerError(err.message);
    }
  };

  const handleToggleUserBlock = async (userId: number, currentStatus: string) => {
    const next = currentStatus === 'blocked' ? 'active' : 'blocked';
    await apiFetch(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      tokenType: 'admin',
      body: JSON.stringify({ status: next }),
    });
    notifySuccess(`User status updated to ${next}.`);
    loadTabData('users');
    if (selectedUserDetail?.user?.id === userId) {
      openUserDetail(userId);
    }
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserDetail) return;
    try {
      await apiFetch(`/api/admin/users/${selectedUserDetail.user.id}/balance`, {
        method: 'POST',
        tokenType: 'admin',
        body: JSON.stringify({
          type: balanceForm.type,
          amount: Number(balanceForm.amount),
          reason: balanceForm.reason,
        }),
      });
      notifySuccess('Balance updated with audited transaction record.');
      await openUserDetail(selectedUserDetail.user.id);
      loadTabData('users');
    } catch (err: any) {
      setBannerError(err.message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedAmounts = amountsInput
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);

      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        tokenType: 'admin',
        body: JSON.stringify({
          ...settingsForm,
          withdrawalAmounts: parsedAmounts,
        }),
      });
      notifySuccess('Platform settings saved.');
      loadTabData('settings');
    } catch (err: any) {
      setBannerError(err.message);
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between">
          <BrandMark />
          <button
            type="button"
            onClick={onExitToUserApp}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 min-h-[40px]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Member App</span>
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="h-12 w-12 rounded-2xl bg-blue-700 text-white flex items-center justify-center mb-5">
              <Shield className="h-6 w-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              TASK HUB Admin Console
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Sign in with your administrator credentials. User accounts cannot access this portal.
            </p>

            {loginError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {loginError}
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Admin Username or Email
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full px-3.5 py-3 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full px-3.5 py-3 text-sm rounded-xl border border-slate-200"
                />
              </div>
              <button
                type="submit"
                disabled={loggingIn}
                className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold min-h-[48px]"
              >
                {loggingIn ? 'Verifying...' : 'Sign In to Admin Panel'}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const navItems: { id: AdminTab; label: string; Icon: React.ElementType }[] = [
    { id: 'overview', label: 'Dashboard', Icon: LayoutDashboard },
    { id: 'tasks', label: 'Task Management', Icon: ListChecks },
    { id: 'submissions', label: 'Submissions', Icon: ClipboardCheck },
    { id: 'withdrawals', label: 'Withdrawals', Icon: Wallet },
    { id: 'users', label: 'Users & Balances', Icon: Users },
    { id: 'referrals', label: 'Referrals', Icon: DollarSign },
    { id: 'transactions', label: 'Transactions', Icon: ArrowDownUp },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];

  const maxChartVal = Math.max(
    1,
    ...(overview?.chartSeries.map((d) => Math.max(d.registrations, d.submissions)) || [1])
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 flex flex-col">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
          <BrandMark size="sm" />
          <span className="text-xs font-bold text-blue-700">Admin</span>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[42px] ${
                  tab === item.id
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:block mt-auto p-4 border-t border-slate-200 space-y-2">
          <button
            type="button"
            onClick={onExitToUserApp}
            className="w-full py-2.5 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Open Member App
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2.5 px-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Admin Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4">
          <h1 className="font-display text-lg font-bold text-slate-900 capitalize">
            {navItems.find((n) => n.id === tab)?.label}
          </h1>
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={onExitToUserApp}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold"
            >
              User App
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
          {bannerError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {bannerError}
            </div>
          )}
          {bannerMsg && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {bannerMsg}
            </div>
          )}

          {/* OVERVIEW */}
          {tab === 'overview' && overview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  ['Total Users', overview.kpis.totalUsers],
                  ["Today's Registrations", overview.kpis.todayRegistrations],
                  ['Valid Referrals', overview.kpis.totalValidReferrals],
                  ['Total Tasks', overview.kpis.totalTasks],
                  ['Active Tasks', overview.kpis.activeTasks],
                  ['Completed Tasks', overview.kpis.completedTasks],
                  ['Pending Proofs', overview.kpis.pendingSubmissions],
                  ['Total Task Rewards', formatInr(overview.kpis.totalTaskRewards)],
                  ['Referral Commissions', formatInr(overview.kpis.totalReferralCommission)],
                  ['Withdrawal Requests', overview.kpis.totalWithdrawalRequests],
                  ['Pending Withdrawals', overview.kpis.pendingWithdrawals],
                  ['Approved Withdrawals', overview.kpis.approvedWithdrawals],
                  ['Total Withdrawn Amount', formatInr(overview.kpis.totalWithdrawalAmount)],
                ].map(([label, val]) => (
                  <div
                    key={String(label)}
                    className="bg-white rounded-2xl border border-slate-200 p-4"
                  >
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="font-mono-num text-2xl font-bold text-slate-900 mt-1.5">
                      {val}
                    </p>
                  </div>
                ))}
              </div>

              {/* 7-Day Activity Chart + Category Distribution */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-display text-base font-bold text-slate-900">
                        7-Day Platform Activity
                      </h2>
                      <p className="text-xs text-slate-500">
                        Daily user registrations vs task submissions
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-sm bg-blue-700 inline-block" />
                        Registrations
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-sm bg-sky-400 inline-block" />
                        Submissions
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-3 items-end h-52 pt-4">
                    {overview.chartSeries.map((day) => {
                      const regH = Math.max(6, Math.round((day.registrations / maxChartVal) * 140));
                      const subH = Math.max(6, Math.round((day.submissions / maxChartVal) * 140));
                      return (
                        <div key={day.date} className="flex flex-col items-center gap-2">
                          <div className="flex items-end gap-1.5 h-36">
                            <div
                              title={`Registrations: ${day.registrations}`}
                              style={{ height: `${regH}px` }}
                              className="w-3.5 sm:w-5 rounded-t bg-blue-700 transition-all"
                            />
                            <div
                              title={`Submissions: ${day.submissions}`}
                              style={{ height: `${subH}px` }}
                              className="w-3.5 sm:w-5 rounded-t bg-sky-400 transition-all"
                            />
                          </div>
                          <span className="text-[11px] font-mono text-slate-500">{day.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6">
                  <h2 className="font-display text-base font-bold text-slate-900 mb-4">
                    Tasks by Category
                  </h2>
                  <div className="space-y-3">
                    {overview.categoryBreakdown.map((c) => {
                      const meta = getCategoryMeta(c.category);
                      return (
                        <div
                          key={c.category}
                          className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                        >
                          <span className="text-sm font-medium text-slate-700">{meta.label}</span>
                          <span className="font-mono-num text-sm font-bold text-slate-900">
                            {c.total}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TASK MANAGEMENT */}
          {tab === 'tasks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  All active tasks sync automatically to the member application.
                </p>
                <button
                  type="button"
                  onClick={openCreateTask}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-4 py-2.5 text-xs font-bold min-h-[44px]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Task</span>
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-3.5 px-4">Task</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4 text-right">Reward</th>
                      <th className="py-3.5 px-4 text-right">Quota</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {tasksList.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">{t.title}</td>
                        <td className="py-3.5 px-4 text-xs text-slate-600">
                          {getCategoryMeta(t.category).label}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-num font-bold text-blue-700">
                          {formatInr(t.rewardAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-num text-xs text-slate-600">
                          {t.completedCount} / {t.totalLimit}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusLabel status={t.isActive ? 'active' : 'blocked'} />
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleTask(t.id)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              {t.isActive ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditTask(t)}
                              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-700"
                              aria-label="Edit task"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTask(t.id)}
                              className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                              aria-label="Delete task"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SUBMISSIONS QUEUE */}
          {tab === 'submissions' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {['pending_verification', 'approved', 'rejected', 'all'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSubFilter(st)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold capitalize min-h-[40px] ${
                      subFilter === st
                        ? 'bg-blue-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {submissions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No submissions in this queue.
                  </div>
                ) : (
                  submissions.map((s) => (
                    <div
                      key={s.id}
                      className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">{s.taskTitle}</span>
                          <span className="font-mono text-xs font-bold text-blue-700">
                            {formatInr(s.taskReward)}
                          </span>
                          <StatusLabel status={s.status} />
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          User: {s.userUid} ({s.userPhone}) · {formatDateTime(s.submittedAt)}
                        </p>
                        {s.proofText && (
                          <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                            {s.proofText}
                          </p>
                        )}
                        {s.proofFileUrl && (
                          <a
                            href={s.proofFileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-xs font-semibold text-blue-700 underline"
                          >
                            Inspect Uploaded Proof Media
                          </a>
                        )}
                      </div>

                      {s.status !== 'approved' && s.status !== 'completed' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleReviewSubmission(s.id, 'approve')}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold min-h-[40px]"
                          >
                            Approve &amp; Credit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewSubmission(s.id, 'reject')}
                            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold min-h-[40px]"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* WITHDRAWAL MANAGEMENT */}
          {tab === 'withdrawals' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {['all', 'pending', 'approved', 'processing', 'paid', 'rejected'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setWdrFilter(st)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold capitalize whitespace-nowrap min-h-[40px] ${
                        wdrFilter === st
                          ? 'bg-blue-700 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="search"
                    value={wdrSearch}
                    onChange={(e) => setWdrSearch(e.target.value)}
                    placeholder="Search UID / Code..."
                    className="px-3.5 py-2 text-sm bg-white rounded-xl border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => loadTabData('withdrawals')}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
                {withdrawalsList.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No withdrawal requests match this filter.
                  </div>
                ) : (
                  withdrawalsList.map((w) => (
                    <div key={w.id} className="p-5 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-mono text-sm font-bold text-slate-900">
                              {w.requestCode}
                            </span>
                            <span className="text-xs font-mono text-slate-500">
                              UID: {w.userUid} · {w.userPhone}
                            </span>
                            <StatusLabel status={w.status} />
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{w.payoutDetails}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Requested {formatDateTime(w.createdAt)}
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="font-mono-num text-xl font-bold text-blue-700">
                            {formatInr(w.amount)}
                          </p>
                          <p className="text-xs text-slate-500 uppercase">{w.method}</p>
                        </div>
                      </div>

                      {w.status !== 'paid' && w.status !== 'rejected' && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100">
                          <input
                            type="text"
                            value={wdrRemarksMap[w.id] ?? ''}
                            onChange={(e) =>
                              setWdrRemarksMap((p) => ({ ...p, [w.id]: e.target.value }))
                            }
                            placeholder="Optional admin remarks or UTR reference..."
                            className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200"
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            {w.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleProcessWithdrawal(w.id, 'approve')}
                                className="px-3 py-2 rounded-xl bg-blue-700 text-white text-xs font-semibold"
                              >
                                Approve
                              </button>
                            )}
                            {(w.status === 'pending' || w.status === 'approved') && (
                              <button
                                type="button"
                                onClick={() => handleProcessWithdrawal(w.id, 'processing')}
                                className="px-3 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold"
                              >
                                Processing
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleProcessWithdrawal(w.id, 'paid')}
                              className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                            >
                              Mark Paid
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProcessWithdrawal(w.id, 'reject')}
                              className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
                            >
                              Reject &amp; Refund
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* USERS MANAGEMENT */}
          {tab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {['all', 'active', 'blocked'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setUserStatusFilter(st)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold capitalize min-h-[40px] ${
                        userStatusFilter === st
                          ? 'bg-blue-700 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadTabData('users')}
                    placeholder="Search UID, phone, ref code..."
                    className="px-3.5 py-2 text-sm bg-white rounded-xl border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => loadTabData('users')}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                  >
                    Search
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-3.5 px-4">UID / Member</th>
                      <th className="py-3.5 px-4">Phone</th>
                      <th className="py-3.5 px-4">Ref Code</th>
                      <th className="py-3.5 px-4 text-right">Balance</th>
                      <th className="py-3.5 px-4 text-right">Total Earned</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {usersList.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-3.5 px-4">
                          <p className="font-mono font-bold text-slate-900">{u.uid}</p>
                          <p className="text-xs text-slate-500">{u.fullName}</p>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs">{u.phone}</td>
                        <td className="py-3.5 px-4 font-mono text-xs">{u.referralCode}</td>
                        <td className="py-3.5 px-4 text-right font-mono-num font-bold text-blue-700">
                          {formatInr(u.balance)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-num text-slate-700">
                          {formatInr(u.totalEarnings)}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusLabel status={u.status} />
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openUserDetail(u.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Manage</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleUserBlock(u.id, u.status)}
                              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                                u.status === 'blocked'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-red-50 text-red-700'
                              }`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                              <span>{u.status === 'blocked' ? 'Unblock' : 'Block'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REFERRAL MANAGEMENT */}
          {tab === 'referrals' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Referral Tree Relationships ({refData.relationships.length})
                </h2>
                <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                  {refData.relationships.map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-mono text-slate-900">
                          Sponsor: <strong>{r.sponsorUid}</strong> → Member:{' '}
                          <strong>{r.memberUid}</strong>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Code: {r.referralCodeUsed} · {formatDateOnly(r.createdAt)}
                        </p>
                      </div>
                      <StatusLabel status={r.isValid ? 'valid' : 'invalid'} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Commission Payout Ledger ({refData.commissions.length})
                </h2>
                <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                  {refData.commissions.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-mono text-slate-900">
                          {c.sponsorUid} ← {c.sourceUid} (L{c.level} · {c.ratePercent}%)
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {c.sourceType} · {formatDateTime(c.createdAt)}
                        </p>
                      </div>
                      <span className="font-mono-num text-sm font-bold text-emerald-700">
                        +{formatInr(c.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TRANSACTION MANAGEMENT */}
          {tab === 'transactions' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={txDirFilter}
                  onChange={(e) => setTxDirFilter(e.target.value)}
                  className="px-3.5 py-2 text-xs font-semibold bg-white rounded-xl border border-slate-200"
                >
                  <option value="all">All Directions</option>
                  <option value="credit">Credits</option>
                  <option value="debit">Debits</option>
                </select>
                <select
                  value={txCatFilter}
                  onChange={(e) => setTxCatFilter(e.target.value)}
                  className="px-3.5 py-2 text-xs font-semibold bg-white rounded-xl border border-slate-200"
                >
                  <option value="all">All Categories</option>
                  <option value="task_reward">Task Rewards</option>
                  <option value="referral_commission">Referral Commissions</option>
                  <option value="team_task_commission">Team Commissions</option>
                  <option value="withdrawal">Withdrawals</option>
                  <option value="withdrawal_refund">Withdrawal Refunds</option>
                  <option value="money_adding">Manual Add</option>
                  <option value="admin_deduction">Manual Deduction</option>
                </select>
                <input
                  type="search"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  placeholder="Search TX ID, UID, note..."
                  className="px-3.5 py-2 text-sm bg-white rounded-xl border border-slate-200"
                />
                <button
                  type="button"
                  onClick={() => loadTabData('transactions')}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                >
                  Apply
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-3 px-4">TX ID</th>
                      <th className="py-3 px-4">User UID</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {txList.map((t) => (
                      <tr key={t.id}>
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {t.txCode}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">{t.userUid}</td>
                        <td className="py-3 px-4 capitalize">{t.category.replace('_', ' ')}</td>
                        <td className="py-3 px-4 text-slate-700">{t.description}</td>
                        <td
                          className={`py-3 px-4 text-right font-mono-num font-bold ${
                            t.direction === 'credit' ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {t.direction === 'credit' ? '+' : '-'}
                          {formatInr(t.amount)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusLabel status={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ADMIN SETTINGS */}
          {tab === 'settings' && settingsForm && (
            <form
              onSubmit={handleSaveSettings}
              className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6 max-w-3xl"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referral Commission (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={settingsForm.referralCommissionPercent}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        referralCommissionPercent: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Team Level-2 Commission (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={settingsForm.teamCommissionPercent}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        teamCommissionPercent: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Valid Referral Min Tasks
                  </label>
                  <input
                    type="number"
                    value={settingsForm.validReferralMinTasks}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        validReferralMinTasks: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Signup Welcome Bonus (₹)
                  </label>
                  <input
                    type="number"
                    value={settingsForm.signupBonus}
                    onChange={(e) =>
                      setSettingsForm({ ...settingsForm, signupBonus: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Minimum Withdrawal (₹)
                  </label>
                  <input
                    type="number"
                    value={settingsForm.minWithdrawal}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        minWithdrawal: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Maximum Withdrawal (₹)
                  </label>
                  <input
                    type="number"
                    value={settingsForm.maxWithdrawal}
                    onChange={(e) =>
                      setSettingsForm({
                        ...settingsForm,
                        maxWithdrawal: Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Available Withdrawal Amounts (comma separated ₹)
                </label>
                <input
                  type="text"
                  value={amountsInput}
                  onChange={(e) => setAmountsInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono rounded-xl border border-slate-200"
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-100">
                {[
                  ['registrationEnabled', 'Enable New User Registrations'],
                  ['referralRequired', 'Require Invite / Referral Code on Registration'],
                  ['autoApproveTasks', 'Auto-Approve Submitted Tasks Immediately'],
                  ['maintenanceMode', 'Maintenance Mode (Pause new registrations & withdrawals)'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(settingsForm[key])}
                      onChange={(e) =>
                        setSettingsForm({ ...settingsForm, [key]: e.target.checked })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-blue-700"
                    />
                    <span className="text-sm font-medium text-slate-800">{label}</span>
                  </label>
                ))}
              </div>

              <button
                type="submit"
                className="rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 text-sm font-bold min-h-[48px]"
              >
                Save Platform Settings
              </button>
            </form>
          )}
        </main>
      </div>

      {/* CREATE / EDIT TASK MODAL */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900">
                {editingTaskId ? 'Edit Task' : 'Create New Task'}
              </h2>
              <button
                type="button"
                onClick={() => setTaskModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Task Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={taskForm.category}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  >
                    <option value="video_watching">Video Watching</option>
                    <option value="photo_viewing">Photo Viewing</option>
                    <option value="website_visiting">Website Visiting</option>
                    <option value="social_media">Social Media</option>
                    <option value="other">Other Tasks</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reward (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={taskForm.rewardAmount}
                    onChange={(e) => setTaskForm({ ...taskForm, rewardAmount: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Daily Limit
                  </label>
                  <input
                    type="number"
                    value={taskForm.dailyLimit}
                    onChange={(e) => setTaskForm({ ...taskForm, dailyLimit: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Total Limit
                  </label>
                  <input
                    type="number"
                    value={taskForm.totalLimit}
                    onChange={(e) => setTaskForm({ ...taskForm, totalLimit: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  External Task Link *
                </label>
                <input
                  type="url"
                  required
                  value={taskForm.externalLink}
                  onChange={(e) => setTaskForm({ ...taskForm, externalLink: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Task Icon URL or Upload
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={taskForm.iconUrl}
                    onChange={(e) => setTaskForm({ ...taskForm, iconUrl: e.target.value })}
                    className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-slate-200"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleUploadTaskAsset(e, 'iconUrl')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description *
                </label>
                <textarea
                  rows={2}
                  required
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Instructions
                </label>
                <textarea
                  rows={2}
                  value={taskForm.instructions}
                  onChange={(e) => setTaskForm({ ...taskForm, instructions: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Video URLs (1 per line)
                    </label>
                    <label className="text-xs font-semibold text-blue-700 cursor-pointer">
                      + Upload Video
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => handleUploadTaskAsset(e, 'videoUrlsText')}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    value={taskForm.videoUrlsText}
                    onChange={(e) => setTaskForm({ ...taskForm, videoUrlsText: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Photo URLs (1 per line)
                    </label>
                    <label className="text-xs font-semibold text-blue-700 cursor-pointer">
                      + Upload Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleUploadTaskAsset(e, 'photoUrlsText')}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    value={taskForm.photoUrlsText}
                    onChange={(e) => setTaskForm({ ...taskForm, photoUrlsText: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold"
                >
                  {editingTaskId ? 'Save Changes' : 'Publish Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* USER DETAIL & BALANCE ADJUSTMENT MODAL */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {selectedUserDetail.user.fullName} ·{' '}
                  <span className="font-mono text-blue-700">{selectedUserDetail.user.uid}</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Phone: {selectedUserDetail.user.phone} · Ref:{' '}
                  {selectedUserDetail.user.referralCode} · Sponsor:{' '}
                  {selectedUserDetail.user.sponsorUid || 'Direct'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserDetail(null)}
                className="p-2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-blue-50 p-3">
                <p className="text-[11px] text-blue-700">Available Balance</p>
                <p className="font-mono-num text-lg font-bold text-blue-900">
                  {formatInr(selectedUserDetail.wallet.balance)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">Task Earnings</p>
                <p className="font-mono-num text-lg font-bold text-slate-900">
                  {formatInr(selectedUserDetail.wallet.totalTaskEarnings)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">Ref + Team</p>
                <p className="font-mono-num text-lg font-bold text-slate-900">
                  {formatInr(
                    parseFloat(selectedUserDetail.wallet.totalReferralEarnings) +
                      parseFloat(selectedUserDetail.wallet.totalTeamEarnings)
                  )}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">Total Withdrawn</p>
                <p className="font-mono-num text-lg font-bold text-slate-900">
                  {formatInr(selectedUserDetail.wallet.totalWithdrawn)}
                </p>
              </div>
            </div>

            {/* Manual Balance Adjustment */}
            <form
              onSubmit={handleAdjustBalance}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
            >
              <h3 className="text-xs font-bold text-slate-900 uppercase">
                Manual Balance Adjustment (Audited)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select
                  value={balanceForm.type}
                  onChange={(e) =>
                    setBalanceForm({ ...balanceForm, type: e.target.value as 'add' | 'deduct' })
                  }
                  className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white"
                >
                  <option value="add">Add Balance (+)</option>
                  <option value="deduct">Deduct Balance (-)</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={balanceForm.amount}
                  onChange={(e) => setBalanceForm({ ...balanceForm, amount: e.target.value })}
                  placeholder="Amount (₹)"
                  className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                />
                <input
                  type="text"
                  required
                  value={balanceForm.reason}
                  onChange={(e) => setBalanceForm({ ...balanceForm, reason: e.target.value })}
                  placeholder="Reason (required)"
                  className="sm:col-span-2 px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 text-xs font-bold"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Apply Adjustment</span>
              </button>
            </form>

            {/* User Team & Recent Activity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="border border-slate-200 rounded-xl p-3">
                <p className="font-bold text-slate-900 mb-2">
                  Team Members ({selectedUserDetail.team.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedUserDetail.team.map((tm: any) => (
                    <div key={tm.uid} className="flex justify-between">
                      <span className="font-mono">{tm.uid}</span>
                      <StatusLabel status={tm.isValid ? 'valid' : 'invalid'} />
                    </div>
                  ))}
                  {selectedUserDetail.team.length === 0 && (
                    <p className="text-slate-400">No invited users.</p>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-3">
                <p className="font-bold text-slate-900 mb-2">
                  Recent Transactions ({selectedUserDetail.transactions.length})
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {selectedUserDetail.transactions.map((tx: any) => (
                    <div key={tx.id} className="flex justify-between gap-2">
                      <span className="truncate text-slate-600">{tx.description}</span>
                      <span className="font-mono-num font-semibold">
                        {tx.direction === 'credit' ? '+' : '-'}
                        {formatInr(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
