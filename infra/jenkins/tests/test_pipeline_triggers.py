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

    def test_orchestrator_runs_test_build_lanes_then_deploys_sequentially(self) -> None:
        # Test and build are paired per backend/frontend lane, then deploys
        # rejoin into the required backend-before-frontend order.
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        test_build_index = source.index("stage('Test → Build')")
        deploy_backend_index = source.index("stage('Deploy Backend')")
        deploy_frontend_index = source.index("stage('Deploy Frontend')")

        self.assertLess(test_build_index, deploy_backend_index)
        self.assertLess(deploy_backend_index, deploy_frontend_index)

    def test_test_build_stage_runs_backend_and_frontend_lanes_in_parallel(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        test_build_index = source.index("stage('Test → Build')")
        parallel_after_test_build = source.index("parallel", test_build_index)
        backend_lane = source.index("stage('Backend')", parallel_after_test_build)
        frontend_lane = source.index("stage('Frontend')", parallel_after_test_build)
        deploy_backend_index = source.index("stage('Deploy Backend')")

        self.assertLess(parallel_after_test_build, backend_lane)
        self.assertLess(parallel_after_test_build, frontend_lane)
        self.assertLess(backend_lane, deploy_backend_index)
        self.assertLess(frontend_lane, deploy_backend_index)

    def test_each_lane_runs_test_before_its_build(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        backend_lane = source.index("stage('Backend')")
        backend_test = source.index("stage('Backend Test')", backend_lane)
        backend_build = source.index("stage('Backend Build')", backend_test)

        frontend_lane = source.index("stage('Frontend')")
        frontend_test = source.index("stage('Frontend Test')", frontend_lane)
        frontend_build = source.index("stage('Frontend Build')", frontend_test)

        self.assertLess(backend_test, backend_build)
        self.assertLess(frontend_test, frontend_build)

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
        self.assertNotIn("cargo nextest", backend)
        self.assertNotIn("stage('Verify Infra Running')", backend)

        self.assertNotIn("stage('Test Frontend')", frontend)
        self.assertNotIn("traceoflight-web-test", frontend)

    def test_orchestrator_carries_test_runtime(self) -> None:
        # The actual test commands live in the orchestrator now.
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        # Backend uses cargo-nextest for native JUnit output.
        self.assertIn("cargo nextest run", source)
        self.assertIn("--profile ci", source)
        # Frontend test image is built and run by the orchestrator.
        self.assertIn("traceoflight-web-test", source)

    def test_orchestrator_retries_frontend_test_image_build_after_snapshot_failures(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        self.assertIn("build_frontend_test_image()", source)
        self.assertIn("for attempt in 1 2 3", source)
        self.assertIn("docker build -f Dockerfile.test -t traceoflight-web-test .", source)
        self.assertIn("docker image rm -f traceoflight-web-test || true", source)
        self.assertIn("docker builder prune -af || true", source)

    def test_orchestrator_uses_docker_create_pattern_for_junit_extraction(self) -> None:
        # `docker run --rm` would discard the container before we can `docker cp`
        # the JUnit XML out. Each test stage must use create + start + cp + rm.
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        self.assertIn("docker create", source)
        self.assertIn("docker cp", source)
        # `docker rm "$container_id"` is the cleanup that pairs with create.
        self.assertIn('docker rm "$container_id"', source)

    def test_orchestrator_publishes_junit_in_post_block(self) -> None:
        source = self.read("infra/jenkins/Jenkinsfile.orchestrator")

        self.assertIn("junit", source)
        self.assertIn("apps/api/test-results/", source)
        self.assertIn("apps/web/test-results/", source)

    def test_child_pipelines_expose_mode_choice_parameter(self) -> None:
        for path in ("infra/jenkins/Jenkinsfile.backend", "infra/jenkins/Jenkinsfile.frontend"):
            source = self.read(path)
            self.assertIn("name: 'MODE'", source, f"MODE param missing in {path}")
            self.assertIn("'full'", source, f"'full' choice missing in {path}")
            self.assertIn("'build'", source, f"'build' choice missing in {path}")
            self.assertIn("'deploy'", source, f"'deploy' choice missing in {path}")

    def test_backend_test_image_installs_cargo_nextest(self) -> None:
        # cargo-nextest is required for JUnit XML output. Pin the install line
        # to make sure a future Dockerfile rewrite doesn't silently drop it.
        source = self.read("apps/api/Dockerfile.test")

        self.assertIn("cargo install --locked cargo-nextest", source)
        # Build-time sanity check: a broken install fails the image build
        # rather than the test stage at runtime.
        self.assertIn("cargo-nextest --version", source)

    def test_backend_nextest_profile_writes_junit_xml(self) -> None:
        source = self.read("apps/api/.config/nextest.toml")

        self.assertIn("[profile.ci]", source)
        self.assertIn("junit", source)

    def test_frontend_test_scripts_emit_junit_xml(self) -> None:
        source = self.read("apps/web/package.json")

        # vitest junit
        self.assertIn("--reporter=junit", source)
        self.assertIn("ui-junit.xml", source)
        # node:test guards junit
        self.assertIn("guards-junit.xml", source)
        # node:test auth junit
        self.assertIn("auth-junit.xml", source)


if __name__ == "__main__":
    unittest.main()
