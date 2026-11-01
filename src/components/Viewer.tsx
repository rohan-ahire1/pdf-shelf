import { useEffect, useRef, useState } from 'react';
import { rawUrl, type Note } from '../api';
import { useTheme } from '../theme';
import { PdfViewer } from './PdfViewer';

// Shows a note: PDFs in our own pdf.js viewer, HTML in a locked-down frame,
// Markdown rendered with Mermaid diagrams, plain text as is.
export function Viewer({ note }: { note: Note }) {
  const url = rawUrl(note.path);
  if (note.kind === 'pdf') return <PdfViewer key={url} url={url} name={note.name} />;
  if (note.kind === 'html') {
    return <iframe className="preview" src={url} title={`Preview of ${note.name}`} sandbox="allow-scripts allow-popups" />;
  }
  return <TextViewer note={note} url={url} />;
}

function TextViewer({ note, url }: { note: Note; url: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setText(null);
    setError('');
    fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Could not load (${r.status})`))))
      .then((t) => live && setText(t))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [url, note.modifiedTime]);

  if (error) return <div className="preview-msg error-text">{error}</div>;
  if (text === null) return <div className="preview-msg muted">Loading…</div>;
  if (note.kind === 'text') return <pre className="doc plain">{text}</pre>;
  return <Markdown source={text} folder={note.folder} />;
}

function Markdown({ source, folder }: { source: string; folder: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    let live = true;
    (async () => {
      const [{ marked }, { default: DOMPurify }] = await Promise.all([import('marked'), import('dompurify')]);
      const html = DOMPurify.sanitize(await marked.parse(source, { gfm: true }));
      if (!live || !ref.current) return;
      ref.current.innerHTML = html;
      for (const a of ref.current.querySelectorAll('a[href^="http"]')) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noreferrer');
      }
      // Images next to the note (e.g. ![](diagram.png)) load from the notes folder.
      for (const img of ref.current.querySelectorAll('img')) {
        const src = img.getAttribute('src') || '';
        if (src && !/^([a-z]+:|\/|#)/i.test(src)) img.src = rawUrl(joinPath(folder, src));
      }

      const blocks = [...ref.current.querySelectorAll('pre > code.language-mermaid')];
      if (!blocks.length) return;
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme === 'dark' ? 'dark' : 'default' });
      for (const [i, code] of blocks.entries()) {
        try {
          const { svg } = await mermaid.render(`mmd-${Date.now()}-${i}`, code.textContent || '');
          if (!live) return;
          const box = document.createElement('div');
          box.className = 'mermaid-diagram';
          box.innerHTML = svg;
          code.parentElement?.replaceWith(box);
        } catch {
          code.parentElement?.classList.add('mermaid-error');
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [source, folder, theme]);

  return <div ref={ref} className="doc markdown" />;
}

function joinPath(folder: string, rel: string) {
  const parts = folder ? folder.split('/') : [];
  for (const p of decodeURIComponent(rel).split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return parts.join('/');
}
