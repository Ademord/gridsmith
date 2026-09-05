# Security and storage

Gridsmith runs in the browser. It uses localStorage for layouts, captions, dates, drafts and the chosen theme, and IndexedDB for imported image data. It does not upload photos, contact Instagram, collect analytics, or provide cloud sync. GitHub Pages receives the normal requests needed to serve the page.

The public source and demo include 18 owner-approved, previously unposted generated images, resized to 300 × 400 PNGs with metadata removed. Three abstract cards serve as fictional posted references. Actual posted photos, the original personal image collection and saved personal workspaces are excluded. The bundled samples are public; photos you subsequently import remain in your browser until you choose to download or share them.

**Save layout downloads your data.** The JSON backup contains your imported images and text. Exported ZIPs contain image files and captions. Keep these downloads private when they include private material; do not commit them to this repository or attach them to a public issue.

Browser storage can be cleared, blocked or exhausted. An import is committed only after image and layout storage accept it; a failed import reports the problem in its review dialog. Other edits can remain visible even when persistence fails. The persistent **Unsaved changes** notice identifies this state; download a backup before reloading. Moving to a different site origin or browser does not transfer existing data automatically.

Image and layout files are untrusted input. Import review limits each batch to 20 files and 100 MB, with a 30 MB per-image limit. Captions are treated as text. Formula-like captions receive an apostrophe in CSV exports; the JSON manifest retains their exact text. These measures and the automated checks are not a security audit or a guarantee against every malformed file.

To report a security issue, use the repository's private vulnerability reporting option if the owner has enabled it. Otherwise contact the owner privately through a channel they publish. Do not post private photos, backups, credentials, or an exploit containing someone else's data in public issues. No private reporting channel or response-time commitment is assumed here.
