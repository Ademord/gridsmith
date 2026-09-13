# Review records

## Version 1.1.1 — 13 September 2026

Demo SHA-256: `9c3ed5286e44f8a69cebd17abbb6bce076c81cd87c2f4a6e4da22624ee7ffe76`. This release moves the demo invitation into the document flow, adds dismissal as a separate browser preference, and keeps the tour and sample import accessible from Help. Escape in Help now preserves the selected photos beneath it; Escape in the workspace still clears selection.

Three fresh reviewers cover experience, privacy and delivery. The experience reviewer reproduced the invitation intercepting Library expansion at 320 × 640, then verified the correction at 1440 × 1000, 390 × 844 and 320 × 640. Review also found that Help Escape cleared selection in both version 1.1 and the first candidate. Original failure evidence is retained outside the repository. Each correction requires a separate reviewer before release.

The suite now has 49 browser cases, including actual Library interaction before dismissal, persistence through reload, accessible Help re-entry, selection preservation, and blocked preference storage. Twenty-four release canaries passed. Exact source-commit CI, release-download parity and live Pages journeys are separate delivery gates; the versioned release notes record their final identities and outcomes.

Windows Chromium and Firefox are tested locally. Current Windows WebKit cannot create even a blank page: independent minimal reproductions and Code Integrity events identify an OS policy blocking its browser process before Gridsmith loads. The failure is retained; no browser version, assertion or security policy was changed. The complete WebKit suite remains required in Linux CI. The earlier Windows WebKit pass below is historical, not a claim about this release.

The privacy reviewer compared the starting 80-file tree with the earlier independent audit and checked all reachable history, remote branches/tags, both existing release downloads, nine Actions artifacts and six run-log archives. Only the same reviewed images, historical demo HTML, test result files and expected runner logs were found within this bounded review. New source, screenshots and the final inventory require a separate delta review. Private original images, personal layouts and recordings remain excluded.

The owner's 13 September instruction to publish follows the earlier disclosure of the public repository and same 18 samples. It supersedes the historical missing-audience-approval hold below for the selected GitHub Pages route. It does not approve a new image collection, another host or a paid service. Actual hosted evidence is still required independently of that permission.

## Version 1.1 — historical record

Reviewed 7 September 2026. Demo SHA-256: `c64c78f95b59c445d75868e6c7a2054fce6517dfe80473c6fd9bb822d296de9a` (5,345,532 bytes). This identifies the tested app, not a claim about a future source commit.

The local suite passed 45 tests in each of Chromium 151, Firefox 153 and WebKit 26.5 on Windows, with no skipped cases. Twenty-four release canary tests passed. The committed workflows rerun the browser suite on Linux and the release checks on the exact source commit. Use the release notes and Actions run for remote evidence; local results do not substitute for it.

Twelve workers ran in waves: four builders, four separate critics and four whistleblowers. The lead integrated changes. Critics first set behavioral expectations, then inspected actual artifacts. The demo critic opened the actual DWC Call Manager demo and compared desktop and narrow layouts; this was a nonblind comparison, with no claim of an overall visual win.

| Finding | Resolution and independent verification |
| --- | --- |
| WT-001: solid-color crops could pass the old tests | Tests now compare source pixels and reading order. The import critic verified 13 independent cases and confirmed that both strengthened pixel tests reject the retained broken crop version. |
| WT-002: a no-op restore passed the old copied-file test | The test clears image and layout storage before restoration, then checks bytes, metadata and reload. The browser critic confirmed that the retained no-op version fails in Firefox and WebKit. |
| DATA-04: failed Undo could mismatch an image and caption | Undo/Redo persist image changes and layout before changing UI or history. A separate critic reproduced the original failure and verified 24 storage-fault cases across three engines, including same-ID replacements and retry. |
| R02–R05: release scanning accepted extra bundled metadata and common escaped paths | The release critic added strict record keys and escape decoding. The governance whistleblower independently retested the fixes and narrow legacy compatibility. |
| FRAME-01: screenshot header controls stopped grid detection | Frame removal now precedes gutter detection. The import critic verified 15 exact crops and partial-row disclosure on a synthetic fixture, proved both earlier faulty versions fail it, and checked all imported native pixels privately on the original screenshot. |
| GOV-01: a review record could omit selected delivery gates | The validator now requires hosted verification and downloaded-release parity separately. The governance whistleblower verified that either omission fails. |

The demo critic independently passed nine cases plus two narrow interaction checks: explicit crop confirmation, cancellation, reset/undo, all 17 tour steps, preserved edits and truthful ZIP labels. The import critic checked exact native crops, negative controls and fallback for unsupported layouts. Original failure reports and separate resolution records remain in the local audit archive; browser recordings and private workspaces are excluded from the repository.

All 18 approved sample PNGs retain their reviewed bytes. Generated reference cards and test fixtures are separately pinned. The complete outgoing tree and reachable history are checked; this is a scoped content review and pattern scan, not a guarantee against arbitrary hidden data. Five current documentation screenshots were independently inspected.

### Limits and remaining gates at the time

On 7 September, public GitHub Pages was blocked on explicit visibility approval and Done remained open. A private source/offline release could record its completed parts without claiming the entire delivery was complete. The later authorization is recorded above; it does not retroactively turn the earlier blocked delivery into a pass.

Desktop engine tests and narrow viewports do not establish physical iPhone, Android or Safari behavior. Firefox's test driver uses touch with a narrow viewport. WebKit on Windows rejects local files when its offline-emulation flag is set; the copied-file test instead denies HTTP/S before navigation and reload and checks that no requests occur. A separate critic reproduced that driver limitation. Actual OS symlink creation was unavailable locally; the Git symlink-mode canary passed.

Detection is a suggestion. Compressed unequal layouts and overlapping or rotated mosaics may fall back to the whole original. Cross-store failure handling is tested; browser-crash atomicity across localStorage and IndexedDB is not claimed. The review validator checks structure and hashes, not reviewer identity, honesty or whether an omitted objection exists.
