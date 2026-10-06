> Historical 0.3 integration. TornDashboard 0.4 uses personal Torn API + opt-in YATA and does not call or deploy these patches.

# BOSBOT integration

TornDashboard reads the BOSBOT browser-device API; it does not run an additional server or scrape Discord messages. Existing BOSBOT users share common stock/war/chain observations while personal flight and director data stay account scoped.

The Python integration was developed in `Mericsdc/TornBOSBOT`. These source patches preserve that work after duplicate release archives were removed:

- `from-0.24.4.patch`: full extension integration relative to bot commit `ae19932772897d4cde1b41461c3e97bc1c896c02`.
- `from-0.24.5.patch`: incremental upgrade for the previous active 0.24.5 release, including personal travel, pricing and director views.

These are reference source patches, not an automatic production deployment command. Apply only against the matching source after checking with `git apply --check` or `patch --dry-run`; retain the bot's normal SQLite backup/rollback release process. Service credentials and databases are not included. Later bot changes belong in the TornBOSBOT repository.

On 2026-10-05 the actual `bosbot.service` was active with working directory `/opt/bosbot/current`; health returned **0.24.6 Beta**. Active `dashboard/extension_feed.py`, `dashboard/extension_personal.py` and `dashboard/data.py` hashes matched the tested integration source. There is no additional pending installer step for this version.

Browser flow: Options → Connect BOSBOT account → website login → compare browser identity → approve → device-scoped snapshots. Real Torn account/widget acceptance still needs a logged-in user; automated tests use an isolated fixture.
