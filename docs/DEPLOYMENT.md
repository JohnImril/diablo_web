# Deployment

The client runs on static hosting over HTTPS. For local development and preview, use localhost.

See the [deployment workflow](../.github/workflows/deploy.yml) and [Vite configuration](../vite.config.ts).

## App Assets and Updates

Deploy the complete `dist/` output, including the generated service worker, manifest, WASM assets, and source maps.
Source maps are public and fetched on demand for error diagnostics; they are excluded from the offline app cache.
The shareware archive `spawn.mpq` is also outside that cache and is downloaded into IndexedDB on first use.

Service worker registration is enabled only in production. Visible, online pages check for updates at startup,
every five minutes, when coming online, and on visibility changes. Updates wait for game activity to finish,
coordinate activation across tabs, and flush tracked storage writes before reloading. Failed or timed-out writes
block reload and expose in-memory save downloads. Test this behavior using `npm run build` and `npm run preview`;
the development server does not register the service worker.

The workflow passes the optional `VITE_WS_URL` secret at build time. Set it to your multiplayer backend's
`wss://` endpoint when building for HTTPS hosting. The engine worker (`src/modules/engine/adapters/game.worker.ts`)
uses this endpoint through the WebSocket adapter when the engine calls `DApi.use_websocket(true)`, providing
the WebSocket multiplayer path. The WebRTC bridge in `src/app/runtime/gameRuntime.ts` remains a separate
integration path; setting `VITE_WS_URL` configures the WebSocket endpoint rather than replacing that bridge.
The endpoint is resolved only when WebSocket multiplayer is selected. A missing or invalid endpoint cannot
prevent single-player startup; selecting WebSocket without a configured production URL reports an error.
Development or localhost falls back to `ws://127.0.0.1:8787/ws`; configured production URLs must use `wss://`.
For local setup and a two-player check, use the
[client connection guide](https://github.com/JohnImril/hellgate-ws/blob/main/docs/client.md).

## Hosting URLs and Search Discovery

When changing the host or base path, update these together:

- `BASE` in `vite.config.ts` and the fallback `public/manifest.webmanifest` start URL / scope.
- Canonical and social URLs in `index.html`, the canonical URL in `public/help.html`, and `public/sitemap.xml`.
- The sitemap URL in `public/robots.txt` and the public play/guide links in README.

The player guide is static HTML, linked from the app and available without JavaScript. Keep player-facing
instructions there, architecture in `ARCHITECTURE.md`, and hosting operations here; README stays a short entry point.
Check that `/diablo_web/help.html` returns the guide rather than an SPA fallback after deployment.

On GitHub project Pages, `public/robots.txt` is served at `/diablo_web/robots.txt` and does not control crawlers.
Only `https://johnimril.github.io/robots.txt`, managed by the origin's root site, can do that. Its absence does
not block indexing. Submit the project's sitemap URL directly in Search Console; if maintaining the root site,
add the sitemap there without replacing rules for other projects. Use URL Inspection to check rendered content
and the selected canonical URL. A sitemap does not guarantee indexing or ranking.

## Build Identity and Storage Resets

These values are embedded at build time. For local builds, set environment variables before `npm run build`;
the deployment workflow supplies the values described below.

| Value                       | Default / deployment source                                                                         | Effect                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_APP_BUILD_ID`         | Explicit environment value, then `GITHUB_SHA`, then package version; deployment uses the commit SHA | Identifies the build; does not itself clear IndexedDB data.                                                                       |
| `VITE_APP_ASSET_DATA_EPOCH` | `1`; deployment uses the repository variable of the same name, or `1`                               | A mismatch deletes non-save files in IndexedDB, including cached MPQ data. Workbox manages app caches separately.                 |
| `VITE_APP_SAVE_DATA_EPOCH`  | `1`; every deployment uses the repository variable of the same name, or `1`                         | An increase deletes `.sv` files and save metadata atomically with the new epoch. A decrease blocks storage without deleting data. |

Epochs are compared with the last values stored in each browser's database when storage initializes. Legacy
databases without this metadata are treated as epoch `1`. Ordinary builds preserve data when epochs stay the
same. Any asset epoch change clears non-save files. Save epochs must be non-negative decimal integers without
leading zeros: only an increase authorizes a save reset. Invalid save-epoch build values fail Vite configuration;
an invalid stored save epoch or a build epoch lower than the stored value blocks storage before any files or
metadata are changed. Reset deletions and epoch metadata commit in one IndexedDB transaction.
Changing a value on the hosting server without rebuilding does not change an already built client.

To deliberately reset saves, export them first, increase the repository variable `VITE_APP_SAVE_DATA_EPOCH`,
then build and deploy. Keep that value for subsequent deployments. Manual and automatic deployments use the same
stable variable; workflow run IDs never become save epochs. Re-running a deployment with the same epoch does not
reset saves again. The former `storage_reset` input has been removed to prevent temporary epoch changes.

If a previous deployment already used a workflow run ID as its save epoch, set the repository variable to that
value before the next deployment. Browsers already at that epoch retain their saves; browsers at a lower epoch
still perform the originally intended reset. Returning to `1` is blocked by the new client, rather than clearing data.

## Rollback

### Clients Compatible with IndexedDB v5

Roll back only to a client that opens version 5, participates in `diablo_fs:session` ownership, understands the
stored save format, and uses the current save epoch. Rebuild the chosen source revision with the current epoch
instead of deploying an old artifact with an obsolete epoch. This preserves saves; an older asset epoch may
still invalidate cached MPQs. Clients with the new epoch guard reject a lower save epoch without deleting data.
Earlier v5 clients without that guard still reset on any mismatch, so matching their epoch is essential.

### Legacy Clients Requesting IndexedDB v4

After a browser has upgraded to version 5, a v4 client fails to open the database with `VersionError`.
Closing tabs does not downgrade the schema, and the automatic schema upgrade has no reverse migration.
Do not delete browser storage as a rollback procedure. Prefer a v5-compatible rebuild. If returning to v4 is
unavoidable, export saves using the v5 client and use a separate origin/browser profile with fresh storage,
then import saves only if that client's format is compatible. Retain the original v5 storage until recovery is verified.
