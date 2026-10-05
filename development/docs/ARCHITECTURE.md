# 0.3 live path

All production Chrome reads are BOSBOT-only: content script → authorized service worker → account-bound BOSBOT snapshot. Legacy mock/companion settings are migrated on first update; preview/backend mocks are development fixtures only. Personal travel and company data use the server-held verified account key, and company employee penalties require a current director profile check. New travel filters/profit and alert decisions live in shared pure domain modules. Alert state is scoped to the device, persisted in trusted storage and serialized separately from network requests. Offscreen audio and Chrome notifications handle delivery; content ticks supplement background alarms.

# Architecture

## Extension

`bootstrap → Dashboard → Panels + WidgetManager + DragDrop + TornObserver`. Registry owns definitions, each factory owns its mounted instance. A typed EventBus reports mode/layout/error events. ModeManager resolves manual or automatic modes, with a current active flight taking precedence over active war. Each mode has an independent persistent layout.

All dashboard nodes live under one open shadow root (`#tcd-dashboard`). The root is for CSS isolation, not a security boundary. No secrets appear anywhere in the dashboard. Text from providers is inserted with textContent; dynamic strings never become HTML.

TornObserver finds a content anchor (`#mainContainer`, `#main-content`, `.content-wrapper`, `main`, `.main-wrap`), measures its rectangle and unions detected sidebars. When both gutters can fit the requested width, the two panels use measured content edges. Otherwise the host moves after the anchor as an in-flow responsive grid; if no anchor exists, it appends to body. Content is never squeezed, wrapped or given hardcoded offsets. MutationObserver catches document replacement; ResizeObserver catches content geometry changes; resize/scroll/history events and a lightweight URL/connectivity check trigger placement. Internal shadow DOM changes do not retrigger document observation. All listeners, timers, sortable instances and widgets have cleanup paths.

Content script has no arbitrary fetch/key methods. It uses a `DashboardStore` interface backed by Chrome runtime messaging. Worker serializes state mutations to avoid lost concurrent patches. Storage contains a versioned public state and a separate trusted account device capability. Full schemas validate settings, layouts, favorites, messages, and snapshots. `rememberPositions=false` stores moves in the current Dashboard instance only. Turning it back on resumes the last persisted layout; a subsequent move saves again.

Options is an extension page with a stricter role. It handles BOSBOT pairing, the connection origin, reset, alerts and product watches. Optional host permission is requested only for the configured HTTPS BOSBOT origin, never from the Torn page.

## Backend and data

Fastify REST:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Version, adapter and explicit mock status |
| `GET /v1/snapshot?scenario=normal|travel|war` | Validated mock war/travel snapshot |
| `POST /v1/observations` | Bounded stock observation ingestion |
| `GET /v1/stocks/:itemId?country=...` | Last seen, interval history and prediction |
| `POST /v1/ws-ticket` | Authenticated, single-use 30-second stream ticket |
| `WS /v1/stream?ticket=...&scenario=...` | Initial snapshot, periodic snapshots, stock events and ping/pong |

Observation timestamps are epoch milliseconds. Example body: `{"itemId":206,"country":"Switzerland","stock":0,"observedAt":1791150000000,"source":"manual"}`. Use a current timestamp; writes accept only the last 30 days, with at most five seconds of clock skew. Zero→positive history supports estimated windows; no observation infers an exact event time.

`ObservationRepository`: memory ring/history cap or PostgreSQL parameterized queries with uniqueness/index. `Cache`: expiring memory or Redis. Empty connection URLs choose in-memory development adapters. Configured failures stop startup. REST and WS snapshots remain explicit mock fixtures; ingested observation history is queried separately until a production provider is implemented.

The current backend is a single-user, single-process companion foundation. Production multi-user operation needs user authentication/ownership, encrypted key vault if server-held keys are ever required, tenant-scoped repositories/cache, ingestion validation/provenance, retention, and shared Redis tickets/pubsub. No authenticated Torn data is currently accepted by the backend.


## BOSBOT provider (0.3)

Content → worker → `BosbotApi` → existing BOSBOT HTTPS server. The Fastify companion remains optional; its mock/stock/WS foundation is preserved. BOSBOT’s `dashboard/extension_api.py` handles account approval and read-only device scope; `extension_storage.py` holds hashed credentials and atomic single-use claims. `extension_feed.py` adapts portal caches into the shared snapshot contract, filters permission-denied sections and masks level-model stat fallbacks. The restock portal reuses the monitor’s current observed payload where available. Target status refreshes independently from battle-stat providers. Chain uses a shared 10-second central cache, not one Torn call per installation.

Missing war/chain/travel sections are null with public issue messages. Source strings and ranking are rendered as text. BOSBOT scoring lives on the server; local scoring weights continue to apply to mock/companion data. All transport timestamps are milliseconds. Pairing tokens and secrets never enter Dashboard state. DATA_CHANGED invalidates open tab snapshots immediately after pairing/disconnect; regular data refresh is 15 seconds. A ten-second worker snapshot cache shares reads across Torn tabs, preventing duplicate calls and device rate-limit collisions.
