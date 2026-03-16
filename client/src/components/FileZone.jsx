import { useState, useRef, useCallback } from 'react';
import './FileZone.css';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export default function FileZone({ isAdmin, onFileUpload, uploading }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const validateFile = useCallback((file) => {
    if (file.size > MAX_FILE_SIZE) {
      setError(`"${file.name}" exceeds 20 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      setTimeout(() => setError(''), 4000);
      return false;
    }
    setError('');
    return true;
  }, []);

  const handleFiles = useCallback((files) => {
    if (!isAdmin) return;
    Array.from(files).forEach((file) => {
      if (validateFile(file)) {
        onFileUpload(file);
      }
    });
  }, [isAdmin, onFileUpload, validateFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isAdmin) setIsDragOver(true);
  }, [isAdmin]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (isAdmin && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [isAdmin, handleFiles]);

  const handleClick = useCallback(() => {
    if (isAdmin && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [isAdmin]);

  const handleInputChange = useCallback((e) => {
    if (e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  }, [handleFiles]);

  return (
    <div className="file-zone-wrapper">
      <div
        className={`file-zone ${isDragOver ? 'file-zone--drag-over' : ''} ${!isAdmin ? 'file-zone--disabled' : ''} ${uploading ? 'file-zone--uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="file-zone__input"
          onChange={handleInputChange}
          multiple
          disabled={!isAdmin}
        />

        <div className="file-zone__content">
          {uploading ? (
            <>
              <div className="file-zone__spinner"></div>
              <p className="file-zone__text">Uploading...</p>
            </>
          ) : (
            <>
              <div className="file-zone__icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <p className="file-zone__text">
                {isAdmin ? 'Drop files here or click to upload' : 'File uploads (admin only)'}
              </p>
              <p className="file-zone__limit">Maximum file size: 20 MB</p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="file-zone__error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
}
