import { redis } from '../config/redis.js';
import { customAlphabet } from 'nanoid';
import { v4 as uuidv4 } from 'uuid';

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);
const ROOM_TTL = 7200; // 2 hours in seconds

/**
 * Create a new room with a unique 6-character ID and admin token.
 */
export async function createRoom() {
  let roomId;
  let exists = true;

  // Ensure unique room ID
  while (exists) {
    roomId = nanoid();
    exists = await redis.exists(`room:${roomId}`);
  }

  const adminToken = uuidv4();

  const roomData = {
    adminToken,
    blocks: JSON.stringify([{
      id: uuidv4(),
      name: 'main.js',
      code: '',
      language: 'javascript',
      ownerId: null
    }]),
    files: JSON.stringify([]),
    joinOrder: JSON.stringify([]),
    createdAt: Date.now().toString(),
  };

  await redis.hset(`room:${roomId}`, roomData);
  await redis.expire(`room:${roomId}`, ROOM_TTL);

  return { roomId, adminToken };
}

/**
 * Get room data by ID. Returns null if room doesn't exist.
 */
export async function getRoom(roomId) {
  const data = await redis.hgetall(`room:${roomId}`);
  if (!data || Object.keys(data).length === 0) return null;

  let blocks = [];
  if (data.blocks) {
    blocks = JSON.parse(data.blocks);
  } else if (data.code !== undefined) {
    blocks = [{
      id: "legacy-block",
      code: data.code,
      language: data.language || 'javascript'
    }];
  }

  return {
    blocks,
    files: JSON.parse(data.files || '[]'),
    createdAt: parseInt(data.createdAt || '0'),
  };
}

/**
 * Fast check if a room exists (does not reset TTL or fetch data).
 */
export async function roomExists(roomId) {
  const exists = await redis.exists(`room:${roomId}`);
  return exists === 1;
}

/**
 * Verify if the provided token matches the room's admin token.
 */
export async function verifyAdmin(roomId, token) {
  const adminToken = await redis.hget(`room:${roomId}`, 'adminToken');
  return adminToken === token;
}

/**
 * Get the current host (the oldest user in the room).
 */
export async function getHost(roomId) {
  const joinOrderRaw = await redis.hget(`room:${roomId}`, 'joinOrder');
  const joinOrder = joinOrderRaw ? JSON.parse(joinOrderRaw) : [];
  return joinOrder.length > 0 ? joinOrder[0] : null;
}

/**
 * Update the code content for a specific block.
 */
export async function updateCodeBlock(roomId, blockId, code) {
  const data = await redis.hgetall(`room:${roomId}`);
  if (!data || Object.keys(data).length === 0) return;
  
  let blocks = [];
  if (data.blocks) {
    blocks = JSON.parse(data.blocks);
  } else if (data.code !== undefined) {
    blocks = [{ id: "legacy-block", name: 'legacy.js', code: data.code, language: data.language || 'javascript' }];
  }

  const blockIndex = blocks.findIndex(b => b.id === blockId);
  if (blockIndex !== -1) {
    blocks[blockIndex].code = code;
    await redis.hset(`room:${roomId}`, 'blocks', JSON.stringify(blocks));
    await resetTTL(roomId);
  }
}

/**
 * Update the language for a specific block.
 */
export async function updateLanguageBlock(roomId, blockId, language) {
  const data = await redis.hgetall(`room:${roomId}`);
  if (!data || Object.keys(data).length === 0) return;
  
  let blocks = [];
  if (data.blocks) {
    blocks = JSON.parse(data.blocks);
  } else if (data.code !== undefined) {
    blocks = [{ id: "legacy-block", name: 'legacy.js', code: data.code, language: data.language || 'javascript' }];
  }

  const blockIndex = blocks.findIndex(b => b.id === blockId);
  if (blockIndex !== -1) {
    blocks[blockIndex].language = language;
    await redis.hset(`room:${roomId}`, 'blocks', JSON.stringify(blocks));
    await resetTTL(roomId);
  }
}

/**
 * Add a new code block to the room.
 */
export async function addCodeBlock(roomId, ownerId) {
  const data = await redis.hgetall(`room:${roomId}`);
  if (!data || Object.keys(data).length === 0) return null;
  
  let blocks = [];
  if (data.blocks) {
    blocks = JSON.parse(data.blocks);
  } else if (data.code !== undefined) {
    blocks = [{ id: "legacy-block", name: 'legacy.js', code: data.code, language: data.language || 'javascript' }];
  }
  
  const newBlock = {
    id: uuidv4(),
    name: `untitled-${blocks.length}.js`,
    code: '',
    language: 'javascript',
    ownerId
  };
  
  blocks.push(newBlock);
  await redis.hset(`room:${roomId}`, 'blocks', JSON.stringify(blocks));
  await resetTTL(roomId);
  
  return newBlock;
}

/**
 * Delete a specific code block from the room.
 */
export async function deleteCodeBlock(roomId, blockId) {
  const data = await redis.hgetall(`room:${roomId}`);
  if (!data || Object.keys(data).length === 0) return;
  
  let blocks = [];
  if (data.blocks) {
    blocks = JSON.parse(data.blocks);
  } else if (data.code !== undefined) {
    blocks = [{ id: "legacy-block", name: 'legacy.js', code: data.code, language: data.language || 'javascript' }];
  }
  
  // Prevent deleting the very last block
  if (blocks.length <= 1) return;
  
  blocks = blocks.filter(b => b.id !== blockId);
  await redis.hset(`room:${roomId}`, 'blocks', JSON.stringify(blocks));
  await resetTTL(roomId);
}

/**
 * Update the name for a specific block.
 */
export async function updateBlockName(roomId, blockId, name) {
  const data = await redis.hgetall(`room:${roomId}`);
  if (!data || Object.keys(data).length === 0) return;
  
  let blocks = [];
  if (data.blocks) {
    blocks = JSON.parse(data.blocks);
  }

  const blockIndex = blocks.findIndex(b => b.id === blockId);
  if (blockIndex !== -1) {
    blocks[blockIndex].name = name;
    await redis.hset(`room:${roomId}`, 'blocks', JSON.stringify(blocks));
    await resetTTL(roomId);
  }
}

/**
 * Add a file entry to the room's file list.
 */
export async function addFile(roomId, fileData, ownerId) {
  const filesRaw = await redis.hget(`room:${roomId}`, 'files');
  const files = JSON.parse(filesRaw || '[]');
  files.push({
    ...fileData,
    uploadedAt: Date.now(),
    ownerId,
  });
  await redis.hset(`room:${roomId}`, 'files', JSON.stringify(files));
  await resetTTL(roomId);
  return files;
}

/**
 * Remove a file entry from the room's file list.
 */
export async function removeFile(roomId, fileKey) {
  const filesRaw = await redis.hget(`room:${roomId}`, 'files');
  let files = JSON.parse(filesRaw || '[]');
  files = files.filter(f => f.key !== fileKey);
  await redis.hset(`room:${roomId}`, 'files', JSON.stringify(files));
  await resetTTL(roomId);
  return files;
}


/**
 * Reset the TTL for a room (called on every interaction).
 */
export async function resetTTL(roomId) {
  await redis.expire(`room:${roomId}`, ROOM_TTL);
}

/**
 * Delete a room from Redis.
 */
export async function deleteRoom(roomId) {
  await redis.del(`room:${roomId}`);
}

// ─── User Tracking (Identity) ───────────────────────────────────────────────

/**
 * Add a user to the room's active users hash.
 */
export async function addUser(roomId, socketId, username) {
  await redis.hset(`room:${roomId}:users`, socketId, username);
  
  // Track join order for ownership transfer
  const joinOrderRaw = await redis.hget(`room:${roomId}`, 'joinOrder');
  let joinOrder = joinOrderRaw ? JSON.parse(joinOrderRaw) : [];
  if (!joinOrder.includes(socketId)) {
    joinOrder.push(socketId);
    await redis.hset(`room:${roomId}`, 'joinOrder', JSON.stringify(joinOrder));
  }

  // If this is the ONLY user in the room, they inherit all orphaned resources
  let transferred = false;
  if (joinOrder.length === 1) {
    const data = await redis.hgetall(`room:${roomId}`);
    let blocks = data.blocks ? JSON.parse(data.blocks) : [];
    let files = data.files ? JSON.parse(data.files) : [];
    let changed = false;

    blocks.forEach(b => {
      if (b.ownerId !== socketId) { b.ownerId = socketId; changed = true; }
    });
    files.forEach(f => {
      if (f.ownerId !== socketId) { f.ownerId = socketId; changed = true; }
    });

    if (changed) {
      await redis.hset(`room:${roomId}`, 'blocks', JSON.stringify(blocks));
      await redis.hset(`room:${roomId}`, 'files', JSON.stringify(files));
      transferred = true;
    }
  }

  await redis.expire(`room:${roomId}:users`, ROOM_TTL);
  return transferred;
}

/**
 * Remove a user from the room's active users hash and transfer ownership if needed.
 */
export async function removeUser(roomId, socketId) {
  await redis.hdel(`room:${roomId}:users`, socketId);
  
  // Manage joinOrder and ownership transfer
  const joinOrderRaw = await redis.hget(`room:${roomId}`, 'joinOrder');
  let joinOrder = joinOrderRaw ? JSON.parse(joinOrderRaw) : [];
  joinOrder = joinOrder.filter(id => id !== socketId);
  await redis.hset(`room:${roomId}`, 'joinOrder', JSON.stringify(joinOrder));

  let nextOwner = joinOrder.length > 0 ? joinOrder[0] : null;
  let transferred = false;

  if (nextOwner) {
    const data = await redis.hgetall(`room:${roomId}`);
    let blocks = data.blocks ? JSON.parse(data.blocks) : [];
    let files = data.files ? JSON.parse(data.files) : [];
    let changed = false;

    blocks.forEach(b => {
      if (b.ownerId === socketId) { b.ownerId = nextOwner; changed = true; }
    });
    files.forEach(f => {
      if (f.ownerId === socketId) { f.ownerId = nextOwner; changed = true; }
    });

    if (changed) {
      await redis.hset(`room:${roomId}`, 'blocks', JSON.stringify(blocks));
      await redis.hset(`room:${roomId}`, 'files', JSON.stringify(files));
      transferred = true;
    }
  }

  return { nextOwner, transferred };
}

/**
 * Get all active users in a room. Returns { socketId: username } map.
 */
export async function getUsers(roomId) {
  const users = await redis.hgetall(`room:${roomId}:users`);
  return users || {};
}

// ─── Chat Message Persistence ───────────────────────────────────────────────

const MAX_MESSAGES = 200;

/**
 * Add a chat message to the room's message list (newest first).
 */
export async function addMessage(roomId, message) {
  await redis.lpush(`room:${roomId}:messages`, JSON.stringify(message));
  await redis.ltrim(`room:${roomId}:messages`, 0, MAX_MESSAGES - 1);
  await redis.expire(`room:${roomId}:messages`, ROOM_TTL);
}

/**
 * Get the most recent messages for a room (returns oldest-first order).
 */
export async function getMessages(roomId, count = 50) {
  const raw = await redis.lrange(`room:${roomId}:messages`, 0, count - 1);
  // lrange returns newest-first (since we lpush), reverse for chronological order
  return raw.map(m => JSON.parse(m)).reverse();
}
