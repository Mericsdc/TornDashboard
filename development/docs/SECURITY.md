# Security

The live Chrome data path is content script → service worker → BOSBOT only. It accepts no Torn credentials and has no arbitrary URL/account fetch method. BOSBOT provider keys and Discord/site credentials stay on the server. Device tokens are account-approved read-only capabilities, scoped to the exact server origin and extension ID.

Both Chrome local and session storage use `TRUSTED_CONTEXTS` before messages are handled. Public state contains preferences/layouts/favorites only. The Torn page, content script and public replies cannot read device credentials. Chrome local storage is not an encrypted vault; revoke a lost browser at BOSBOT `/extension/devices`. Legacy Torn/companion session credentials are removed on first 0.3 migration.

Same-extension options pages may pair, disconnect, change the server origin, refresh data and test sound. Only top-level HTTPS Torn content scripts may read authorized widget data and change dashboard preferences, layouts and favorites. Messages are strict-schema validated. Content cannot change connection origins or request pairing credentials. Optional host access is requested from the options page only. Client redirects, cookies and credential URLs are rejected. Errors never echo provider bodies or secret URLs.

BOSBOT pairing requires current site identity, exact website Origin and CSRF validation. Polling secrets/device tokens are hashed in SQLite; approval is single-claim and expires after five minutes. Device validity and current account/page access are rechecked on every feed read. Ten browsers per account; 30-day device expiry; bounded/rate-limited pairing, polling and reads. Failed remote disconnect removes local credentials and instructs the user to revoke on the website. Existing site CORS/CSRF/CSP remain intact.

Private flight profile ID must match the BOSBOT account's verified Torn ID. Company employees are fetched/exported only when a current company profile matches that account's director ID (60s cache); employee observations expire independently. API keys are not returned by those views. Addiction fields are effectiveness penalties, not fabricated player stats. No salaries, working stats or director write actions are exposed in the extension contract.

Dynamic provider text uses textContent. Shadow DOM isolates CSS, not security. Offscreen sound accepts a fixed same-extension command and plays a bundled WAV; it has no keys or external network access. Persistent alert baselines/deduplication are device-scoped and remain in trusted storage. No Discord messages are sent by the extension.

Automated Chromium tests verify pairing, restart persistence, revocation, private storage denial, role denial, BOSBOT-only migration and actual offscreen sound/notification API completion using deliberately invalid test credentials. They never access production accounts.

The optional Fastify development service has its own bounded/schema-validated REST and WebSocket foundation. It is not used by the production extension; it accepts no Torn credentials. PostgreSQL queries are parameterized; configured database failures fail startup instead of silently discarding data. Non-loopback binding requires a development API token and explicit origins.
