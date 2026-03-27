import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { getRoom, verifyAdmin, getUploadUrl, registerFile, uploadFileToFilebase, deleteFile } from '../utils/api';
import RoomHeader from '../components/RoomHeader';
import CodeEditor from '../components/CodeEditor';
import FileZone from '../components/FileZone';
import FileList from '../components/FileList';
import UsernameModal from '../components/UsernameModal';
import ChatPanel from '../components/ChatPanel';
import './Room.css';

import { DiJavascript1, DiPython, DiJava, DiCss3, DiHtml5, DiReact } from 'react-icons/di';
import { VscFile, VscMarkdown, VscJson, VscTerminalCmd } from 'react-icons/vsc';
import { SiTypescript, SiCplusplus, SiDotnet, SiGo, SiRust, SiRuby, SiPhp, SiSwift, SiKotlin } from 'react-icons/si';

const EXTENSION_TO_LANGUAGE = {
  js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python',
  java: 'java',
  c: 'c', cpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  html: 'html',
  css: 'css',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  md: 'markdown',
  sh: 'bash',
  txt: 'plaintext',
};

const getFileIcon = (filename) => {
  if (!filename) return <VscFile />;
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': return <DiJavascript1 color="#F7DF1E" size={16} />;
    case 'ts': case 'tsx': return <SiTypescript color="#3178C6" size={14} />;
    case 'py': return <DiPython color="#3776AB" size={16} />;
    case 'java': return <DiJava color="#5382a1" size={16} />;
    case 'c': case 'cpp': return <SiCplusplus color="#00599C" size={14} />;
    case 'cs': return <SiDotnet color="#239120" size={14} />;
    case 'go': return <SiGo color="#00ADD8" size={14} />;
    case 'rs': return <SiRust color="#DEA584" size={14} />;
    case 'rb': return <SiRuby color="#CC342D" size={14} />;
    case 'php': return <SiPhp color="#777BB4" size={14} />;
    case 'swift': return <SiSwift color="#F05138" size={14} />;
    case 'kt': return <SiKotlin color="#7F52FF" size={14} />;
    case 'html': return <DiHtml5 color="#E34F26" size={16} />;
    case 'css': return <DiCss3 color="#1572B6" size={16} />;
    case 'json': return <VscJson color="#CBCB41" size={16} />;
    case 'md': return <VscMarkdown color="#083fa1" size={16} />;
    case 'sh': case 'bat': return <VscTerminalCmd color="#4EAA25" size={16} />;
    default: return <VscFile size={16} />;
  }
};

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [blocks, setBlocks] = useState([]);
  const [files, setFiles] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [expired, setExpired] = useState(false);

  const [activeBlockId, setActiveBlockId] = useState(null);
  const [editingBlockId, setEditingBlockId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  // Identity & Chat state
  const [username, setUsername] = useState(() => localStorage.getItem('codeshare_username') || '');
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [chatVisible, setChatVisible] = useState(true);
  const [chatFocused, setChatFocused] = useState(false);

  const isLocalChange = useRef(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check for admin token in localStorage
  useEffect(() => {
    const token = localStorage.getItem(`admin_${roomId}`);
    if (token) {
      setAdminToken(token);
    }
  }, [roomId]);

  // Check if username is set — if not, show modal
  useEffect(() => {
    if (!username) {
      setShowUsernameModal(true);
    }
  }, []);

  const handleUsernameSubmit = useCallback((name) => {
    localStorage.setItem('codeshare_username', name);
    setUsername(name);
    setShowUsernameModal(false);
  }, []);

  // Initialize socket connection
  const { socket, emit } = useSocket(roomId, adminToken, username);

  // Fetch room data on mount
  useEffect(() => {
    async function init() {
      try {
        const room = await getRoom(roomId);
        setBlocks(room.blocks || []);
        setFiles(room.files || []);
        
        if (room.blocks?.length > 0) {
          setActiveBlockId(room.blocks[0].id);
        }

        const token = localStorage.getItem(`admin_${roomId}`);
        if (token) {
          const { isAdmin: admin } = await verifyAdmin(roomId, token);
          setIsAdmin(admin);
          if (!admin) {
            localStorage.removeItem(`admin_${roomId}`);
            setAdminToken('');
          }
        }

        setLoading(false);
      } catch (err) {
        if (err.response?.status === 404) {
          setError('Room not found or expired');
        } else {
          setError('Failed to connect to server');
        }
        setLoading(false);
      }
    }

    init();
  }, [roomId]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const onRoomState = (data) => {
      if (!isLocalChange.current) {
        setBlocks(data.blocks || []);
        if (data.blocks?.length > 0 && !activeBlockId) {
          setActiveBlockId(data.blocks[0].id);
        }
      }
      setFiles(data.files || []);
      setIsAdmin(prev => (prev || data.isAdmin) ? true : false);
      if (data.userCount !== undefined) setUserCount(data.userCount);
    };

    const onCodeUpdated = (data) => {
      if (!isLocalChange.current) {
        setBlocks(prev => prev.map(b => b.id === data.blockId ? { ...b, code: data.code } : b));
      }
    };

    const onLanguageChanged = (data) => {
      setBlocks(prev => prev.map(b => b.id === data.blockId ? { ...b, language: data.language } : b));
    };

    const onBlockAdded = (data) => {
      setBlocks(prev => [...prev, data.block]);
      if (data.isOwner) {
        setActiveBlockId(data.block.id);
        setIsMobileMenuOpen(false);
      }
    };

    const onBlockDeleted = (data) => {
      setBlocks(prev => {
        const newBlocks = prev.filter(b => b.id !== data.blockId);
        if (activeBlockId === data.blockId && newBlocks.length > 0) {
          setActiveBlockId(newBlocks[0].id);
        }
        return newBlocks;
      });
    };

    const onBlockRenamed = (data) => {
      setBlocks(prev => prev.map(b => b.id === data.blockId ? { ...b, name: data.name } : b));
    };

    const onFileAdded = (data) => {
      setFiles(prev => {
        if (prev.some(f => f.key === data.fileData.key)) return prev;
        return [...prev, data.fileData];
      });
    };

    const onFileDeleted = (data) => {
      setFiles(prev => prev.filter(f => f.key !== data.fileKey));
    };

    const onUserCount = (data) => setUserCount(data.count);
    const onRoomExpired = () => setExpired(true);
    const onError = (data) => showToast(data.message, 'error');

    const onChatHistory = (data) => setChatMessages(data.messages || []);
    const onNewMessage = (data) => setChatMessages(prev => [...prev, data.message]);
    const onUsersUpdated = (data) => setActiveUsers(data.users || []);

    socket.on('room-state', onRoomState);
    socket.on('code-updated', onCodeUpdated);
    socket.on('language-changed', onLanguageChanged);
    socket.on('block-added', onBlockAdded);
    socket.on('block-deleted', onBlockDeleted);
    socket.on('block-renamed', onBlockRenamed);
    socket.on('file-added', onFileAdded);
    socket.on('file-deleted', onFileDeleted);
    socket.on('user-count', onUserCount);
    socket.on('room-expired', onRoomExpired);
    socket.on('error', onError);
    socket.on('chat-history', onChatHistory);
    socket.on('new-message', onNewMessage);
    socket.on('users-updated', onUsersUpdated);

    return () => {
      socket.off('room-state', onRoomState);
      socket.off('code-updated', onCodeUpdated);
      socket.off('language-changed', onLanguageChanged);
      socket.off('block-added', onBlockAdded);
      socket.off('block-deleted', onBlockDeleted);
      socket.off('block-renamed', onBlockRenamed);
      socket.off('file-added', onFileAdded);
      socket.off('file-deleted', onFileDeleted);
      socket.off('user-count', onUserCount);
      socket.off('room-expired', onRoomExpired);
      socket.off('error', onError);
      socket.off('chat-history', onChatHistory);
      socket.off('new-message', onNewMessage);
      socket.off('users-updated', onUsersUpdated);
    };
  }, [socket, activeBlockId]);

  const handleCodeChange = useCallback((blockId, newCode) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, code: newCode } : b));
    isLocalChange.current = true;
    emit('code-update', { roomId, blockId, code: newCode, adminToken });
    setTimeout(() => { isLocalChange.current = false; }, 200);
  }, [roomId, adminToken, emit]);

  const handleAddBlock = useCallback(() => {
    if (!isAdmin || !adminToken) return;
    emit('block-added', { roomId, adminToken });
  }, [roomId, adminToken, emit, isAdmin]);

  const handleDeleteBlock = useCallback((blockId) => {
    if (!isAdmin || !adminToken) return;
    emit('block-deleted', { roomId, blockId, adminToken });
  }, [roomId, adminToken, emit, isAdmin]);

  const handleRenameBlock = useCallback((blockId, newName) => {
    if (!isAdmin || !adminToken || !newName.trim()) {
      setEditingBlockId(null);
      return;
    }
    const ext = newName.split('.').pop().toLowerCase();
    const newLang = EXTENSION_TO_LANGUAGE[ext] || 'plaintext';
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name: newName, language: newLang } : b));
    emit('block-rename', { roomId, blockId, name: newName, adminToken });
    emit('language-change', { roomId, blockId, language: newLang, adminToken });
    setEditingBlockId(null);
  }, [roomId, adminToken, emit, isAdmin]);

  const handleFileUpload = useCallback(async (file) => {
    if (!isAdmin || !adminToken) return;
    setUploading(true);
    try {
      const { uploadUrl, fileKey, downloadUrl } = await getUploadUrl(roomId, file.name, file.type, adminToken);
      await uploadFileToFilebase(uploadUrl, file);
      const fileData = { name: file.name, size: file.size, key: fileKey, downloadUrl };
      await registerFile(roomId, fileData, adminToken);
      emit('file-uploaded', { roomId, fileData, adminToken });
      showToast(`"${file.name}" uploaded successfully`, 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }, [roomId, adminToken, isAdmin, emit]);

  const handleFileDelete = useCallback(async (fileKey) => {
    if (!isAdmin || !adminToken) return;
    try {
      await deleteFile(roomId, fileKey, adminToken);
      emit('file-deleted', { roomId, fileKey, adminToken });
      showToast('File deleted successfully', 'success');
    } catch (err) {
      showToast('Failed to delete file', 'error');
    }
  }, [roomId, adminToken, isAdmin, emit]);

  const handleSendMessage = useCallback((text, replyTo) => {
    emit('send-message', { roomId, text, replyTo });
  }, [roomId, emit]);

  // Handle clicking a #filename link in chat → switch editor tab
  const handleFileClick = useCallback((filename) => {
    const block = blocks.find(b => b.name.toLowerCase() === filename.toLowerCase());
    if (block) {
      setActiveBlockId(block.id);
      setChatFocused(false); // Switch back to editor
      showToast(`Switched to ${block.name}`, 'success');
    } else {
      showToast(`File "${filename}" not found in code blocks`, 'error');
    }
  }, [blocks]);

  const startRenaming = (block) => {
    setEditingBlockId(block.id);
    setRenameValue(block.name);
  };

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Loading / Error / Expired states
  if (loading) return <div className="room-loading"><div className="room-loading__spinner"></div><p className="mono text-muted">Connecting...</p></div>;
  if (error) return <div className="room-error"><div className="room-error__icon">✕</div><h2 className="room-error__title">Room Unavailable</h2><p className="room-error__text">{error}</p><button className="btn btn-primary" onClick={() => navigate('/')}>← Back Home</button></div>;
  if (expired) return <div className="room-error"><div className="room-error__icon" style={{ color: 'var(--warning)' }}>⏱</div><h2 className="room-error__title">Room Expired</h2><p className="room-error__text">Room auto-destructed after inactivity.</p><button className="btn btn-primary" onClick={() => navigate('/')}>← Back Home</button></div>;

  const activeBlock = blocks.find(b => b.id === activeBlockId);

  // Shared ChatPanel element
  const chatPanel = (
    <ChatPanel
      messages={chatMessages}
      activeUsers={activeUsers}
      files={files}
      blocks={blocks}
      username={username}
      roomId={roomId}
      onSendMessage={handleSendMessage}
      onFileClick={handleFileClick}
    />
  );

  return (
    <div className="room">
      {showUsernameModal && <UsernameModal onSubmit={handleUsernameSubmit} />}

      <RoomHeader 
        roomId={roomId} 
        isAdmin={isAdmin} 
        userCount={userCount} 
        onAddBlock={handleAddBlock} 
        onToggleMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onToggleChat={() => setChatVisible(!chatVisible)}
        chatVisible={chatVisible}
      />

      <div className={`room__body ${isMobileMenuOpen ? 'room__body--mobile-open' : ''} ${chatFocused ? 'room__body--chat-focused' : ''}`}>
        {/* Left Sidebar */}
        {!chatFocused && (
          <aside className="room__sidebar">
            <div className="sidebar-section">
              <div className="sidebar-section__header">
                <span>EXPLORER: CODE BLOCKS</span>
                {isAdmin && (
                  <button className="explorer-action-btn" onClick={handleAddBlock} title="New Block">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                )}
              </div>
              <div className="sidebar-list">
                {blocks.map((block) => (
                  <div 
                    key={block.id} 
                    className={`explorer-item ${activeBlockId === block.id ? 'explorer-item--active' : ''}`}
                    onClick={() => setActiveBlockId(block.id)}
                  >
                    <span className="explorer-item__icon" style={{display: 'flex', alignItems:'center', justifyContent:'center'}}>
                      {getFileIcon(block.name)}
                    </span>
                    {editingBlockId === block.id ? (
                      <input
                        autoFocus
                        className="explorer-item__input mono"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRenameBlock(block.id, renameValue)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameBlock(block.id, renameValue);
                          if (e.key === 'Escape') setEditingBlockId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="explorer-item__name mono">{block.name}</span>
                    )}
                    {isAdmin && (
                      <div className="explorer-item__actions">
                        <button 
                          className="explorer-action-btn" 
                          onClick={(e) => { e.stopPropagation(); startRenaming(block); }}
                          title="Rename"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        {blocks.length > 1 && (
                          <button 
                            className="explorer-action-btn" 
                            onClick={(e) => { e.stopPropagation(); handleDeleteBlock(block.id); }}
                            title="Delete"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* Main Workspace */}
        <main className="room__main">
          {chatFocused ? (
            /* Chat Full View — replaces editor */
            <div className="room__chat-full">
              <div className="room__chat-full-header">
                <div className="room__chat-full-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Room Chat</span>
                  <span className="chat-user-count mono">{activeUsers.length} online</span>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setChatFocused(false)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back to Editor
                </button>
              </div>
              {chatPanel}
            </div>
          ) : activeBlock ? (
            <div className="room__editor-container">
              <CodeEditor
                block={activeBlock}
                isAdmin={isAdmin}
                onCodeChange={handleCodeChange}
                onDelete={handleDeleteBlock}
                fileIcon={getFileIcon(activeBlock.name)}
              />
            </div>
          ) : (
            <div className="room__empty-state">
              <p className="mono text-muted">// Select a file to edit</p>
            </div>
          )}
        </main>

        {/* Right Sidebar: Files + Chat (only when not chat-focused) */}
        {!chatFocused && (
          <aside className="room__files">
            <div className="sidebar-section">
              <div className="sidebar-section__header">
                <span>SHARED FILES</span>
              </div>
              <FileZone isAdmin={isAdmin} onFileUpload={handleFileUpload} uploading={uploading} />
              <FileList files={files} isAdmin={isAdmin} onDelete={handleFileDelete} />
            </div>

            {chatVisible && (
              <div className="room__chat-section">
                <div className="sidebar-section__header">
                  <span>ROOM CHAT</span>
                  <div className="room__chat-header-actions">
                    <span className="chat-user-count mono">{activeUsers.length} online</span>
                    <button 
                      className="explorer-action-btn" 
                      onClick={() => setChatFocused(true)}
                      title="Expand Chat"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="9 21 3 21 3 15" />
                        <line x1="21" y1="3" x2="14" y2="10" />
                        <line x1="3" y1="21" x2="10" y2="14" />
                      </svg>
                    </button>
                  </div>
                </div>
                {chatPanel}
              </div>
            )}
          </aside>
        )}
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
