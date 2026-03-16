import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, getRoom } from '../utils/api';
import './Landing.css';

export default function Landing() {
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleJoinRoom = useCallback(async (e) => {
    e.preventDefault();
    const id = roomId.trim().toUpperCase();
    if (!id || id.length < 4) {
      setError('Enter a valid Room ID');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await getRoom(id);
      navigate(`/room/${id}`);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Room not found or expired');
      } else {
        setError('Connection error. Is the server running?');
      }
    } finally {
      setLoading(false);
    }
  }, [roomId, navigate]);

  const handleCreateRoom = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await createRoom();
      // Store admin token
      localStorage.setItem(`admin_${data.roomId}`, data.adminToken);
      navigate(`/room/${data.roomId}`);
    } catch (err) {
      setError('Failed to create room. Is the server running?');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setRoomId(value);
    setError('');
  }, []);

  return (
    <div className="landing">
      {/* Scanline overlay */}
      <div className="landing__scanline"></div>

      {/* Top bar */}
      <div className="landing__topbar">
        <div className="landing__brand">
          <span className="landing__logo">⟨/⟩</span>
          <span className="landing__app-name">CodeShare</span>
        </div>
        <button
          className="btn btn-secondary"
          onClick={handleCreateRoom}
          disabled={loading}
        >
          + Create Room
        </button>
      </div>

      {/* Center content */}
      <div className="landing__center">
        <div className="landing__terminal-header">
          <span className="landing__terminal-text mono">
            <span className="text-accent">$</span> codeshare <span className="text-accent">--join</span>
          </span>
        </div>

        <form onSubmit={handleJoinRoom} className="landing__form">
          <div className="landing__input-wrapper">
            <input
              id="room-id-input"
              type="text"
              className="landing__input mono"
              value={roomId}
              onChange={handleInputChange}
              placeholder="ROOM ID"
              autoFocus
              maxLength={6}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="landing__input-hint mono">6-character code</span>
          </div>

          <button
            type="submit"
            className="btn btn-primary landing__join-btn"
            disabled={loading || roomId.length < 4}
          >
            {loading ? (
              <span className="landing__spinner"></span>
            ) : (
              <>
                Join Room
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="landing__error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <div className="landing__footer-text mono">
          <span className="text-muted">// real-time code sharing for workshops</span>
        </div>
      </div>

      {/* Bottom decoration */}
      <div className="landing__bottom">
        <span className="mono text-muted landing__status">
          <span className="landing__status-dot"></span>
          system ready
        </span>
      </div>
    </div>
  );
}
