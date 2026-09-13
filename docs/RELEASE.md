# Releasing Gridsmith

The repository contains its inventory generator and release checker. Neither tool reads another project or a private source directory. Python 3.12+, Git, and the pinned build dependencies in `requirements.txt` are required. Browser tests also require the dependencies described in the main README.

From a full checkout, build and test the intended change:

```sh
python tools/build.py
python tools/build.py --check
python -m unittest discover -s tests -p '*_test.py'
npm test
```

Capture fresh screenshots using the documented screenshot command, then review their visible content and metadata. The image policy in `tools/release_check.py` separately pins the 27 approved sample images, five generated images and five documentation screenshot paths. A changed image needs provenance review and an explicit policy change by a different reviewer. Append reviewed screenshot hashes to the policy tuples, retaining earlier reviewed encodings for reachable history checks. Updating either JSON manifest alone cannot approve replacement image bytes. The build additionally checks the generated images against their deterministic pixels.

Refresh hashes for **only the existing exact paths** in `PUBLIC-CONTENTS.json`:

```sh
python tools/release_inventory.py
```

An intentional addition or removal must name each file explicitly. There is no glob expansion or directory discovery:

```sh
python tools/release_inventory.py --add docs/RELEASE.md --add docs/GOVERNANCE.md
python tools/release_inventory.py --remove obsolete-note.md
```

Review the inventory and policy diffs, and stage the exact intended files, including the inventory. Run the checker before committing:

```sh
python tools/release_check.py
```

It compares the inventory with the exact tracked file set and checks both working and staged bytes. It rejects links, conflicted index entries, nonignored untracked files, forbidden runtime files, mismatched approved images, unexpected bundled image payloads, personal saved workspace data, PNG text/EXIF/unsupported chunks or trailing bytes, and selected credential/private-path patterns. Bundled sample records permit only `id`, `src`, `locked` and `sample`, with their reviewed values and image mapping; extra original URLs or captions fail. The `sample: true` marker is required on all 30 records in the current build. It may be absent only throughout an earlier reviewed 21-record build in reachable history. The asset manifest also requires the exact approved schema; extra fields and duplicate JSON keys fail. Pattern inspection includes bounded HTML/percent decoding and common JSON/JavaScript Unicode, hex and slash escapes. It checks every reachable local commit for those payload patterns and forbidden files, and requires GitHub no-reply author and committer emails. Deleted files in reachable history remain subject to the checks. A shallow clone fails; CI must use `fetch-depth: 0`. The checker invokes `tools/build.py --check` without rebuilding, so refreshing an inventory cannot hide stale output.

Ignored local dependencies, caches and browser test output are excluded from the release boundary. They must never be included by copying the entire working directory. Package source from the reviewed commit using Git's tracked tree; distribute the reviewed `demo/index.html` as the offline HTML. The inventory intentionally excludes its own recursive hash. Record its SHA-256 separately with the commit and demo SHA-256.

`CHECKS PASSED` means only that these technical checks passed. It does not approve publication, establish test results for a future commit, or prove that the tree has no secrets. The scanner does not provide malware analysis, arbitrary encoding/archive inspection, private-photo recognition, remote-ref discovery, or a guarantee about data outside the tracked tree. Review approved images visually, inspect source and build-policy changes independently, and retain browser/offline evidence. The candidate's own executable checker and builder are code under review; they cannot establish their own trustworthiness.

## Recorded release approval

Commit the reviewed candidate. Run remote CI for that exact commit and compare the downloaded offline artifact hash with the tested demo. Follow [governance](GOVERNANCE.md) to retain independent review results and unresolved objections. Publication remains blocked until the owner approves the exact audience. Tools do not grant that permission.

An optional evidence validator accepts a JSON record outside the candidate tree, avoiding recursive hashes:

```sh
python tools/release_check.py --review ../release-review.json --review-sha256 REVIEWED_RECORD_SHA256
```

Obtain the evidence hash from the review record's independent approval channel, not by automatically hashing an unreviewed candidate during the same command. The validator requires a clean committed tree; `schema_version: 1`; an `identity` object containing `commit`, `inventory_sha256`, and `demo_sha256`; distinct nonempty `author` and `reviewer`; an empty `holds` list; and these `claims`: `functional`, `browser`, `offline`, `privacy`, `source-build`, `remote-ci`, `offline-download-parity`, `hosted`. Every claim contains its `name`, `status: "PASS"`, the exact `identity`, the same `author` and `reviewer`, a nonempty reproduction `command`, and an `evidence` reference. The `publication` object contains `status: "APPROVED"`, an exact `audience`, and `permission_evidence`.

The delivery claims are separate: `offline` covers a copied file with networking denied; `offline-download-parity` compares the downloaded release bytes against the reviewed HTML; `hosted` covers the approved live URL, served build identity and critical controls. The selected hosted gate remains blocked while Pages lacks approval. A private source/offline release may record its completed parts, but it cannot satisfy this whole-delivery approval gate or close Done.

Keep open holds in the evidence record; never empty the list just to satisfy validation. Preserve their original reports and independent resolutions separately when they close. Missing claims, stale identities, self-review, unresolved holds or missing publication permission fail the optional gate. Success prints `RECORDED RELEASE APPROVAL VALIDATED`. This validates the record's structure and supplied hashes; it does not authenticate people, fetch evidence links, prove a review happened, or replace the owner's permission.
