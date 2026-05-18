import { useState } from 'react';
import './SummaryCard.css';

// The button part — rendered inline in the action row
export function SummarizeButton({ isActive, isLoading, onClick }) {
  return (
    <button
      className={`file-list__summarize-btn ${isActive ? 'file-list__summarize-btn--active' : ''} ${isLoading ? 'file-list__summarize-btn--loading' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title="AI Summarize"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}

// The card part — rendered below the file row
export function SummaryPanel({ data, loading, error, onClose }) {
  // Support both old plain string cache and new JSON structure
  const summaryText = typeof data === 'string' ? data : data?.summary;
  const warnings = data?.warnings || [];

  return (
    <div className="summary-card">
      <div className="summary-card__header">
        <div className="summary-card__label">
          <span className="summary-card__icon">🤖</span>
          <span className="summary-card__title">AI Analysis</span>
        </div>
        <button className="summary-card__close" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Dismiss">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="summary-card__body">
        {loading && (
          <div className="summary-card__loading">
            <div className="summary-card__skeleton"></div>
            <div className="summary-card__skeleton summary-card__skeleton--short"></div>
          </div>
        )}
        {error && <p className="summary-card__error">{error}</p>}
        {!loading && !error && summaryText && (
          <div className="summary-card__content">
            <div className="summary-card__section">
              <h4 className="summary-card__subtitle">✨ Summary</h4>
              <p className="summary-card__text">{summaryText}</p>
            </div>
            
            {warnings.length > 0 && (
              <div className="summary-card__section summary-card__section--warnings">
                <h4 className="summary-card__subtitle">⚠️ Warnings</h4>
                <ul className="summary-card__warnings-list">
                  {warnings.map((warning, idx) => (
                    <li key={idx} className="summary-card__warning-item">{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
