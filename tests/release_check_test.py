"""Release boundaries exercised with real files and temporary Git histories."""
import base64
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import release_check as check
import release_inventory as inventory


def sha(data):
    return hashlib.sha256(data).hexdigest()


class ReleaseChecks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="gridsmith-release-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.run_git("init", "-q")
        self.run_git("config", "user.name", "Release fixture")
        self.run_git("config", "user.email", "fixture@users.noreply.github.com")
        self.run_git("config", "core.autocrlf", "false")
        self.write("README.md", b"Temporary public release fixture.\n")
        self.write(".gitignore", b"node_modules/\n__pycache__/\n*.pyc\n")
        self.write("assets/manifest.json", (ROOT / "assets/manifest.json").read_bytes())
        self.paths = ["README.md", ".gitignore", "assets/manifest.json"]
        self.write(inventory.INVENTORY, json.dumps({"schema_version": 1, "files": [{"path": name} for name in self.paths]}).encode())
        self.refresh_commit()

    def run_git(self, *args):
        result = subprocess.run(["git", "-C", str(self.root), *args], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
        return result.stdout

    def write(self, name, data):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def refresh_commit(self, additions=()):
        inventory.refresh(self.root, additions)
        self.run_git("add", "--all")
        self.run_git("commit", "-qm", "Public fixture update", "--allow-empty")

    def assert_issue(self, issues, fragment):
        self.assertTrue(any(fragment in issue for issue in issues), (fragment, issues))

    def test_clean_tracked_fixture_and_ignored_local_dependencies(self):
        self.write("node_modules/private-cache.txt", b"Local dependency cache")
        self.assertEqual(check.check_tree(self.root), [])
        self.assertEqual(check.check_history(self.root), [])

    def test_new_tracked_file_is_not_silently_inventoried(self):
        self.write("surprise.txt", b"Unexpected outgoing payload")
        self.run_git("add", "surprise.txt")
        inventory.refresh(self.root)
        value = json.loads((self.root / inventory.INVENTORY).read_text())
        self.assertNotIn("surprise.txt", [entry["path"] for entry in value["files"]])
        self.assert_issue(check.check_tree(self.root), "tracked paths differ")

    def test_untracked_nonignored_file_blocks(self):
        self.write("forgotten.txt", b"Review me")
        self.assert_issue(check.check_tree(self.root), "untracked nonignored")

    def test_changed_bytes_cannot_use_stale_inventory(self):
        self.write("README.md", b"Changed after review")
        self.assert_issue(check.check_tree(self.root), "working payload differs")

    def test_staged_bytes_cannot_hide_behind_clean_working_payload(self):
        original = (self.root / "README.md").read_bytes()
        self.write("README.md", b"Different staged content")
        self.run_git("add", "README.md")
        self.write("README.md", original)
        self.assert_issue(check.check_tree(self.root), "staged payload differs")

    def test_explicit_addition_and_removal(self):
        self.write("new-note.md", b"Intentional note")
        self.refresh_commit(["new-note.md"])
        self.assertEqual(check.check_tree(self.root), [])
        (self.root / "new-note.md").unlink()
        inventory.refresh(self.root, removals=["new-note.md"])
        self.run_git("add", "--all")
        self.assertEqual(check.check_tree(self.root), [])

    def test_patterns_and_traversal_are_not_file_selection(self):
        before = (self.root / inventory.INVENTORY).read_bytes()
        for name in ("../outside.txt", "/absolute.txt", "tools/*.py", "a/./b", "a//b", "A:\\secret", ".git/config"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                inventory.refresh(self.root, additions=[name])
        self.assertEqual((self.root / inventory.INVENTORY).read_bytes(), before)

    def test_symlink_index_entry_blocks_without_opening_target(self):
        oid = self.run_git("hash-object", "-w", "README.md").decode().strip()
        self.run_git("update-index", "--cacheinfo", f"120000,{oid},README.md")
        self.assert_issue(check.check_tree(self.root), "nonregular")

    def test_runtime_file_is_blocked_even_after_inventory_refresh(self):
        self.write("session.sqlite", b"Synthetic database canary")
        self.refresh_commit(["session.sqlite"])
        self.assert_issue(check.check_tree(self.root), "forbidden runtime/private file")

    def test_secret_and_encoded_home_canaries(self):
        token = "gh" + "p_" + "C" * 36
        user_path = "C:" + "/Users/" + "SyntheticPerson/private.txt"
        from urllib.parse import quote
        self.write("README.md", (token + "\n" + quote(user_path, safe="")).encode())
        self.refresh_commit()
        issues = check.check_tree(self.root)
        self.assert_issue(issues, "github-token")
        self.assert_issue(issues, "user-home-path")
        self.assertFalse(any(token in issue or "SyntheticPerson" in issue for issue in issues))

    def test_common_javascript_escaped_home_canaries(self):
        user_path = "C:" + "/Users/" + "SyntheticPerson/private.txt"
        for escape in ("u%04x", "x%02x"):
            encoded = "".join("\\" + escape % ord(char) for char in user_path)
            payload = ('const source = "' + encoded + '";').encode()
            with self.subTest(escape=escape):
                self.assert_issue(check.text_findings(payload), "user-home-path")

    def test_extra_bundled_metadata_and_changed_identity_block(self):
        import re
        source = (ROOT / "demo/index.html").read_text(encoding="utf-8")
        match = re.search(r'<script id="bundled" type="application/json">(.*?)</script>', source, re.DOTALL)
        self.assertIsNotNone(match)
        for key, value in (("original", "https://synthetic.invalid/unapproved.png"),
                           ("caption", "Synthetic private caption"), ("locked", True),
                           ("id", "saved-personal-image"), ("sample", 1)):
            manifest = json.loads(match[1])
            manifest[0][key] = value
            changed = source[:match.start(1)] + json.dumps(manifest, separators=(",", ":")) + source[match.end(1):]
            with self.subTest(key=key):
                self.assert_issue(check.inspect_payload("demo/index.html", changed.encode()), "bundled sample metadata")
        manifest = json.loads(match[1])
        manifest[0]["src"], manifest[1]["src"] = manifest[1]["src"], manifest[0]["src"]
        changed = source[:match.start(1)] + json.dumps(manifest, separators=(",", ":")) + source[match.end(1):]
        self.assert_issue(check.inspect_payload("demo/index.html", changed.encode()), "bundled sample source")
        # Reachable reviewed builds had only id/src/locked before sample:true
        # was introduced. Preserve that schema without accepting extra fields.
        manifest = json.loads(match[1])
        for item in manifest:
            item.pop("sample")
        changed = source[:match.start(1)] + json.dumps(manifest, separators=(",", ":")) + source[match.end(1):]
        self.assertEqual(check.inspect_payload("demo/index.html", changed.encode()), [])

    def test_deleted_secret_remains_blocked_in_history(self):
        self.write("old-note.txt", ("gh" + "p_" + "D" * 36).encode())
        self.refresh_commit(["old-note.txt"])
        (self.root / "old-note.txt").unlink()
        inventory.refresh(self.root, removals=["old-note.txt"])
        self.run_git("add", "--all")
        self.run_git("commit", "-qm", "Remove historical canary")
        self.assertEqual(check.check_tree(self.root), [])
        self.assert_issue(check.check_history(self.root), "github-token")

    def test_private_author_email_and_shallow_history_block(self):
        self.run_git("-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "Identity fixture")
        self.assert_issue(check.check_history(self.root), "email is not GitHub no-reply")
        (self.root / ".git/shallow").write_bytes(self.run_git("rev-parse", "HEAD"))
        self.assert_issue(check.check_history(self.root), "history is shallow")

    def test_replacing_image_and_both_manifests_does_not_approve_image(self):
        # A different valid PNG makes this a content substitution, not a corrupt file.
        self.write("assets/sample_01.png", (ROOT / "assets/sample_02.png").read_bytes())
        manifest = json.loads((self.root / "assets/manifest.json").read_bytes())
        manifest["images"][0]["sha256"] = sha((self.root / "assets/sample_01.png").read_bytes())
        self.write("assets/manifest.json", json.dumps(manifest).encode())
        self.refresh_commit(["assets/sample_01.png"])
        issues = check.check_tree(self.root)
        self.assert_issue(issues, "image differs from independently pinned")
        self.assert_issue(issues, "assets/manifest.json: differs")

    def test_png_text_metadata_canary_has_valid_crc_but_blocks(self):
        data = (ROOT / "docs/images/mobile.png").read_bytes()
        body = b"Description\x00Synthetic private metadata"
        kind = b"tEXt"
        chunk = struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xffffffff)
        self.write("docs/images/mobile.png", data[:-12] + chunk + data[-12:])
        self.refresh_commit(["docs/images/mobile.png"])
        self.assert_issue(check.check_tree(self.root), "PNG metadata")

    def test_appended_png_payload_blocks(self):
        self.write("docs/images/mobile.png", (ROOT / "docs/images/mobile.png").read_bytes() + b"hidden trailer")
        self.refresh_commit(["docs/images/mobile.png"])
        self.assert_issue(check.check_tree(self.root), "PNG trailing data")

    def test_replacement_screenshot_requires_separate_policy_review(self):
        self.write("docs/images/mobile.png", (ROOT / "docs/images/workspace.png").read_bytes())
        self.refresh_commit(["docs/images/mobile.png"])
        self.assert_issue(check.check_tree(self.root), "image differs from independently pinned")

    def test_unapproved_embedded_png_and_saved_caption_block(self):
        original = (ROOT / "demo/index.html").read_bytes()
        image = base64.b64encode((ROOT / "docs/images/mobile.png").read_bytes())
        self.assert_issue(check.inspect_payload("demo/index.html", original + b'<img src="data:image/png;base64,' + image + b'">'), "unapproved bundled")
        with_caption = original.replace(b'"meta":{}', b'"meta":{"sample_01":{"caption":"Synthetic personal caption"}}', 1)
        self.assertNotEqual(original, with_caption)
        self.assert_issue(check.inspect_payload("demo/index.html", with_caption), "unapproved workspace")

    def review_fixture(self):
        # Evidence is kept outside the candidate tree to avoid recursive identities.
        self.write("demo/index.html", (ROOT / "demo/index.html").read_bytes())
        self.refresh_commit(["demo/index.html"])
        identity = {
            "commit": self.run_git("rev-parse", "HEAD").decode().strip(),
            "inventory_sha256": sha((self.root / inventory.INVENTORY).read_bytes()),
            "demo_sha256": sha((self.root / "demo/index.html").read_bytes()),
        }
        return {
            "schema_version": 1, "identity": identity,
            "author": "builder-fixture", "reviewer": "critic-fixture", "holds": [],
            "claims": [{"name": name, "status": "PASS", "identity": identity, "author": "builder-fixture", "reviewer": "critic-fixture", "command": "recorded fixture command", "evidence": "fixture-evidence.json"} for name in ("functional", "browser", "offline", "privacy", "source-build", "remote-ci", "offline-download-parity", "hosted")],
            "publication": {"status": "APPROVED", "audience": "synthetic private fixture", "permission_evidence": "fixture permission record"},
        }

    def validate_review(self, review, expected_hash=None):
        with tempfile.TemporaryDirectory(prefix="gridsmith-evidence-test-") as folder:
            target = Path(folder) / "review.json"
            target.write_text(json.dumps(review), encoding="utf-8")
            return check.check_review(self.root, target, expected_hash or sha(target.read_bytes()))

    def test_review_binds_exact_commit_inventory_and_independent_hash(self):
        review = self.review_fixture()
        self.assertEqual(self.validate_review(review), [])
        self.assert_issue(self.validate_review(review, "0" * 64), "approval hash")
        self.write("README.md", b"Changed source after review")
        self.refresh_commit()
        self.assert_issue(self.validate_review(review), "review identity")

    def test_self_review_hold_and_missing_permission_cannot_pass(self):
        review = self.review_fixture()
        review["reviewer"] = review["author"]
        self.assert_issue(self.validate_review(review), "distinct named identities")
        review["reviewer"] = "critic-fixture"
        review["holds"] = [{"id": "CANARY-1", "status": "OPEN", "evidence": "Synthetic unresolved issue"}]
        self.assert_issue(self.validate_review(review), "holds block")
        review["holds"] = []
        review["publication"]["status"] = "BLOCKED"
        self.assert_issue(self.validate_review(review), "publication requires")

    def test_missing_or_stale_claim_cannot_pass(self):
        review = self.review_fixture()
        review["claims"].pop()
        self.assert_issue(self.validate_review(review), "required claims")
        review["claims"][0]["identity"] = {"commit": "old"}
        self.assert_issue(self.validate_review(review), "claim is not PASS")

    def test_selected_delivery_gates_cannot_be_omitted(self):
        # These requirements come from the release charter, not REQUIRED_CLAIMS.
        for gate in ("hosted", "offline-download-parity"):
            with self.subTest(gate=gate):
                review = self.review_fixture()
                review["claims"] = [claim for claim in review["claims"] if claim["name"] != gate]
                self.assert_issue(self.validate_review(review), "required claims")

    def test_cli_does_not_refresh_stale_generated_artifact(self):
        # Use the real checked-in builder, sources and approved assets in an isolated repo.
        source_inventory = json.loads((ROOT / inventory.INVENTORY).read_bytes())
        paths = [item["path"] for item in source_inventory["files"] if item["path"].startswith(("planner_src/", "demo_src/", "assets/", "demo/", "tests/fixtures/"))]
        paths += ["tools/build.py"]
        for name in paths:
            self.write(name, (ROOT / name).read_bytes())
        build = subprocess.run([sys.executable, str(self.root / "tools/build.py")], capture_output=True)
        self.assertEqual(build.returncode, 0, build.stderr.decode(errors="replace"))
        self.refresh_commit(paths)
        self.write("planner_src/base.css", (self.root / "planner_src/base.css").read_bytes() + b"\n/* Stale artifact canary */\n")
        self.refresh_commit()
        before = (self.root / "demo/index.html").read_bytes()
        run = subprocess.run([sys.executable, str(ROOT / "tools/release_check.py"), "--root", str(self.root)], capture_output=True)
        self.assertEqual(run.returncode, 1)
        self.assertIn(b"source-to-build freshness check failed", run.stderr)
        self.assertEqual((self.root / "demo/index.html").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
