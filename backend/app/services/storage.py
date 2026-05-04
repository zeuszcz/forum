"""Thin wrapper around the MinIO/S3 client used for user-uploaded media.

Bucket policy is set to anonymous-download by the docker-compose minio-init
container, so objects are addressable without auth — but we serve them via
the backend (`GET /attachments/{key}`) so nginx doesn't need to expose MinIO
publicly.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import IO, BinaryIO

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.config import settings

_executor = ThreadPoolExecutor(max_workers=4)


def _build_client():
    scheme = "https" if settings.minio_secure else "http"
    return boto3.client(
        "s3",
        endpoint_url=f"{scheme}://{settings.minio_endpoint}",
        aws_access_key_id=settings.minio_access_key,
        aws_secret_access_key=settings.minio_secret_key,
        config=Config(signature_version="s3v4"),
        region_name="us-east-1",
    )


_client = None


def get_client():
    global _client
    if _client is None:
        _client = _build_client()
    return _client


async def upload_object(
    key: str, fileobj: IO[bytes], content_type: str, content_length: int
) -> None:
    """Upload bytes to the configured bucket under `key`."""
    client = get_client()

    def _put():
        client.put_object(
            Bucket=settings.minio_bucket,
            Key=key,
            Body=fileobj,
            ContentType=content_type,
            ContentLength=content_length,
        )

    await asyncio.get_event_loop().run_in_executor(_executor, _put)


async def get_object_stream(key: str) -> tuple[BinaryIO, str, int]:
    """Fetch an object's body stream + content-type + length.

    Raises FileNotFoundError when the key doesn't exist.
    """
    client = get_client()

    def _get():
        try:
            return client.get_object(Bucket=settings.minio_bucket, Key=key)
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code in {"NoSuchKey", "404"}:
                raise FileNotFoundError(key) from e
            raise

    obj = await asyncio.get_event_loop().run_in_executor(_executor, _get)
    body = obj["Body"]
    content_type = obj.get("ContentType", "application/octet-stream")
    length = int(obj.get("ContentLength", 0))
    return body, content_type, length
