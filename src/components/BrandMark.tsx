import React from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Globe,
  Images,
  Play,
  Share2,
  XCircle,
} from 'lucide-react';

export const BrandMark: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const iconSize = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <span
        className={`${iconSize} rounded-xl bg-[#5B46F6] text-white flex items-center justify-center shrink-0 shadow-xs`}
        aria-hidden="true"
      >
        <ClipboardCheck className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2.4} />
      </span>
      <span className={`font-display font-bold tracking-tight text-slate-900 ${textSize}`}>
        TASK HUB
      </span>
    </span>
  );
};

export function getCategoryMeta(category: string) {
  switch (category) {
    case 'video_watching':
      return {
        label: 'Video Watching',
        Icon: Play,
        bgClass: 'bg-gradient-to-br from-[#5B46F6] to-indigo-700 text-white',
        colorClass: 'text-[#5B46F6] bg-indigo-50',
      };
    case 'photo_viewing':
      return {
        label: 'Photo Viewing',
        Icon: Images,
        bgClass: 'bg-gradient-to-br from-sky-500 to-blue-700 text-white',
        colorClass: 'text-sky-700 bg-sky-50',
      };
    case 'website_visiting':
      return {
        label: 'Website Visiting',
        Icon: Globe,
        bgClass: 'bg-gradient-to-br from-blue-600 to-indigo-800 text-white',
        colorClass: 'text-blue-700 bg-blue-50',
      };
    case 'social_media':
      return {
        label: 'Social Media',
        Icon: Share2,
        bgClass: 'bg-gradient-to-br from-emerald-500 to-teal-700 text-white',
        colorClass: 'text-emerald-700 bg-emerald-50',
      };
    default:
      return {
        label: 'Other Task',
        Icon: ClipboardCheck,
        bgClass: 'bg-gradient-to-br from-slate-700 to-slate-900 text-white',
        colorClass: 'text-slate-700 bg-slate-100',
      };
  }
}

export const StatusLabel: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status.toLowerCase();
  if (
    normalized === 'approved' ||
    normalized === 'completed' ||
    normalized === 'paid' ||
    normalized === 'active' ||
    normalized === 'valid'
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span className="capitalize">{normalized.replace('_', ' ')}</span>
      </span>
    );
  }
  if (
    normalized === 'rejected' ||
    normalized === 'failed' ||
    normalized === 'blocked' ||
    normalized === 'invalid'
  ) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 whitespace-nowrap">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="capitalize">{normalized.replace('_', ' ')}</span>
      </span>
    );
  }
  if (normalized === 'available') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B46F6] whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>Available</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
      <Clock className="h-3.5 w-3.5 shrink-0" />
      <span className="capitalize">{normalized.replace('_', ' ')}</span>
    </span>
  );
};
