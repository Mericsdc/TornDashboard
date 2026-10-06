# TornDashboard 0.5.1 — chain correctness and compact Travel

## Chain root cause and fix

The widget only rendered a clamped countdown from the API. It retained the old hit count/progress at zero; neither UI nor alert decisions used the player's native sidebar as evidence. API observations could differ from the visible timer.

The new read-only ChainPageObserver finds the own, visible sidebar by its semantic Chain label/count/time, including separate adjacent text nodes. It observes SPA replacement and native countdown updates. Count changes, expiry and crossing 30 seconds publish immediately; otherwise worker checkpoints are bounded to ten seconds. Repeated unchanged positive text does not keep extending a frozen deadline. A visible static zero stays authoritative through checkpoints from the existing UI tick. Hidden/removed rows fall back to the provider.

A shared chain engine is used by the widget, data merge and alert evaluator. It normalizes elapsed/timeout-zero/completed chains to zero hits, no active progress and an ended status. Recent native evidence takes priority over delayed API results, so a late response cannot resurrect a displayed ended chain. API fallback accounts for HTTP cache Age, disables browser response caching and anchors relative timeout to request start. No arbitrary fixed seconds are subtracted. Native matching remains dependent on Torn showing its sidebar; API-only values are labelled as a local countdown and may reflect provider delay.

The 30-second sound/notification uses the corrected deadline and existing cross-tab/restart deduplication. New hits/new chains rearm it. Sleeping/closed Chrome can still delay delivery.

## Compact Travel

- The center TravelDock and Travel Market/Shop Assistant/Landing Summary UI are removed. No extension cards are inserted around the native flight module.
- Travel Status is removed: Torn already displays route/time.
- One Watched Products widget replaces watch + Restock. Each product shows observed quantity, price difference, stock observation time and the estimated restock window/confidence when available. Prices, threshold and remove control are expandable. Empty state is a small count plus Add button.
- Trip Profit is a sidebar summary that appears only after purchase evidence. It shows quantity, estimated profit, cost/value, ROI and known hourly profit. Full multi-item receipts/price ages are expandable. The active trip and Travel History remain intact.
- Old installed layouts migrate without deleting API credentials, favorites, history or appearance. Retired widgets disappear from all presets and settings. Existing Restock-only arrangements map to Watched Products.

Data accuracy remains unchanged: YATA quantities are observations, future stock/restock is not guaranteed, stale values retain age labels, inventory additions alone do not prove purchases, and actual sale attribution is still not implemented. No new key exposure, backend, provider or gameplay request is introduced.

## Main files

New: `packages/shared/src/chain.ts`, `packages/extension/src/services/chain-page-observer.ts`, `core/format.ts`, `tests/unit/chain.test.ts`.

Changed: chain widget, shared alerts/contracts/trip merge, TravelDataStore, Torn API/request wrapper, worker message broker, ExtensionStore, presets/migration/settings, widget manager/registry, Dashboard/TornObserver, Watched Products, Trip Profit, CSS, version/build output, unit/provider/storage/browser tests.

Removed: `core/travel-dock.ts`, `widgets/travel-market/index.ts`, `widgets/travel-status/index.ts`, `widgets/restock/index.ts`.

## Manual acceptance

1. Reload the existing extension, then refresh Torn. Verify version 0.5.1 and retained key, watches, history and appearance.
2. During a chain, compare count and timer against the own Torn sidebar. Expect native synchronization; no accumulated multi-second lead.
3. Cross 30 seconds: one enabled sound/notification. After a new hit, the new countdown can warn again.
4. Let the chain expire or observe Torn zero: ended/zero hits, no progress or keep-alive warning. A later API refresh must not bring back the old count.
5. Navigate/refresh and temporarily hide the sidebar: API fallback remains labelled; a visible sidebar corrects it again.
6. Depart for any country: no center Market or sidebar Travel Status; only that destination's watches. Empty watch list stays compact.
7. Shop and return: compact purchase summary, expandable multiple-item totals, one merged watched/restock card, preserved foreign context.
8. Reload during return/API outage, then finish: saved trip remains and archives once. No duplicate Restock/Market cards reappear in CUSTOM or old saved layouts.

Automated evidence and fixture screenshots are recorded in [VERIFICATION.md](VERIFICATION.md). The authenticated account and physical notification/audio delivery still require manual acceptance.
