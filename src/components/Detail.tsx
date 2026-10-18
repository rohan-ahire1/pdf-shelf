import { useEffect, useId, useState } from 'react';
import { previewUrl, type Pdf, type PdfChanges } from '../drive';
import { Importance } from './Importance';
import { TagEditor } from './TagEditor';

interface Props {
  pdf: Pdf;
  allTags: string[];
  allTypes: string[];
  onPatch: (changes: PdfChanges) => void;
  onTrash: () => void;
  onClose: () => void;
}

export function Detail({ pdf, allTags, allTypes, onPatch, onTrash, onClose }: Props) {
  const [name, setName] = useState(pdf.name);
  const [type, setType] = useState(pdf.type);
  const typesId = useId();

  useEffect(() => setName(pdf.name), [pdf.id, pdf.name]);
  useEffect(() => setType(pdf.type), [pdf.id, pdf.type]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commitName = () => {
    const v = name.trim();
    if (v && v !== pdf.name) onPatch({ name: v });
    else setName(pdf.name);
  };
  const commitType = () => {
    const v = type.trim();
    if (v !== pdf.type) onPatch({ type: v });
  };

  return (
    <aside className="detail" aria-label="PDF details">
      <div className="detail-head">
        <button
          type="button"
          className={`star ${pdf.starred ? 'on' : ''}`}
          aria-pressed={pdf.starred}
          aria-label={pdf.starred ? 'Unstar' : 'Star'}
          onClick={() => onPatch({ starred: !pdf.starred })}
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
        <Importance size="md" value={pdf.importance} onChange={(importance) => onPatch({ importance })} />

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
        <TagEditor tags={pdf.tags} suggestions={allTags} onChange={(tags) => onPatch({ tags })} />

        {pdf.folderPath && (
          <>
            <label>Subfolder</label>
            <div className="muted">{pdf.folderPath}</div>
          </>
        )}
      </div>

      <iframe className="preview" src={previewUrl(pdf.id)} title={`Preview of ${pdf.name}`} allow="autoplay" />

      <div className="detail-actions">
        <a className="btn" href={pdf.webViewLink} target="_blank" rel="noreferrer">
          Open in Google Drive
        </a>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (confirm(`Move "${pdf.name}" to Google Drive trash? You can restore it from Drive for 30 days.`)) onTrash();
          }}
        >
          Move to trash
        </button>
      </div>
    </aside>
  );
}
