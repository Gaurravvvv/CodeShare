import { useState, useCallback } from 'react';
import './UsernameModal.css';

export default function UsernameModal({ onSubmit }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }
    if (trimmed.length > 20) {
      setError('Username must be 20 characters or less');
      return;
    }
    onSubmit(trimmed);
  }, [name, onSubmit]);

  return (
    <div className="username-modal-overlay">
      <div className="username-modal">
        <div className="username-modal__header">
          <div className="username-modal__icon">⟨/⟩</div>
          <h2 className="username-modal__title">Join Room</h2>
          <p className="username-modal__subtitle mono text-muted">
            // enter a display name to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="username-modal__form">
          <div className="username-modal__input-group">
            <label className="username-modal__label" htmlFor="username-input">
              Display Name
            </label>
            <input
              id="username-input"
              type="text"
              className="username-modal__input mono"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="e.g. Alex"
              autoFocus
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {error && (
            <div className="username-modal__error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary username-modal__btn"
            disabled={!name.trim()}
          >
            Join Chat
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
