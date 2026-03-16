# CodeShare — Real-Time Collaborative Workspace

CodeShare is a professional, high-performance collaborative code editor and file-sharing platform. It features a modern, VS Code-inspired UI with real-time synchronization, multi-block management, and secure file storage.

![Interface Overview](client/public/screenshot.png) *(Note: Replace with actual screenshot path if available)*

## 🚀 Key Features

- **VS Code-Style Interface**: A professional three-column layout featuring a left-side Explorer, a central Active Editor, and a right-side File Management pane.
- **Collaborative Multi-Block Editing**: Create multiple code instances (files) within a single room. Each block supports independent language settings and real-time synchronization.
- **Automatic Extension Sync**: Changing the code language (e.g., from JavaScript to Python) automatically updates the file extension in the explorer (e.g., `main.js` → `main.py`).
- **Real-Time Renaming**: Admins can rename code blocks instantly, with changes broadcasting to all connected users in milliseconds.
- **Secure File Sharing**: Full integration with **Filebase (S3-compatible)**. Upload and manage shared assets with secure, pre-signed URLs.
- **Live Presence**: Track active users in the room in real-time.
- **Auto-Destruct**: Rooms and associated files are automatically purged after 2 hours of inactivity to ensure privacy and resource efficiency.

## 🛠 Tech Stack

- **Frontend**: React.js, Socket.io-client, CSS3 (Vanilla)
- **Backend**: Node.js, Express, Socket.io
- **Database/State**: Redis (via ioredis)
- **Storage**: Filebase (S3-compatible Storage)
- **Tools**: Vite, AWS SDK v3, NanoID

## 🚦 Getting Started

### Prerequisites

- Node.js (v18+)
- Redis Server (local or cloud) or Docker

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/Gaurravvvv/CodeShare.git
    cd CodeShare
    ```

2.  **Server Setup**:
    ```bash
    cd server
    npm install
    # Create a .env file based on the provided environment variables
    npm run dev
    ```

3.  **Client Setup**:
    ```bash
    cd ../client
    npm install
    # Create a .env file with VITE_API_URL
    npm run dev
    ```

4.  **Open the App**:
    Visit `http://localhost:5173`.

## ⚙️ Environment Variables

### Server (`server/.env`)
- `PORT`: Server port (default 3001)
- `CLIENT_URL`: URL of the frontend for CORS
- `REDIS_URL`: Redis connection string
- `FILEBASE_KEY`: Filebase Access Key
- `FILEBASE_SECRET`: Filebase Secret Key
- `FILEBASE_BUCKET`: Filebase Bucket Name
- `FILEBASE_PUBLIC_URL`: Public URL for accessing files

### Client (`client/.env`)
- `VITE_API_URL`: Backend URL (e.g., `http://localhost:3001`)

## 📄 License

MIT License. See `LICENSE` for details.
