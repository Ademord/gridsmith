"""Portable, read-only release checks. See docs/RELEASE.md for scope and limits."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path
import re
import struct
import subprocess
import sys
from urllib.parse import unquote
import zlib

from release_inventory import INVENTORY, file_bytes, read_inventory, safe_path

# Approval policy, deliberately independent of both mutable JSON manifests.
# Changes to this policy require a separate review of the image provenance.
APPROVED_SAMPLES = (
    "835d670a34c8fe4b4dcbfa3338547b98f551c92b5f1045b81f67c275fbb41a0a",
    "3da3007b78d394b0ecf578e05f3f7d6ba72d2e44d9e85f751d6f7372f3614dbd",
    "a97cd4b9745d27bd94a5a096e55c87d419078331e52acd666f6c94e91b0d70bd",
    "c53c0796bd3856da78d2d38ef7a50db7b31a4043e1365272f55ee798a59bf6ba",
    "29eb83c8c223cac6abca4d82f8834df65195b329a4d702e7dbf004a6b2f1dac7",
    "8a665efc90410ae45ff8594db3f79ea32f992204e42f83361b88f5d8d0be23c8",
    "5c89bb49a5cf729479a6b1596b67135f34f9d835903265b35970fed22fd76d40",
    "b085c939c03ce40d29b8b253859bbc1970cec4ee0a328fff7016222823481023",
    "59392ed39cfb5d30921b76a5f61cee835037ab5f81201405eb1e2ba96e10a6a5",
    "007153ff0aaaccc7b31e9d969f863953d5867596e77ae5df925b9926010b7d66",
    "10e2363e8044756fc7e4ae5e34813263961c40dbed489df5619569ae1f197326",
    "1cca5ccc80cd4f104edebfde08aeb98e4711623ee425ae60d8a6863ac3e91e46",
    "c3c3683aaf02ae9c489092f1b00fb77f8aa1cf93dbae44f6d083544005686a5f",
    "529f7e085baaf3dcc9fac4bf1223b860f806274c821add83f5340cfa519b52aa",
    "791c833dd3e60d06d518064233310d40d9e7ba364851abf48d32714826d24737",
    "e09f17836994de5acd0407aa486c62ef0dda236cb50bafd47ee289f71ad5774c",
    "f46b69ed59e924644866bbe1bd0b6a5fb9434d6083ddd819d7d01cf03d8a07a1",
    "5e9634712203f0c2bc4a683c8a59c2a91f09927b1c57d2db7d30332359e27142",
)
GENERATED_PNGS = {
    "grid-4x4": "1b07091b3e0062d33d6fdd6b2c28f1d37e3a392aa9e7965b240e43f54e116bea",
    "grid-6x5": "d92cd2eb09d9596c218bb741accdd279fd3f2811d2822c2bd97b52a1e450a651",
    "sample_19": "359599b5ffc7868811290e1a5d81c1dd7e3593901d986725487c6e89c338fd2c",
    "sample_20": "bf52fa1240fb0095d4ab22613352c2415e7c19de00d218545d46be0a605cec58",
    "sample_21": "ccc07c292ba1ed59c554c3ece1e2d298623dde8f46613ef8fd733a1cc25adc80",
}
APPROVED_SCREENSHOTS = {
    # Retain reviewed earlier encodings: reachable history is checked too.
    "guided-tour": ("308132ab34fd7c792e873970c57dec95fbf8515ace62e5b923acb59ed25ed737", "700540211a3bd1e24bb68a1eeebeb6496d1f076ac40e78af3994bb73fe655a43", "1bc49826f15d2db69a0f126ececda07e1259136288fef98f70adec19bbbaff84", "fad16a2f7276b49b8edc32bb3e09395e3fe17a45ff24e6d6db2cdf04b731d0c8"),
    "import-review": ("4cb95a2dfe9a4df2840554f4f4a56529a62ebd1cdf0bd4c33e7b1ec2cafff61b", "fb35dfba31f9a0d7e5cd6d4938855a408191cd4c4d1493c572b5eff63c2d5ed5"),
    "mobile": ("e93131822f6fde33b5cdeab02717e35e915875a64fd59192922c72384e3e26b1", "18565ec2c4aab86b7d2c6614be20592647099152fab23805a0549ad87ffd639d", "b2e90755983c6ec1617650ef669f25470c6c52ac7e197b109229e31661d2d46c"),
    "workspace-light": ("7b3e0b59b8c9f5c99e1bc48ba4e843171396eb7c238459719022e5a0e3476716", "a2341015ff354567784734d5ef4b0edcc4c1f40537cce2b1aede011ede2f663b", "2a05efcac4358d44294faf90eef21bb40cf2b7642f7ff704f3966237ad472188"),
    "workspace": ("b1347092e5a6660ff3be72c7b0203086efc83f04a14fe30e0679596a1c2e640d", "b16ad93a0009d559d4f3ee439c22d0cff2d39f142907fefff15c13c31b600998", "efe32b478ff246208d4e28c42bfab3e73d28cb899f3c96b1b8c89bb450ccf605", "37c6f29acd8a360c2891fa68191ee1f251fd0bf334bfa04c532c2b8c748d16c5"),
}
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
HASH = re.compile(r"^[0-9a-f]{64}$")
REQUIRED_CLAIMS = frozenset(("functional", "browser", "offline", "privacy", "source-build", "remote-ci", "offline-download-parity", "hosted"))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args):
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, check=False)
    if result.returncode:
        # Do not print arbitrary git output: it can contain private paths/data.
        raise ValueError("Git command failed: " + args[0])
    return result.stdout


def forbidden_path(name):
    lower = name.casefold()
    parts = lower.split("/")
    forbidden_dirs = {"node_modules", ".venv", "venv", "__pycache__", ".playwright", "test-results", "playwright-report", "recordings", "private", ".git"}
    return (any(p in forbidden_dirs for p in parts)
            or any(p == ".env" or p.startswith(".env.") or p.startswith("._") for p in parts)
            or lower.endswith((".sqlite", ".sqlite3", ".db", ".log", ".zip", ".pyc", ".pem", ".key", ".p12", ".har"))
            or any(p.startswith("gridsmith-layout") for p in parts)
            or lower.endswith((".sqlite-wal", ".sqlite-shm", ".sqlite3-wal", ".sqlite3-shm")))


def png_size(data):
    """Validate framing/CRC and exclude text, EXIF and unknown ancillary chunks."""
    if not data.startswith(PNG_MAGIC):
        raise ValueError("Invalid PNG signature")
    position, chunks, size = 8, [], None
    while position < len(data):
        if position + 12 > len(data):
            raise ValueError("Truncated PNG")
        length = struct.unpack(">I", data[position:position + 4])[0]
        kind = data[position + 4:position + 8]
        end = position + length + 12
        if end > len(data):
            raise ValueError("Truncated PNG chunk")
        body = data[position + 8:end - 4]
        if zlib.crc32(kind + body) & 0xffffffff != struct.unpack(">I", data[end - 4:end])[0]:
            raise ValueError("PNG CRC mismatch")
        if kind not in (b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"sRGB", b"gAMA", b"cHRM", b"pHYs"):
            raise ValueError("PNG metadata or unsupported chunk")
        if kind == b"IHDR":
            if chunks or length != 13:
                raise ValueError("Invalid PNG header")
            size = struct.unpack(">II", body[:8])
            if not all(size):
                raise ValueError("Empty PNG dimensions")
        chunks.append(kind)
        position = end
        if kind == b"IEND":
            if length or position != len(data):
                raise ValueError("PNG trailing data")
            break
    if not chunks or chunks[0] != b"IHDR" or chunks[-1] != b"IEND" or b"IDAT" not in chunks:
        raise ValueError("Incomplete PNG")
    return size


def text_findings(data):
    """Conservative canaries; report rule names, never matching secret values."""
    if b"\x00" in data[:4096]:
        # UTF-16 text still receives the same checks.
        encoding = "utf-16" if data.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8"
    else:
        encoding = "utf-8"
    try:
        text = data.decode(encoding)
    except UnicodeError:
        return []
    variants = [text]
    for _ in range(2):
        decoded = html.unescape(unquote(variants[-1]))
        # Common JSON/JavaScript string escapes are inspectable without executing
        # source. This is deliberately bounded, not arbitrary deobfuscation.
        decoded = re.sub(r"\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))",
                         lambda match: chr(int(match[1] or match[2], 16)), decoded)
        variants.append(decoded.replace("\\/", "/"))
    text = "\n".join(variants)
    # Patterns are assembled so that this policy file is not its own canary.
    rules = {
        "private-key": r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE" + r" KEY-----",
        "github-token": r"\b(?:gh[pousr]_" + r"[A-Za-z0-9]{30,}|github_pat_" + r"[A-Za-z0-9_]{40,})\b",
        "aws-access-key": r"\b(?:AKIA|ASIA)" + r"[A-Z0-9]{16}\b",
        "credential-assignment": r"(?i)[\"']?(?:api[_-]?key|client[_-]?secret|access[_-]?token|password)[\"']?\s*[:=]\s*[\"'][A-Za-z0-9_+/=-]{20,}[\"']",
        "user-home-path": r"(?i)(?:[A-Z]:[\\/]+Users[\\/]+[^\s\\/\"'<>]+|/(?:Users|home)/[^\s/\"'<>]+)",
        "private-project-path": r"(?i)(?:insta[-_]feed[/\\](?:images|state|posted)|(?:saved|private)[-_]workspace\.json)",
    }
    return [rule for rule, pattern in rules.items() if re.search(pattern, text)]


def embedded_images(data):
    text = data.decode("utf-8")
    images = []
    for match in re.finditer(r"data:image/([^;,\s]+);base64,([^\s\"'<>`)]*)", text):
        if match[1] != "png":
            raise ValueError("Unapproved embedded image type")
        try:
            payload = base64.b64decode(match[2], validate=True)
        except ValueError as error:
            raise ValueError("Invalid embedded PNG encoding") from error
        png_size(payload)
        if digest(payload) not in set(APPROVED_SAMPLES) | set(GENERATED_PNGS.values()):
            raise ValueError("Unapproved embedded PNG hash")
        images.append(digest(payload))
    return images


def image_findings(name, data):
    issues = []
    if not name.lower().endswith(".png") and not data.startswith(PNG_MAGIC):
        if name.lower().endswith((".jpg", ".jpeg", ".webp", ".gif", ".heic", ".avif", ".svg")):
            issues.append("unapproved image type")
        return issues
    try:
        size = png_size(data)
    except ValueError as error:
        return [str(error)]
    expected = {f"assets/sample_{n:02}.png": value for n, value in enumerate(APPROVED_SAMPLES, 1)}
    expected.update({f"assets/generated/{key}.png": value for key, value in GENERATED_PNGS.items()})
    expected.update({f"tests/fixtures/{key}.png": GENERATED_PNGS[key] for key in ("grid-4x4", "grid-6x5")})
    expected = {key: (value,) for key, value in expected.items()}
    expected.update({f"docs/images/{key}.png": value for key, value in APPROVED_SCREENSHOTS.items()})
    if name in expected:
        if digest(data) not in expected[name]:
            issues.append("image differs from independently pinned approval policy")
        if name.startswith("assets/sample_") and size != (300, 400):
            issues.append("approved sample dimensions changed")
    else:
        issues.append("image path has no approval policy")
    return issues


def inspect_payload(name, data):
    issues = image_findings(name, data)
    if data.startswith(PNG_MAGIC):
        return issues
    issues.extend(text_findings(data))
    if name == "demo/index.html":
        try:
            images = embedded_images(data)
            expected_samples = list(APPROVED_SAMPLES) + [GENERATED_PNGS[f"sample_{n}"] for n in (19, 20, 21)]
            expected = expected_samples + [GENERATED_PNGS["grid-4x4"]]
            if sorted(images) != sorted(expected):
                issues.append("bundled image set differs from approved 21 samples and guide fixture")
            bundled = re.findall(r'<script\s+id="bundled"\s+type="application/json">(.*?)</script>', data.decode("utf-8"), re.DOTALL)
            manifest = json.loads(bundled[0]) if len(bundled) == 1 else None
            if not isinstance(manifest, list) or len(manifest) != 21:
                issues.append("bundled samples have an invalid manifest")
            else:
                for n, item in enumerate(manifest, 1):
                    # Earlier reviewed builds predate the sample marker. Both
                    # schemas exclude original URLs, captions and other data.
                    allowed_keys = ({"id", "src", "locked"}, {"id", "src", "locked", "sample"})
                    if (not isinstance(item, dict) or set(item) not in allowed_keys
                            or item.get("id") != f"sample_{n:02}" or item.get("sample", True) is not True
                            or item.get("locked") is not (n > 18)):
                        issues.append("bundled sample metadata differs from approved schema")
                        break
                    source = item.get("src")
                    prefix = "data:image/png;base64,"
                    if (not isinstance(source, str) or not source.startswith(prefix)
                            or digest(base64.b64decode(source[len(prefix):], validate=True)) != expected_samples[n - 1]):
                        issues.append("bundled sample source differs from approved identity")
                        break
            saved = re.findall(r'<script\s+id="savedstate"\s+type="application/json">(.*?)</script>', data.decode("utf-8"), re.DOTALL)
            expected_state = {
                "order": [f"sample_{n:02}" for n in range(1, 13)],
                "backlog": [f"sample_{n:02}" for n in range(13, 19)],
                "cols": 3, "railw": 0, "railh": False, "meta": {}, "drafts": [],
            }
            if len(saved) != 1 or json.loads(saved[0]) != expected_state:
                issues.append("bundled saved state contains unapproved workspace data")
        except (ValueError, UnicodeError):
            issues.append("invalid or unapproved bundled image/state payload")
    return issues


def check_tree(root):
    """Compare the explicit inventory with both index bytes and working bytes."""
    root = root.resolve()
    if Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve() != root:
        raise ValueError("Root must be the release repository, not a parent repository")
    inventory = read_inventory(root)
    entries = {entry["path"]: entry for entry in inventory["files"]}
    entries[INVENTORY] = {"sha256": digest(file_bytes(root, INVENTORY)), "bytes": len(file_bytes(root, INVENTORY))}
    indexed = {}
    for record in git(root, "ls-files", "--stage", "-z").split(b"\x00"):
        if record:
            attributes, raw_name = record.split(b"\t", 1)
            mode, oid, stage = attributes.decode().split()
            name = raw_name.decode("utf-8")
            indexed[name] = (mode, oid, stage)
    issues = []
    if set(indexed) != set(entries):
        issues.append("tracked paths differ from exact inventory (additions or omissions)")
    if git(root, "ls-files", "--others", "--exclude-standard", "-z"):
        issues.append("untracked nonignored files exist; review or move them before release")
    for name, entry in entries.items():
        safe_path(name)
        if forbidden_path(name):
            issues.append(f"{name}: forbidden runtime/private file")
        if not HASH.fullmatch(str(entry.get("sha256", ""))) or type(entry.get("bytes")) is not int or entry["bytes"] < 0:
            issues.append(f"{name}: invalid inventory hash/size")
            continue
        try:
            payload = file_bytes(root, name)
        except (ValueError, OSError) as error:
            issues.append(f"{name}: {type(error).__name__} opening release file")
            continue
        if digest(payload) != entry["sha256"] or len(payload) != entry["bytes"]:
            issues.append(f"{name}: working payload differs from inventory")
        if name in indexed:
            mode, oid, stage = indexed[name]
            if mode not in ("100644", "100755") or stage != "0":
                issues.append(f"{name}: nonregular or conflicted index entry")
            elif git(root, "cat-file", "blob", oid) != payload:
                issues.append(f"{name}: staged payload differs from working payload")
        issues.extend(f"{name}: {issue}" for issue in inspect_payload(name, payload))
    approved_manifest = json.loads(file_bytes(root, "assets/manifest.json").decode("utf-8")).get("images")
    expected_manifest = [{"path": f"assets/sample_{n:02}.png", "sha256": value, "width": 300, "height": 400} for n, value in enumerate(APPROVED_SAMPLES, 1)]
    if approved_manifest != expected_manifest:
        issues.append("assets/manifest.json: differs from independently pinned approval policy")
    return issues


def check_history(root):
    """Inspect every reachable local commit and blob; require complete history."""
    if git(root, "rev-parse", "--is-shallow-repository").strip() != b"false":
        return ["history is shallow; fetch full history before checking"]
    issues, seen = [], set()
    for commit in git(root, "rev-list", "--all").decode().splitlines():
        record = git(root, "show", "-s", "--format=%ae%n%ce%n%B", commit).decode("utf-8", errors="replace")
        for address in record.splitlines()[:2]:
            if not re.fullmatch(r"[A-Za-z0-9+_.-]+@users\.noreply\.github\.com", address):
                issues.append(f"history {commit[:12]}: author/committer email is not GitHub no-reply")
        issues.extend(f"history {commit[:12]}: {rule}" for rule in text_findings(record.encode("utf-8")))
        for entry in git(root, "ls-tree", "-rz", commit).split(b"\x00"):
            if not entry:
                continue
            attributes, raw_name = entry.split(b"\t", 1)
            mode, kind, oid = attributes.decode().split()
            name = raw_name.decode("utf-8")
            if (name, oid) in seen:
                continue
            seen.add((name, oid))
            try:
                safe_path(name)
            except ValueError:
                issues.append(f"history {commit[:12]}: unsafe filename")
                continue
            if forbidden_path(name) or mode not in ("100644", "100755") or kind != "blob":
                issues.append(f"history {commit[:12]}: forbidden path or nonregular entry")
                continue
            data = git(root, "cat-file", "blob", oid)
            issues.extend(f"history {commit[:12]} {name}: {issue}" for issue in inspect_payload(name, data))
    return issues


def check_review(root, review_path, expected_hash):
    """Validate recorded evidence, not whether a person is independent or honest."""
    data = review_path.read_bytes()
    if not expected_hash or not HASH.fullmatch(expected_hash) or digest(data) != expected_hash:
        return ["review evidence hash does not match independently supplied approval hash"]
    review = json.loads(data.decode("utf-8"))
    if not isinstance(review, dict):
        return ["review evidence must be an object"]
    issues = []
    expected_identity = {
        "commit": git(root, "rev-parse", "HEAD").decode().strip(),
        "inventory_sha256": digest(file_bytes(root, INVENTORY)),
        "demo_sha256": digest(file_bytes(root, "demo/index.html")),
    }
    if review.get("schema_version") != 1 or review.get("identity") != expected_identity:
        issues.append("review identity does not match exact commit, inventory and demo")
    if git(root, "status", "--porcelain", "--untracked-files=normal"):
        issues.append("release approval requires a clean committed working tree")
    author, reviewer = review.get("author"), review.get("reviewer")
    if not isinstance(author, str) or not isinstance(reviewer, str) or not author.strip() or not reviewer.strip() or author.strip().casefold() == reviewer.strip().casefold():
        issues.append("release author and reviewer must be distinct named identities")
    if review.get("holds") != []:
        issues.append("unresolved or missing release holds block approval")
    claims = review.get("claims")
    if not isinstance(claims, list):
        return issues + ["claims must be a list"]
    names = [claim.get("name") for claim in claims if isinstance(claim, dict)]
    if len(names) != len(claims) or len(set(names)) != len(names) or not REQUIRED_CLAIMS.issubset(names):
        issues.append("required claims are missing, duplicated or malformed")
    for claim in claims:
        if not isinstance(claim, dict):
            continue
        if claim.get("status") != "PASS" or claim.get("identity") != expected_identity:
            issues.append("claim is not PASS for the exact release identity")
        if claim.get("author") != author or claim.get("reviewer") != reviewer:
            issues.append("claim must identify the release author and independent reviewer")
        if not isinstance(claim.get("evidence"), str) or not claim["evidence"].strip() or not isinstance(claim.get("command"), str) or not claim["command"].strip():
            issues.append("claim requires an evidence reference and reproduction command")
    publication = review.get("publication", {})
    if not isinstance(publication, dict) or publication.get("status") != "APPROVED" or not all(isinstance(publication.get(key), str) and publication[key].strip() for key in ("audience", "permission_evidence")):
        issues.append("publication requires explicit audience and permission evidence")
    return issues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--review", type=Path, help="Optional independent review evidence JSON")
    parser.add_argument("--review-sha256", help="Hash of reviewed evidence, obtained outside the candidate tree")
    args = parser.parse_args()
    if bool(args.review) != bool(args.review_sha256):
        parser.error("--review and --review-sha256 must be supplied together")
    try:
        issues = check_tree(args.root)
        issues.extend(check_history(args.root))
        # Use the checked-in build's deterministic check without regenerating outputs.
        result = subprocess.run([sys.executable, str(args.root / "tools/build.py"), "--check"], capture_output=True, check=False)
        if result.returncode:
            issues.append("source-to-build freshness check failed (run tools/build.py --check for detail)")
        if args.review:
            issues.extend(check_review(args.root, args.review, args.review_sha256))
    except (ValueError, OSError, KeyError, TypeError) as error:
        # Keep errors useful without echoing potentially sensitive payloads.
        print("CHECKS FAILED: " + type(error).__name__ + "; check repository/inventory/evidence structure", file=sys.stderr)
        return 1
    if issues:
        for issue in issues:
            print("FAIL: " + issue, file=sys.stderr)
        return 1
    print("RECORDED RELEASE APPROVAL VALIDATED" if args.review else "CHECKS PASSED; release approval was not evaluated.")
    print("Pattern checks and recorded identities do not prove absence of secrets or reviewer independence.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
