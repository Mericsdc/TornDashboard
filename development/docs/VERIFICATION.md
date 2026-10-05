# Verification — TornDashboard 0.3.2 / BOSBOT 0.24.6

Verified 2026-10-05:

- Node 24 build, ESLint, strict TypeScript and **31 unit/API/distribution tests** pass.
- **Four Chromium flows** pass: responsive SPA recovery; an actual update of the installed folder preserving extension ID, BOSBOT device credential and preferences; legacy-state BOSBOT migration with drag/save and secret isolation; account pairing/live fixture/restart/revocation.
- Chrome loads the canonical root folder successfully with development sources nested inside it. Runtime files are replaced in that root, which keeps the existing installation path.
- Packaging uses a fixed allowlist of **11 runtime assets**. Independent `unzip` validation confirms filenames, archive checksums and extracted manifest. Source/backend/.env files are excluded. Incomplete staging is rejected before any installed file changes.
- The BOSBOT browser fixture verifies war opponent/hospital roster, flight destination/Japan market, filters, watched products, profit calculation, travel-only calculator visibility and director-only addiction penalties.
- Actual MV3 offscreen creation and bundled WAV playback resolve. Chain and stock alert delivery through Chrome notification/audio APIs succeeds; chain deduplication is shared across tabs. Domain tests cover stale/out-of-order/expired data suppression, first-stock baseline, threshold transitions, estimated restock reminders and new-hit rearming. Physical speakers and OS notification display require user acceptance.
- The earlier BOSBOT integration passed 303 Python tests locally and on the server's isolated Python 3.14 test tree. Tests did not use production secrets/database.

## Production service

Read-only checks on the actual host confirm `bosbot.service` is **active**, user `bosbot`, working directory `/opt/bosbot/current`, active release `/opt/bosbot/releases/bosbot.pjxbUf`. Health returns **0.24.6 Beta**. Source files match the final tested local integration:

| File | SHA256 |
| --- | --- |
| `dashboard/extension_feed.py` | `6969c61ced3d3d2a1b614724eec19809e3602d0e1a310f0a78e340ce0b34907e` |
| `dashboard/extension_personal.py` | `7438bd8a00fd319386b27334c690e89cd556e80c76d633db305f23a26f808fe3` |
| `dashboard/data.py` | `43f2e8ee7fcd7bedc39eca14bcdcd1686fcaa4f160b6453a66bcac4d2d32434e` |

No further installer invocation is required for 0.24.6. Production credentials, data and service configuration were not changed during project consolidation. The extension is named **TornDashboard**; its existing absolute unpacked folder path was preserved.

## User acceptance

Reload the existing extension in Chrome, then Torn. Options should show a verified live BOSBOT feed. Compare an actual flight destination/products, current war roster and chain with the BOSBOT portal; check owner/member permissions, watched-product alerts and audible output. Build/fixture/service-health evidence does not prove a specific user's logged-in Torn session or physical sound output.

The images in this directory show controlled fixtures, not private production account data. The localhost preview is explicitly MOCK. Chrome must be running and awake for alerts; background alarms can be delayed.

GitHub verification/release workflow runs on Node 24, installs Chromium and repeats the checks. A version tag must match the manifest before a release is published. Its constant asset name is `TornDashboard.zip`. Chrome Web Store distribution is a separate step; GitHub releases do not automatically update an unpacked Chrome installation.
