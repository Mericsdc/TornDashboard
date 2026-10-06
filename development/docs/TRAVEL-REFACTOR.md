# Travel refactor — TornDashboard 0.5.0

## Architecture and root cause

The existing Vanilla TypeScript widgets, storage broker, TornApi wrapper, TornObserver anchors and local alert engine are reused. There is one authenticated fetch system, in the service worker. The optional companion backend remains outside this extension's live data path.

```
Torn DOM + passive shop response observer
                ↓ normalized observations
        TravelDataStore / state machine
                ↔ trusted, owner-scoped Chrome local storage
                ↔ existing TornApi + anonymous opt-in YATA
                ↓ inventory / purchase / valuation engines
        normalized snapshot.travelApp + snapshot.stocks
                ↓
        sidebars / TravelDock / Options history
```

`travelApp` owns travel, active trip, inventory, market price history, bag, resource bars, derived profit and completed history. `snapshot.stocks` supplies normalized foreign shop observations/restock predictions; public preferences supply watched products. Widgets never issue raw provider requests.

Previously, refresh failure cleared the snapshot, the center dock expired after 90 seconds, Travel Status discarded old observations, and the last foreign country existed only in worker memory. Price validity was incorrectly coupled to stock freshness. These paths are replaced by persistent sessions and cache-first reads. Cached values stay on screen while a coalesced background refresh runs. The message mutation queue only commits results; it does not wait on network fetches.

## Detection and transitions

- **AT_HOME**: Torn profile reports normal/home status and travel has no remaining flight. Selecting a country on the travel page creates a preview, not a trip.
- **OUTBOUND**: travel time remains and destination is foreign, or a visible Torn → foreign flight is observed. This creates a persisted trip.
- **ABROAD**: profile reports Abroad or a verified foreign shop response is observed. Country aliases normalize across all 11 Torn destinations.
- **RETURNING**: the return button or passive return request is observed immediately; Torn travel destination becomes Torn with flight time remaining. Origin and market context are copied from the persisted session. A visible foreign → Torn route can establish context even if the worker has restarted.
- **LANDED**: a known arrival deadline passes locally. The session remains until an API home confirmation and a short stabilization period; Full/custom log access additionally requires a completed purchase-log refresh after that confirmation.

Stale or conflicting phase observations cannot regress a return to Abroad or switch an active trip's country. A matching cached API response may enrich departure/method/arrival fields without overwriting a newer page phase. Known flight deadlines are preserved when a sleeping or stale DOM countdown returns. A new outbound departure after the previous return's known arrival proves a new trip; the previous ledger is archived, with incomplete evidence marked if final logs were unavailable.

An unconfirmed return intent can be rolled back by a new ground observation from the API after stabilization (for example a cancelled confirmation); the same session and foreign context remain intact. Confirmed flight routes never regress from late shop responses.

The market country remains the last foreign country through RETURNING and LANDED. Completion clears temporary context only after saving history. A foreign shop response from another country cannot update the active market.

## Purchases and inventory

The `/user/inventory` adapter requests only categories relevant to the destination, excludes faction-owned items and retains Torn's actual inventory timestamp. The reusable diff computes added, removed and unchanged quantities only for IDs covered by both snapshots. Pre-owned items are subtracted; category failures cannot look like removals. Inventory baseline and departure snapshots persist with the session.

Torn caches inventory per category for **one hour**. It cannot prove live shopping. The preferred evidence is `/user/log`, filtered to the official **Item abroad buy** log type (resolved via `/torn/logtypes`, known type 4201 fallback). It requires a Full key or custom log permission. Actual receipt quantities and costs are preserved. Pagination is bounded and only safe cursor values on the fixed Torn endpoint are reused.

With a Minimal key, a small MAIN-world script passively observes the player's own `travelData` shop/buy responses. It makes no requests and exposes no keys or extension APIs. Only explicit successful responses become receipts. When a response is ambiguous, a bounded purchase candidate can be corroborated by a matching own inventory or bag increase within ten seconds; it is marked lower confidence. Failed responses never count. Browser navigation/reload cannot erase receipts already stored.

API log IDs deduplicate repeated refreshes. Page and API receipts are matched one-to-one by item, quantity and time so recovering logs never doubles a purchase. Items must belong to the active foreign shop and trip window. Unexplained additions remain unconfirmed, not purchases. This cannot prove that a coincidental gift matching an ambiguous page request was a shop purchase; corroborated records are visibly low confidence.

## Capacity, prices and profit

Capacity priority: current shop bag counter → remembered total for the same travel method → inferred base/method/general travel perks → one-time total override in Options. Category-specific and unknown multiplier perks are not treated as exact totals. Known cached values are preferred to blank fields. Usage is obtained from the page, or estimated from confirmed purchases when complete logs exist; consumed/transferred items may make that estimate differ, so it is labelled. The old manual free-slot setting is retained only for migration compatibility and is never interpreted as total capacity.

Torn `/torn/items` supplies foreign shop country/cost and Torn `market_price`. Values are cached independently of YATA quantities. Visible shop prices receive their own observation time. Old stock quantities remain last observations and cannot trigger freshness-dependent alerts or exact purchase recommendations. Prices remain usable with age labels: high confidence up to 30 minutes, medium up to two hours, lower thereafter. If at least two recent observed price points exist, a low-confidence range uses their observed min/max; no arbitrary percentage band is invented.

For every purchased item:

```
cost = sum(actual receipt costs; catalog fallback explicitly lowers confidence)
market value = purchased quantity × current / last-known Torn market price
estimated profit = market value − cost
ROI = estimated profit ÷ cost × 100
round trip duration = return arrival − outbound departure
profit/hour = estimated profit ÷ round trip hours
return-flight profit/hour = estimated profit ÷ inbound flight hours
```

Totals require the relevant cost/value fields; missing prices leave quantity/cost visible. Multiple products use a compact table. Outbound forecasts show potential gross profit using observed stock and automatically detected free capacity. Their hourly forecast uses twice the current flight duration and is explicitly labelled as excluding shopping and assuming stock remains available. This forecast never becomes a purchase record.

The manual budget/capacity/round-trip/fee calculator and Optimize Bag controls have been removed from the live UI. Trip Profit uses the ledger automatically. RETURNING displays Trip Profit beside Landing Summary. OUTBOUND shows Travel Market; ABROAD shows Shop Assistant and recorded purchases. No timers create API calls.

Energy, nerve and life predictions use current API bars, supported increment/interval/next-tick values and the known arrival deadline, capped at the reported maximum while preserving existing over-cap values. They assume no use or boosts. Unsupported or old regeneration data produces a waiting value, not a fabricated prediction.

## Persistence, history and fallbacks

Trusted `travelDataV1` is scoped to the API key's verified owner. It contains the normalized snapshot, endpoint cache, stock history and bounded pending page receipts. Worker/browser restarts hydrate it before revalidation. Key permissions are checked afresh; raw log responses are not persisted. Reconnecting the same account keeps its trip. Switching accounts exposes no previous owner's session. Disconnect removes the key and clears visible data; saved trips remain private to the matching owner.

History retains up to 100 completed trips / 90 days and is further trimmed by encoded storage size. Price observations at completion are frozen with the archive so future market changes cannot rewrite the historic estimate. Options shows 30-day totals, best country/item and hourly profit for trips with a known duration. Incomplete evidence is labelled. Actual revenue/profit fields are separate and initially null.

Restock history retains at most 128 observations per product over seven days. Predictions require at least three observed zero-to-positive replenishments with bounded gaps. Own shop observations and YATA observations merge without replacing newer page values. Return travel keeps the foreign market, last stock/time, confidence and estimated window visible. An expired estimate remains labelled as a previous window, not an upcoming guarantee. Empty watched products use `0 / + Add`.

Quality states support loading, fresh, cached, stale and errors with/without cache. UI priority is valid current data → saved values → “Waiting for travel data…”. Failure of one field does not erase the whole widget. Account changes are the deliberate exception: another account's private data is cleared.

## API limitations / live acceptance

- A Minimal key cannot recover unobserved purchases made on another device. Use Full or custom Item abroad buy permission for that coverage. A trip first observed mid-flight may lack a baseline or outbound duration.
- Inventory is server-cached for one hour. Pure inventory additions cannot distinguish shopping, gifts and transfers.
- Torn has no exact foreign stock/restock schedule in this API. YATA stock is community-observed; stock at landing cannot be guaranteed.
- Exact capacity is not provided by `/user/travel`. Cached/inferred/manual totals remain labelled until a shop counter is observed.
- Market value applies to purchased quantities and assumes they remain available for resale; later consumption/transfers can reduce the bag contents. It is an estimate before selling fees and travel costs, not guaranteed sale revenue. Generic sales of fungible items cannot reliably identify which trip's units were sold alongside pre-owned stock. **This release does not automatically attribute actual sales.** Actual profit remains null; it is never silently replaced with the estimate.
- Resource projections require supported regeneration data and assume no intervening consumption/boosts. Sleeping/closed Chrome can delay notifications.
- Tests use controlled external responses inside a real unpacked MV3 extension. The user's authenticated Torn account, current Torn shop response variants and physical speaker/OS notification delivery still require the checklist below. No personal key was requested or used.

Official contracts checked on 2026-10-06: [Torn OpenAPI / Swagger](https://www.torn.com/swagger.php), [Torn API documentation](https://www.torn.com/api.html), [YATA export](https://yata.yt/api/v1/travel/export/).

## Changed files

Paths below are relative to `development/` unless stated otherwise.

- **New model/engine:** `packages/shared/src/trip-model.ts`, `trip-engine.ts`.
- **New persistent broker/page evidence:** `packages/extension/src/background/travel-store.ts`, `services/travel-page-observer.ts`, `content/travel-page.ts`.
- **Existing data integration:** `background/service-worker.ts`, `services/torn-api.ts`, `storage.ts`, `message-schema.ts`.
- **Existing dashboard integration:** `core/dashboard.ts`, `mode-manager.ts`, `travel-dock.ts`, `widget-manager.ts`, `widget-registry.ts`.
- **Widgets:** `widgets/travel-status/index.ts`, `travel-market/index.ts`, `travel-profit/index.ts`, `travel-favorites/index.ts`, `restock/index.ts`, `widgets/base.ts`, `styles/dashboard.css`.
- **Settings/shared contracts:** `packages/extension/options.html`, `src/settings/options.ts`; `packages/shared/src/contracts.ts`, `defaults.ts`, `index.ts`, `travel.ts`.
- **Packaging:** extension manifest, `scripts/build.mjs`, `extension-runtime.mjs`, package manifests/lock; regenerated runtime assets at the same repository root. The allowlist now has 12 assets, including the passive `travel-page.js` observer.
- **Tests:** new `tests/unit/trip-engine.test.ts`, `trip-provider.test.ts`, `travel-store.test.ts`, `tests/e2e/travel-session.spec.ts`; updated existing travel/API/browser tests.
- **Documentation:** root README, architecture/security/verification docs, this report and fixture screenshots. A development-only shell-quote override fixes the audited dependency; it is not included in the extension ZIP.

## Manual test checklist

Reload the existing TornDashboard extension in `chrome://extensions`, then refresh Torn. Keep the same installed directory. Connect your own key in Options and save YATA consent.

1. **Torn → foreign country:** select any destination; verify only that country's products appear, then depart. Confirm OUTBOUND route, landing time, cached capacity and stock age labels. No manual calculator appears.
2. **Land abroad:** verify ABROAD / On ground, current shop bag counter and Shop Assistant. Confirm capacity/stock against the native shop.
3. **Buy one item:** buy a known amount while owning some already. Confirm purchased quantity equals the receipt/new purchase, not total owned. Check cost, market value, profit/item and ROI.
4. **Buy multiple items:** buy two further products; confirm separate rows and correct totals. Failed buys, gifts, uses and transfers must not silently become confirmed purchases. Check Full/custom log recovery without duplication.
5. **Return to Torn:** click Return and navigate away from the shop immediately. Confirm compact foreign → Torn status, Trip Profit + Landing Summary and persistent watches/restock for the foreign origin.
6. **Refresh during return:** reload Torn and restart Chrome. Verify the same trip, quantities, origin/market context and local countdown; no duplicate purchases.
7. **Stale market data:** let a price age or temporarily block refresh. Confirm the numeric last-known value, age/low-confidence label and preserved totals; no “Unknown – price stale” primary result. A range requires real observed history.
8. **Failed API call:** temporarily restrict API access using Chrome site access or a local test profile, then restore it. Confirm saved panels remain usable, no internal/backend message appears, partial stock/resource failure does not erase prices/profit, and refresh recovers.
9. **Complete the trip:** let the return arrive and confirm Torn's home state. After stabilization/final log refresh, verify one archived trip in Options → Travel History, completed estimate/duration/hourly metrics and cleared temporary context. Actual stays unverified until sale attribution exists.
