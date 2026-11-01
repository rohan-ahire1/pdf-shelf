import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ACCEPTED, isAccepted, listNotes, trashNote, updateNote, uploadFile, type Note, type NoteChanges } from './api';
import { Detail } from './components/Detail';
import { Importance } from './components/Importance';
import { Tag } from './components/Tag';
import { setTheme, useTheme } from './theme';

type View =
  | { kind: 'all' }
  | { kind: 'starred' }
  | { kind: 'important' }
  | { kind: 'unsorted' }
  | { kind: 'folder'; value: string }
  | { kind: 'type'; value: string }
  | { kind: 'tag'; value: string };
type Sort = 'importance' | 'modified' | 'created' | 'name';

const DEFAULT_TYPES = ['Study', 'Work', 'Research', 'Personal', 'Reference'];
const SORT_KEY = 'notes.sort';
const KIND_LABEL: Record<Note['kind'], string> = { pdf: 'PDF', markdown: 'MD', html: 'HTML', text: 'TXT' };

const sameView = (a: View, b: View) => a.kind === b.kind && ('value' in a ? a.value : '') === ('value' in b ? b.value : '');

function readSort(): Sort {
  try {
    const s = localStorage.getItem(SORT_KEY);
    if (s === 'importance' || s === 'modified' || s === 'created' || s === 'name') return s;
  } catch {
    // ignore
  }
  return 'importance';
}

// The original values of just the fields being changed, so a failed save only undoes itself.
function pick(note: Note, changes: NoteChanges): NoteChanges {
  return Object.fromEntries(Object.keys(changes).map((k) => [k, note[k as keyof NoteChanges]]));
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

const displayName = (name: string) => name.replace(/\.(pdf|md|markdown|html?|txt)$/i, '');

export default function App() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>({ kind: 'all' });
  const [sort, setSort] = useState<Sort>(readSort);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const theme = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 6000 : 3000);
  }, []);

  const showError = useCallback((e: unknown) => notify(e instanceof Error ? e.message : String(e), true), [notify]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setNotes(await listNotes());
      setLoadError('');
    } catch (e) {
      if (!notesRef.current) setLoadError(e instanceof Error ? e.message : String(e));
      else showError(e);
    } finally {
      setRefreshing(false);
    }
  }, [showError]);

  // Load now, and again whenever you come back to the tab, so files copied in from elsewhere show up.
  useEffect(() => {
    refresh();
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const patch = useCallback(
    async (path: string, changes: NoteChanges) => {
      const before = notesRef.current?.find((n) => n.path === path);
      if (!before) return;
      setNotes((ns) => ns && ns.map((n) => (n.path === path ? { ...n, ...changes } : n)));
      try {
        const { path: newPath } = await updateNote(path, changes);
        if (newPath !== path) {
          setNotes((ns) => ns && ns.map((n) => (n.path === path ? { ...n, path: newPath } : n)));
          setSelected((s) => (s === path ? newPath : s));
        }
      } catch (e) {
        setNotes((ns) => ns && ns.map((n) => (n.path === path ? { ...n, ...pick(before, changes) } : n)));
        showError(e);
      }
    },
    [showError],
  );

  const trash = async (note: Note) => {
    try {
      await trashNote(note.path);
      setNotes((ns) => ns && ns.filter((n) => n.path !== note.path));
      setSelected(null);
      notify(`Moved "${note.name}" to trash`);
    } catch (e) {
      showError(e);
    }
  };

  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => isAccepted(f.name));
    if (!list.length) return notify('Only PDF, Markdown, HTML and text files can be added.', true);
    const folder = view.kind === 'folder' ? view.value : '';
    notify(`Uploading ${list.length} file${list.length > 1 ? 's' : ''}…`);
    let done = 0;
    for (const file of list) {
      try {
        await uploadFile(file, folder);
        done++;
      } catch (e) {
        showError(e);
      }
    }
    if (done) {
      await refresh();
      notify(`Added ${done} file${done > 1 ? 's' : ''}`);
    }
  };

  const changeSort = (s: Sort) => {
    setSort(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      // ignore
    }
  };

  const all = useMemo(() => notes ?? [], [notes]);

  const { tagCounts, typeCounts, folderCounts, counts } = useMemo(() => {
    const tags = new Map<string, number>();
    const types = new Map<string, number>();
    const folders = new Map<string, number>();
    let starred = 0;
    let important = 0;
    let unsorted = 0;
    for (const n of all) {
      for (const t of n.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
      if (n.type) types.set(n.type, (types.get(n.type) ?? 0) + 1);
      if (n.folder) folders.set(n.folder, (folders.get(n.folder) ?? 0) + 1);
      if (n.starred) starred++;
      if (n.importance >= 4) important++;
      if (!n.type && !n.tags.length) unsorted++;
    }
    const byName = (a: [string, number], b: [string, number]) => a[0].localeCompare(b[0]);
    return {
      tagCounts: [...tags].sort(byName),
      typeCounts: [...types].sort(byName),
      folderCounts: [...folders].sort(byName),
      counts: { all: all.length, starred, important, unsorted },
    };
  }, [all]);

  const allTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);
  const allTypes = useMemo(
    () => [...new Set([...typeCounts.map(([t]) => t), ...DEFAULT_TYPES])].sort((a, b) => a.localeCompare(b)),
    [typeCounts],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((n) => {
      switch (view.kind) {
        case 'starred':
          if (!n.starred) return false;
          break;
        case 'important':
          if (n.importance < 4) return false;
          break;
        case 'unsorted':
          if (n.type || n.tags.length) return false;
          break;
        case 'folder':
          if (n.folder !== view.value) return false;
          break;
        case 'type':
          if (n.type !== view.value) return false;
          break;
        case 'tag':
          if (!n.tags.includes(view.value)) return false;
          break;
      }
      if (!q) return true;
      return [n.name, n.type, n.folder, ...n.tags].some((s) => s.toLowerCase().includes(q));
    });
    const byModified = (a: Note, b: Note) => b.modifiedTime.localeCompare(a.modifiedTime);
    const compare: Record<Sort, (a: Note, b: Note) => number> = {
      importance: (a, b) => b.importance - a.importance || Number(b.starred) - Number(a.starred) || byModified(a, b),
      modified: byModified,
      created: (a, b) => b.createdTime.localeCompare(a.createdTime),
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
    };
    return list.sort(compare[sort]);
  }, [all, view, query, sort]);

  const current = all.find((n) => n.path === selected) ?? null;

  if (!notes) {
    return (
      <div className="center-page">
        {loadError ? (
          <div className="card">
            <h1>Can't reach your notes</h1>
            <p className="error-text">{loadError}</p>
            <button className="btn primary" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : (
          <p className="muted">Loading your notes…</p>
        )}
      </div>
    );
  }

  const navItem = (v: View, label: string, count: number, icon?: string) => (
    <li key={`${v.kind}:${label}`}>
      <button type="button" className={sameView(view, v) ? 'active' : ''} onClick={() => setView(v)} title={label}>
        {icon && (
          <span className="nav-icon" aria-hidden>
            {icon}
          </span>
        )}
        <span className="nav-label">{label}</span>
        <span className="count">{count}</span>
      </button>
    </li>
  );

  const viewTitle: Record<View['kind'], string> = {
    all: 'All notes',
    starred: 'Starred',
    important: 'Most important',
    unsorted: 'Unsorted',
    folder: '',
    type: '',
    tag: '',
  };

  return (
    <div
      className={`app ${current ? 'with-detail' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <span className="logo small" aria-hidden>
            ▤
          </span>
          <span>Notes</span>
        </div>
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="Search names, tags, types   /"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search notes"
        />
        <div className="topbar-actions">
          <button
            type="button"
            className="btn ghost icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            + Add files
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) upload(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <nav className="sidebar" aria-label="Filters">
        <ul>
          {navItem({ kind: 'all' }, 'All notes', counts.all, '▤')}
          {navItem({ kind: 'starred' }, 'Starred', counts.starred, '★')}
          {navItem({ kind: 'important' }, 'Most important', counts.important, '▲')}
          {navItem({ kind: 'unsorted' }, 'Unsorted', counts.unsorted, '○')}
        </ul>
        {folderCounts.length > 0 && (
          <>
            <h2>Folders</h2>
            <ul>{folderCounts.map(([f, n]) => navItem({ kind: 'folder', value: f }, f, n, '📁'))}</ul>
          </>
        )}
        {typeCounts.length > 0 && (
          <>
            <h2>Type of work</h2>
            <ul>{typeCounts.map(([t, n]) => navItem({ kind: 'type', value: t }, t, n))}</ul>
          </>
        )}
        {tagCounts.length > 0 && (
          <>
            <h2>Tags</h2>
            <ul>{tagCounts.map(([t, n]) => navItem({ kind: 'tag', value: t }, t, n, '#'))}</ul>
          </>
        )}
      </nav>

      <main className="main">
        <div className="toolbar">
          <h1>
            {'value' in view ? view.value : viewTitle[view.kind]} <span className="muted">{visible.length}</span>
          </h1>
          <div className="toolbar-right">
            <label className="sort">
              <span className="muted">Sort</span>
              <select value={sort} onChange={(e) => changeSort(e.target.value as Sort)}>
                <option value="importance">Importance</option>
                <option value="modified">Last edited</option>
                <option value="created">Newest</option>
                <option value="name">Name</option>
              </select>
            </label>
            <button className="btn ghost" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="empty">
            {all.length === 0 ? (
              <>
                <p>
                  <strong>No notes yet.</strong>
                </p>
                <p className="muted">Drop PDFs, Markdown or HTML files anywhere on this page, or use “Add files”.</p>
              </>
            ) : (
              <p className="muted">Nothing matches. Try another filter or search.</p>
            )}
          </div>
        ) : (
          <ul className="pdf-list">
            {visible.map((n) => (
              <li key={n.path} className={n.path === selected ? 'selected' : ''}>
                <button
                  type="button"
                  className={`star ${n.starred ? 'on' : ''}`}
                  aria-pressed={n.starred}
                  aria-label={n.starred ? `Unstar ${n.name}` : `Star ${n.name}`}
                  onClick={() => patch(n.path, { starred: !n.starred })}
                >
                  ★
                </button>
                <button type="button" className="pdf-main" onClick={() => setSelected(n.path)}>
                  <span className="pdf-name">
                    <span className={`kind kind-${n.kind}`}>{KIND_LABEL[n.kind]}</span>
                    {displayName(n.name)}
                  </span>
                  <span className="pdf-meta">
                    {n.type && <span className="type">{n.type}</span>}
                    {n.tags.map((t) => (
                      <Tag key={t} name={t} />
                    ))}
                    {n.folder && view.kind !== 'folder' && <span className="muted path">{n.folder}</span>}
                  </span>
                </button>
                <Importance value={n.importance} onChange={(importance) => patch(n.path, { importance })} />
                <span className="date muted">{formatDate(n.modifiedTime)}</span>
              </li>
            ))}
          </ul>
        )}
      </main>

      {current && (
        <Detail
          key={current.path}
          note={current}
          allTags={allTags}
          allTypes={allTypes}
          onPatch={(changes) => patch(current.path, changes)}
          onTrash={() => trash(current)}
          onClose={() => setSelected(null)}
        />
      )}

      {dragging && (
        <div className="dropzone" aria-hidden>
          Drop files to add them{view.kind === 'folder' ? ` to ${view.value}` : ''}
        </div>
      )}
      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
