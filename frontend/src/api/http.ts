/**
 * fetch() for our own API. State-changing requests carry the CSRF token: the backend sets it in the
 * XSRF-TOKEN cookie and expects it back in the X-XSRF-TOKEN header (Spring Security's SPA setup).
 */
function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET' && method !== 'HEAD') {
    const token = readCookie('XSRF-TOKEN');
    if (token) headers.set('X-XSRF-TOKEN', token);
  }
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
}
