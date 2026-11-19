import DOMPurify from 'isomorphic-dompurify';

const SESSION_TOKEN_STORAGE_KEY = 'tl_session_token';

function readStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

let activeCsrfToken: string | null = null;
let activeSessionToken: string | null = readStoredSessionToken();

export function setCsrfToken(token: string | null) {
  activeCsrfToken = token;
}

export function setSessionToken(token: string | null) {
  activeSessionToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
      } else {
        window.sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors in strict sandboxes
    }
  }
}

export function cleanText(input: string | null | undefined): string {
  if (!input) return '';
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

function buildAuthHeaders(existing?: HeadersInit): Headers {
  const headers = new Headers(existing);
  if (activeSessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${activeSessionToken}`);
  }
  return headers;
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = buildAuthHeaders(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();

  if (
    method !== 'GET' &&
    method !== 'HEAD' &&
    activeCsrfToken &&
    !headers.has('X-CSRF-Token')
  ) {
    headers.set('X-CSRF-Token', activeCsrfToken);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchAuthorizedResponse(url: string): Promise<Response> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: buildAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Media request failed (${res.status})`);
  }
  return res;
}

export function uploadFileWithProgress<T>(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.withCredentials = true;
    xhr.timeout = 120000;

    if (activeSessionToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${activeSessionToken}`);
    }
    if (activeCsrfToken) {
      xhr.setRequestHeader('X-CSRF-Token', activeCsrfToken);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        const pct = Math.max(1, Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}') as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve(parsed as T);
      } else {
        const msg =
          typeof parsed.error === 'string'
            ? parsed.error
            : xhr.status === 413
              ? 'File exceeds the 15 MB upload limit.'
              : xhr.status === 401
                ? 'Authentication expired. Please sign in again.'
                : `Upload failed (HTTP ${xhr.status}).`;
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during file upload. Check connection and retry.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out after 120s. Please retry.'));
    };

    xhr.send(formData);
  });
}
