# Security — 0.4

The production path is isolated content script → authorized service worker → fixed Torn API endpoints, plus opt-in anonymous YATA stock export. It requires no bot/site/Discord account. No arbitrary URL or user-account API request is exposed to content scripts.

Torn keys are entered only in the same-extension options page. A 16-character key is verified with `/v2/key/info`; the returned owner ID determines account scope. Keys use the Authorization header exclusively for `https://api.torn.com/v2/…`, omit cookies and reject redirects. YATA receives no key, account ID or other personal fields. Provider error bodies are not echoed. Malformed/oversized payloads are rejected and dynamic display text uses textContent.

Chrome local and session storage are restricted to `TRUSTED_CONTEXTS` before messages are handled. Remembered keys stay in local storage; session-only keys are removed when Chrome closes. Chrome storage is not an encrypted vault. Public state/snapshots contain no credentials. Content scripts cannot read private storage, submit keys, inspect key status, change data providers or disconnect credentials. Only same-extension options pages can perform these actions. Strict message schemas and exact sender ID/URL/main-frame checks apply.

Old BOSBOT device/pairing records are removed locally during migration. This is not server-side revocation; users can revoke old bot capabilities on the old portal separately. No bot server is changed by this version. Layout/appearance/watches migrate; built-in preset membership is constrained and legacy extra widgets are preserved in CUSTOM.

All endpoint responses are shared/cached across tabs. Profile/travel/member reads use 30 seconds, wars 60 seconds, catalog prices one hour, chain 15 seconds. Only the chain uses Torn’s documented timestamp parameter for a fresh warning deadline. Invalid/revoked keys stop retries; rate limits back off. This does not reserve quota against other applications using the same account.

Foreign rows originate in Torn's shop catalog, not provider item names/country guesses. YATA quantities join only matching catalog country and item ID. Future/stale stock is unknown and cannot drive purchases/alerts. Return origins use a recent bounded visible route or an observed previous foreign destination; unresolved origins yield no products. The observer provides no secrets or arbitrary API selectors.

Company employee data is fetched only after a profile proves the director ID equals the key owner. Only name/ID/addiction effectiveness penalty is exposed; absent penalties remain unknown. Recommended targets use the active ranked-war opponent roster; no battle stats or fair fight are invented.

Alerts are serialized and deduplicated in trusted owner-scoped storage. Offscreen audio receives only fixed same-extension commands and plays a bundled WAV. Notification and sound outcomes are recorded separately. No Discord messages or gameplay actions are sent. Sleeping/closed Chrome cannot guarantee deadline delivery.

Chromium fixtures exercise actual extension load, key messaging/storage boundaries, rendering, migration, update identity, drag/save and notification/audio API completion. External provider transport is simulated; production account and physical speaker/OS notification acceptance are separate checks. ZIP distribution includes only runtime assets, never source/.env/credentials.
