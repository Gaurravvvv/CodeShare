import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client;

const getS3Client = () => {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    region: 'us-east-1', 
    endpoint: 'https://s3.filebase.com',
    forcePathStyle: true, 
    credentials: {
      accessKeyId: process.env.FILEBASE_KEY || '',
      secretAccessKey: process.env.FILEBASE_SECRET || '',
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return s3Client;
};

const BUCKET = process.env.FILEBASE_BUCKET || 'codeshare';

/**
 * Check if Filebase is configured.
 */
export const isConfigured = () => {
  return !!(process.env.FILEBASE_KEY && process.env.FILEBASE_SECRET && process.env.FILEBASE_BUCKET);
};

/**
 * Generate a pre-signed PUT URL for uploading AND a pre-signed GET URL for downloading.
 */
export async function generateUploadUrl(roomId, filename, fileType) {
  if (!isConfigured()) {
    throw new Error('Filebase storage is not configured on the server.');
  }

  const key = `rooms/${roomId}/${Date.now()}-${filename}`;
  const client = getS3Client();

  // 1. Prepare the Upload Command (PUT)
  const uploadCommand = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: fileType || 'application/octet-stream',
  });

  // Generate the Upload URL
  const uploadUrl = await getSignedUrl(client, uploadCommand, { 
    expiresIn: 300, // 5 minutes to complete the upload
    signableHeaders: new Set(["content-type"]) 
  }); 

  // 2. Prepare the Download Command (GET)
  const downloadCommand = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  // Generate a signed Download URL valid for 7 days (604800 seconds)
  // This allows users to download from your private bucket without errors.
  const downloadUrl = await getSignedUrl(client, downloadCommand, { 
    expiresIn: 604800 
  });

  return { uploadUrl, fileKey: key, downloadUrl };
}

/**
 * Delete all files for a room from Filebase.
 */
export async function deleteRoomFiles(roomId) {
  if (!isConfigured()) {
    console.log(`[Filebase] Skip cleanup for room ${roomId}: Filebase not configured`);
    return;
  }

  try {
    const prefix = `rooms/${roomId}/`;
    const client = getS3Client();

    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
    });

    const listed = await client.send(listCommand);

    if (!listed.Contents || listed.Contents.length === 0) {
      console.log(`[Filebase] No files to delete for room ${roomId}`);
      return;
    }

    const objectsToDelete = listed.Contents.map((obj) => ({ Key: obj.Key }));

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: objectsToDelete }
    });
    
    await client.send(deleteCommand);
    console.log(`[Filebase] Deleted ${objectsToDelete.length} files for room ${roomId}`);
  } catch (error) {
    console.error(`[Filebase] Failed to delete files for room ${roomId}:`, error);
  }
}