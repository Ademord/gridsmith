# Version 1.1 review record

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

## Limits and remaining gates

Public GitHub Pages remains blocked on explicit visibility approval. The Done milestone remains open. A private source/offline release can record its completed parts without claiming the entire delivery is complete.

Desktop engine tests and narrow viewports do not establish physical iPhone, Android or Safari behavior. Firefox's test driver uses touch with a narrow viewport. WebKit on Windows rejects local files when its offline-emulation flag is set; the copied-file test instead denies HTTP/S before navigation and reload and checks that no requests occur. A separate critic reproduced that driver limitation. Actual OS symlink creation was unavailable locally; the Git symlink-mode canary passed.

Detection is a suggestion. Compressed unequal layouts and overlapping or rotated mosaics may fall back to the whole original. Cross-store failure handling is tested; browser-crash atomicity across localStorage and IndexedDB is not claimed. The review validator checks structure and hashes, not reviewer identity, honesty or whether an omitted objection exists.
