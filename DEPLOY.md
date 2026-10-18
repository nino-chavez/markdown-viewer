# Deployment

Markdown Viewer is a static website on Cloudflare Pages. Documents are processed on the reader's device. There is no application server, database, upload endpoint, or runtime secret.

| Setting | Value |
| --- | --- |
| Production URL | https://markdown.ninochavez.co/ |
| Compatibility URL | https://nino-markdown-viewer.pages.dev/ |
| Custom domain DNS | Proxied CNAME `markdown.ninochavez.co` → `nino-markdown-viewer.pages.dev` |
| Cloudflare project | `nino-markdown-viewer` |
| GitHub repository | `nino-chavez/markdown-viewer` |
| Production branch | `main` |
| Build command | `npm run check && npm test && npm run build` |
| Output directory | `dist/site` |
| Node version | `26.10.0` |
| Deployment trigger | Cloudflare's GitHub integration on push |

Cloudflare Workers is the vendor's default for new sites. This project uses Pages because its Git integration is available through the existing account access. The Workers Builds API rejected that credential. Pages provides the required static hosting and automatic Git deployments without adding a CI credential or an application server.

## Custom domain

The official address is `markdown.ninochavez.co`, attached to this Pages project in the `ninochavez.co` zone. Associate a new hostname with Pages before creating its DNS record. Verify that the Pages domain becomes active and HTTPS serves the app. See [Cloudflare’s custom-domain instructions](https://developers.cloudflare.com/pages/configuration/custom-domains/).

The original `pages.dev` address stays available for existing installations. Do not redirect its file-launch address across origins: an installed app’s identity and file permissions belong to its origin. New installations use the official address. Existing Mac users must install from that address and assign the new installation in Finder before removing the old app.

The website sends `Cache-Control: public, no-cache, no-transform` so Cloudflare does not inject its Web Analytics script into the HTML. Keep this header on the standalone download too. The deployed privacy test caught analytics inherited from the custom domain; a Pages preview alone did not expose it. [Cloudflare documents this opt-out](https://developers.cloudflare.com/web-analytics/get-started/#sites-proxied-through-cloudflare).

## Release

Run `npm ci`, `npm run check`, `npm test`, and `npm run test:e2e` in a clean checkout. The browser suite checks both the standalone HTML and the website, including offline startup and document privacy. The local PWA test server listens only on loopback.

Push the branch and let Cloudflare build its preview. Confirm the preview's headers and offline behavior. Merge the reviewed PR after required GitHub checks pass; the push to `main` triggers production automatically. Do not race that build with a manual CLI deployment.

The downloadable backup is built at `dist/Markdown Viewer.html` and served by the website as `Markdown.Viewer.html`. Attach that file to versioned GitHub releases under the asset name `Markdown.Viewer.html`.

## Verification

Check the newest Cloudflare deployment's status and Git commit, then fetch the production page, manifest, service worker, and icons. The manifest must register Markdown extensions with `file_handlers`, use `display: standalone`, and keep a stable root `id`.

Run the deployed PWA checks with `VIEWER_BASE_URL=https://markdown.ninochavez.co npx playwright test tests/pwa.e2e.ts`. The update test is local-only; the deployed tests must not create a test endpoint.

Install using desktop Chrome on macOS, open a synthetic Markdown file through Finder's **Open With**, and repeat while the app is already running. After assigning Finder’s **Get Info → Open with → Change All**, verify a plain double-click for `.md`, `.markdown`, `.mdown`, and `.mkd`. Check the app opens offline after its public files are cached. Record native installation and Finder results separately from automated launch-handler tests.

The service worker caches an exact allowlist of public app files. Open document contents, images, and file handles must not appear in Cache Storage, IndexedDB, localStorage, or sessionStorage. Only theme and width preferences use localStorage. A test POST must be blocked by the page's content security policy.

## Updates and recovery

New versions wait until every viewer window closes. Never force a reload to apply an update: documents are session-only. Clearing site data removes the cached app; visiting the production URL online recreates it. Offline startup uses the root URL (`/`), which is also the install and Finder launch address. URLs with query strings are deliberately outside the cache allowlist.

To reverse a release, revert the relevant Git change through a reviewed PR and let the Git integration deploy it. Cloudflare's deployment history is also available for an urgent rollback. Both actions reverse shipped behavior and require an explicit rollback decision.

Administrative API access uses the existing 1Password item `Cloudflare account-ops claude-code`, fields `credential` and `account_id`. It is used only from the operator's machine, not stored in GitHub or the website. The CLI is `npx cf@1.0.0-beta.18`; inspect a command's schema before changing project configuration.
