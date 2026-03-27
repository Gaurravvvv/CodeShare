import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './QRCode.css';

export default function QRCode({ roomUrl }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="qr-code" onClick={() => setExpanded(true)} title="Click to expand">
        <QRCodeSVG
          value={roomUrl}
          size={42}
          bgColor="#ffffff"
          fgColor="#000000"
          level="M"
          includeMargin={true}
        />
      </div>

      {expanded && (
        <div className="qr-modal-overlay" onClick={() => setExpanded(false)}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qr-modal__header">
              <h3 className="qr-modal__title">Scan to Join Room</h3>
              <button className="btn-icon" onClick={() => setExpanded(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="qr-modal__body">
              <QRCodeSVG
                value={roomUrl}
                size={240}
                bgColor="#ffffff"
                fgColor="#000000"
                level="H"
                includeMargin={true}
              />
              <p className="qr-modal__url mono">{roomUrl}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
