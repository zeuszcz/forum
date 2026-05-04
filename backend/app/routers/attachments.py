"""User-uploaded media (images for posts/threads).

POST /attachments — auth required, accepts a single image file (≤8MB), validates
mime type, stores in MinIO under `attachments/{uuid}.{ext}`, returns the public
URL the editor should embed.

GET /attachments/{key} — streams the bytes from MinIO. Public; nginx forwards
/api/attachments/* to here so the browser can render `![](/api/attachments/abc.png)`.
"""
from __future__ import annotations

import secrets

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse

from app.core.deps import CurrentUser
from app.services import storage as storage_service

router = APIRouter(tags=["attachments"])

ALLOWED_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}
MAX_BYTES = 8 * 1024 * 1024  # 8 MB


@router.post("/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(user: CurrentUser, file: UploadFile = File(...)) -> dict:
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Поддерживаются только PNG / JPEG / WebP / GIF",
        )

    # Read once to enforce size cap, then upload
    body = await file.read()
    if len(body) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Файл слишком большой (максимум {MAX_BYTES // (1024 * 1024)} МБ)",
        )

    ext = ALLOWED_MIME[file.content_type]
    key = f"attachments/{secrets.token_urlsafe(16)}.{ext}"

    from io import BytesIO

    await storage_service.upload_object(key, BytesIO(body), file.content_type, len(body))

    # Public URL — served via nginx /api/ → backend
    return {
        "key": key,
        "url": f"/api/attachments/{key.removeprefix('attachments/')}",
        "content_type": file.content_type,
        "size": len(body),
    }


@router.get("/attachments/{name}")
async def get_attachment(name: str) -> StreamingResponse:
    """Stream a previously-uploaded attachment back to the browser."""
    # Defensive: only allow filenames we minted (token + ext)
    if "/" in name or "\\" in name or ".." in name:
        raise HTTPException(status_code=400, detail="bad name")
    key = f"attachments/{name}"
    try:
        body, content_type, length = await storage_service.get_object_stream(key)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="not found") from exc

    headers = {
        "Cache-Control": "public, max-age=2592000, immutable",
        "Content-Length": str(length),
    }

    def iterator():
        try:
            while True:
                chunk = body.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()

    return StreamingResponse(iterator(), media_type=content_type, headers=headers)
