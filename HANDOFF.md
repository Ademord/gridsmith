# Gridsmith handoff

Updated 7 September 2026. Gridsmith is a browser-local feed planner with a standalone approved-image demo. The repository is private. GitHub Pages is not deployed: the current account plan requires a public repository, and explicit approval for that visibility change remains pending. Do not change visibility or use another public host until approval arrives.

[Source](https://github.com/Ademord/gridsmith) | [CI](https://github.com/Ademord/gridsmith/actions/workflows/ci.yml) | [Releases](https://github.com/Ademord/gridsmith/releases) | [Done milestone](https://github.com/Ademord/gridsmith/milestone/1)

## Implemented

- Feed arrangement, multi-selection, keyboard moves, undo/redo, captions, planned dates, preview and named drafts.
- Reviewed collage import with explicit selection, crop inspection, manual equal-grid correction and exact Original mode. Flat gutters support unequal tiles, mixed rows, borders, large gaps and partial rows. Unresolved mosaics keep the original; manual correction cannot recover every irregular shape.
- Native crop pixels, transactional import and backup restoration, and retryable Undo/Redo when image or layout storage fails. UI and history change only after persistence succeeds. Browser crashes across the two storage systems are not claimed to be atomic.
- Four themes, narrow layouts, persistent unsaved-change notices and JSON/ZIP downloads.
- A 17-step tour plus direct manual grid-import sample. Tour edits require an explicitly marked demo sample. Imported photos, existing captions and drafts remain user work.
- Exports identify demo samples and fictional posted references, retain actual pixel dimensions, and distinguish previews from original files.
- Browser tests for Chromium, Firefox and WebKit, copied-file tests with network denied, exact crop-pixel oracles and restoration into empty storage.
- Repository-contained release inventory/checking tools, adversarial canaries and review rules that keep builders, reviewers, objections and evidence separate.

## Data and release boundary

The same 18 approved, previously unposted images remain at 300 x 400, with metadata removed. Three abstract cards are fictional posted references. Actual posted photos, original names, private captions, saved personal workspaces, recordings and private development history are excluded. The owner's original planner and full-size collection remain separate and intact. A larger full-size sample pack was considered; this release keeps the lightweight reviewed samples and reports their actual export quality.

The release used twelve workers: four builders, four separate critics and four whistleblowers. Reviews found crop/restore tests that could accept broken behavior, a storage-denied Undo defect, release-check omissions and a screenshot-header regression. Original failures were retained and every demonstrated defect was independently retested after its fix. See [review rules](docs/GOVERNANCE.md) and [release verification](docs/RELEASE.md). Engine checks do not establish physical-device or Safari behavior.

## Continue safely

Read [TODO.md](TODO.md) and [AGENTS.md](AGENTS.md). Use isolated test contexts and keep a private Save layout backup before trying updates. After source changes, build, test the affected cases, refresh screenshots when their UI changes, explicitly update the inventory, and inspect the full diff. Before release, run all required checks, obtain CI on the final commit, and compare the downloaded HTML with the reviewed artifact. The release notes and Actions provide exact commit/run identities without a self-referential document hash.

Done stays open until the approved Pages deployment loads the same build and its critical controls pass a live check. Local tests, remote CI, offline download and live hosting are separate gates. Missing approval remains blocked; do not turn it into a pass by omitting it.
