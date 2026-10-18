// Thin wrapper over the Google Drive v3 REST API.
// Stars use Drive's own "starred" flag. Tags, type and importance are saved as
// appProperties on each file, so they live in your Drive and follow you to any device.

import { clearToken, getToken } from './auth';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PDF_MIME = 'application/pdf';
const ROOT_KEY = 'pdfShelfRoot';
const TAG_KEYS = ['tags0', 'tags1', 'tags2', 'tags3', 'tags4'];
const FILE_FIELDS = 'id,name,starred,modifiedTime,createdTime,size,parents,webViewLink,appProperties';
const PROP_LIMIT = 124; // Drive's max bytes per property, key + value

export interface Pdf {
  id: string;
  name: string;
  starred: boolean;
  modifiedTime: string;
  createdTime: string;
  size: number;
  webViewLink: string;
  folderPath: string;
  tags: string[];
  type: string;
  importance: number; // 0 = not set, 1–5
}

export type PdfChanges = Partial<Pick<Pdf, 'name' | 'starred' | 'tags' | 'type' | 'importance'>>;

export interface Folder {
  id: string;
  name: string;
}

interface RawFile {
  id: string;
  name: string;
  starred?: boolean;
  modifiedTime?: string;
  createdTime?: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
  appProperties?: Record<string, string>;
}

export class AuthError extends Error {}

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new AuthError('Your session ended. Please sign in again.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    throw new AuthError('Your session ended. Please sign in again.');
  }
  if (!res.ok) {
    let msg = `Google Drive error (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg = j.error.message;
    } catch {
      // keep the generic message
    }
    throw new Error(msg);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function listAll(q: string, fields: string, orderBy?: string): Promise<RawFile[]> {
  const out: RawFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${fields})`,
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (orderBy) params.set('orderBy', orderBy);
    if (pageToken) params.set('pageToken', pageToken);
    const r = await api<{ files: RawFile[]; nextPageToken?: string }>(`${API}/files?${params}`);
    out.push(...r.files);
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

function toPdf(f: RawFile, paths: Map<string, string>): Pdf {
  const props = f.appProperties ?? {};
  const tags = TAG_KEYS.flatMap((k) => (props[k] ? props[k].split(',') : [])).filter(Boolean);
  const parent = f.parents?.find((p) => paths.has(p));
  return {
    id: f.id,
    name: f.name,
    starred: !!f.starred,
    modifiedTime: f.modifiedTime ?? '',
    createdTime: f.createdTime ?? '',
    size: Number(f.size ?? 0),
    webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
    folderPath: parent ? paths.get(parent)! : '',
    tags,
    type: props.type ?? '',
    importance: Math.max(0, Math.min(5, Number(props.importance) || 0)),
  };
}

const byteLength = (s: string) => new TextEncoder().encode(s).length;

// Drive caps each property at 124 bytes, so tags are spread over a few keys.
function packTags(tags: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  let i = 0;
  let current = '';
  const flush = () => {
    if (i >= TAG_KEYS.length) throw new Error('Too many tags on one PDF. Remove a few and try again.');
    out[TAG_KEYS[i++]] = current;
  };
  for (const tag of tags) {
    if (byteLength(TAG_KEYS[0] + tag) > PROP_LIMIT) throw new Error(`The tag "${tag}" is too long.`);
    const next = current ? `${current},${tag}` : tag;
    if (byteLength(TAG_KEYS[0] + next) > PROP_LIMIT) {
      flush();
      current = tag;
    } else {
      current = next;
    }
  }
  if (current) flush();
  for (; i < TAG_KEYS.length; i++) out[TAG_KEYS[i]] = null;
  return out;
}

export async function findRoot(): Promise<Folder | null> {
  const q = `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='${ROOT_KEY}' and value='1' }`;
  const [first] = await listAll(q, 'id,name');
  return first ? { id: first.id, name: first.name } : null;
}

export async function searchFolders(text: string): Promise<Folder[]> {
  const params = new URLSearchParams({
    q: `mimeType='${FOLDER_MIME}' and trashed=false${text ? ` and name contains ${quote(text)}` : ''}`,
    fields: 'files(id,name)',
    pageSize: '30',
  });
  if (!text) params.set('orderBy', 'modifiedTime desc');
  const r = await api<{ files: RawFile[] }>(`${API}/files?${params}`);
  return r.files.map((f) => ({ id: f.id, name: f.name }));
}

export async function createFolder(name: string): Promise<Folder> {
  const f = await api<RawFile>(`${API}/files?fields=id,name`, {
    method: 'POST',
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  });
  return { id: f.id, name: f.name };
}

export async function setRoot(folder: Folder, previous: Folder | null): Promise<void> {
  if (previous && previous.id !== folder.id) {
    await api(`${API}/files/${previous.id}?fields=id`, {
      method: 'PATCH',
      body: JSON.stringify({ appProperties: { [ROOT_KEY]: null } }),
    });
  }
  await api(`${API}/files/${folder.id}?fields=id`, {
    method: 'PATCH',
    body: JSON.stringify({ appProperties: { [ROOT_KEY]: '1' } }),
  });
}

// Every PDF inside the notes folder, including its subfolders.
export async function loadLibrary(root: Folder): Promise<Pdf[]> {
  const paths = new Map<string, string>([[root.id, '']]);
  let frontier = [root.id];
  for (let depth = 0; frontier.length && depth < 12; depth++) {
    const next: string[] = [];
    for (const group of chunks(frontier, 40)) {
      const q = `(${group.map((id) => `${quote(id)} in parents`).join(' or ')}) and mimeType='${FOLDER_MIME}' and trashed=false`;
      for (const f of await listAll(q, 'id,name,parents')) {
        if (paths.has(f.id)) continue;
        const parent = f.parents?.find((p) => paths.has(p));
        const base = parent ? paths.get(parent)! : '';
        paths.set(f.id, base ? `${base} / ${f.name}` : f.name);
        next.push(f.id);
      }
    }
    frontier = next;
  }

  const seen = new Map<string, Pdf>();
  for (const group of chunks([...paths.keys()], 40)) {
    const q = `(${group.map((id) => `${quote(id)} in parents`).join(' or ')}) and mimeType='${PDF_MIME}' and trashed=false`;
    for (const f of await listAll(q, FILE_FIELDS)) seen.set(f.id, toPdf(f, paths));
  }
  return [...seen.values()];
}

export async function updatePdf(id: string, changes: PdfChanges): Promise<void> {
  const body: Record<string, unknown> = {};
  const props: Record<string, string | null> = {};
  if (changes.name !== undefined) body.name = changes.name;
  if (changes.starred !== undefined) body.starred = changes.starred;
  if (changes.tags !== undefined) Object.assign(props, packTags(changes.tags));
  if (changes.type !== undefined) {
    if (byteLength('type' + changes.type) > PROP_LIMIT) throw new Error('That type name is too long.');
    props.type = changes.type || null;
  }
  if (changes.importance !== undefined) props.importance = changes.importance ? String(changes.importance) : null;
  if (Object.keys(props).length) body.appProperties = props;
  await api(`${API}/files/${id}?fields=id&supportsAllDrives=true`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function trashPdf(id: string): Promise<void> {
  await api(`${API}/files/${id}?fields=id&supportsAllDrives=true`, {
    method: 'PATCH',
    body: JSON.stringify({ trashed: true }),
  });
}

export async function uploadPdf(file: File, root: Folder): Promise<Pdf> {
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ name: file.name, mimeType: PDF_MIME, parents: [root.id] })], { type: 'application/json' }),
  );
  form.append('file', file);
  const f = await api<RawFile>(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=${FILE_FIELDS}`, {
    method: 'POST',
    body: form,
  });
  return toPdf(f, new Map([[root.id, '']]));
}

export const previewUrl = (id: string) => `https://drive.google.com/file/d/${id}/preview`;
