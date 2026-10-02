"""Exercise the VPS follower against real temporary Git repositories."""

import pathlib
import subprocess
import tempfile
import unittest

SYNC = pathlib.Path(__file__).with_name("sync_vps.py")


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.source, self.copy = self.root / "source", self.root / "copy"
        self.git(self.root, "init", "--initial-branch=main", str(self.source))
        self.git(self.source, "config", "user.email", "fixture@example.invalid")
        self.git(self.source, "config", "user.name", "Sync fixture")
        self.commit("first")
        self.git(self.root, "clone", str(self.source), str(self.copy))
        self.before = self.git(self.copy, "rev-parse", "HEAD")
        self.commit("second")

    def git(self, path, *args):
        return subprocess.check_output(
            ["git", "-c", "core.hooksPath=/dev/null", "-C", str(path), *args],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()

    def commit(self, value):
        (self.source / "content").write_text(value)
        self.git(self.source, "add", "content")
        self.git(self.source, "commit", "-m", value)

    def sync(self, expected=None):
        return subprocess.run(
            ["python3", str(SYNC), str(self.copy), expected or str(self.source)],
            capture_output=True,
            text=True,
        )

    def assert_refused(self, expected=None):
        result = self.sync(expected)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("REFUSED", result.stderr)
        self.assertEqual(self.git(self.copy, "rev-parse", "HEAD"), self.before)

    def test_fast_forward_delivers_content_and_is_idempotent(self):
        for _ in range(2):
            result = self.sync()
            self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.copy / "content").read_text(), "second")
        self.assertEqual(self.git(self.copy, "status", "--porcelain"), "")
        self.assertEqual(
            self.git(self.copy, "rev-parse", "HEAD"),
            self.git(self.source, "rev-parse", "HEAD"),
        )

    def test_tracked_edits_are_preserved(self):
        (self.copy / "content").write_text("unfinished")
        self.assert_refused()
        self.assertEqual((self.copy / "content").read_text(), "unfinished")

    def test_untracked_files_are_preserved(self):
        (self.copy / "local").write_text("unfinished")
        self.assert_refused()
        self.assertEqual((self.copy / "local").read_text(), "unfinished")

    def test_divergent_commit_is_preserved(self):
        self.git(
            self.copy,
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "--allow-empty",
            "-m",
            "local",
        )
        self.before = self.git(self.copy, "rev-parse", "HEAD")
        self.assert_refused()

    def test_wrong_remote_is_refused(self):
        self.assert_refused("https://example.invalid/wrong.git")

    def test_wrong_branch_is_refused(self):
        self.git(self.copy, "checkout", "-b", "local-work")
        self.assert_refused()


if __name__ == "__main__":
    unittest.main()
