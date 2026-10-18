import { useId, useState } from 'react';
import { Tag } from './Tag';

interface Props {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, suggestions, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const add = (raw: string) => {
    const name = raw.replace(/,/g, ' ').trim();
    setDraft('');
    if (!name || tags.some((t) => t.toLowerCase() === name.toLowerCase())) return;
    // Reuse the existing spelling of a tag if one matches.
    const existing = suggestions.find((s) => s.toLowerCase() === name.toLowerCase());
    onChange([...tags, existing ?? name]);
  };

  return (
    <div className="tag-editor">
      {tags.map((t) => (
        <Tag key={t} name={t}>
          <button type="button" className="tag-remove" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            ×
          </button>
        </Tag>
      ))}
      <input
        value={draft}
        list={listId}
        placeholder={tags.length ? 'Add tag' : 'Add a tag, e.g. ML notes'}
        aria-label="Add tag"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
