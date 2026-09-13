# Remaining work

## Delivery record

The source is public and the [Pages demo](https://ademord.github.io/gridsmith/) passed independent hosted journeys. The earlier permission hold is superseded by the owner's 13 September publication instruction. Final version 1.1.1 source/CI/download/live identities and delivery closure are recorded in the [release notes](https://github.com/Ademord/gridsmith/releases/tag/v1.1.1) and [Done milestone](https://github.com/Ademord/gridsmith/milestone/1). The feature findings from this pass are independently resolved.

## Device checks not yet available

- Test on a physical iPhone/Safari and Android phone: file picker/drop behavior, drag arrangement, import correction, downloads, storage recovery and guide focus. Automated Chromium/Firefox/WebKit results do not replace this.

## Maintenance follow-ups

- Rerun Windows WebKit when an allowed browser runtime is available. Code Integrity currently blocks its process before even a blank page loads. No OS policy was changed; Linux WebKit remains part of required CI.
- Review the nonfatal action-runtime deprecation notices in GitHub Actions and update action majors in a separately tested maintenance change. The current workflows pass with GitHub's Node 24 compatibility handling.

## Completed from the earlier TODO

- Added actual Firefox and WebKit engine coverage and separate CI jobs.
- Added independent irregular grid, border, mixed-aspect, large-gutter and partial-row cases, native pixel checks and original-image negatives.
- Evaluated full-size approved samples. Kept the existing 300 x 400 demo assets and added truthful sample/reference export labels; a larger sample pack is not needed for this release.
- Added repository-contained inventory/release tools, independent review rules and a current handoff.
- Published the approved sample demo on GitHub Pages and independently exercised its actual controls and exports.
- Made the demo invitation dismissible without covering the Library, with tour and import access retained in Help.
- Preserved photo selection when Help closes with Escape; ordinary workspace Escape still clears it.
- Corrected an asynchronous Undo/Redo test race. The exact test passes with delayed storage and rejects a deliberately broken Undo within its original time limit.

For a new defect, record an input, expected result, observed result and evidence before expanding the scope. Keep private uploads and backups out of public issues. No Instagram publishing or cloud sync is planned in this release.
