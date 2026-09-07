# Remaining work

## Required delivery

- Obtain explicit approval to make the reviewed Gridsmith repository public, including source and the 18 approved sample images. The current private plan cannot host Pages.
- After approval, enable Pages with GitHub Actions and dispatch `pages.yml`. Verify successful checks, the served HTML hash, and actual import, guide and export controls. Update pending hosting links and close Done only after that verification.

## Device checks not yet available

- Test on a physical iPhone/Safari and Android phone: file picker/drop behavior, drag arrangement, import correction, downloads, storage recovery and guide focus. Automated Chromium/Firefox/WebKit results do not replace this.

## Completed from the earlier TODO

- Added actual Firefox and WebKit engine coverage and separate CI jobs.
- Added independent irregular grid, border, mixed-aspect, large-gutter and partial-row cases, native pixel checks and original-image negatives.
- Evaluated full-size approved samples. Kept the existing 300 x 400 demo assets and added truthful sample/reference export labels; a larger sample pack is not needed for this release.
- Added repository-contained inventory/release tools, independent review rules and a current handoff.

For a new defect, record an input, expected result, observed result and evidence before expanding the scope. Keep private uploads and backups out of public issues. No Instagram publishing or cloud sync is planned in this release.
