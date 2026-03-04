import json

from app.storage.minio_client import MinioStorageClient


class _DummyMinio:
    def __init__(self) -> None:
        self.make_bucket_calls: list[str] = []
        self.set_bucket_policy_calls: list[tuple[str, str]] = []
        self._bucket_exists = False

    def bucket_exists(self, bucket: str) -> bool:
        return self._bucket_exists

    def make_bucket(self, bucket: str) -> None:
        self.make_bucket_calls.append(bucket)
        self._bucket_exists = True

    def set_bucket_policy(self, bucket: str, policy: str) -> None:
        self.set_bucket_policy_calls.append((bucket, policy))


def test_ensure_bucket_creates_bucket_and_sets_public_read_policy(monkeypatch) -> None:
    dummy = _DummyMinio()

    def fake_minio(*args, **kwargs):  # type: ignore[no-untyped-def]
        return dummy

    monkeypatch.setattr('app.storage.minio_client.Minio', fake_minio)
    client = MinioStorageClient()

    client.ensure_bucket()

    assert dummy.make_bucket_calls == [client.bucket]
    assert len(dummy.set_bucket_policy_calls) == 1

    bucket_name, policy_text = dummy.set_bucket_policy_calls[0]
    assert bucket_name == client.bucket

    policy = json.loads(policy_text)
    assert policy['Version'] == '2012-10-17'
    statement = policy['Statement'][0]
    assert statement['Effect'] == 'Allow'
    assert statement['Action'] == ['s3:GetObject']
    assert statement['Principal'] == {'AWS': ['*']}
    assert statement['Resource'] == [f'arn:aws:s3:::{client.bucket}/*']
