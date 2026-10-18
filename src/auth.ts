// Google sign-in in the browser (Google Identity Services token flow).
// No server: the access token lives in this tab's sessionStorage for up to an hour.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google?: any;
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive';
const TOKEN_KEY = 'pdfShelf.token';
const CLIENT_ID_KEY = 'pdfShelf.clientId';

let token: string | null = null;
let expiresAt = 0;
let gisPromise: Promise<void> | null = null;

function storageGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(store: Storage, key: string, value: string | null) {
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // Storage blocked (private window): the app still works, it just forgets on reload.
  }
}

export function getClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || storageGet(localStorage, CLIENT_ID_KEY) || '';
}

export function saveClientId(id: string) {
  storageSet(localStorage, CLIENT_ID_KEY, id.trim() || null);
}

export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Could not load Google sign-in. Check your connection.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

export function restoreToken(): boolean {
  const raw = storageGet(sessionStorage, TOKEN_KEY);
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw) as { token: string; expiresAt: number };
    if (saved.expiresAt - Date.now() < 60_000) return false;
    token = saved.token;
    expiresAt = saved.expiresAt;
    return true;
  } catch {
    return false;
  }
}

export function getToken(): string | null {
  return token && expiresAt - Date.now() > 30_000 ? token : null;
}

export function clearToken() {
  token = null;
  expiresAt = 0;
  storageSet(sessionStorage, TOKEN_KEY, null);
}

export async function signIn(): Promise<void> {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: getClientId(),
      scope: SCOPE,
      callback: (r: any) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
          return reject(new Error('PDF Shelf needs Google Drive access to show your notes. Please allow it.'));
        }
        token = r.access_token;
        expiresAt = Date.now() + Number(r.expires_in) * 1000;
        storageSet(sessionStorage, TOKEN_KEY, JSON.stringify({ token, expiresAt }));
        resolve();
      },
      error_callback: (e: any) =>
        reject(new Error(e?.type === 'popup_closed' ? 'Sign-in window was closed.' : e?.message || 'Sign-in failed.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

export function signOut() {
  const t = token;
  clearToken();
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => {});
}
