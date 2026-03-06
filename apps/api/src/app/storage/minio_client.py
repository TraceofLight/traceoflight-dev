from __future__ import annotations

from datetime import timedelta
import io
import json
import uuid

from minio import Minio
from minio.error import S3Error

from app.core.config import settings


class MinioStorageClient:
    def __init__(self) -> None:
        self.client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self.bucket = settings.minio_bucket

    def _public_read_policy(self) -> str:
        return json.dumps(
            {
                'Version': '2012-10-17',
                'Statement': [
                    {
                        'Effect': 'Allow',
                        'Principal': {'AWS': ['*']},
                        'Action': ['s3:GetObject'],
                        'Resource': [f'arn:aws:s3:::{self.bucket}/*'],
                    }
                ],
            }
        )

    def ensure_bucket(self) -> None:
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)
        self.client.set_bucket_policy(self.bucket, self._public_read_policy())

    def build_object_key(self, kind: str, filename: str) -> str:
        safe_name = filename.replace(' ', '-').lower()
        return f"{kind}/{uuid.uuid4()}-{safe_name}"

    def presigned_put_url(self, object_key: str, content_type: str, expires_seconds: int) -> str:
        return self.client.get_presigned_url(
            'PUT',
            bucket_name=self.bucket,
            object_name=object_key,
            expires=timedelta(seconds=expires_seconds),
            response_headers={"Content-Type": content_type},
        )

    def presigned_get_url(self, object_key: str, expires_seconds: int) -> str:
        return self.client.get_presigned_url(
            'GET',
            bucket_name=self.bucket,
            object_name=object_key,
            expires=timedelta(seconds=expires_seconds),
        )

    def put_bytes(self, object_key: str, data: bytes, content_type: str = 'application/octet-stream') -> None:
        self.client.put_object(
            bucket_name=self.bucket,
            object_name=object_key,
            data=io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    def get_bytes(self, object_key: str) -> bytes:
        response = self.client.get_object(self.bucket, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def object_exists(self, object_key: str) -> bool:
        try:
            self.client.stat_object(self.bucket, object_key)
            return True
        except S3Error as exc:
            if exc.code in {'NoSuchKey', 'NoSuchObject', 'NoSuchBucket'}:
                return False
            raise
