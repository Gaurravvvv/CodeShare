import { useRef, useCallback, useEffect, useState } from 'react';
import { VscCopy, VscCheck } from 'react-icons/vsc';
import './CodeEditor.css';

export default function CodeEditor({ block, isAdmin, totalBlocks, onCodeChange, onDelete, fileIcon }) {
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const [lineCount, setLineCount] = useState(1);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef(null);

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

  return (
    <div className="code-editor">
      <div className="code-editor__toolbar">
        <div className="code-editor__toolbar-left">
          <div className="code-editor__file-icon">{fileIcon || '📄'}</div>
          <span className="code-editor__title mono">
            {block.name}
          </span>
          {!isAdmin && <span className="badge badge-viewer">READ ONLY</span>}
        </div>
        <div className="code-editor__toolbar-right">
          <button 
            className="code-editor__action-btn code-editor__copy-btn" 
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <VscCheck className="text-success" /> : <VscCopy />}
            <span className="code-editor__action-text">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <div className="code-editor__body">
        <div className="code-editor__line-numbers" ref={lineNumbersRef}>
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1} className="line-number">{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="code-editor__textarea mono"
          value={block.code}
          onChange={handleChange}
          onScroll={handleScroll}
          onKeyDown={isAdmin ? handleKeyDown : undefined}
          readOnly={!isAdmin}
          placeholder={isAdmin ? '// Start typing your code here...' : '// Waiting for admin to share code...'}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  );
}
