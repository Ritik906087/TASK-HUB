import React, { useCallback, useEffect, useState } from 'react';
import { Bell, ClipboardList, Home, Share2, User } from 'lucide-react';
import { apiFetch, formatInr, getUserToken, setUserToken } from './lib/api.ts';
import { AdminPortal } from './components/AdminPortal.tsx';
import { AuthViews, type AuthScreenMode } from './components/AuthViews.tsx';
import { BrandMark } from './components/BrandMark.tsx';
import { HomeDashboard, type DashboardMetrics } from './components/HomeDashboard.tsx';
import { InviteView } from './components/InviteView.tsx';
import { MineView, type MineSubView } from './components/MineView.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstall.tsx';
import { type TaskListItem } from './components/TaskCard.tsx';
import { TaskDetailView } from './components/TaskDetailView.tsx';
import { TasksView } from './components/TasksView.tsx';

type MainTab = 'home' | 'tasks' | 'invite' | 'mine';

interface MeResponse {
  user: {
    id: number;
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
}

const isAdminUrlPath = (pathname: string) =>
  pathname === '/adm7870' || pathname.startsWith('/adm7870/');

const MINE_SUBVIEW_LABELS: Record<MineSubView, string> = {
  menu: 'My Account',
  team: 'Team Details',
  earnings: 'Earnings History',
  bind_bank: 'Bind Bank Account',
  bind_upi: 'Bind UPI ID',
  withdraw: 'Withdraw Funds',
  transactions: 'Transaction History',
  notifications: 'Notifications',
  android_guide: 'Android APK Guide',
};

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState(() =>
    isAdminUrlPath(window.location.pathname)
  );
  const [authMode] = useState<AuthScreenMode>(() =>
    window.location.pathname.startsWith('/register') ? 'register' : 'login'
  );
  const [inviteCodeParam] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('ref') || '').trim().toUpperCase();
  });

  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getUserToken()));
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [mineSubView, setMineSubView] = useState<MineSubView>('menu');

  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loadingApp, setLoadingApp] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);

  const navigateState = useCallback(
    (next: { tab?: MainTab; taskId?: number | null; mineView?: MineSubView; admin?: boolean }) => {
      if (next.admin !== undefined) {
        setIsAdminRoute(next.admin);
        window.history.pushState(next, '', next.admin ? '/adm7870' : '/');
        return;
      }
      if (next.tab !== undefined) setActiveTab(next.tab);
      if (next.taskId !== undefined) setSelectedTaskId(next.taskId);
      if (next.mineView !== undefined) setMineSubView(next.mineView);
      window.history.pushState(
        {
          tab: next.tab ?? activeTab,
          taskId: next.taskId !== undefined ? next.taskId : selectedTaskId,
          mineView: next.mineView ?? mineSubView,
          admin: false,
        },
        '',
        '/'
      );
    },
    [activeTab, selectedTaskId, mineSubView]
  );

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isAdminUrlPath(window.location.pathname)) {
        setIsAdminRoute(true);
        return;
      }
      setIsAdminRoute(false);
      if (e.state) {
        if (e.state.tab) setActiveTab(e.state.tab);
        setSelectedTaskId(e.state.taskId ?? null);
        setMineSubView(e.state.mineView ?? 'menu');
      } else {
        setSelectedTaskId(null);
        setMineSubView('menu');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const loadUserAppData = useCallback(async () => {
    if (!getUserToken()) return;
    setLoadingApp(true);
    setAppError(null);
    try {
      const [meRes, dashRes, tasksRes] = await Promise.all([
        apiFetch<MeResponse>('/api/auth/me'),
        apiFetch<DashboardMetrics>('/api/user/dashboard'),
        apiFetch<{ tasks: TaskListItem[] }>('/api/user/tasks'),
      ]);
      setProfile(meRes);
      setMetrics(dashRes);
      setTasks(tasksRes.tasks);
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        setUserToken(null);
        setIsAuthenticated(false);
      } else {
        setAppError(err.message || 'Unable to sync account data.');
      }
    } finally {
      setLoadingApp(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isAdminRoute) {
      loadUserAppData();
    }
  }, [isAuthenticated, isAdminRoute, loadUserAppData]);

  const handleLogout = () => {
    setUserToken(null);
    setIsAuthenticated(false);
    setProfile(null);
    setMetrics(null);
    setTasks([]);
    setSelectedTaskId(null);
    setMineSubView('menu');
    setActiveTab('home');
  };

  if (isAdminRoute) {
    return (
      <>
        <AdminPortal
          onExitToUserApp={() => {
            setIsAdminRoute(false);
            window.history.pushState({ tab: 'home' }, '', '/');
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthViews
          initialMode={inviteCodeParam ? 'register' : authMode}
          initialInviteCode={inviteCodeParam}
          onAuthenticated={() => {
            setIsAuthenticated(true);
            setActiveTab('home');
            window.history.replaceState({ tab: 'home', taskId: null, mineView: 'menu' }, '', '/');
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  const navItems: { id: MainTab; label: string; Icon: React.ElementType }[] = [
    { id: 'home', label: 'HOME', Icon: Home },
    { id: 'tasks', label: 'TASKS', Icon: ClipboardList },
    { id: 'invite', label: 'INVITE', Icon: Share2 },
    { id: 'mine', label: 'MINE', Icon: User },
  ];

  const handleSelectTab = (tab: MainTab) => {
    navigateState({ tab, taskId: null, mineView: 'menu' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const walletBalanceDisplay = formatInr(metrics?.balance ?? profile?.wallet.balance);

  const desktopTitle =
    selectedTaskId !== null
      ? 'Task Details'
      : activeTab === 'home'
        ? 'Home Dashboard'
        : activeTab === 'tasks'
          ? 'Task Marketplace'
          : activeTab === 'invite'
            ? 'Invite & Earn'
            : MINE_SUBVIEW_LABELS[mineSubView];

  const mobileSubTitle =
    selectedTaskId !== null
      ? 'Task Details'
      : activeTab === 'mine' && mineSubView !== 'menu'
        ? MINE_SUBVIEW_LABELS[mineSubView]
        : '';

  return (
    <div className="min-h-screen bg-[#F8F9FC] top-aura-bg flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-64 bg-white border-r border-slate-200 flex-col shrink-0 sticky top-0 h-screen">
        <div className="h-16 px-6 border-b border-slate-200 flex items-center">
          <BrandMark />
        </div>

        <nav className="p-4 space-y-1.5 flex-1">
          {navItems.map((item) => {
            const Icon = item.Icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors min-h-[44px] ${
                  active
                    ? 'bg-[#5B46F6] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="capitalize">{item.label.toLowerCase()}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => navigateState({ tab: 'mine', taskId: null, mineView: 'withdraw' })}
            className="w-full text-left rounded-xl bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-100 p-3.5 transition-colors"
          >
            <p className="text-[11px] font-medium text-slate-500">Wallet Balance</p>
            <p className="font-mono-num text-lg font-bold text-[#5B46F6] mt-0.5">
              {walletBalanceDisplay}
            </p>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Minimal Top Header — No title, no balance, no UID */}
        <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/85 backdrop-blur-md border-b border-slate-200/70 px-4 sm:px-8 flex items-center justify-between gap-3">
          {/* Mobile Left */}
          <div className="lg:hidden min-w-0">
            {mobileSubTitle ? (
              <h2 className="font-display text-sm font-bold text-slate-900 truncate">
                {mobileSubTitle}
              </h2>
            ) : null}
          </div>

          {/* Desktop Left */}
          <div className="hidden lg:flex items-center min-w-0">
            <h2 className="font-display text-base font-bold text-slate-900 truncate">
              {desktopTitle}
            </h2>
          </div>

          {/* Right Actions: PWA Install + Notification Bell */}
          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton compact />

            <button
              type="button"
              onClick={() =>
                navigateState({ tab: 'mine', taskId: null, mineView: 'notifications' })
              }
              className="relative h-10 w-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-[#5B46F6] transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-4.5 w-4.5" strokeWidth={2} />
              {(metrics?.unreadNotifications ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {metrics?.unreadNotifications}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 p-4 sm:p-8 pb-24 lg:pb-10 max-w-6xl w-full mx-auto">
          {appError && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
              <span>{appError}</span>
              <button
                type="button"
                onClick={loadUserAppData}
                className="text-xs font-bold underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {selectedTaskId !== null ? (
            <TaskDetailView
              taskId={selectedTaskId}
              onBack={() => navigateState({ taskId: null })}
              onSubmitted={loadUserAppData}
            />
          ) : activeTab === 'home' ? (
            <HomeDashboard
              metrics={metrics}
              tasks={tasks}
              loading={loadingApp}
              onSelectTask={(id) => navigateState({ taskId: id })}
              onGoToTasks={() => handleSelectTab('tasks')}
              onGoToInvite={() => handleSelectTab('invite')}
            />
          ) : activeTab === 'tasks' ? (
            <TasksView
              tasks={tasks}
              loading={loadingApp}
              onSelectTask={(id) => navigateState({ taskId: id })}
            />
          ) : activeTab === 'invite' ? (
            <InviteView />
          ) : (
            <MineView
              profile={profile}
              subView={mineSubView}
              onChangeSubView={(v) => navigateState({ tab: 'mine', mineView: v })}
              onOpenInvite={() => handleSelectTab('invite')}
              onRefreshDashboard={loadUserAppData}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile bottom navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-4 h-16 items-center">
          {navItems.map((item) => {
            const Icon = item.Icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectTab(item.id)}
                className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-colors ${
                  active ? 'text-[#5B46F6]' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span
                  className={`flex items-center justify-center rounded-xl px-3 py-1 transition-colors ${
                    active ? 'bg-indigo-50' : ''
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? 'stroke-[2.3]' : 'stroke-[1.8]'}`} />
                </span>
                <span
                  className={`text-[10px] mt-0.5 tracking-wide ${
                    active ? 'font-bold' : 'font-medium'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}
