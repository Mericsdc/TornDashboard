# Architecture — 0.4

`bootstrap → Dashboard → Panels + TravelDock + WidgetManager + DragDrop + TornObserver`. Each registered definition owns a mount/update/destroy instance. Context carries public state/snapshot/time and narrow preference/watch mutations. Snapshot reads are brokered by the worker. No heavy UI framework is used.

NORMAL, TRAVEL, WAR and CUSTOM have independent layouts. Built-in membership is constrained in the migration, worker and renderer; WAR contains chain/recommendations, TRAVEL contains travel widgets. CUSTOM preserves legacy extras. Automatic mode prioritizes current travel then active ranked war. Selecting a preset makes switching manual; CUSTOM remains manual. Hidden travel profit/company widgets enforce active travel/director conditions.

The two side lists share a SortableJS group. Handles and keyboard controls appear only in Arrange, independently of density. WidgetManager moves DOM nodes only when order changes, preserving focused form inputs. Quick appearance controls are drafts until Save; widget filters save their own preferences without replacing the input nodes. Bag controls retain local drafts until Optimize.

TornObserver measures main/sidebar bounds. It clamps requested width to available gutters, supports both sides or stacking on one available side, and uses an inline grid before main on narrow screens. It never squeezes or wraps Torn content. The separate shadow-root travel dock lives after a detected flight module/progress block inside main content, with main-content fallback. Mutation/resize/history/connectivity checks remount both hosts after SPA replacement and remove duplicate injected docks.

Liquid Glass uses neutral translucent layers, background blur/saturation, light inset borders and rounded surfaces. Density changes spacing/type; edit controls do not depend on density. Reduced motion and increased-contrast styles are supported.

Worker-only TornApi parses key info/profile/travel/wars/chain/enemy members/items and director company responses. Cache keys and endpoint URLs are fixed. YATA export joins official shop rows by canonical country+item ID. Shared helpers normalize Dubai/UAE and UK aliases; an unknown destination cannot become an all-country filter. All unknown price/stock/strength fields remain explicit.

Bag optimizer uses bounded stock/capacity knapsack with cost/profit Pareto frontiers for budgets. It applies selling fees and excludes stale/unprofitable candidates. A bounded frontier is explicitly labelled an approximation if pruning occurs. Capacity is manual. Profit/hour uses an entered round trip or an explicitly estimated double flight duration. Actual market prices and travel costs can differ.

Local stock history retains phase boundaries and latest observations rather than every positive poll; at most 128 observations per product are stored for seven days. Restock estimation requires three observed zero→positive transitions with bounded gaps. Windows remain estimates, never exact timers. Alerts use freshness, persistent baselines, owner-scoped deduplication and a 30-second chain alarm with content ticks.

The optional Fastify development backend retains REST/WebSocket + PostgreSQL/Redis/memory foundation. It is not part of the live extension data path. Historical BOSBOT source patches are retained only as prior-version context and have no runtime imports.
