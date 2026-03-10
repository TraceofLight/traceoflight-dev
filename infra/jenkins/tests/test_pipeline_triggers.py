from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]


class JenkinsTriggerPipelineTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_backend_pipeline_keeps_github_webhook_entrypoint(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.backend")

        self.assertIn("githubPush()", source)

    def test_frontend_pipeline_has_no_direct_github_webhook_trigger(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.frontend")

        self.assertNotIn("githubPush()", source)

    def test_backend_pipeline_triggers_frontend_after_successful_stages(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.backend")

        healthcheck_index = source.index("stage('Healthcheck')")
        trigger_index = source.index("stage('Trigger Frontend')")
        build_step_index = source.index("build job: 'traceoflight-frontend', wait: false")

        self.assertLess(healthcheck_index, trigger_index)
        self.assertLess(trigger_index, build_step_index)


if __name__ == "__main__":
    unittest.main()
