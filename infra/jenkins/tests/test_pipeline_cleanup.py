from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]


class JenkinsCleanupPipelineTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_frontend_pipeline_prunes_dangling_images_and_builder_cache(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.frontend")

        self.assertIn("docker image prune -f", source)
        self.assertIn("docker builder prune -f", source)

    def test_backend_pipeline_prunes_dangling_images_and_builder_cache(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.backend")

        self.assertIn("docker image prune -f", source)
        self.assertIn("docker builder prune -f", source)

    def test_infra_pipeline_removes_one_shot_minio_init_container(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.infra")

        self.assertIn("docker compose --env-file .env rm -f minio-init", source)


if __name__ == "__main__":
    unittest.main()
