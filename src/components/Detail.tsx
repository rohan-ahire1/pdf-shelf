import { useEffect, useId, useState } from 'react';
import { rawUrl, type Note, type NoteChanges } from '../api';
import { Importance } from './Importance';
import { TagEditor } from './TagEditor';
import { Viewer } from './Viewer';

interface Props {
  note: Note;
  allTags: string[];
  allTypes: string[];
  onPatch: (changes: NoteChanges) => void;
  onTrash: () => void;
  onClose: () => void;
}

const splitExt = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ''];
};

export function Detail({ note, allTags, allTypes, onPatch, onTrash, onClose }: Props) {
  const [base, ext] = splitExt(note.name);
  const [name, setName] = useState(base);
  const [type, setType] = useState(note.type);
  const typesId = useId();

  useEffect(() => setName(splitExt(note.name)[0]), [note.name]);
  useEffect(() => setType(note.type), [note.path, note.type]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commitName = () => {
    const v = name.trim();
    if (v && v !== base) onPatch({ name: v + ext });
    else setName(base);
  };
  const commitType = () => {
    const v = type.trim();
    if (v !== note.type) onPatch({ type: v });
  };

  return (
    <aside className="detail" aria-label="Note details">
      <div className="detail-head">
        <button
          type="button"
          className={`star ${note.starred ? 'on' : ''}`}
          aria-pressed={note.starred}
          aria-label={note.starred ? 'Unstar' : 'Star'}
          onClick={() => onPatch({ starred: !note.starred })}
        >
          ★
        </button>
        <input
          className="title-input"
          value={name}
          aria-label="File name"
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button type="button" className="btn ghost icon" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="fields">
        <label>Importance</label>
        <Importance size="md" value={note.importance} onChange={(importance) => onPatch({ importance })} />

        <label htmlFor={`${typesId}-input`}>Type of work</label>
        <div>
          <input
            id={`${typesId}-input`}
            list={typesId}
            value={type}
            placeholder="e.g. Study, Work, Research"
            onChange={(e) => setType(e.target.value)}
            onBlur={commitType}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <datalist id={typesId}>
            {allTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <label>Tags</label>
        <TagEditor tags={note.tags} suggestions={allTags} onChange={(tags) => onPatch({ tags })} />

        {note.folder && (
          <>
            <label>Folder</label>
            <div className="muted">{note.folder}</div>
          </>
        )}
      </div>

      <Viewer note={note} />

      <div className="detail-actions">
        <div className="row">
          <a className="btn" href={rawUrl(note.path)} target="_blank" rel="noreferrer">
            Open in new tab
          </a>
          <a className="btn ghost" href={`${rawUrl(note.path)}?download`}>
            Download
          </a>
        </div>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (confirm(`Move "${note.name}" to trash? It stays in ~/notes/.trash on the server until you empty it.`)) onTrash();
          }}
        >
          Move to trash
        </button>
      </div>
    </aside>
  );
}
