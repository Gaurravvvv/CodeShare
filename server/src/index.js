import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { redisSub, redis } from './config/redis.js'; // Ensure this uses the redss:// URL
import { initSocketHandlers } from './socket/handler.js';
import * as filebaseService from './services/filebaseService.js';
import roomRoutes from './routes/room.js';
import uploadRoutes from './routes/upload.js';
import previewRoutes from './routes/preview.js';
import summarizeRoutes from './routes/summarize.js';
import { socketAuthMiddleware } from './middleware/auth.js';
import { register, metricsMiddleware, activeRoomsGauge } from './metrics.js';

// Security middleware
import {
  helmetMiddleware,
  generalLimiter,
} from './middleware/security.js';

const app = express();
const server = createServer(app);

// Prometheus metrics middleware (placed first to capture duration accurately)
app.use(metricsMiddleware);

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

// ─── Security Middleware ────────────────────────────────────────────────────────
app.use(helmetMiddleware);

// ─── Health Check (minimal info disclosure) ─────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ─── Prometheus Metrics Endpoint ──────────────────────────────────────────────
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.use(generalLimiter);

// ─── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms', uploadRoutes);
app.use('/api/preview', previewRoutes);
app.use('/api/summarize', summarizeRoutes);

// ─── Socket.io Setup ────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
  // Adding stability for cloud environments
  pingTimeout: 60000,
  // Socket payload size limit (1MB)
  maxHttpBufferSize: 1e6,
});

// Socket authentication middleware
io.use(socketAuthMiddleware);

initSocketHandlers(io);

// --- Redis Keyspace Notifications ----------------------------------------------
async function setupExpiryListener() {
  try {
    // Note: On Upstash, ensure notifications are enabled in their dashboard 
    // or run: CONFIG SET notify-keyspace-events Ex
    await redisSub.subscribe('__keyevent@0__:expired');
    console.log('[Redis] Subscribed to keyspace expiry notifications');

    redisSub.on('message', async (channel, expiredKey) => {
      // Check if it's the room key itself (e.g., room:ABCD) and not a subkey (e.g., room:ABCD:users)
      const keyParts = expiredKey.split(':');
      if (keyParts.length === 2 && keyParts[0] === 'room') {
        activeRoomsGauge.dec();
        const roomId = keyParts[1];
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

// Initialize active rooms count from Redis on startup
async function initializeActiveRoomsGauge() {
  try {
    const keys = await redis.keys('room:*');
    const activeRooms = keys.filter(key => key.split(':').length === 2).length;
    activeRoomsGauge.set(activeRooms);
    console.log(`[Metrics] Initialized active_rooms_total to ${activeRooms}`);
  } catch (err) {
    console.error('[Metrics] Failed to initialize active_rooms_total:', err.message);
  }
}

setupExpiryListener();
initializeActiveRoomsGauge();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   Aether Production Server Active        ║`);
  console.log(`║   Port: ${PORT.toString().padEnd(33)}║`);
  console.log(`║   Security: Helmet + Rate Limiting       ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});