from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]


class JenkinsCleanupPipelineTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_frontend_pipeline_skips_default_checkout_to_avoid_duplicate_scm_fetch(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.frontend")

        self.assertIn("skipDefaultCheckout(true)", source)

    def test_frontend_pipeline_prunes_safe_docker_garbage_in_post(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.frontend")

        self.assertIn("rm -f apps/web/.env.web || true", source)
        self.assertIn("docker container prune -f", source)
        self.assertIn("docker image prune -f", source)
        self.assertNotIn("docker builder prune -f", source)

    def test_backend_pipeline_prunes_safe_docker_garbage_in_post(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.backend")

        self.assertIn("rm -f apps/api/.env.api || true", source)
        self.assertIn("docker container prune -f", source)
        self.assertIn("docker image prune -f", source)
        self.assertNotIn("docker builder prune -f", source)

    def test_frontend_dockerfile_avoids_copying_node_modules_between_stages(self) -> None:
        source = self.read("apps/web/Dockerfile")

        self.assertNotIn("COPY --from=deps /app/node_modules ./node_modules", source)
        self.assertNotIn("COPY --from=build /app/node_modules ./node_modules", source)
        self.assertIn("RUN npm ci", source)
        self.assertIn("RUN npm prune --omit=dev", source)

    def test_frontend_dockerfile_installs_dev_dependencies_before_switching_to_production(self) -> None:
        source = self.read("apps/web/Dockerfile")

        npm_ci_index = source.index("RUN npm ci")
        node_env_index = source.index("ENV NODE_ENV=production")
        self.assertLess(
            npm_ci_index,
            node_env_index,
            "Dockerfile must install devDependencies before setting NODE_ENV=production.",
        )

    def test_infra_pipeline_removes_one_shot_minio_init_container(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.infra")

        self.assertIn("docker compose --env-file ../../../apps/api/.env.api rm -f minio-init", source)


if __name__ == "__main__":
    unittest.main()
