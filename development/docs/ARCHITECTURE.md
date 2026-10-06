# Architecture — 0.5

The extension remains Vanilla TypeScript/CSS with SortableJS and Manifest V3. `bootstrap → Dashboard → Panels + TravelDock + WidgetManager + DragDrop + TornObserver` owns rendering/remounting. Registered widget instances use mount/update/destroy. Core layout, four presets, appearance drafts and Arrange controls remain unchanged.

The worker now owns `TravelDataStore`, a persistent, owner-scoped normalized snapshot. Existing `TornApi` remains the only authenticated provider. Isolated DOM observations and a small passive MAIN-world shop observer update the travel state machine; neither sees keys or performs gameplay actions. Cached state is returned immediately while coalesced background refreshes update it. The short mutation queue commits network results without blocking reads.

Travel phases, origin/destination/market context, inventory snapshots, confirmed purchase ledger, prices, resource bars, derived profit and bounded trip history are independent of page lifetime. A return keeps the foreign market through completion. Widgets consume normalized state; API failures keep the previous snapshot. Timers run from known timestamps, and stale prices remain usable with age/confidence labels.

The manual bag calculator has been replaced by automatic Trip Profit and state-dependent Travel Market / Shop Assistant / Landing Summary. Multi-item receipts deduplicate against logs, inventory changes need corroboration, capacity prefers page/cached data and actual profit remains separate from estimates. History freezes completion prices and is bounded by count, age and size.

Responsive left/right panels still measure main/sidebar gutters; center panels use the existing flight anchor/fallback and survive SPA replacement. WAR includes only chain/recommendations, TRAVEL only travel tools, CUSTOM remains manual. The optional development Fastify/PostgreSQL/Redis backend is outside the live extension path.

[Full data flow, formulas, fallback behavior, changed files and manual checklist](TRAVEL-REFACTOR.md).
