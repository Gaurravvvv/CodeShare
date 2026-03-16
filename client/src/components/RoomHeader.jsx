import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from './QRCode';
import './RoomHeader.css';

export default function RoomHeader({ roomId, isAdmin, userCount, onAddBlock }) {
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;
  const roomUrl = `${APP_URL}/room/${roomId}`;

  const copyRoomId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = roomId;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [roomId]);

  const handleExit = () => {
    navigate('/');
  };

  return (
    <header className="room-header">
      <div className="room-header__left">
        <div className="room-header__brand">
          <span className="room-header__logo">⟨/⟩</span>
          <span className="room-header__app-name">CodeShare</span>
        </div>
        <div className="room-header__divider"></div>
        <div className="room-header__room-info">
          <button className="room-header__room-id mono" onClick={copyRoomId} title="Click to copy">
            {roomId}
            <svg className="room-header__copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {copied ? (
                <polyline points="20 6 9 17 4 12" />
              ) : (
                <>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </>
              )}
            </svg>
          </button>
          {isAdmin ? (
            <span className="badge badge-admin">★ ADMIN</span>
          ) : (
            <span className="badge badge-viewer">👁 VIEWER</span>
          )}
        </div>
      </div>

      <div className="room-header__right">
        {isAdmin && (
          <button className="btn btn-secondary btn-sm" onClick={onAddBlock}>
            + Add Block
          </button>
        )}
        <div className="room-header__users badge badge-users">
          <span className="room-header__user-dot"></span>
          {userCount} online
        </div>
        <QRCode roomUrl={roomUrl} />
        <button className="btn btn-danger btn-sm room-header__exit" onClick={handleExit} title="Exit Room">
          Exit Room
        </button>
      </div>
    </header>
  );
}

