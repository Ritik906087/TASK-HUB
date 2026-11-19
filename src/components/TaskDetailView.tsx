import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  Send,
  Upload,
} from 'lucide-react';
import { apiFetch, formatDateTime, formatInr, uploadMediaFile } from '../lib/api.ts';
import { getCategoryMeta, StatusLabel } from './BrandMark.tsx';

interface TaskDetailData {
  task: {
    id: number;
    title: string;
    category: string;
    iconUrl: string | null;
    description: string;
    instructions: string;
    externalLink: string;
    rewardAmount: string;
    videoUrls: string[];
    photoUrls: string[];
    dailyLimit: number;
    totalLimit: number;
    completedCount: number;
  };
  submission: {
    id: number;
    status: string;
    proofText: string | null;
    proofFileUrl: string | null;
    adminRemarks: string | null;
    submittedAt: string;
  } | null;
  comments: {
    id: number;
    message: string;
    createdAt: string;
    userUid: string;
    userName: string;
  }[];
}

interface TaskDetailViewProps {
  taskId: number;
  onBack: () => void;
  onSubmitted: () => void;
}

export const TaskDetailView: React.FC<TaskDetailViewProps> = ({
  taskId,
  onBack,
  onSubmitted,
}) => {
  const [data, setData] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [proofText, setProofText] = useState('');
  const [proofFileUrl, setProofFileUrl] = useState('');
  const [linkVisited, setLinkVisited] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);

  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<TaskDetailData>(`/api/user/tasks/${taskId}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Unable to load task details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [taskId]);

  const handleOpenExternalLink = () => {
    setLinkVisited(true);
    if (data?.task.externalLink) {
      window.open(data.task.externalLink, '_blank', 'noopener,noreferrer');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadMediaFile(file, 'user');
      setProofFileUrl(uploaded.url);
    } catch (err: any) {
      setError(err.message || 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSubmitFeedback(null);
    try {
      const res = await apiFetch<{ message: string }>(`/api/user/tasks/${taskId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          proofText,
          proofFileUrl,
          linkVisited,
        }),
      });
      setSubmitFeedback(res.message);
      await loadDetail();
      onSubmitted();
    } catch (err: any) {
      setError(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPostingComment(true);
    try {
      const res = await apiFetch<{
        comment: {
          id: number;
          message: string;
          createdAt: string;
          userUid: string;
          userName: string;
        };
      }>(`/api/user/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ message: commentText }),
      });
      setData((prev) =>
        prev ? { ...prev, comments: [res.comment, ...prev.comments] } : prev
      );
      setCommentText('');
    } catch (err: any) {
      setError(err.message || 'Could not post comment');
    } finally {
      setPostingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/3" />
        <div className="h-4 bg-slate-100 rounded w-2/3" />
        <div className="h-40 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Tasks</span>
        </button>
        <p className="text-sm text-red-600">{error || 'Task not found'}</p>
      </div>
    );
  }

  const { task, submission, comments } = data;
  const cat = getCategoryMeta(task.category);
  const CatIcon = cat.Icon;
  const currentStatus = submission ? submission.status : 'available';
  const canSubmit = !submission || submission.status === 'rejected';

  const hasCustomUploadedIcon =
    Boolean(task.iconUrl) &&
    task.iconUrl !== '/icon.svg' &&
    !task.iconUrl?.startsWith('/src/assets/images/');

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-[#5B46F6] transition-colors min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Tasks</span>
      </button>

      {/* Main Task Header & Description */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`h-14 w-14 rounded-2xl shrink-0 overflow-hidden flex items-center justify-center shadow-xs ${
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
            <div>
              <div className="flex items-center gap-2.5 text-xs text-slate-500">
                <span>{cat.label}</span>
                <span aria-hidden="true">·</span>
                <StatusLabel status={currentStatus} />
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                {task.title}
              </h1>
            </div>
          </div>

          <div className="sm:text-right bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 shrink-0">
            <p className="text-xs font-medium text-[#5B46F6]">Task Reward</p>
            <p className="font-mono-num text-2xl font-bold text-[#4338CA]">
              {formatInr(task.rewardAmount)}
            </p>
          </div>
        </div>

        <p className="mt-5 text-sm sm:text-base text-slate-700 leading-relaxed">
          {task.description}
        </p>

        {/* Instructions */}
        <div className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-4 sm:p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-2">Task Instructions</h2>
          <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
            {task.instructions}
          </p>
        </div>

        {/* External Link CTA */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-slate-100">
          <div className="text-xs text-slate-500 tabular-nums">
            Completions: {task.completedCount} / {task.totalLimit}
          </div>
          <button
            type="button"
            onClick={handleOpenExternalLink}
            className="inline-flex items-center gap-2 rounded-xl bg-[#5B46F6] hover:bg-[#4B36E6] text-white px-5 py-3 text-sm font-semibold transition-colors min-h-[44px]"
          >
            <span>Open External Task Link</span>
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Optional Video Player(s) */}
      {task.videoUrls && task.videoUrls.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900">Task Video Media</h2>
          <div className="grid grid-cols-1 gap-4">
            {task.videoUrls.map((url, idx) => (
              <div key={idx} className="rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                <video
                  src={url}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[380px] object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional Photo Gallery */}
      {task.photoUrls && task.photoUrls.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900">Task Reference Photos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {task.photoUrls.map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
              >
                <img
                  src={url}
                  alt={`${task.title} reference ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-52 object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Submission Box */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <h2 className="font-display text-base font-bold text-slate-900 mb-3">
          Submit Completion Proof
        </h2>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {submitFeedback && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {submitFeedback}
          </div>
        )}

        {submission && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Current Submission Status</span>
              <StatusLabel status={submission.status} />
            </div>
            {submission.proofText && (
              <p className="text-sm text-slate-700">Submitted note: {submission.proofText}</p>
            )}
            {submission.adminRemarks && (
              <p className="text-xs text-slate-600">Reviewer remarks: {submission.adminRemarks}</p>
            )}
            <p className="text-xs text-slate-400">
              Submitted on {formatDateTime(submission.submittedAt)}
            </p>
          </div>
        )}

        {canSubmit ? (
          <form onSubmit={handleSubmitTask} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Completion Note / Verification Code
              </label>
              <textarea
                rows={3}
                value={proofText}
                onChange={(e) => setProofText(e.target.value)}
                placeholder="Describe what you completed or enter any verification code..."
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Upload Screenshot / Proof (Optional)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 cursor-pointer min-h-[44px]">
                  <Upload className="h-4 w-4 text-blue-700" />
                  <span>{uploading ? 'Uploading...' : 'Choose Image or Video'}</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                {proofFileUrl && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <ImageIcon className="h-4 w-4" />
                    <span>Proof uploaded</span>
                  </span>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || uploading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 text-sm font-semibold transition-colors disabled:opacity-60 min-h-[48px]"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{submitting ? 'Submitting...' : 'Submit / Complete Task'}</span>
            </button>
          </form>
        ) : (
          <p className="text-sm text-slate-600">
            This task has already been submitted. Duplicate submissions are locked to protect reward integrity.
          </p>
        )}
      </div>

      {/* Discussion / Comments Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-4 w-4 text-blue-700" />
          <h2 className="font-display text-base font-bold text-slate-900">
            Task Discussion ({comments.length})
          </h2>
        </div>

        <form onSubmit={handlePostComment} className="flex gap-2 mb-5">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Ask a question or share a tip about this task..."
            className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
          <button
            type="submit"
            disabled={postingComment || !commentText.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 text-xs font-semibold disabled:opacity-50 min-h-[44px]"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Post</span>
          </button>
        </form>

        {comments.length === 0 ? (
          <p className="text-sm text-slate-500">No discussion comments yet. Start the conversation.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {comments.map((c) => (
              <div key={c.id} className="py-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-800">
                    {c.userName} · <span className="font-mono">{c.userUid}</span>
                  </span>
                  <span>{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{c.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
