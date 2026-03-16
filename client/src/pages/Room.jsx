import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { getRoom, verifyAdmin, getUploadUrl, registerFile, uploadFileToFilebase } from '../utils/api';
import RoomHeader from '../components/RoomHeader';
import CodeEditor from '../components/CodeEditor';
import FileZone from '../components/FileZone';
import FileList from '../components/FileList';
import './Room.css';

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
      if (!isLocalChange.current) {
        setBlocks(data.blocks || []);
      }
      setFiles(data.files || []);
      setIsAdmin(data.isAdmin);
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
      console.log('Received block-added event data:', data);
      setBlocks(prev => [...prev, data.block]);
    };

    const onBlockDeleted = (data) => {
      console.log('Received block-deleted event data:', data);
      setBlocks(prev => prev.filter(b => b.id !== data.blockId));
    };

    const onFileAdded = (data) => {
      setFiles((prev) => {
        const exists = prev.some(f => f.key === data.fileData.key);
        if (exists) return prev;
        return [...prev, data.fileData];
      });
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
    socket.on('file-added', onFileAdded);
    socket.on('user-count', onUserCount);
    socket.on('room-expired', onRoomExpired);
    socket.on('error', onError);

    return () => {
      socket.off('room-state', onRoomState);
      socket.off('code-updated', onCodeUpdated);
      socket.off('language-changed', onLanguageChanged);
      socket.off('block-added', onBlockAdded);
      socket.off('block-deleted', onBlockDeleted);
      socket.off('file-added', onFileAdded);
      socket.off('user-count', onUserCount);
      socket.off('room-expired', onRoomExpired);
      socket.off('error', onError);
    };
  }, [socket]);

  // Handle code changes (admin only)
  const handleCodeChange = useCallback((blockId, newCode) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, code: newCode } : b));
    isLocalChange.current = true;
    emit('code-update', { roomId, blockId, code: newCode, adminToken });
    setTimeout(() => { isLocalChange.current = false; }, 200);
  }, [roomId, adminToken, emit]);

  // Handle language change (admin only)
  const handleLanguageChange = useCallback((blockId, newLang) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, language: newLang } : b));
    emit('language-change', { roomId, blockId, language: newLang, adminToken });
  }, [roomId, adminToken, emit]);

  // Handle adding a new block (admin only)
  const handleAddBlock = useCallback(() => {
    console.log('Adding block clicked. isAdmin:', isAdmin, 'adminToken:', adminToken);
    if (!isAdmin || !adminToken) return;
    emit('block-added', { roomId, adminToken });
  }, [roomId, adminToken, emit, isAdmin]);

  // Handle deleting a block (admin only)
  const handleDeleteBlock = useCallback((blockId) => {
    if (!isAdmin || !adminToken) return;
    emit('block-deleted', { roomId, blockId, adminToken });
  }, [roomId, adminToken, emit, isAdmin]);

  // Handle file upload (admin only)
  const handleFileUpload = useCallback(async (file) => {
    if (!isAdmin || !adminToken) return;

    setUploading(true);
    try {
      // 1. Get pre-signed URL
      const { uploadUrl, fileKey, downloadUrl } = await getUploadUrl(
        roomId,
        file.name,
        file.type,
        adminToken
      );

      // 2. Upload to R2
      await uploadFileToFilebase(uploadUrl, file);

      // 3. Register file in room
      const fileData = {
        name: file.name,
        size: file.size,
        key: fileKey,
        downloadUrl,
      };

      await registerFile(roomId, fileData, adminToken);

      // 4. Notify via socket
      emit('file-uploaded', { roomId, fileData, adminToken });

      showToast(`"${file.name}" uploaded successfully`, 'success');
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload failed';
      showToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  }, [roomId, adminToken, isAdmin, emit]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="room-loading">
        <div className="room-loading__spinner"></div>
        <p className="mono text-muted">Connecting to room {roomId}...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="room-error">
        <div className="room-error__icon">✕</div>
        <h2 className="room-error__title">Room Unavailable</h2>
        <p className="room-error__text">{error}</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
      </div>
    );
  }

  // Expired state
  if (expired) {
    return (
      <div className="room-error">
        <div className="room-error__icon" style={{ color: 'var(--warning)' }}>⏱</div>
        <h2 className="room-error__title">Room Expired</h2>
        <p className="room-error__text">This room has expired due to inactivity. Rooms auto-destruct after 2 hours of inactivity.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          ← Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="room">
      <RoomHeader
        roomId={roomId}
        isAdmin={isAdmin}
        userCount={userCount}
      />

      <div className="room__body">
        {/* Left Column: Code Editors */}
        <div className="room__editor" style={{ display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
          {blocks.map((block) => (
            <CodeEditor
              key={block.id}
              block={block}
              totalBlocks={blocks.length}
              isAdmin={isAdmin}
              onCodeChange={handleCodeChange}
              onLanguageChange={handleLanguageChange}
              onDelete={handleDeleteBlock}
            />
          ))}
          {isAdmin && (
            <button className="btn btn-secondary" onClick={handleAddBlock} style={{ marginBottom: '20px' }}>
              + Add Code Block
            </button>
          )}
        </div>

        {/* Right Column: Files */}
        <div className="room__files">
          <FileZone
            isAdmin={isAdmin}
            onFileUpload={handleFileUpload}
            uploading={uploading}
          />
          <FileList files={files} />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
