import { useState, useEffect, useRef, useCallback } from 'react';
import './FilePreviewModal.css';
import ReactMarkdown from 'react-markdown';

const IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','svg'];
const VIDEO_EXTS = ['mp4','webm','ogg'];
const AUDIO_EXTS = ['mp3','wav','aac'];
const SHEET_EXTS = ['xlsx', 'xls', 'csv'];
const PPTX_EXTS = ['pptx'];
const MD_EXTS = ['md', 'markdown'];

function getExt(name) { return (name||'').split('.').pop().toLowerCase(); }

function getCategory(name) {
  const e = getExt(name);
  if (IMAGE_EXTS.includes(e)) return 'image';
  if (VIDEO_EXTS.includes(e)) return 'video';
  if (AUDIO_EXTS.includes(e)) return 'audio';
  if (e === 'pdf') return 'pdf';
  if (e === 'docx') return 'docx';
  if (MD_EXTS.includes(e)) return 'markdown';
  if (SHEET_EXTS.includes(e)) return 'spreadsheet';
  if (e === 'pptx') return 'pptx';
  return 'unsupported';
}

function ImagePreview({ url }) {
  return <div className="fpm__image-container"><img src={url} alt="Preview" className="fpm__image" /></div>;
}

function VideoPreview({ url }) {
  return <div className="fpm__media-container"><video controls className="fpm__video" preload="metadata"><source src={url} />Your browser does not support video.</video></div>;
}

function AudioPreview({ url, filename }) {
  return (
    <div className="fpm__audio-container">
      <div className="fpm__audio-art">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span className="fpm__audio-name">{filename}</span>
      </div>
      <audio controls className="fpm__audio" preload="metadata"><source src={url} /></audio>
    </div>
  );
}

function PdfPreview({ url, pdfData }) {
  const containerRef = useRef(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
        const pdf = pdfData
          ? await pdfjsLib.getDocument({ data: pdfData.slice(0) }).promise
          : await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);
        const el = containerRef.current;
        if (!el) return;
        el.innerHTML = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.className = 'fpm__pdf-page';
          canvas.width = vp.width;
          canvas.height = vp.height;
          el.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }
        setRendering(false);
      } catch (err) {
        console.error('PDF render error:', err);
        if (!cancelled) { setError('Failed to render PDF'); setRendering(false); }
      }
    }
    render();
    return () => { cancelled = true; };
  }, [url, pdfData]);

  if (error) return <div className="fpm__error">{error}</div>;
  return (
    <div className="fpm__pdf-container">
      {rendering && <div className="fpm__loading"><div className="fpm__spinner"/><span>Rendering PDF…</span></div>}
      {pageCount > 0 && <div className="fpm__pdf-info mono">{pageCount} page{pageCount !== 1 ? 's' : ''}</div>}
      <div ref={containerRef} className="fpm__pdf-pages"/>
    </div>
  );
}

function DocxPreview({ url }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function convert() {
      try {
        const mammoth = await import('mammoth');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Fetch failed');
        const ab = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: ab });
        if (!cancelled) { setHtml(result.value); setLoading(false); }
      } catch (err) {
        if (!cancelled) { setError('Failed to render document'); setLoading(false); }
      }
    }
    convert();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div className="fpm__loading"><div className="fpm__spinner"/><span>Converting document…</span></div>;
  if (error) return <div className="fpm__error">{error}</div>;
  return <div className="fpm__docx-container"><div className="fpm__docx-content" dangerouslySetInnerHTML={{ __html: html }}/></div>;
}

function SpreadsheetPreview({ url }) {
  const [tables, setTables] = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function convert() {
      try {
        const XLSX = await import('xlsx');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Fetch failed');
        const ab = await res.arrayBuffer();
        const wb = XLSX.read(ab, { type: 'array' });
        const sheets = wb.SheetNames.map(n => ({ name: n, data: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }) }));
        if (!cancelled) { setTables(sheets); setLoading(false); }
      } catch (err) {
        if (!cancelled) { setError('Failed to render spreadsheet'); setLoading(false); }
      }
    }
    convert();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div className="fpm__loading"><div className="fpm__spinner"/><span>Parsing spreadsheet…</span></div>;
  if (error) return <div className="fpm__error">{error}</div>;
  const cur = tables[activeSheet];
  return (
    <div className="fpm__sheet-container">
      {tables.length > 1 && <div className="fpm__sheet-tabs">{tables.map((s, i) => <button key={s.name} className={`fpm__sheet-tab ${i === activeSheet ? 'fpm__sheet-tab--active' : ''}`} onClick={() => setActiveSheet(i)}>{s.name}</button>)}</div>}
      {cur && cur.data.length > 0 ? (
        <>
          <div className="fpm__sheet-info mono">
            {cur.data.length} rows × {cur.data[0].length} columns
          </div>
          <div className="fpm__table-wrapper">
            <table className="fpm__table">
              <thead><tr>{cur.data[0].map((c, i) => <th key={i}>{c ?? ''}</th>)}</tr></thead>
              <tbody>{cur.data.slice(1).map((row, ri) => <tr key={ri}>{cur.data[0].map((_, ci) => <td key={ci}>{row[ci] ?? ''}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>
      ) : <div className="fpm__error">Sheet is empty</div>}
    </div>
  );
}

function PptxPreview({ url }) {
  const [pdfData, setPdfData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function convert() {
      try {
        const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const res = await fetch(`${API}/api/preview/pptx`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Conversion failed'); }
        const ab = await res.arrayBuffer();
        if (!cancelled) { setPdfData(ab); setLoading(false); }
      } catch (err) {
        if (!cancelled) { setError(err.message || 'Failed to convert presentation'); setLoading(false); }
      }
    }
    convert();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div className="fpm__loading"><div className="fpm__spinner"/><span>Converting presentation…</span></div>;
  if (error) return <div className="fpm__error">{error}</div>;
  return <PdfPreview pdfData={pdfData} />;
}

function MarkdownPreview({ url }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function fetchMarkdown() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch markdown file');
        const text = await res.text();
        if (!cancelled) { setContent(text); setLoading(false); }
      } catch (err) {
        if (!cancelled) { setError('Failed to load markdown'); setLoading(false); }
      }
    }
    fetchMarkdown();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return <div className="fpm__loading"><div className="fpm__spinner"/><span>Loading markdown…</span></div>;
  if (error) return <div className="fpm__error">{error}</div>;

  return (
    <div className="fpm__markdown-container">
      <MarkdownContent content={content} />
    </div>
  );
}

// Separate component for react-markdown to allow dynamic import
function MarkdownContent({ content }) {
  const [ReactMarkdown, setReactMarkdown] = useState(null);
  const [remarkGfm, setRemarkGfm] = useState(null);

  useEffect(() => {
    Promise.all([
      import('react-markdown'),
      import('remark-gfm')
    ]).then(([rm, gfm]) => {
      setReactMarkdown(() => rm.default);
      setRemarkGfm(() => gfm.default);
    });
  }, []);

  if (!ReactMarkdown || !remarkGfm) {
    return <div className="fpm__loading"><div className="fpm__spinner"/><span>Rendering…</span></div>;
  }

  return (
    <div className="fpm__markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function UnsupportedPreview({ filename, url }) {
  return (
    <div className="fpm__unsupported">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <h3 className="fpm__unsupported-title">Preview not available</h3>
      <p className="fpm__unsupported-ext mono">.{getExt(filename)} files cannot be previewed</p>
      <a href={url} download className="btn btn-primary fpm__download-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download File
      </a>
    </div>
  );
}

export default function FilePreviewModal({ file, onClose }) {
  const overlayRef = useRef(null);
  const category = getCategory(file.name);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleOverlayClick = useCallback((e) => { if (e.target === overlayRef.current) onClose(); }, [onClose]);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  function renderContent() {
    switch (category) {
      case 'image': return <ImagePreview url={file.downloadUrl} />;
      case 'video': return <VideoPreview url={file.downloadUrl} />;
      case 'audio': return <AudioPreview url={file.downloadUrl} filename={file.name} />;
      case 'pdf': return <PdfPreview url={file.downloadUrl} />;
      case 'docx': return <DocxPreview url={file.downloadUrl} />;
      case 'markdown': return <MarkdownPreview url={file.downloadUrl} />;
      case 'spreadsheet': return <SpreadsheetPreview url={file.downloadUrl} />;
      case 'pptx': return <PptxPreview url={file.downloadUrl} />;
      default: return <UnsupportedPreview filename={file.name} url={file.downloadUrl} />;
    }
  }

  return (
    <div className="fpm__overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="fpm__modal">
        <div className="fpm__header">
          <div className="fpm__header-info">
            <span className="fpm__badge mono">{getExt(file.name).toUpperCase()}</span>
            <span className="fpm__filename mono">{file.name}</span>
          </div>
          <div className="fpm__header-actions">
            <a href={file.downloadUrl} download={file.name} className="fpm__action-btn" title="Download" onClick={(e) => e.stopPropagation()}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </a>
            <button className="fpm__close-btn" onClick={onClose} title="Close (Esc)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="fpm__body">{renderContent()}</div>
      </div>
    </div>
  );
}
