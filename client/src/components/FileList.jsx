import './FileList.css';

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  const codeExts = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'go', 'rs', 'rb', 'php', 'html', 'css', 'json'];
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'md'];

  if (codeExts.includes(ext)) return '{ }';
  if (imageExts.includes(ext)) return '🖼';
  if (docExts.includes(ext)) return '📄';
  if (ext === 'zip' || ext === 'tar' || ext === 'gz') return '📦';
  return '📎';
}

export default function FileList({ files, isAdmin, onDelete }) {
  if (!files || files.length === 0) {
    return (
      <div className="file-list file-list--empty">
        <p className="file-list__empty-text mono">
          <span className="text-muted">//</span> No files uploaded yet
        </p>
      </div>
    );
  }

  return (
    <div className="file-list">
      <div className="file-list__header">
        <span className="file-list__title">Files</span>
        <span className="file-list__count">{files.length}</span>
      </div>
      <div className="file-list__items">
        {files.map((file, index) => (
          <div key={file.key} className="file-list__item-container">
            <a
              className="file-list__item"
              href={file.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              download={file.name}
              title="Download file"
            >
              <span className="file-list__icon">{getFileIcon(file.name)}</span>
              <div className="file-list__info">
                <span className="file-list__name mono">{file.name}</span>
                <span className="file-list__size">{formatFileSize(file.size)}</span>
              </div>
              <svg className="file-list__download" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
            {isAdmin && (
              <button 
                className="file-list__delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(file.key);
                }}
                title="Delete file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

