import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { redisSub } from './config/redis.js';
import { initSocketHandlers } from './socket/handler.js';
import * as filebaseService from './services/filebaseService.js';
import roomRoutes from './routes/room.js';
import uploadRoutes from './routes/upload.js';

const app = express();
const server = createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Routes
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms', uploadRoutes);

// Socket.io
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

initSocketHandlers(io);

// ─── Redis Keyspace Notifications for TTL Expiry ───────────────────────────────
// Listen for expired keys to trigger R2 cleanup
async function setupExpiryListener() {
  try {
    // Subscribe to keyspace events for expired keys
    await redisSub.subscribe('__keyevent@0__:expired');
    console.log('[Redis] Subscribed to keyspace expiry notifications');

    redisSub.on('message', async (channel, expiredKey) => {
      // Check if the expired key is a room
      if (expiredKey.startsWith('room:')) {
        const roomId = expiredKey.replace('room:', '');
        console.log(`[TTL] Room ${roomId} expired. Cleaning up Filebase files...`);

        if (filebaseService.isConfigured()) {
          await filebaseService.deleteRoomFiles(roomId);
        } else {
          console.log(`[TTL] Filebase not configured, skipping file cleanup for room ${roomId}`);
        }

        // Notify any connected clients that the room has expired
        io.to(roomId).emit('room-expired', {
          message: 'This room has expired due to inactivity.',
        });
      }
    });
  } catch (err) {
    console.error('[Redis] Failed to setup expiry listener:', err.message);
    console.log('[Redis] Room file cleanup on expiry will not work.');
  }
}

setupExpiryListener();

// Start server
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   CodeShare Server running on :${PORT}      ║`);
  console.log(`║   Client URL: ${CLIENT_URL.padEnd(25)} ║`);
  console.log(`║   [Filebase] Storage: ${process.env.FILEBASE_BUCKET ? 'Configured ✓' : 'Missing Credentials ✗'}${''.padEnd(12)}║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});
