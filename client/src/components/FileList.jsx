import { useState, useCallback } from 'react';
import FilePreviewModal from './FilePreviewModal';
import { SummarizeButton, SummaryPanel } from './SummaryCard';
import './FileList.css';

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  const codeExts = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'md'];

  if (codeExts.includes(ext)) return '{ }';
  if (imageExts.includes(ext)) return '🖼';
  if (docExts.includes(ext)) return '📄';
  if (ext === 'zip' || ext === 'tar' || ext === 'gz') return '📦';
  return '📎';
}

function canSummarize(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  const supported = [
    'js', 'jsx', 'ts', 'tsx', 'py', 'cpp', 'c', 'java', 'go', 'rs',
    'rb', 'php', 'swift', 'kt', 'html', 'css', 'scss', 'json', 'yaml',
    'yml', 'xml', 'sql', 'sh', 'bat', 'r', 'lua', 'dart',
    'txt', 'md', 'markdown', 'log', 'csv',
    'pdf', 'docx', 'xlsx', 'xls', 'pptx',
  ];
  return supported.includes(ext);
}

export default function FileList({ files, isAdmin, socketId, onDelete }) {
  const [previewFile, setPreviewFile] = useState(null);
  const [activeSummaryKey, setActiveSummaryKey] = useState(null);
  // Cache summaries so re-opening is instant
  const [summaryCache, setSummaryCache] = useState({});
  const [loadingKey, setLoadingKey] = useState(null);
  const [errorKey, setErrorKey] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSummarize = useCallback(async (file) => {
    const key = file.key;

    // If already open, just close it
    if (activeSummaryKey === key) {
      setActiveSummaryKey(null);
      return;
    }

    // If cached, show it instantly
    if (summaryCache[key]) {
      setActiveSummaryKey(key);
      setErrorKey(null);
      return;
    }

    // Fetch from backend
    setActiveSummaryKey(key);
    setLoadingKey(key);
    setErrorKey(null);
    setErrorMsg('');

    try {
      const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: file.downloadUrl, fileName: file.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summarization failed');
      setSummaryCache(prev => ({ ...prev, [key]: data }));
    } catch (err) {
      setErrorKey(key);
      setErrorMsg(err.message || 'Could not generate summary');
    } finally {
      setLoadingKey(null);
    }
  }, [activeSummaryKey, summaryCache]);

  if (!files || files.length === 0) {
    return (
      <div className="file-list file-list--empty">
        <p className="file-list__empty-text mono">
          <span className="text-muted">//</span> No files uploaded yet
        </p>
      </div>
    );
  }

  return (
    <div className="file-list">
      <div className="file-list__header">
        <span className="file-list__title">Files</span>
        <span className="file-list__count">{files.length}</span>
      </div>
      <div className="file-list__items">
        {files.map((file) => {
          const showSummarize = canSummarize(file.name);
          const isOpen = activeSummaryKey === file.key;
          const isLoading = loadingKey === file.key;
          const hasError = errorKey === file.key;
          const isOwner = file.ownerId === socketId;
          const canEdit = isAdmin || isOwner;

          return (
            <div key={file.key} className="file-list__entry">
              {/* Action row: download link + view + summarize + delete */}
              <div className="file-list__item-container">
                <a
                  className="file-list__item"
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={file.name}
                  title="Download file"
                >
                  <span className="file-list__icon">{getFileIcon(file.name)}</span>
                  <div className="file-list__info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="file-list__name mono">{file.name}</span>
                      {isOwner && <span className="owner-badge">You</span>}
                    </div>
                    <span className="file-list__size">{formatFileSize(file.size)}</span>
                  </div>
                  <svg className="file-list__download" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
                <button
                  className="file-list__view-btn"
                  onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }}
                  title="Preview file"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
                {showSummarize && (
                  <SummarizeButton
                    isActive={isOpen}
                    isLoading={isLoading}
                    onClick={() => handleSummarize(file)}
                  />
                )}
                {canEdit && (
                  <button
                    className="file-list__delete-btn"
                    onClick={(e) => { e.stopPropagation(); onDelete(file.key); }}
                    title="Delete file"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Summary panel — appears below the file row */}
              {isOpen && (
                <SummaryPanel
                  data={summaryCache[file.key] || null}
                  loading={isLoading}
                  error={hasError ? errorMsg : ''}
                  onClose={() => setActiveSummaryKey(null)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* File Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
