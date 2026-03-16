import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Create a new room.
 * @returns {{ roomId: string, adminToken: string }}
 */
export async function createRoom() {
  const { data } = await api.post('/rooms');
  return data;
}

/**
 * Get room data.
 * @param {string} roomId
 * @returns {{ code: string, language: string, files: Array }}
 */
export async function getRoom(roomId) {
  const { data } = await api.get(`/rooms/${roomId}`);
  return data;
}

/**
 * Verify admin token for a room.
 * @param {string} roomId
 * @param {string} adminToken
 * @returns {{ isAdmin: boolean }}
 */
export async function verifyAdmin(roomId, adminToken) {
  const { data } = await api.post(`/rooms/${roomId}/verify-admin`, { adminToken });
  return data;
}

/**
 * Get a pre-signed upload URL for Filebase.
 * @param {string} roomId
 * @param {string} filename
 * @param {string} fileType
 * @param {string} adminToken
 * @returns {{ uploadUrl: string, fileKey: string, downloadUrl: string }}
 */
export async function getUploadUrl(roomId, filename, fileType, adminToken) {
  const { data } = await api.post(`/rooms/${roomId}/upload-url`, {
    adminToken,
    filename,
    fileType,
  });
  return data;
}

/**
 * Register an uploaded file in the room.
 * @param {string} roomId
 * @param {Object} fileData
 * @param {string} adminToken
 * @returns {{ files: Array }}
 */
export async function registerFile(roomId, fileData, adminToken) {
  const { data } = await api.post(`/rooms/${roomId}/files`, {
    adminToken,
    ...fileData,
  });
  return data;
}

/**
 * Upload a file directly to Filebase using a pre-signed URL.
 * @param {string} uploadUrl
 * @param {File} file
 */
export async function uploadFileToFilebase(uploadUrl, file) {
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
  });
}

/**
 * Delete a file from the room.
 * @param {string} roomId
 * @param {string} fileKey
 * @param {string} adminToken
 */
export async function deleteFile(roomId, fileKey, adminToken) {
  const { data } = await api.delete(`/rooms/${roomId}/files/${encodeURIComponent(fileKey)}`, {
    params: { adminToken },
  });
  return data;
}