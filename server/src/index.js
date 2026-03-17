import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { redisSub } from './config/redis.js'; // Ensure this uses the rediss:// URL
import { initSocketHandlers } from './socket/handler.js';
import * as filebaseService from './services/filebaseService.js';
import roomRoutes from './routes/room.js';
import uploadRoutes from './routes/upload.js';

const app = express();
const server = createServer(app);

// RENDER FIX: Always use 0.0.0.0 for host and dynamic PORT from environment
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];
if (process.env.FRONTEND_URL) {
  ALLOWED_ORIGINS.push(process.env.FRONTEND_URL);
}
// Optionally keep CLIENT_URL for backward compatibility if it's different
if (process.env.CLIENT_URL && !ALLOWED_ORIGINS.includes(process.env.CLIENT_URL)) {
  ALLOWED_ORIGINS.push(process.env.CLIENT_URL);
}

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

// Health check (Crucial for Render to know your app is "Live")
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/api/rooms', roomRoutes);
app.use('/api/rooms', uploadRoutes);

// Socket.io Setup
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Adding stability for cloud environments
  pingTimeout: 60000, 
});

initSocketHandlers(io);

// --- Redis Keyspace Notifications ----------------------------------------------
async function setupExpiryListener() {
  try {
    // Note: On Upstash, ensure notifications are enabled in their dashboard 
    // or run: CONFIG SET notify-keyspace-events Ex
    await redisSub.subscribe('__keyevent@0__:expired');
    console.log('[Redis] Subscribed to keyspace expiry notifications');

    redisSub.on('message', async (channel, expiredKey) => {
      if (expiredKey.startsWith('room:')) {
        const roomId = expiredKey.replace('room:', '');
        console.log(`[TTL] Room ${roomId} expired. Cleaning up Filebase...`);

        if (filebaseService.isConfigured()) {
          try {
            await filebaseService.deleteRoomFiles(roomId);
          } catch (err) {
            console.error(`[TTL] Cleanup failed for ${roomId}:`, err.message);
          }
        }

        io.to(roomId).emit('room-expired', {
          message: 'This room has expired due to inactivity.',
        });
      }
    });
  } catch (err) {
    console.error('[Redis] Failed to setup expiry listener:', err.message);
  }
}

setupExpiryListener();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   Aether Production Server Active        ║`);
  console.log(`║   Port: ${PORT.toString().padEnd(33)}║`);
  console.log(`║   Origins Allowed: ${ALLOWED_ORIGINS.length.toString().padEnd(22)}║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});