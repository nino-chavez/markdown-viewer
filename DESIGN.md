# Markdown Viewer

Readers need to open local Markdown reports and wide tables without installing
an editor. Success: open a file, understand its headings,
follow a link, and inspect a wide table without the whole page scrolling sideways.

Character: quiet, document-led, precise, familiar, spacious. Avoid dashboard cards,
marketing copy, compulsory projects, account setup, and hiding the document in chrome.

The outline reader is the chosen structure: it supports long reports while leaving source as an explicit
mode. The centered reader loses navigation; the workbench spends half the screen on
source a reader rarely needs. Wide mode handles tables within the same structure.

The app owns its visual system: cool gray workspace #f3f4f6, white document, ink
#202630, muted #606976, blue #235da6. System UI controls and Georgia reading text.
No external fonts or assets. A 44px minimum action target, visible focus rings,
semantic headings, keyboard shortcuts, and reduced-motion support are required.

States: empty (open/drop/paste/example), loading (status), document (outline/read/source),
invalid or oversized file (non-destructive error), empty file (explicit empty state).
Multiple opened files are session-only. Source files are never modified. Theme and
reading-width preferences may persist; document contents do not.

## Images and diagrams

Implemented for v0.2.0 on 2026-09-08. Preserve the single-file distribution, offline reading, and original Markdown. Images come from explicit file/folder selection or embedded raster data. Mermaid is bundled locally.

## Installation and offline use

The v0.3 delivery change preserves the existing layout, typography, reading controls, media restrictions, and session-only documents. The website and downloadable HTML share the same reader. The new controls sit at the bottom of the sidebar: Install app, App help, and offline readiness. The icon uses the existing M/down-arrow identity and palette.

The website uses the standard web app manifest, `file_handlers`, `launchQueue`, and a service worker. These follow [Chrome's file-handling contract](https://developer.chrome.com/docs/capabilities/web-apis/file-handling) and the [service-worker lifecycle](https://web.dev/articles/service-worker-lifecycle). Internal reference: `apps/rally-hq/src/service-worker.ts` and `static/manifest.webmanifest`; this reader needs only application-file caching, without Rally's push, accounts, or score synchronization.

Cache only a build-time allowlist of public app files. Keep document bytes, image bytes, names, and file handles in memory. The page's `connect-src 'none'` policy blocks fetch uploads. The service worker's separate policy permits same-origin downloads of app files. Opening an external link remains an explicit reader action.

Do not force an update into an open window. A new service worker waits until old clients close, then activates. The sidebar reports a waiting update without reloading or clearing documents. File launches are serialized so a second Finder launch cannot cancel an earlier one. A failed handle read leaves other documents intact.

Desktop Chrome is the Mac installation and Finder target. Other browsers retain the file picker and downloadable HTML. Register Markdown extensions only; do not claim `.txt` or change macOS defaults automatically. A file launch grants no neighboring-image access.

### Image access

Opening a Markdown file does not grant access to neighboring images. **Open folder** establishes a root for relative paths and opens the selected Markdown documents. **Add images** attaches files to the current document; a unique basename may resolve a loose attachment. **Choose document folder** supplies the current document's image root without importing other Markdown files.

Normalize paths within the selected root. Reject absolute paths and traversal outside it. Keep attachments with their document and release object URLs when switching or closing. See [File API image handling](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications#using_object_urls) and [folder selection](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory).

PNG, JPEG, WebP, and GIF headers are checked before decoding. Bound encoded size, decoded dimensions, total pixels, selected asset bytes, and image count. Remote images, arbitrary SVG, and embedded active HTML remain blocked. Markdown images become inert placeholders before document insertion; selected bytes become temporary image URLs only after validation.

### Mermaid rendering

Use the full Mermaid library. Tiny omits mindmaps and architecture diagrams; a CDN or hosted renderer would break offline use. See [Mermaid's rendering API](https://mermaid.js.org/config/usage.html#api-usage) and [Tiny's limits](https://mermaid.js.org/config/usage.html#tiny-mermaid).

Render fenced blocks in strict mode with HTML labels disabled. Reject document configuration, external resources, image/icon nodes, and oversized input. Lock [security-sensitive configuration](https://mermaid.js.org/config/schema-docs/config.html#secure). Sanitize generated SVG separately and display it as an isolated image document. Never bind diagram click handlers. Preserve the source and show it on failure.

Mermaid has shared configuration, so rendering is serialized. Each document activation invalidates stale work. Generate light and dark variants; printing waits for media and always uses the light variant. Hide successful diagram source in print while preserving failed-diagram source.

### Distribution and checks

The build bundles all runtime code and inventories full license notices for its included dependencies. This increases the download from the 112,807-byte v0.1.0 artifact to roughly 3.6 MB; the current release asset is the authority for exact size.

Chromium checks exercise local folder paths, document-specific attachments, raster decoding, source fidelity, document switching, resource limits, remote-resource blocking, five Mermaid types, theme switching, print styles, and automated accessibility. Rendered desktop and phone-sized views plus PDF output are inspected separately. These checks do not establish Safari, Windows, or physical-phone compatibility.
