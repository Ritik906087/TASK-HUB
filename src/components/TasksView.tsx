import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { TaskCard, type TaskListItem } from './TaskCard.tsx';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
] as const;

type StatusTabId = (typeof STATUS_TABS)[number]['id'];

const CATEGORIES = [
  { id: 'all', label: 'All Categories' },
  { id: 'video_watching', label: 'Video Watching' },
  { id: 'photo_viewing', label: 'Photo Viewing' },
  { id: 'website_visiting', label: 'Website Visiting' },
  { id: 'social_media', label: 'Social Media' },
  { id: 'other', label: 'Other Tasks' },
];

function getStatusBucket(userStatus: string): StatusTabId | 'available' {
  const s = (userStatus || '').toLowerCase();
  if (s === 'submitted' || s === 'pending_verification' || s === 'pending') return 'pending';
  if (s === 'approved' || s === 'completed') return 'completed';
  if (s === 'rejected' || s === 'failed') return 'failed';
  return 'available';
}

interface TasksViewProps {
  tasks: TaskListItem[];
  loading: boolean;
  onSelectTask: (taskId: number) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({ tasks, loading, onSelectTask }) => {
  const [statusFilter, setStatusFilter] = useState<StatusTabId>('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const statusCounts = useMemo(() => {
    const counts: Record<StatusTabId, number> = {
      all: tasks.length,
      pending: 0,
      completed: 0,
      failed: 0,
    };
    for (const t of tasks) {
      const bucket = getStatusBucket(t.userStatus);
      if (bucket === 'pending') counts.pending += 1;
      if (bucket === 'completed') counts.completed += 1;
      if (bucket === 'failed') counts.failed += 1;
    }
    return counts;
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== 'all' && getStatusBucket(t.userStatus) !== statusFilter) return false;
      if (category !== 'all' && t.category !== category) return false;
      if (q) {
        return (
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tasks, statusFilter, category, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
          Tasks
        </h1>

        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#5B46F6]/20 focus:border-[#5B46F6] min-h-[44px]"
          />
        </div>
      </div>

      {/* Status Filter Tabs: All / Pending / Completed / Failed */}
      <div className="grid grid-cols-4 gap-2 bg-white p-1.5 rounded-2xl border border-slate-200/80">
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`py-2 px-2 rounded-xl text-xs font-bold transition-colors min-h-[38px] flex items-center justify-center gap-1.5 ${
                active
                  ? 'bg-[#5B46F6] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] font-mono-num px-1.5 py-0.5 rounded-md ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {statusCounts[tab.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Category Filter Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
              category === cat.id
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {loading && tasks.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            {statusFilter === 'pending'
              ? 'No pending tasks yet.'
              : statusFilter === 'completed'
                ? 'No completed tasks yet.'
                : statusFilter === 'failed'
                  ? 'No failed tasks found.'
                  : 'No matching tasks found.'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {statusFilter === 'all'
              ? 'Try switching categories or clearing your search filter.'
              : 'Submitted, completed, and failed tasks appear here automatically.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
          ))}
        </div>
      )}
    </div>
  );
};
