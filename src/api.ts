// Talks to the notes server on the VPS (server/server.mjs).

export type Kind = 'pdf' | 'markdown' | 'html' | 'text';

export interface Note {
  path: string; // relative to the notes folder; also the id
  name: string;
  folder: string;
  kind: Kind;
  size: number;
  modifiedTime: string;
  createdTime: string;
  starred: boolean;
  tags: string[];
  type: string;
  importance: number; // 0 = not set, 1–5
}

export type NoteChanges = Partial<Pick<Note, 'name' | 'starred' | 'tags' | 'type' | 'importance'>>;

export const ACCEPTED = '.pdf,.md,.markdown,.html,.htm,.txt';
const ACCEPTED_EXT = ACCEPTED.split(',');

export const isAccepted = (name: string) => ACCEPTED_EXT.some((ext) => name.toLowerCase().endsWith(ext));

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `Server error (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      // keep the generic message
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function listNotes(): Promise<Note[]> {
  return (await call<{ notes: Note[] }>('/api/notes')).notes;
}

export async function updateNote(path: string, changes: NoteChanges): Promise<{ path: string }> {
  return call(`/api/notes?path=${encodeURIComponent(path)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export async function trashNote(path: string): Promise<void> {
  await call(`/api/notes?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
}

export async function uploadFile(file: File, folder = ''): Promise<{ path: string }> {
  const params = new URLSearchParams({ name: file.name, folder });
  return call(`/api/upload?${params}`, { method: 'POST', body: file });
}

export const rawUrl = (path: string) => `/raw/${path.split('/').map(encodeURIComponent).join('/')}`;
