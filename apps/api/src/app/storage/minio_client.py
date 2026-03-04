from __future__ import annotations

from datetime import timedelta
import json
import uuid

from minio import Minio

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
