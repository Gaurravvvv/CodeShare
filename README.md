# 🚀 CodeShare

**Real-time code and file sharing for offline workshops and quick collaborations.**

CodeShare is a zero-login, room-based web application that allows multiple users to collaborate on code snippets and share files instantly. Built for scenarios where speed and privacy are paramount, rooms automatically self-destruct after 2 hours of inactivity.

---

## ✨ Features

- **Zero-Login Architecture**: Create a room instantly without an account. Only the admin (creator) has editing and uploading privileges.
- **Multiple Code Editors**: Share multiple synchronized code snippets in the same room. Each block supports syntax highlighting and independent language settings.
- **Secure File Sharing**: Upload files (up to 20MB) directly to **Filebase (S3)**. Files are accessible via secure pre-signed URLs.
- **Real-Time Sync**: Powered by **Socket.io** for instant code updates and file notifications.
- **Self-Destruct (TTL)**: Rooms and their associated files are automatically deleted from Redis and Filebase after 7200 seconds (2 hours) of inactivity.
- **QR Code Sharing**: Instantly share room access with other devices via a generated QR code.
- **Unified Terminal Aesthetic**: Sleek "dark mode" UI with monospace typography for a developer-first experience.

---

## 🛠 Tech Stack

- **Frontend**: React.js, Vite, Socket.io-client, Axios, Lucide-react (icons).
- **Backend**: Node.js, Express, Socket.io, Ioredis.
- **Database**: Redis (Room state, TTL management).
- **Storage**: Filebase (S3-compatible API).
- **Styling**: Vanilla CSS (Custom Terminal System).

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+)
- **Docker** (for running Redis locally)

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Gaurravvvv/CodeShare.git
   cd CodeShare
   ```

2. **Start Redis**:
   ```bash
   docker-compose up -d
   ```

3. **Backend Setup**:
   ```bash
   cd server
   npm install
   ```
   Create a `.env` file in the `server/` directory:
   ```env
   PORT=3001
   CLIENT_URL=http://localhost:5173
   REDIS_URL=redis://localhost:6379
   FILEBASE_KEY=your_filebase_key
   FILEBASE_SECRET=your_filebase_secret
   FILEBASE_BUCKET=your_bucket_name
   ```

4. **Frontend Setup**:
   ```bash
   cd ../client
   npm install
   ```
   Create a `.env` file in the `client/` directory:
   ```env
   VITE_API_URL=http://localhost:3001
   ```

### Running Locally

- **Start Backend**: `cd server && npm run dev`
- **Start Frontend**: `cd client && npm run dev`

Open `http://localhost:5173` in your browser.

---

## 📂 Project Structure

```text
CodeShare/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # Shared UI components
│   │   ├── hooks/       # Custom React hooks (Socket.io)
│   │   ├── pages/       # Landing and Room views
│   │   └── utils/       # API and helper functions
├── server/              # Node.js backend
│   ├── src/
│   │   ├── config/      # Redis connection
│   │   ├── routes/      # REST API endpoints
│   │   ├── services/    # Room logic and Filebase interaction
│   │   └── socket/      # WebSocket event handlers
└── docker-compose.yml   # Redis configuration
```

---

## 🛡 Security & Architecture

1.  **Admin Verification**: When a room is created, an `adminToken` is generated and stored in the creator's `localStorage`. All state-mutating actions (editing code, adding blocks, uploading files) require this token.
2.  **S3 Pre-signed URLs**: File uploads and downloads are handled via pre-signed URLs. This ensures that your storage bucket remains private while allowing temporary, secure access for room participants.
3.  **Checksum Disabling**: Specifically configured for Filebase to avoid signature mismatches common with AWS SDK v3's automatic checksum generation.
4.  **Auto-Cleanup**: The server listens for Redis keyspace notifications (`expired` event). When a room key expires, the backend immediately triggers an API call to Filebase to delete all files in that room's folder.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License.
