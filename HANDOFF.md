# Gridsmith handoff

Updated 13 September 2026. Gridsmith is a browser-local feed planner with public source and a verified [GitHub Pages demo](https://ademord.github.io/gridsmith/). The owner instructed publication after disclosure of the public repository and the same 18 sample images. This supersedes the earlier missing-audience-approval hold; the historical hold remains in the review record. Read the [version 1.1.1 release notes](https://github.com/Ademord/gridsmith/releases/tag/v1.1.1) and Done milestone for final source, CI, download/live identities and delivery status.

[Source](https://github.com/Ademord/gridsmith) | [CI](https://github.com/Ademord/gridsmith/actions/workflows/ci.yml) | [Releases](https://github.com/Ademord/gridsmith/releases) | [Done milestone](https://github.com/Ademord/gridsmith/milestone/1)

## Implemented

- Feed arrangement, multi-selection, keyboard moves, undo/redo, captions, planned dates, preview and named drafts.
- Reviewed collage import with explicit selection, crop inspection, manual equal-grid correction and exact Original mode. Flat gutters support unequal tiles, mixed rows, borders, large gaps and partial rows. Unresolved mosaics keep the original; manual correction cannot recover every irregular shape.
- Native crop pixels, transactional import and backup restoration, and retryable Undo/Redo when image or layout storage fails. UI and history change only after persistence succeeds. Browser crashes across the two storage systems are not claimed to be atomic.
- Four themes, narrow layouts, persistent unsaved-change notices and JSON/ZIP downloads.
- A 17-step tour plus direct manual grid-import sample. Tour edits require an explicitly marked demo sample. Imported photos, existing captions and drafts remain user work.
- The demo invitation now scrolls with the feed, can be dismissed independently of saved content, and stays dismissed through reload and tour exit. Help keeps both tour and sample import available. This fixes the invitation intercepting Library controls on a small screen.
- Exports identify demo samples and fictional posted references, retain actual pixel dimensions, and distinguish previews from original files.
- Browser tests for Chromium, Firefox and WebKit, copied-file tests with network denied, exact crop-pixel oracles and restoration into empty storage.
- Repository-contained release inventory/checking tools, adversarial canaries and review rules that keep builders, reviewers, objections and evidence separate.

## Data and release boundary

The same 18 approved, previously unposted images remain at 300 x 400, with metadata removed. Three abstract cards are fictional posted references. Actual posted photos, original names, private captions, saved personal workspaces, recordings and private development history are excluded. The owner's original planner and full-size collection remain separate and intact. A larger full-size sample pack was considered; this release keeps the lightweight reviewed samples and reports their actual export quality.

Version 1.1 used twelve workers: four builders, four separate critics and four whistleblowers. That review found crop/restore tests that could accept broken behavior, a storage-denied Undo defect, release-check omissions and a screenshot-header regression. This publication pass used three fresh specialist reviewers for experience, privacy and delivery. They independently closed the invitation overlap, Help Escape selection loss and an asynchronous Undo test race. Failed evidence remains available; no skipped expectation was used to obtain acceptance. See [review rules](docs/GOVERNANCE.md) and [release verification](docs/RELEASE.md).

The first corrected Pages deployment passed all 49 cases in each Linux browser engine and 24 release canaries. Independent anonymous desktop and narrow journeys verified the actual served HTML, all 17 tour steps, imports, native crop pixels, backups restored into empty storage and ZIP contents. Current local Chromium and Firefox checks passed; Windows WebKit is blocked by OS policy before a blank page loads. Linux WebKit coverage does not establish physical-device or Safari behavior. All 94 protected original image, layout, source-image and archive files matched the before/after hashes.

## Continue safely

Read [TODO.md](TODO.md) and [AGENTS.md](AGENTS.md). Use isolated test contexts and keep a private Save layout backup before trying updates. After source changes, build, test the affected cases, refresh screenshots when their UI changes, explicitly update the inventory, and inspect the full diff. Before release, run all required checks, obtain CI on the final commit, and compare the downloaded HTML with the reviewed artifact. The release notes and Actions provide exact commit/run identities without a self-referential document hash.

Local tests, exact-commit CI, an actual downloaded offline file and live hosting are separate gates. The release notes and Done milestone retain the final outcomes without making a document refer to its own commit hash. For a later release, close its delivery milestone only after every selected gate passes; record unavailable evidence honestly. Device and maintenance follow-ups remain in TODO.
