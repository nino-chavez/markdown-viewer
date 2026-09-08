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

## Image and diagram feasibility

Assessed 2026-09-08. Both are feasible within the single-file, offline reader. Neither is implemented in v0.1.0.

### Images

Recommend embedded raster images and explicitly selected local images. A browser can display a selected file through a temporary object URL without uploading it. Folder selection also supplies relative paths, which can resolve references such as `images/chart.png`. See [File API image handling](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications#using_object_urls) and [folder selection](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory).

Opening one Markdown file does not grant access to its neighboring images. Add an explicit image or folder chooser. Match paths within that selection, reject paths escaping the selected folder, and report missing or ambiguous files. Release object URLs when documents close. Bound decoded image dimensions, file sizes, and total session memory; start with PNG, JPEG, WebP, and GIF.

Remote image loading is technically possible, but it makes network requests and reveals the reader's connection to the image host. Keep remote images blocked by default. A future explicit load action would need corresponding privacy copy and a deliberate network-policy change. Arbitrary SVG files and embedded HTML remain outside the initial image scope.

### Diagrams

Recommend bundling the full Mermaid library and rendering fenced `mermaid` blocks locally. Keep the original code available and show it when rendering fails. [Mermaid's rendering API](https://mermaid.js.org/config/usage.html#api-usage) supports this integration.

The alternatives tested were a full local bundle and Mermaid Tiny. A CDN or hosted rendering service would add a network dependency, so it does not fit the offline requirement. Tiny excludes mindmaps, architecture diagrams, and KaTeX; see [Tiny's documented limits](https://mermaid.js.org/config/usage.html#tiny-mermaid).

Local measurements with Mermaid 11.17.2 and esbuild 0.28.2:

| Artifact | Uncompressed bytes |
| --- | ---: |
| Released v0.1.0 viewer | 112,807 |
| Published Mermaid Tiny script | 2,555,146 |
| Full Mermaid bundle, minified IIFE targeting Safari 15 and Chrome 100 | 3,453,044 |

These measure library/download size, not runtime memory or a completed release with media support. Expect a viewer around 3.6 MB with the full library, before implementation-specific overhead and additional notices.

Use strict security mode, disable HTML labels and diagram click actions, sanitize generated SVG separately from document HTML, and keep the existing network restrictions. Lock security-sensitive configuration against document overrides using Mermaid's [secure configuration keys](https://mermaid.js.org/config/schema-docs/config.html#secure). Suppress Mermaid's own error artwork so invalid syntax leaves a readable source fallback in place.

### Evidence and remaining work

An isolated Chromium 153 prototype used the viewer's existing Content Security Policy and disabled browser networking. Flowchart, sequence, entity-relationship, mindmap, and architecture examples rendered. Selected-file and embedded-data PNG images decoded. The basic malformed-diagram and hostile HTML/click examples produced no HTTP requests or page errors. Rendered output was inspected; the initial malformed-input run exposed Mermaid error artwork outside the intended container, addressed with `suppressErrorRendering` in the prototype.

This establishes feasibility, not production readiness. The application source and dependency lockfile are unchanged. Before release, integrate document switching and cancellation, local-image path resolution, size/complexity limits, dark mode, print, accessibility, and third-party notices. Extend hostile-input checks to diagram configuration, image nodes, external styles, and SVG references. Folder selection and relative-image resolution are documented browser capabilities; they were not exercised in this prototype.
