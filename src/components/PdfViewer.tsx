import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';

type PdfJs = typeof import('pdfjs-dist');
type Size = { w: number; h: number };

// pdf.js is large, so it only loads the first time a PDF is opened.
let pdfjs: Promise<PdfJs> | null = null;
function loadPdfJs() {
  pdfjs ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  );
  return pdfjs;
}

const STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const GAP = 12;
const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function PdfViewer({ url, name }: { url: string; name: string }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [fitScale, setFitScale] = useState(1);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [expanded, setExpanded] = useState(false);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const position = useRef(0);

  const scale = zoom === 'fit' ? fitScale : zoom;
  const renderScale = useDebounced(scale, 150);

  useEffect(() => {
    let live = true;
    let loading: ReturnType<PdfJs['getDocument']> | null = null;
    setDoc(null);
    setSizes([]);
    setError('');
    loadPdfJs()
      .then(async (lib) => {
        if (!live) return;
        loading = lib.getDocument({ url });
        const d = await loading.promise;
        const pages = await Promise.all(Array.from({ length: d.numPages }, (_, i) => d.getPage(i + 1)));
        if (!live) return;
        setSizes(
          pages.map((p) => {
            const v = p.getViewport({ scale: 1 });
            return { w: v.width, h: v.height };
          }),
        );
        setDoc(d);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
      loading?.destroy();
    };
  }, [url]);

  // "Fit" keeps the widest page as wide as the panel.
  useEffect(() => {
    if (!scroller || !sizes.length) return;
    const widest = Math.max(...sizes.map((s) => s.w));
    const update = () => setFitScale(clamp((scroller.clientWidth - GAP * 2) / widest));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller, sizes]);

  // Stay at the same spot in the document when the zoom changes.
  useLayoutEffect(() => {
    if (scroller) scroller.scrollTop = position.current * scroller.scrollHeight;
  }, [scale, scroller]);

  const onScroll = () => {
    if (!scroller) return;
    position.current = scroller.scrollHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
    const line = scroller.scrollTop + scroller.clientHeight / 3;
    let current = 1;
    for (const el of scroller.querySelectorAll<HTMLElement>('.pdf-page')) {
      if (el.offsetTop > line) break;
      current = Number(el.dataset.page);
    }
    if (current !== page) {
      setPage(current);
      setPageInput(String(current));
    }
  };

  const goTo = useCallback(
    (n: number) => {
      if (!scroller || !sizes.length) return;
      const target = Math.min(sizes.length, Math.max(1, Math.round(n)));
      const el = scroller.querySelector<HTMLElement>(`.pdf-page[data-page="${target}"]`);
      if (el) scroller.scrollTop = el.offsetTop - GAP;
      setPage(target);
      setPageInput(String(target));
    },
    [scroller, sizes.length],
  );

  const zoomIn = () => setZoom(STEPS.find((s) => s > scale + 0.01) ?? MAX_ZOOM);
  const zoomOut = () => setZoom([...STEPS].reverse().find((s) => s < scale - 0.01) ?? MIN_ZOOM);

  // Pinch on a trackpad (or Ctrl + scroll) zooms the document, not the page.
  useEffect(() => {
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => clamp((z === 'fit' ? fitScale : z) * Math.exp(-e.deltaY * 0.01)));
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [scroller, fitScale]);

  // Keys while reading. Escape leaves full window before it closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName);
      if (e.key === 'Escape' && expanded) {
        e.stopImmediatePropagation();
        setExpanded(false);
      } else if (!typing && expanded && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
        e.preventDefault();
        goTo(page + 1);
      } else if (!typing && expanded && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
        e.preventDefault();
        goTo(page - 1);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
      } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (error) return <div className="preview-msg error-text">Could not open this PDF: {error}</div>;

  return (
    <div className={`pdf-viewer ${expanded ? 'expanded' : ''}`}>
      <div className="pdf-toolbar">
        {expanded && <span className="pdf-title">{name.replace(/\.pdf$/i, '')}</span>}
        <div className="pdf-group">
          <button type="button" className="btn ghost icon" onClick={() => goTo(page - 1)} disabled={page <= 1} aria-label="Previous page">
            ‹
          </button>
          <input
            className="pdf-page-input"
            inputMode="numeric"
            value={pageInput}
            aria-label="Page"
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onBlur={() => setPageInput(String(page))}
            onKeyDown={(e) => e.key === 'Enter' && goTo(Number(pageInput) || page)}
          />
          <span className="muted">/ {sizes.length || '…'}</span>
          <button
            type="button"
            className="btn ghost icon"
            onClick={() => goTo(page + 1)}
            disabled={page >= sizes.length}
            aria-label="Next page"
          >
            ›
          </button>
        </div>
        <div className="pdf-group">
          <button type="button" className="btn ghost icon" onClick={zoomOut} aria-label="Zoom out">
            −
          </button>
          <button
            type="button"
            className={`btn ghost pdf-zoom ${zoom === 'fit' ? 'on' : ''}`}
            onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')}
            title={zoom === 'fit' ? 'Fitted to width. Click for 100%' : 'Click to fit to width'}
          >
            {zoom === 'fit' ? 'Fit' : `${Math.round(scale * 100)}%`}
          </button>
          <button type="button" className="btn ghost icon" onClick={zoomIn} aria-label="Zoom in">
            +
          </button>
        </div>
        <button
          type="button"
          className="btn ghost icon pdf-expand"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Exit full window' : 'Read full window'}
          title={expanded ? 'Exit full window (Esc)' : 'Read full window'}
        >
          {expanded ? '✕' : '⤢'}
        </button>
      </div>
      <div className="pdf-scroll" ref={setScroller} onScroll={onScroll}>
        {!doc ? (
          <div className="preview-msg muted">Loading…</div>
        ) : (
          <div className="pdf-pages">
            {sizes.map((size, i) => (
              <PdfPage
                key={i}
                doc={doc}
                number={i + 1}
                size={size}
                scale={scale}
                renderScale={renderScale}
                root={scroller}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PageProps {
  doc: PDFDocumentProxy;
  number: number;
  size: Size;
  scale: number;
  renderScale: number;
  root: HTMLElement | null;
}

// One page. It is only drawn while it is on screen or close to it, so long PDFs stay light.
function PdfPage({ doc, number, size, scale, renderScale, root }: PageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root, rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!near) {
      el.replaceChildren();
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    let text: TextLayer | null = null;
    (async () => {
      const lib = await loadPdfJs();
      const p = await doc.getPage(number);
      if (cancelled) return;
      const viewport = p.getViewport({ scale: renderScale });
      // Sharp on high-density screens, but capped so huge zooms don't run out of canvas memory.
      let ratio = Math.min(window.devicePixelRatio || 1, 3);
      const maxPixels = 16_000_000;
      if (viewport.width * viewport.height * ratio * ratio > maxPixels) {
        ratio = Math.sqrt(maxPixels / (viewport.width * viewport.height));
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      task = p.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
      await task.promise;
      if (cancelled) return;
      const layer = document.createElement('div');
      layer.className = 'textLayer';
      text = new lib.TextLayer({ textContentSource: p.streamTextContent(), container: layer, viewport });
      await text.render();
      if (cancelled) return;
      // Swap in one go, so zooming never flashes a blank page.
      el.replaceChildren(canvas, layer);
    })().catch((e) => {
      if (!cancelled && e?.name !== 'RenderingCancelledException') console.error(e);
    });
    return () => {
      cancelled = true;
      task?.cancel();
      text?.cancel();
    };
  }, [near, doc, number, renderScale]);

  const style = {
    width: size.w * scale,
    height: size.h * scale,
    '--scale-factor': scale,
    '--total-scale-factor': scale,
  } as CSSProperties;
  return <div ref={ref} className="pdf-page" data-page={number} style={style} />;
}
