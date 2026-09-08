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
