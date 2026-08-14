import os
import hmac
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import boto3
import redis.asyncio as redis

router = APIRouter()

# Redis client
redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"), decode_responses=True)

class CronRequest(BaseModel):
    secret: str

@router.post("/cleanup")
async def cron_cleanup(req: CronRequest):
    cron_secret = os.getenv("CRON_SECRET")
    if not cron_secret:
        raise HTTPException(status_code=500, detail="CRON_SECRET is not configured")
        
    # Constant-time comparison
    if not hmac.compare_digest(req.secret, cron_secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    # Check if Filebase is configured
    filebase_key = os.getenv("FILEBASE_KEY")
    filebase_secret = os.getenv("FILEBASE_SECRET")
    filebase_bucket = os.getenv("FILEBASE_BUCKET")
    
    if not filebase_key or not filebase_secret or not filebase_bucket:
        raise HTTPException(status_code=503, detail="File storage not configured")
        
    # Setup S3 client
    s3_client = boto3.client(
        "s3",
        endpoint_url="https://s3.filebase.com",
        aws_access_key_id=filebase_key,
        aws_secret_access_key=filebase_secret,
        region_name="us-east-1"
    )
    
    try:
        # List all prefixes (folders) under rooms/
        response = s3_client.list_objects_v2(
            Bucket=filebase_bucket,
            Prefix="rooms/",
            Delimiter="/"
        )
        
        prefixes = response.get("CommonPrefixes", [])
        cleaned = 0
        skipped = 0
        
        for prefix_obj in prefixes:
            prefix = prefix_obj.get("Prefix")
            if not prefix: continue
            
            # Extract room ID (e.g. rooms/ABC/ -> ABC)
            parts = prefix.split("/")
            if len(parts) < 2: continue
            room_id = parts[1]
            
            # Check if room exists in Redis
            room_exists = await redis_client.exists(f"room:{room_id}")
            
            if not room_exists:
                # Delete all objects in this prefix
                objs = s3_client.list_objects_v2(Bucket=filebase_bucket, Prefix=prefix)
                contents = objs.get("Contents", [])
                
                if contents:
                    delete_keys = [{"Key": obj["Key"]} for obj in contents]
                    s3_client.delete_objects(
                        Bucket=filebase_bucket,
                        Delete={"Objects": delete_keys, "Quiet": True}
                    )
                cleaned += 1
            else:
                skipped += 1
                
        return {"status": "success", "cleanedRooms": cleaned, "skippedRooms": skipped}
    except Exception as e:
        print(f"[Cron] Cleanup error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to execute cron cleanup")
