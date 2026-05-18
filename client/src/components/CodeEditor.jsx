import { useRef, useCallback, useEffect, useState } from 'react';
import { VscCopy, VscCheck } from 'react-icons/vsc';
import './CodeEditor.css';

export default function CodeEditor({ block, isAdmin, socketId, onCodeChange, onDelete, fileIcon }) {
  const isOwner = block.ownerId === socketId;
  const canEdit = isAdmin || isOwner;
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const [lineCount, setLineCount] = useState(1);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef(null);

  // Local state for immediate typing feedback
  const [localCode, setLocalCode] = useState(block.code || '');

  // Sync with remote changes
  useEffect(() => {
    if (block.code !== localCode) {
      setLocalCode(block.code || '');
    }
  }, [block.code]);

  // AI Summary state
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summarizedCode, setSummarizedCode] = useState(null); // Track code that was summarized

  // Calculate line numbers
  useEffect(() => {
    const lines = (block.code || '').split('\n').length;
    setLineCount(Math.max(lines, 1));
  }, [block.code]);

  // Sync scroll between line numbers and textarea
  const handleScroll = useCallback(() => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  // Debounced code change handler
  const handleChange = useCallback((e) => {
    const newCode = e.target.value;
    setLocalCode(newCode); // Update screen instantly with zero lag
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onCodeChange(block.id, newCode);
    }, 100);
  }, [onCodeChange, block.id]);

  // Handle Tab key for indentation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      setLocalCode(newValue); // Update instantly
      textarea.value = newValue;
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      onCodeChange(block.id, newValue);
    }
  }, [onCodeChange, block.id]);

  const handleCopy = useCallback(() => {
    if (block.code) {
      navigator.clipboard.writeText(block.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [block.code]);

  const handleSummarize = useCallback(async () => {
    if (!block.code || !block.code.trim()) return;
    
    // Toggle open/close if we already have a summary AND the code hasn't changed
    if (summary && summarizedCode === block.code) { 
      setSummaryOpen(prev => !prev); 
      return; 
    }
    
    // Otherwise, fetch a fresh summary
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUrl: '__inline__', fileName: block.name, inlineCode: block.code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summarization failed');
      setSummary(data);
      setSummarizedCode(block.code);
    } catch (err) {
      setSummaryError(err.message || 'Could not generate summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [block.code, block.name, summary, summarizedCode]);

  return (
    <div className="code-editor">
      <div className="code-editor__toolbar">
        <div className="code-editor__toolbar-left">
          <div className="code-editor__file-icon">{fileIcon || '📄'}</div>
          <span className="code-editor__title mono">
            {block.name}
          </span>
          {!canEdit && <span className="badge badge-readonly">READ ONLY</span>}
        </div>
        <div className="code-editor__toolbar-right">
          <button
            className={`code-editor__action-btn ${summaryOpen ? 'code-editor__action-btn--active' : ''}`}
            onClick={handleSummarize}
            title="AI Summarize"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span className="code-editor__action-text">Summarize</span>
          </button>
          <div className="code-editor__tab-actions">
            {isOwner && <span className="owner-badge">You</span>}
            <button 
              className="code-editor__action-btn code-editor__copy-btn" 
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? <VscCheck className="text-success" /> : <VscCopy />}
              <span className="code-editor__action-text">{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            {canEdit && (
              <button className="code-editor__action-btn code-editor__action-btn--delete" onClick={() => onDelete(block.id)} title="Delete Block">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span className="code-editor__action-text">Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* AI Summary Panel */}
      {summaryOpen && (
        <div className="code-editor__summary">
          <div className="code-editor__summary-header">
            <span className="code-editor__summary-label">🤖 <span className="code-editor__summary-title">AI Summary</span></span>
            <button className="code-editor__summary-close" onClick={() => setSummaryOpen(false)} title="Close">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="code-editor__summary-body">
            {summaryLoading && <div className="code-editor__summary-skeleton"><div className="summary-shimmer"></div><div className="summary-shimmer summary-shimmer--short"></div></div>}
            {summaryError && <p className="code-editor__summary-error">{summaryError}</p>}
            {!summaryLoading && !summaryError && summary && (
              <div className="code-editor__summary-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="code-editor__summary-section">
                  <h4 className="code-editor__summary-subtitle" style={{ fontSize: '0.7rem', fontWeight: 600, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>✨ Summary</h4>
                  <p className="code-editor__summary-text">{typeof summary === 'string' ? summary : summary.summary}</p>
                </div>
                {summary.warnings && summary.warnings.length > 0 && (
                  <div className="code-editor__summary-section code-editor__summary-section--warnings" style={{ marginTop: '4px' }}>
                    <h4 className="code-editor__summary-subtitle" style={{ fontSize: '0.7rem', fontWeight: 600, margin: '0 0 4px 0', color: '#fbbf24' }}>⚠️ Warnings</h4>
                    <ul className="code-editor__summary-warnings-list" style={{ margin: 0, padding: '0 0 0 16px', listStyleType: 'disc', color: '#fcd34d' }}>
                      {summary.warnings.map((warning, idx) => (
                        <li key={idx} className="code-editor__summary-warning-item" style={{ fontSize: '0.75rem', lineHeight: 1.5, marginBottom: '2px' }}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <div className="code-editor__body">
        <div className="code-editor__line-numbers" ref={lineNumbersRef}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className="line-number">{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="code-editor__textarea mono"
          value={localCode}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={canEdit ? handleKeyDown : undefined}
          readOnly={!canEdit}
          placeholder={canEdit ? '// Start typing your code here...' : '// View-only mode...'}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  );
}
