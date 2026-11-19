export const USER_TOKEN_KEY = 'taskhub_user_token';
export const ADMIN_TOKEN_KEY = 'taskhub_admin_token';

export function getUserToken(): string | null {
  try {
    return localStorage.getItem(USER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setUserToken(token: string | null) {
  try {
    if (token) localStorage.setItem(USER_TOKEN_KEY, token);
    else localStorage.removeItem(USER_TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
    else localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit & { tokenType?: 'user' | 'admin' | 'none' } = {}
): Promise<T> {
  const { tokenType = 'user', headers, ...rest } = options;
  const token =
    tokenType === 'admin'
      ? getAdminToken()
      : tokenType === 'user'
        ? getUserToken()
        : null;

  const mergedHeaders: Record<string, string> = {
    ...(rest.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(headers as Record<string, string> | undefined),
  };

  if (token) {
    mergedHeaders['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  const apiBase = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  const resolvedUrl = apiBase && url.startsWith('/') ? `${apiBase}${url}` : url;
  try {
    response = await fetch(resolvedUrl, {
      ...rest,
      headers: mergedHeaders,
    });
  } catch {
    throw new Error('Network unavailable. Check your internet connection and try again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    const err = new Error(data?.error || `Request failed (${response.status})`) as Error & {
      status?: number;
    };
    err.status = response.status;
    throw err;
  }

  return data as T;
}

export async function uploadMediaFile(
  file: File,
  tokenType: 'user' | 'admin' = 'user'
): Promise<{ id: number; url: string; fileName: string; mimeType: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return apiFetch('/api/media/upload', {
    method: 'POST',
    body: formData,
    tokenType,
  });
}

export function formatInr(val: string | number | undefined | null): string {
  const n = typeof val === 'string' ? parseFloat(val) : Number(val ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `₹${safe.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTime(val: string | Date): string {
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(val: string | Date): string {
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
