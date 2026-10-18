import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getClientId, loadGis, restoreToken, saveClientId, signIn, signOut } from './auth';
import {
  AuthError,
  findRoot,
  loadLibrary,
  setRoot,
  trashPdf,
  updatePdf,
  uploadPdf,
  type Folder,
  type Pdf,
  type PdfChanges,
} from './drive';
import { Detail } from './components/Detail';
import { FolderPicker } from './components/FolderPicker';
import { Importance } from './components/Importance';
import { Tag } from './components/Tag';

type Phase = 'setup' | 'signedOut' | 'loading' | 'pickFolder' | 'ready';
type View =
  | { kind: 'all' }
  | { kind: 'starred' }
  | { kind: 'important' }
  | { kind: 'unsorted' }
  | { kind: 'type'; value: string }
  | { kind: 'tag'; value: string };
type Sort = 'importance' | 'modified' | 'created' | 'name';

const DEFAULT_TYPES = ['Study', 'Work', 'Research', 'Personal', 'Reference'];
const SORT_KEY = 'pdfShelf.sort';

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
function pick(pdf: Pdf, changes: PdfChanges): PdfChanges {
  return Object.fromEntries(Object.keys(changes).map((k) => [k, pdf[k as keyof PdfChanges]]));
}

function formatDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export default function App() {
  const [phase, setPhase] = useState<Phase>(getClientId() ? 'signedOut' : 'setup');
  const [root, setRootState] = useState<Folder | null>(null);
  const [pdfs, setPdfs] = useState<Pdf[]>([]);
  const [view, setView] = useState<View>({ kind: 'all' });
  const [sort, setSort] = useState<Sort>(readSort);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>();
  const pdfsRef = useRef(pdfs);
  pdfsRef.current = pdfs;

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 6000 : 3000);
  }, []);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) {
        setAuthMessage(e.message);
        setPhase('signedOut');
        return;
      }
      notify(e instanceof Error ? e.message : String(e), true);
    },
    [notify],
  );

  const openLibrary = useCallback(
    async (folder: Folder) => {
      setRootState(folder);
      setPhase('loading');
      setPdfs(await loadLibrary(folder));
      setPhase('ready');
    },
    [],
  );

  const boot = useCallback(async () => {
    setPhase('loading');
    try {
      const found = await findRoot();
      if (found) await openLibrary(found);
      else setPhase('pickFolder');
    } catch (e) {
      handleError(e);
      if (!(e instanceof AuthError)) setPhase('signedOut');
    }
  }, [openLibrary, handleError]);

  useEffect(() => {
    if (!getClientId()) return;
    loadGis().catch(() => {});
    if (restoreToken()) boot();
  }, [boot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const doSignIn = async () => {
    setAuthMessage('');
    try {
      await signIn();
      await boot();
    } catch (e) {
      setAuthMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const patch = useCallback(
    async (id: string, changes: PdfChanges) => {
      const before = pdfsRef.current.find((p) => p.id === id);
      if (!before) return;
      setPdfs((ps) => ps.map((p) => (p.id === id ? { ...p, ...changes } : p)));
      try {
        await updatePdf(id, changes);
      } catch (e) {
        setPdfs((ps) => ps.map((p) => (p.id === id ? { ...p, ...pick(before, changes) } : p)));
        handleError(e);
      }
    },
    [handleError],
  );

  const trash = async (pdf: Pdf) => {
    try {
      await trashPdf(pdf.id);
      setPdfs((ps) => ps.filter((p) => p.id !== pdf.id));
      setSelectedId(null);
      notify(`Moved "${pdf.name}" to Drive trash`);
    } catch (e) {
      handleError(e);
    }
  };

  const upload = async (files: FileList | File[]) => {
    if (!root) return;
    const list = [...files].filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!list.length) return notify('Only PDF files can be added.', true);
    notify(`Uploading ${list.length} PDF${list.length > 1 ? 's' : ''}…`);
    let done = 0;
    for (const file of list) {
      try {
        const pdf = await uploadPdf(file, root);
        setPdfs((ps) => [pdf, ...ps]);
        done++;
      } catch (e) {
        handleError(e);
        if (e instanceof AuthError) return;
      }
    }
    if (done) notify(`Added ${done} PDF${done > 1 ? 's' : ''} to ${root.name}`);
  };

  const refresh = async () => {
    if (!root) return;
    setRefreshing(true);
    try {
      setPdfs(await loadLibrary(root));
    } catch (e) {
      handleError(e);
    } finally {
      setRefreshing(false);
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

  const { tagCounts, typeCounts, counts } = useMemo(() => {
    const tagCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    let starred = 0;
    let important = 0;
    let unsorted = 0;
    for (const p of pdfs) {
      for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      if (p.type) typeCounts.set(p.type, (typeCounts.get(p.type) ?? 0) + 1);
      if (p.starred) starred++;
      if (p.importance >= 4) important++;
      if (!p.type && !p.tags.length) unsorted++;
    }
    const byName = (a: [string, number], b: [string, number]) => a[0].localeCompare(b[0]);
    return {
      tagCounts: [...tagCounts].sort(byName),
      typeCounts: [...typeCounts].sort(byName),
      counts: { all: pdfs.length, starred, important, unsorted },
    };
  }, [pdfs]);

  const allTags = useMemo(() => tagCounts.map(([t]) => t), [tagCounts]);
  const allTypes = useMemo(
    () => [...new Set([...typeCounts.map(([t]) => t), ...DEFAULT_TYPES])].sort((a, b) => a.localeCompare(b)),
    [typeCounts],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = pdfs.filter((p) => {
      switch (view.kind) {
        case 'starred':
          if (!p.starred) return false;
          break;
        case 'important':
          if (p.importance < 4) return false;
          break;
        case 'unsorted':
          if (p.type || p.tags.length) return false;
          break;
        case 'type':
          if (p.type !== view.value) return false;
          break;
        case 'tag':
          if (!p.tags.includes(view.value)) return false;
          break;
      }
      if (!q) return true;
      return [p.name, p.type, p.folderPath, ...p.tags].some((s) => s.toLowerCase().includes(q));
    });
    const byModified = (a: Pdf, b: Pdf) => b.modifiedTime.localeCompare(a.modifiedTime);
    const compare: Record<Sort, (a: Pdf, b: Pdf) => number> = {
      importance: (a, b) => b.importance - a.importance || Number(b.starred) - Number(a.starred) || byModified(a, b),
      modified: byModified,
      created: (a, b) => b.createdTime.localeCompare(a.createdTime),
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
    };
    return list.sort(compare[sort]);
  }, [pdfs, view, query, sort]);

  const selected = pdfs.find((p) => p.id === selectedId) ?? null;

  if (phase === 'setup') return <Setup onSaved={() => setPhase('signedOut')} />;

  if (phase === 'signedOut') {
    return (
      <div className="center-page">
        <div className="card signin">
          <div className="logo" aria-hidden>
            ▤
          </div>
          <h1>PDF Shelf</h1>
          <p className="muted">Star, tag and rank the PDF notes in your Google Drive.</p>
          <button className="btn primary big" onClick={doSignIn}>
            Sign in with Google
          </button>
          {authMessage && <p className="error-text">{authMessage}</p>}
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="center-page">
        <p className="muted">Loading your PDFs{root ? ` from ${root.name}` : ''}…</p>
      </div>
    );
  }

  if (phase === 'pickFolder') {
    return (
      <>
        <FolderPicker
          current={root}
          onError={handleError}
          onCancel={root ? () => setPhase('ready') : undefined}
          onPick={async (folder) => {
            await setRoot(folder, root);
            setView({ kind: 'all' });
            setSelectedId(null);
            await openLibrary(folder);
          }}
        />
        {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
      </>
    );
  }

  const navItem = (v: View, label: string, count: number, icon?: string) => (
    <li key={label}>
      <button type="button" className={sameView(view, v) ? 'active' : ''} onClick={() => setView(v)}>
        {icon && <span className="nav-icon" aria-hidden>{icon}</span>}
        <span className="nav-label">{label}</span>
        <span className="count">{count}</span>
      </button>
    </li>
  );

  const viewTitle =
    view.kind === 'all'
      ? 'All PDFs'
      : view.kind === 'starred'
        ? 'Starred'
        : view.kind === 'important'
          ? 'Most important'
          : view.kind === 'unsorted'
            ? 'Unsorted'
            : view.value;

  return (
    <div
      className={`app ${selected ? 'with-detail' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.relatedTarget) setDragging(false);
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
          <span>PDF Shelf</span>
        </div>
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="Search names, tags, types   /"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search PDFs"
        />
        <div className="topbar-actions">
          <button className="btn primary" onClick={() => fileRef.current?.click()}>
            + Add PDFs
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) upload(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            className="btn ghost"
            onClick={() => {
              signOut();
              setPdfs([]);
              setRootState(null);
              setSelectedId(null);
              setPhase('signedOut');
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="sidebar" aria-label="Filters">
        <div className="folder-chip">
          <span className="muted">Folder</span>
          <strong title={root?.name}>{root?.name}</strong>
          <button type="button" className="link" onClick={() => setPhase('pickFolder')}>
            Change
          </button>
        </div>
        <ul>
          {navItem({ kind: 'all' }, 'All PDFs', counts.all, '▤')}
          {navItem({ kind: 'starred' }, 'Starred', counts.starred, '★')}
          {navItem({ kind: 'important' }, 'Most important', counts.important, '▲')}
          {navItem({ kind: 'unsorted' }, 'Unsorted', counts.unsorted, '○')}
        </ul>
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
            {viewTitle} <span className="muted">{visible.length}</span>
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
            {pdfs.length === 0 ? (
              <>
                <p>
                  <strong>No PDFs in {root?.name} yet.</strong>
                </p>
                <p className="muted">Drop PDFs anywhere on this page, or use “Add PDFs”. You can also save PDFs into this folder from Google Drive.</p>
              </>
            ) : (
              <p className="muted">Nothing matches. Try another filter or search.</p>
            )}
          </div>
        ) : (
          <ul className="pdf-list">
            {visible.map((p) => (
              <li key={p.id} className={p.id === selectedId ? 'selected' : ''}>
                <button
                  type="button"
                  className={`star ${p.starred ? 'on' : ''}`}
                  aria-pressed={p.starred}
                  aria-label={p.starred ? `Unstar ${p.name}` : `Star ${p.name}`}
                  onClick={() => patch(p.id, { starred: !p.starred })}
                >
                  ★
                </button>
                <button type="button" className="pdf-main" onClick={() => setSelectedId(p.id)}>
                  <span className="pdf-name">{p.name.replace(/\.pdf$/i, '')}</span>
                  <span className="pdf-meta">
                    {p.type && <span className="type">{p.type}</span>}
                    {p.tags.map((t) => (
                      <Tag key={t} name={t} />
                    ))}
                    {p.folderPath && <span className="muted path">{p.folderPath}</span>}
                  </span>
                </button>
                <Importance value={p.importance} onChange={(importance) => patch(p.id, { importance })} />
                <span className="date muted">{formatDate(p.modifiedTime)}</span>
              </li>
            ))}
          </ul>
        )}
      </main>

      {selected && (
        <Detail
          key={selected.id}
          pdf={selected}
          allTags={allTags}
          allTypes={allTypes}
          onPatch={(changes) => patch(selected.id, changes)}
          onTrash={() => trash(selected)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {dragging && (
        <div className="dropzone" aria-hidden>
          Drop PDFs to add them to {root?.name}
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

function Setup({ onSaved }: { onSaved: () => void }) {
  const [id, setId] = useState('');
  return (
    <div className="center-page">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!id.trim().endsWith('.apps.googleusercontent.com')) return;
          saveClientId(id);
          onSaved();
        }}
      >
        <h1>One-time setup</h1>
        <p className="muted">
          Paste the Google OAuth Client ID you made for PDF Shelf (see the README). It is saved in this browser only.
        </p>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="1234-abc.apps.googleusercontent.com"
          aria-label="Google OAuth Client ID"
          autoFocus
        />
        {id && !id.trim().endsWith('.apps.googleusercontent.com') && (
          <p className="error-text">That doesn’t look like a Client ID. It ends in .apps.googleusercontent.com</p>
        )}
        <button className="btn primary big">Save</button>
      </form>
    </div>
  );
}
