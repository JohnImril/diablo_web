# Deployment

The client runs on static hosting over HTTPS. For local development and preview, use localhost.

See the [deployment workflow](../.github/workflows/deploy.yml) and [Vite configuration](../vite.config.ts).

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
leading zeros: only an increase authorizes a save reset. Invalid build values fail Vite configuration; invalid stored or older save epochs block storage before any
files or metadata are changed. Reset deletions and epoch metadata commit in one IndexedDB transaction.
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
