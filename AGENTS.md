# Working on Gridsmith

Read `HANDOFF.md`, `TODO.md`, and `docs/GOVERNANCE.md` before continuing. Keep those records current. This repository contains the reviewed demo and source; the owner's original photos, saved workspace, and private development history are outside it.

Use the existing image approval policy. A refreshed inventory does not authorize new images or publication. Keep user uploads, backups, credentials, browser profiles and test output out of tracked files. Use isolated browser contexts for tests.

Separate the author from the reviewer. Preserve reproducible objections and failed evidence until a different reviewer verifies the resolution. Do not remove an expectation or skip a failing case to make a result pass. Keep local tests, browser-engine tests, real devices, remote CI, offline downloads and hosted verification distinct.

After a source change, rebuild the HTML and run meaningful affected tests. Before a release, follow `docs/RELEASE.md`, verify all required CI jobs on the exact commit, and compare distributed artifact hashes. Use the explicit inventory tool; never copy the whole working directory for publication. Report missing permission or evidence as blocked, not passed.

Existing user authorization governs routine edits, tests and private repository updates. Public visibility still needs the explicit audience approval recorded in the handoff; do not use another public host to bypass a denial. No paid services, Instagram publishing or cloud sync are authorized by these instructions.
