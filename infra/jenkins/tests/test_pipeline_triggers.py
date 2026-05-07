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

    def test_orchestrator_runs_test_then_build_then_deploys_sequentially(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        test_stage_index = source.index("stage('Test')")
        build_stage_index = source.index("stage('Build')")
        deploy_backend_index = source.index("stage('Deploy Backend')")
        deploy_frontend_index = source.index("stage('Deploy Frontend')")

        self.assertLess(test_stage_index, build_stage_index)
        self.assertLess(build_stage_index, deploy_backend_index)
        self.assertLess(deploy_backend_index, deploy_frontend_index)

    def test_orchestrator_test_stage_runs_backend_and_frontend_in_parallel(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        test_stage_index = source.index("stage('Test')")
        # The next `parallel` keyword after stage('Test') belongs to it.
        parallel_after_test = source.index("parallel", test_stage_index)
        backend_test_branch = source.index("stage('Backend Test')", parallel_after_test)
        frontend_test_branch = source.index("stage('Frontend Test')", parallel_after_test)
        # Both branch declarations must precede stage('Build') so they're
        # genuinely inside the Test stage's parallel block.
        build_stage_index = source.index("stage('Build')")

        self.assertLess(parallel_after_test, backend_test_branch)
        self.assertLess(parallel_after_test, frontend_test_branch)
        self.assertLess(backend_test_branch, build_stage_index)
        self.assertLess(frontend_test_branch, build_stage_index)

    def test_orchestrator_passes_mode_build_then_deploy(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        # Each child job is invoked exactly twice (build + deploy). Test runs
        # inline in the orchestrator, not as a third child invocation.
        for job_name in ("traceoflight-backend", "traceoflight-frontend"):
            self.assertEqual(
                source.count(f"build job: '{job_name}'"),
                2,
                f"{job_name} should be invoked exactly twice (build + deploy, no test mode)",
            )
        self.assertEqual(source.count("name: 'MODE', value: 'build'"), 2)
        self.assertEqual(source.count("name: 'MODE', value: 'deploy'"), 2)

    def test_child_pipelines_no_longer_carry_test_stage(self) -> None:
        # Test now lives in the orchestrator; the children stay focused on
        # build + deploy and must not duplicate the test logic.
        backend = self.read("infra/jenkins/Jenkinsfile.backend")
        frontend = self.read("infra/jenkins/Jenkinsfile.frontend")

        self.assertNotIn("stage('Test Backend')", backend)
        self.assertNotIn("cargo test", backend)
        self.assertNotIn("stage('Verify Infra Running')", backend)

        self.assertNotIn("stage('Test Frontend')", frontend)
        self.assertNotIn("traceoflight-web-test", frontend)

    def test_orchestrator_carries_test_runtime(self) -> None:
        # The actual test commands live in the orchestrator now.
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        self.assertIn("cargo test", source)
        self.assertIn("traceoflight-web-test", source)

    def test_child_pipelines_expose_mode_choice_parameter(self) -> None:
        for path in ("infra/jenkins/Jenkinsfile.backend", "infra/jenkins/Jenkinsfile.frontend"):
            source = self.read(path)
            self.assertIn("name: 'MODE'", source, f"MODE param missing in {path}")
            self.assertIn("'full'", source, f"'full' choice missing in {path}")
            self.assertIn("'build'", source, f"'build' choice missing in {path}")
            self.assertIn("'deploy'", source, f"'deploy' choice missing in {path}")


if __name__ == "__main__":
    unittest.main()
