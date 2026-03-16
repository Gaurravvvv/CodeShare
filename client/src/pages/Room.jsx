import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { getRoom, verifyAdmin, getUploadUrl, registerFile, uploadFileToFilebase, deleteFile } from '../utils/api';
import RoomHeader from '../components/RoomHeader';
import CodeEditor from '../components/CodeEditor';
import FileZone from '../components/FileZone';
import FileList from '../components/FileList';
import './Room.css';

const LANGUAGE_EXTENSIONS = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  go: 'go',
  rust: 'rs',
  ruby: 'rb',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  html: 'html',
  css: 'css',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  markdown: 'md',
  bash: 'sh',
  plaintext: 'txt',
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

  const isLocalChange = useRef(false);

  // Check for admin token in localStorage
  useEffect(() => {
    const token = localStorage.getItem(`admin_${roomId}`);
    if (token) {
      setAdminToken(token);
    }
  }, [roomId]);

  // Initialize socket connection
  const { socket, emit } = useSocket(roomId, adminToken);

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

        // Verify admin
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
      console.log('[Socket] Received room-state:', data);
      if (!isLocalChange.current) {
        setBlocks(data.blocks || []);
        if (data.blocks?.length > 0 && !activeBlockId) {
          setActiveBlockId(data.blocks[0].id);
        }
      }
      setFiles(data.files || []);
      
      setIsAdmin(prev => (prev || data.isAdmin) ? true : false);
      
      if (data.userCount !== undefined) {
        setUserCount(data.userCount);
      }
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
      setActiveBlockId(data.block.id);
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
      setFiles((prev) => {
        const exists = prev.some(f => f.key === data.fileData.key);
        if (exists) return prev;
        return [...prev, data.fileData];
      });
    };

    const onFileDeleted = (data) => {
      setFiles((prev) => prev.filter(f => f.key !== data.fileKey));
    };

    const onUserCount = (data) => {
      setUserCount(data.count);
    };

    const onRoomExpired = () => {
      setExpired(true);
    };

    const onError = (data) => {
      showToast(data.message, 'error');
    };

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
    };
  }, [socket, activeBlockId]);

  // Handle code changes (admin only)
  const handleCodeChange = useCallback((blockId, newCode) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, code: newCode } : b));
    isLocalChange.current = true;
    emit('code-update', { roomId, blockId, code: newCode, adminToken });
    setTimeout(() => { isLocalChange.current = false; }, 200);
  }, [roomId, adminToken, emit]);

  // Handle language change (admin only)
  const handleLanguageChange = useCallback((blockId, newLang) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      
      const ext = LANGUAGE_EXTENSIONS[newLang] || 'txt';
      const nameParts = b.name.split('.');
      const newName = nameParts.length > 1 
        ? `${nameParts.slice(0, -1).join('.')}.${ext}`
        : `${b.name}.${ext}`;
        
      emit('block-rename', { roomId, blockId, name: newName, adminToken });
      return { ...b, language: newLang, name: newName };
    }));
    emit('language-change', { roomId, blockId, language: newLang, adminToken });
  }, [roomId, adminToken, emit]);

  // Handle adding a new block (admin only)
  const handleAddBlock = useCallback(() => {
    if (!isAdmin || !adminToken) return;
    emit('block-added', { roomId, adminToken });
  }, [roomId, adminToken, emit, isAdmin]);

  // Handle deleting a block (admin only)
  const handleDeleteBlock = useCallback((blockId) => {
    if (!isAdmin || !adminToken) return;
    emit('block-deleted', { roomId, blockId, adminToken });
  }, [roomId, adminToken, emit, isAdmin]);

  // Handle renaming a block (admin only)
  const handleRenameBlock = useCallback((blockId, newName) => {
    if (!isAdmin || !adminToken || !newName.trim()) return;
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, name: newName } : b));
    emit('block-rename', { roomId, blockId, name: newName, adminToken });
    setEditingBlockId(null);
  }, [roomId, adminToken, emit, isAdmin]);

  // Handle file upload (admin only)
  const handleFileUpload = useCallback(async (file) => {
    if (!isAdmin || !adminToken) return;

    setUploading(true);
    try {
      const { uploadUrl, fileKey, downloadUrl } = await getUploadUrl(
        roomId,
        file.name,
        file.type,
        adminToken
      );

      await uploadFileToFilebase(uploadUrl, file);

      const fileData = {
        name: file.name,
        size: file.size,
        key: fileKey,
        downloadUrl,
      };

      await registerFile(roomId, fileData, adminToken);
      emit('file-uploaded', { roomId, fileData, adminToken });
      showToast(`"${file.name}" uploaded successfully`, 'success');
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed';
      showToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  }, [roomId, adminToken, isAdmin, emit]);

  // Handle file deletion (admin only)
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

  const startRenaming = (block) => {
    setEditingBlockId(block.id);
    setRenameValue(block.name);
  };

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Loading, error, and expired states...
  if (loading) return <div className="room-loading"><div className="room-loading__spinner"></div><p className="mono text-muted">Connecting...</p></div>;
  if (error) return <div className="room-error"><div className="room-error__icon">✕</div><h2 className="room-error__title">Room Unavailable</h2><p className="room-error__text">{error}</p><button className="btn btn-primary" onClick={() => navigate('/')}>← Back Home</button></div>;
  if (expired) return <div className="room-error"><div className="room-error__icon" style={{ color: 'var(--warning)' }}>⏱</div><h2 className="room-error__title">Room Expired</h2><p className="room-error__text">Room auto-destructed after inactivity.</p><button className="btn btn-primary" onClick={() => navigate('/')}>← Back Home</button></div>;

  const activeBlock = blocks.find(b => b.id === activeBlockId);

  return (
    <div className="room">
      <RoomHeader roomId={roomId} isAdmin={isAdmin} userCount={userCount} onAddBlock={handleAddBlock} />

      <div className="room__body">
        {/* Left Sidebar: VS Code Style Explorer */}
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
                  <span className="explorer-item__icon">📄</span>
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

        {/* Main Workspace: Active Editor */}
        <main className="room__main">
          {activeBlock ? (
            <div className="room__editor-container">
              <CodeEditor
                block={activeBlock}
                isAdmin={isAdmin}
                onCodeChange={handleCodeChange}
                onLanguageChange={handleLanguageChange}
                onDelete={handleDeleteBlock}
              />
            </div>
          ) : (
            <div className="room__empty-state">
              <p className="mono text-muted">// Select a file to edit</p>
            </div>
          )}
        </main>

        {/* Right Sidebar: Files */}
        <aside className="room__files">
          <div className="sidebar-section">
            <div className="sidebar-section__header">
              <span>SHARED FILES</span>
            </div>
            <FileZone isAdmin={isAdmin} onFileUpload={handleFileUpload} uploading={uploading} />
            <FileList files={files} isAdmin={isAdmin} onDelete={handleFileDelete} />
          </div>
        </aside>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
