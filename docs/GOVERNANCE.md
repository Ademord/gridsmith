# Release review and evidence

The builder describes the intended change and supplies reproducible checks. A different reviewer tests the requirements against the exact candidate and records their own conclusion. A contributor may report a defect, challenge a test or raise a release hold without penalty. An author cannot close their own hold or approve their own release.

Keep these records distinct:

- Requirements and permission: what the user requested, the intended audience and explicit publication authorization.
- Hypotheses: assumptions still awaiting evidence, including device/browser coverage limits.
- Results: case ID, expected behavior, observed behavior, command, evidence reference, status and the exact source commit or artifact SHA-256 tested.
- Objections: reproducible issue, affected requirement, evidence, reporter and unresolved status.
- Decisions: evidence considered, action taken and a reviewer different from the change's author.

Do not promote another worker's assertion into a verified result by repeating it. A local pass does not imply remote CI, release-download parity, hosted behavior or real-device coverage. Report each result with its tested identity and limitation. Use `BLOCKED` for absent permission or unavailable required evidence; use `FAIL` for an observed defect. Neither status can become `PASS` by omitting it from a summary.

A hold closes only after its failure is reproduced, a fix is made, and a different reviewer reproduces the corrected result. Retain both the failure and resolution reports. If evidence conflicts, resolve the factual discrepancy through reproduction; a majority vote does not erase a failure. If a test expectation is weakened to hide a defect, stop accepting that change, preserve the original report, and reconstruct the requirement before proceeding.

Before release, the independent reviewer examines the complete diff, including inventory paths, image approval pins, build/checker code and workflows. Regenerated hashes are candidate descriptions, not approval. Claims must refer to the same exact commit, inventory hash and offline demo hash. New source/build changes require new evidence even when the inventory is refreshed. Obtain remote CI and downloaded-artifact parity for that commit, and verify the hosted deployment only after the intended audience is authorized.

Record unresolved holds and permission gaps honestly. A public visibility change, alternative public host or expanded image collection requires the relevant user authorization; an automated technical pass cannot provide it. Private originals and saved workspaces remain outside the release repository.

The optional evidence validator in [RELEASE.md](RELEASE.md) rejects self-review names, stale identities, missing claims and open holds. It cannot prove that two names identify independent people, that linked evidence is truthful, or that no report was omitted. Human or agent review must preserve those guarantees through inspectable records. Do not describe this schema as automated honesty or security assurance.
