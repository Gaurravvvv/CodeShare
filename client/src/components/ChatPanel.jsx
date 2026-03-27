import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './ChatPanel.css';

// File extension categories
const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb',
  'php', 'swift', 'kt', 'html', 'css', 'json', 'yaml', 'yml', 'md', 'sh', 'sql',
  'txt', 'xml', 'toml', 'ini', 'cfg', 'bat', 'ps1', 'lua', 'r', 'dart', 'scala'
]);
const MEDIA_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico',
  'mp4', 'mp3', 'wav', 'ogg', 'avi', 'mov', 'mkv', 'flac',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'tar', 'gz', 'rar', '7z'
]);

function getExt(name) {
  return (name || '').split('.').pop()?.toLowerCase() || '';
}

function isCodeFile(name) {
  return CODE_EXTENSIONS.has(getExt(name));
}

function isMediaFile(name) {
  return MEDIA_EXTENSIONS.has(getExt(name));
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Parse message text into rich segments: plain text, @user, #"code file", $"media file"
 * Supports quoted filenames: #"my file.js" and $"my pic.png"
 * Also supports unquoted single-word: #main.js, $icon.png
 */
function RichText({ text, onFileClick }) {
  // Regex matches:
  //   @word           - user mention
  //   #"quoted name"  - code file mention with spaces
  //   #word.ext       - code file mention without spaces
  //   $"quoted name"  - media file mention with spaces
  //   $word.ext       - media file mention without spaces
  const regex = /(@[\w.-]+|#"[^"]+"|#[\w.-]+|\$"[^"]+"|(?<!\w)\$[\w.-]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    if (raw.startsWith('@')) {
      parts.push({ type: 'user', value: raw });
    } else if (raw.startsWith('#')) {
      // Extract filename (strip # and optional quotes)
      const filename = raw.startsWith('#"') ? raw.slice(2, -1) : raw.slice(1);
      parts.push({ type: 'code', value: raw, filename });
    } else if (raw.startsWith('$')) {
      const filename = raw.startsWith('$"') ? raw.slice(2, -1) : raw.slice(1);
      parts.push({ type: 'media', value: raw, filename });
    }
    lastIndex = match.index + raw.length;
  }
  // Remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'user') {
          return <span key={i} className="chat-mention chat-mention--user">{part.value}</span>;
        }
        if (part.type === 'code') {
          return (
            <span
              key={i}
              className="chat-mention chat-mention--file"
              onClick={(e) => { e.stopPropagation(); onFileClick(part.filename); }}
              role="button"
              tabIndex={0}
              title={`Open ${part.filename} in editor`}
            >
              {part.value}
            </span>
          );
        }
        if (part.type === 'media') {
          return (
            <span
              key={i}
              className="chat-mention chat-mention--media"
              title={part.filename}
            >
              {part.value}
            </span>
          );
        }
        return <span key={i}>{part.value}</span>;
      })}
    </>
  );
}

export default function ChatPanel({ messages, activeUsers, files, blocks, username, roomId, onSendMessage, onFileClick }) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [mentionType, setMentionType] = useState(null); // 'user' | 'code' | 'media' | null
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const mentionStartRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mention candidates based on type
  const mentionCandidates = useMemo(() => {
    if (mentionType === 'user') {
      return (activeUsers || []).filter(u =>
        u.toLowerCase().includes(mentionQuery.toLowerCase())
      );
    }
    if (mentionType === 'code') {
      // Code blocks (editor tabs)
      const blockNames = (blocks || []).map(b => b.name);
      return blockNames.filter(n =>
        n.toLowerCase().includes(mentionQuery.toLowerCase())
      );
    }
    if (mentionType === 'media') {
      // Uploaded media files only
      const mediaFiles = (files || []).filter(f => isMediaFile(f.name)).map(f => f.name);
      return mediaFiles.filter(n =>
        n.toLowerCase().includes(mentionQuery.toLowerCase())
      );
    }
    return [];
  }, [mentionType, mentionQuery, activeUsers, files, blocks]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionCandidates.length, mentionQuery]);

  const closeMention = useCallback(() => {
    setMentionType(null);
    setMentionQuery('');
    mentionStartRef.current = null;
  }, []);

  const insertMention = useCallback((value) => {
    const startPos = mentionStartRef.current;
    if (startPos == null) return;
    const prefixChar = mentionType === 'user' ? '@' : mentionType === 'code' ? '#' : '$';
    const before = text.slice(0, startPos);
    const after = text.slice(startPos + 1 + mentionQuery.length); // +1 for trigger char

    // Wrap in quotes if the value contains spaces
    const hasSpaces = value.includes(' ');
    const formatted = hasSpaces ? `${prefixChar}"${value}" ` : `${prefixChar}${value} `;

    const newText = `${before}${formatted}${after}`;
    setText(newText);
    closeMention();

    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + formatted.length;
        textareaRef.current.focus();
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
      }
    }, 0);
  }, [text, mentionType, mentionQuery, closeMention]);

  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setText(val);

    // Detect @, #, or $ at cursor
    if (cursorPos > 0) {
      let i = cursorPos - 1;
      // Walk back to find trigger
      while (i >= 0 && val[i] !== ' ' && val[i] !== '\n' && val[i] !== '@' && val[i] !== '#' && val[i] !== '$') {
        i--;
      }
      if (i >= 0 && (val[i] === '@' || val[i] === '#' || val[i] === '$')) {
        const trigger = val[i];
        const query = val.slice(i + 1, cursorPos);
        if (i === 0 || val[i - 1] === ' ' || val[i - 1] === '\n') {
          const type = trigger === '@' ? 'user' : trigger === '#' ? 'code' : 'media';
          setMentionType(type);
          setMentionQuery(query);
          mentionStartRef.current = i;
          return;
        }
      }
    }
    closeMention();
  }, [closeMention]);

  const handleKeyDown = useCallback((e) => {
    if (mentionType && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMention();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [mentionType, mentionCandidates, mentionIndex, insertMention, closeMention]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendMessage(trimmed, replyTo);
    setText('');
    setReplyTo(null);
    closeMention();
  }, [text, replyTo, onSendMessage, closeMention]);

  const cancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  // Dropdown label
  const dropdownLabel = mentionType === 'user' ? 'Users' : mentionType === 'code' ? 'Code Files' : 'Media Files';
  const dropdownPrefix = mentionType === 'user' ? '@' : mentionType === 'code' ? '#' : '$';

  return (
    <div className="chat-panel">
      {/* Messages */}
      <div className="chat-panel__messages">
        {(!messages || messages.length === 0) && (
          <div className="chat-panel__empty mono text-muted">
            // no messages yet — say hello!
          </div>
        )}
        {messages?.map((msg) => {
          const isOwn = msg.sender === username;
          return (
            <div
              key={msg.id}
              className={`chat-msg ${isOwn ? 'chat-msg--own' : ''}`}
              onClick={() => setReplyTo({ id: msg.id, sender: msg.sender, text: msg.text })}
              title="Click to reply"
            >
              {msg.replyTo && (
                <div className="chat-msg__reply-preview">
                  <span className="chat-msg__reply-sender">{msg.replyTo.sender}</span>
                  <span className="chat-msg__reply-text">
                    {msg.replyTo.text.length > 60 ? msg.replyTo.text.slice(0, 60) + '…' : msg.replyTo.text}
                  </span>
                </div>
              )}
              <div className="chat-msg__header">
                <span className="chat-msg__sender">{msg.sender}</span>
                <span className="chat-msg__time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="chat-msg__body">
                <RichText text={msg.text} onFileClick={onFileClick} />
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Mention dropdown */}
      {mentionType && mentionCandidates.length > 0 && (
        <div className="chat-mention-dropdown">
          <div className="chat-mention-dropdown__label">{dropdownLabel}</div>
          {mentionCandidates.map((candidate, i) => (
            <div
              key={candidate}
              className={`chat-mention-dropdown__item ${i === mentionIndex ? 'chat-mention-dropdown__item--active' : ''}`}
              onClick={() => insertMention(candidate)}
            >
              <span className="chat-mention-dropdown__prefix">
                {dropdownPrefix}
              </span>
              {candidate}
            </div>
          ))}
        </div>
      )}

      {/* Reply bar */}
      {replyTo && (
        <div className="chat-panel__reply-bar">
          <div className="chat-panel__reply-info">
            <span className="chat-panel__reply-label">Replying to</span>
            <span className="chat-panel__reply-name">{replyTo.sender}</span>
          </div>
          <button className="chat-panel__reply-cancel" onClick={cancelReply}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="chat-panel__input-area">
        <textarea
          ref={textareaRef}
          className="chat-panel__input mono"
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="@ users · # code · $ media"
          rows={1}
          spellCheck={false}
        />
        <button
          className="chat-panel__send-btn"
          onClick={handleSend}
          disabled={!text.trim()}
          title="Send message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
