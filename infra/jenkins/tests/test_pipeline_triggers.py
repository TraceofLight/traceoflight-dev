from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]


class JenkinsTriggerPipelineTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_orchestrator_owns_github_webhook_entrypoint(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        self.assertIn("githubPush()", source)

    def test_backend_pipeline_delegates_github_webhook_to_orchestrator(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.backend")

        self.assertNotIn("githubPush()", source)

    def test_frontend_pipeline_has_no_direct_github_webhook_trigger(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.frontend")

        self.assertNotIn("githubPush()", source)

    def test_backend_pipeline_no_longer_triggers_frontend_inline(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.backend")

        self.assertNotIn("stage('Trigger Frontend')", source)
        self.assertNotIn("build job: 'traceoflight-frontend'", source)

    def test_orchestrator_runs_builds_in_parallel_then_deploys_sequentially(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        build_stage_index = source.index("stage('Build')")
        parallel_index = source.index("parallel", build_stage_index)
        deploy_backend_index = source.index("stage('Deploy Backend')")
        deploy_frontend_index = source.index("stage('Deploy Frontend')")

        self.assertLess(build_stage_index, parallel_index)
        self.assertLess(parallel_index, deploy_backend_index)
        self.assertLess(deploy_backend_index, deploy_frontend_index)

    def test_orchestrator_passes_mode_build_then_deploy(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        # Each child job must be invoked twice: once for build, once for deploy.
        for job_name in ("traceoflight-backend", "traceoflight-frontend"):
            self.assertEqual(source.count(f"build job: '{job_name}'"), 2,
                             f"{job_name} should be invoked twice (build + deploy)")
        self.assertEqual(source.count("name: 'MODE', value: 'build'"), 2)
        self.assertEqual(source.count("name: 'MODE', value: 'deploy'"), 2)

    def test_child_pipelines_expose_mode_choice_parameter(self) -> None:
        for path in ("infra/jenkins/Jenkinsfile.backend", "infra/jenkins/Jenkinsfile.frontend"):
            source = self.read(path)
            self.assertIn("name: 'MODE'", source, f"MODE param missing in {path}")
            self.assertIn("'full'", source, f"'full' choice missing in {path}")
            self.assertIn("'build'", source, f"'build' choice missing in {path}")
            self.assertIn("'deploy'", source, f"'deploy' choice missing in {path}")


if __name__ == "__main__":
    unittest.main()
