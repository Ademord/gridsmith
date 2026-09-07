"""Refresh an explicit release inventory; never discover files to include.

Run from a checkout: python tools/release_inventory.py [--add exact/path ...]
Review additions before staging. A refreshed inventory is not release approval.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath

INVENTORY = "PUBLIC-CONTENTS.json"


def safe_path(value):
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError("Inventory paths must be nonempty relative POSIX paths")
    path = PurePosixPath(value)
    if path.is_absolute() or any(p in (".", "..", ".git") for p in value.split("/")):
        raise ValueError("Unsafe inventory path")
    if path.as_posix() != value or any(c in value for c in "*?[]\x00\n\r"):
        raise ValueError("Inventory paths must be exact normalized names, not patterns")
    return value


def file_bytes(root, name):
    safe_path(name)
    root = root.resolve()
    path = root / name
    # Reject links and junctions at every level before opening any payload.
    for part in (path, *path.parents):
        if part == root:
            break
        if part.is_symlink() or (hasattr(part, "is_junction") and part.is_junction()):
            raise ValueError("Linked release path: " + name)
    if not path.resolve().is_relative_to(root) or not path.is_file():
        raise ValueError("Missing or nonregular release file: " + name)
    return path.read_bytes()


def read_inventory(root):
    value = json.loads(file_bytes(root, INVENTORY).decode("utf-8"))
    if not isinstance(value, dict) or value.get("schema_version") != 1:
        raise ValueError("Unsupported inventory schema")
    entries = value.get("files")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Inventory must contain a nonempty files list")
    paths = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Invalid inventory entry")
        path = safe_path(entry.get("path"))
        if path == INVENTORY or path.casefold() in {p.casefold() for p in paths}:
            raise ValueError("Recursive or duplicate inventory path")
        paths.append(path)
    return value


def refresh(root, additions=(), removals=()):
    value = read_inventory(root)
    paths = {entry["path"] for entry in value["files"]}
    for name in removals:
        paths.remove(safe_path(name))
    for name in additions:
        name = safe_path(name)
        if name == INVENTORY:
            raise ValueError("The inventory cannot inventory its own hash")
        paths.add(name)
    if len({p.casefold() for p in paths}) != len(paths):
        raise ValueError("Case-colliding paths")
    entries = []
    for name in sorted(paths):
        data = file_bytes(root, name)
        entries.append({"path": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    value["files"] = entries
    # Validate every path before replacing the manifest; no partial refreshes.
    (root / INVENTORY).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return len(entries)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--add", action="append", default=[], metavar="EXACT_PATH")
    parser.add_argument("--remove", action="append", default=[], metavar="EXACT_PATH")
    args = parser.parse_args()
    try:
        count = refresh(args.root, args.add, args.remove)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, "Inventory refresh failed: " + str(error) + "\n")
    print(f"Updated {count} explicit file hashes. Review the diff; this is not approval.")


if __name__ == "__main__":
    main()
