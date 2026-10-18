import { useEffect, useState } from 'react';
import { createFolder, searchFolders, type Folder } from '../drive';

interface Props {
  current: Folder | null;
  onPick: (folder: Folder) => Promise<void>;
  onCancel?: () => void;
  onError: (e: unknown) => void;
}

export function FolderPicker({ current, onPick, onCancel, onError }: Props) {
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [newName, setNewName] = useState('Claude Notes');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      searchFolders(query.trim())
        .then((f) => live && setFolders(f))
        .catch((e) => live && onError(e));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, onError]);

  const pick = async (f: Folder) => {
    setBusy(true);
    try {
      await onPick(f);
    } catch (e) {
      onError(e);
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <div className="card picker">
        <h1>Choose your notes folder</h1>
        <p className="muted">
          PDF Shelf shows the PDFs in this Google Drive folder and its subfolders. Nothing gets moved.
        </p>

        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            setBusy(true);
            try {
              await onPick(await createFolder(newName.trim()));
            } catch (err) {
              onError(err);
              setBusy(false);
            }
          }}
        >
          <input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New folder name" />
          <button className="btn primary" disabled={busy}>
            Create new folder
          </button>
        </form>

        <div className="divider">or use an existing folder</div>

        <input
          className="search"
          type="search"
          placeholder="Search your Drive folders"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <ul className="folder-list">
          {folders === null && <li className="muted">Loading folders…</li>}
          {folders?.length === 0 && <li className="muted">No folders match.</li>}
          {folders?.map((f) => (
            <li key={f.id}>
              <button type="button" disabled={busy} onClick={() => pick(f)}>
                <span aria-hidden>📁</span> {f.name}
                {current?.id === f.id && <span className="pill">current</span>}
              </button>
            </li>
          ))}
        </ul>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
