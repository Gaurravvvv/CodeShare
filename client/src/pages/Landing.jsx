import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, getRoom } from '../utils/api';
import './Landing.css';

export default function Landing() {
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const scannerRef = useRef(null);
  const scannerInstanceRef = useRef(null);
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

  // Extract room ID from a scanned URL
  const extractRoomId = useCallback((text) => {
    // Match patterns like /room/ABCDEF or room/ABCDEF
    const match = text.match(/\/room\/([A-Za-z0-9]{4,6})/);
    if (match) return match[1].toUpperCase();
    // Also accept a raw 6-char code
    const raw = text.trim().toUpperCase();
    if (/^[A-Z0-9]{4,6}$/.test(raw)) return raw;
    return null;
  }, []);

  // Open QR scanner
  const openScanner = useCallback(async () => {
    setScannerOpen(true);
    setScanError('');

    // Dynamic import to avoid SSR issues
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        
        if (!scannerRef.current) return;

        const scanner = new Html5Qrcode('qr-scanner-view');
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            const id = extractRoomId(decodedText);
            if (id) {
              // Stop scanner first
              scanner.stop().catch(() => {});
              scannerInstanceRef.current = null;
              setScannerOpen(false);
              navigate(`/room/${id}`);
            }
          },
          () => {} // ignore errors on each scan attempt
        );
      } catch (err) {
        console.error('[QR Scanner] Error:', err);
        setScanError(
          err.toString().includes('NotAllowedError')
            ? 'Camera access denied. Please allow camera permissions.'
            : 'Could not start camera. Try on a mobile device.'
        );
      }
    }, 100);
  }, [extractRoomId, navigate]);

  // Close scanner
  const closeScanner = useCallback(() => {
    if (scannerInstanceRef.current) {
      scannerInstanceRef.current.stop().catch(() => {});
      scannerInstanceRef.current = null;
    }
    setScannerOpen(false);
    setScanError('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerInstanceRef.current) {
        scannerInstanceRef.current.stop().catch(() => {});
      }
    };
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

        {/* Scan to Join button */}
        <button className="btn btn-ghost landing__scan-btn" onClick={openScanner}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Scan QR to Join
        </button>

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

      {/* QR Scanner Modal */}
      {scannerOpen && (
        <div className="scanner-overlay" onClick={closeScanner}>
          <div className="scanner-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scanner-modal__header">
              <h3 className="scanner-modal__title">Scan QR Code</h3>
              <button className="btn-icon" onClick={closeScanner}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="scanner-modal__body">
              <div id="qr-scanner-view" ref={scannerRef} className="scanner-modal__camera"></div>
              <p className="scanner-modal__hint mono text-muted">
                Point your camera at a CodeShare room QR code
              </p>
              {scanError && (
                <div className="scanner-modal__error">
                  {scanError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
