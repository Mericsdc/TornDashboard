# Architecture — 0.5.1

Vanilla TypeScript/CSS, SortableJS and Manifest V3 remain. `bootstrap → Dashboard → Panels + WidgetManager + DragDrop + TornObserver` owns the responsive sidebars. The center TravelDock, Travel Market, Travel Status and separate Restock widget have been removed. Retired IDs remain accepted only for installed-layout migration; they are not registered or offered in settings.

`TravelDataStore` still owns one persistent, account-scoped normalized snapshot. Existing TornApi is the only authenticated provider. Isolated DOM observations and the passive MAIN-world shop observer update the trip state machine without keys or gameplay actions. UI reads cached state while coalesced refreshes run outside the mutation queue.

ChainPageObserver reads only the own visible sidebar. Native count/timer changes correct local presentation and publish significant changes, threshold crossings and ten-second checkpoints to the worker. A static zero or a locally elapsed frozen countdown is checkpointed from the existing UI tick; no additional API polling is used. Hidden/removed sidebar rows are not authoritative. A recent native observation takes priority over delayed/cached API chain responses. API fallback subtracts HTTP cache Age and uses the request-start timestamp, preventing transport duration from being added to the deadline. Expiry clears count/progress locally and uses the same normalized state for alerts. Native schema validation and account scoping remain in the worker.

Travel retains its phases, country context, inventory snapshots, receipt ledger, prices, bag inference, resource calculations and bounded history. Watched Products combines observed stock, last-seen time, profit/item, restock estimate/confidence and expandable prices/alerts. Compact Trip Profit mounts only when an active session has purchases; full receipt details are expandable. Neither adds elements to Torn's central flight/game area.

NORMAL has chain, merged watches and director company data. WAR remains chain plus recommendations. TRAVEL has optional purchase summary and destination watches. CUSTOM can arrange currently available widgets. Preset migration preserves watches, credentials and appearance while removing retired widgets and mapping legacy Restock to Watched Products.

[Release changes and acceptance checklist](COMPACT-TRAVEL.md). [Persistent trip engine design](TRAVEL-REFACTOR.md).
