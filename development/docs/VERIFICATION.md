# Verification — TornDashboard 0.5.1

2026-10-06. Local Node 24 checks pass: ESLint, strict TypeScript, **99 unit/API/backend/distribution tests** and **nine real unpacked MV3 Chromium flows**. The production build and deterministic 12-asset ZIP package pass. `npm audit` reports zero vulnerabilities after updating the development-only shell-quote dependency.

New domain tests exercise every Torn country through outbound, abroad, return, reload, landed and safe finalization; newer page phase versus cached API enrichment; stale countdowns after landing; cancelled return intent; next-trip rollover; pre-owned/removed/unchanged inventory; unknown-category coverage; single/multiple products; page/log deduplication; stale price ranges; partial prices; capacity fallbacks/method changes; resource projection; frozen historical valuations; bounded history; known-duration hourly aggregates; persistent SWR reads, coalesced refreshes, outages, worker recreation and owner isolation.

Provider tests use current Torn-shaped inventory timestamps/categories, Full/custom/Minimal log permissions, Item abroad buy receipts, bars/perks, fixed authenticated headers, cache restoration, one-hour inventory caching and bounded safe pagination. Existing connection/rate-limit/retry/sanitized-error, YATA country join, chain/stock/restock alert, backend and package-promotion checks still pass.

Browser coverage:

1. Actual Chrome host access restriction, rejected permission request, connection retry, anonymous diagnosis and failed key replacement retaining the previous credential.
2. Responsive 340px gutters, explicit Save, Comfortable without edit handles, Arrange toggle, SPA remount and narrow fallback.
3. Same installed folder update preserves extension identity/key/preferences.
4. Legacy BOS migration, dragging/reload, CUSTOM membership and trusted-storage/key-action restrictions in content scripts.
5. Destination-only compact watches with YATA stock, Add through Options, retired cards absent, key removal and cross-tab cache sharing. Capacity remains covered by the trip/provider tests.
6. WAR chain/opponent data, unknown stats, actual offscreen WAV/notification API delivery and deduplication.
7. Director-only company data, CUSTOM/ WAR behavior and Options saves preserving appearance edited on Torn.
8. Native Chain: deliberately mismatched API/native counts and timer; synchronized display/30s warning; zero immediately clears progress; a later real provider refresh cannot revive old hits; noisy DOM changes do not spam worker checkpoints; a frozen counter expires locally during provider outage.
9. Complete Travel session: outbound → shop/bag snapshot → one successful purchase → failed purchase → ambiguous response corroborated by bag increase → multiple products → immediate return while shop DOM disappears → final API log recovery without double counting → refresh → browser/worker restart → API outage → old market price still usable → safely completed trip/history. The compact sidebar appears only after purchases, full receipt details expand, and no center Travel dock or duplicate status/restock is created. The MAIN-world observer consumes real page fetch responses in the test; UI state is updated through the actual worker/data layer. The clock is advanced in both worker and isolated content worlds to test long flights/cache ages without unnecessary real-time waits.

`travel-preview.png`, `travel-return-preview.png`, `chain-ended-preview.png` and `war-preview.png` are controlled fixtures, not the user's Torn account. Screenshots were inspected for layout. API transport in these tests is simulated with official-shaped responses; authenticated production account values, current Torn shop response variants, physical speaker output and OS notification presentation remain **user tests required**. No personal key was used.

GitHub Actions repeats lint/typecheck/unit/build/browser/package checks on Linux/Node 24. Tags must match manifest/package version. Only `TornDashboard.zip` plus `SHA256SUMS` are distributed. The canonical root path stays unchanged; generated dependencies/preview/backend/test output are removed after verification. GitHub releases do not automatically update an unpacked Chrome installation: reload the same installed folder, or use the same Web Store listing for automatic store updates.

[Current chain/compact Travel implementation and manual acceptance checklist](COMPACT-TRAVEL.md). [Persistent trip data engine and API limitations](TRAVEL-REFACTOR.md).
