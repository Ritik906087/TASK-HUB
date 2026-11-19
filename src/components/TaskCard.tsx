import React from 'react';
import { formatInr } from '../lib/api.ts';
import { getCategoryMeta, StatusLabel } from './BrandMark.tsx';

export interface TaskListItem {
  id: number;
  title: string;
  category: string;
  iconUrl: string | null;
  description: string;
  externalLink: string;
  rewardAmount: string;
  videoCount: number;
  photoCount: number;
  commentCount: number;
  dailyLimit: number;
  totalLimit: number;
  completedCount: number;
  userStatus: string;
}

interface TaskCardProps {
  task: TaskListItem;
  onSelect: (taskId: number) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onSelect }) => {
  const cat = getCategoryMeta(task.category);
  const CatIcon = cat.Icon;
  const hasCustomUploadedIcon =
    Boolean(task.iconUrl) &&
    task.iconUrl !== '/icon.svg' &&
    !task.iconUrl?.startsWith('/src/assets/images/');

  const normalizedStatus =
    task.userStatus === 'rejected'
      ? 'failed'
      : task.userStatus === 'submitted' || task.userStatus === 'pending_verification'
        ? 'pending'
        : task.userStatus === 'approved' || task.userStatus === 'completed'
          ? 'completed'
          : 'available';

  return (
    <article
      onClick={() => onSelect(task.id)}
      className="group bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer flex items-center justify-between gap-3.5"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div
          className={`h-12 w-12 sm:h-13 sm:w-13 rounded-2xl shrink-0 overflow-hidden flex items-center justify-center shadow-xs ${
            hasCustomUploadedIcon ? 'bg-slate-100 border border-slate-200' : cat.bgClass
          }`}
        >
          {hasCustomUploadedIcon ? (
            <img
              src={task.iconUrl!}
              alt={task.title}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <CatIcon className="h-6 w-6" strokeWidth={2.2} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm sm:text-base font-bold text-slate-900 group-hover:text-[#5B46F6] transition-colors truncate">
            {task.title}
          </h3>
          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{task.description}</p>
          {normalizedStatus !== 'available' && (
            <div className="mt-1">
              <StatusLabel status={normalizedStatus} />
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(task.id);
        }}
        className="rounded-xl bg-[#5B46F6] hover:bg-[#4B36E6] text-white px-4 py-2.5 text-xs sm:text-sm font-mono-num font-bold transition-colors whitespace-nowrap shrink-0 min-h-[40px] shadow-xs"
      >
        {formatInr(task.rewardAmount)}
      </button>
    </article>
  );
};
