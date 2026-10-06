# TornDashboard development

Chrome’un yüklediği tek kök bir üst klasördür. Bu dizin Vanilla TypeScript/CSS kaynaklarını, paylaşılan veri mantığını, testleri ve isteğe bağlı geliştirme backend’ini içerir. Kurulum/kullanım için [ana README](../README.md).

Node 24: `npm ci`, `npm run check`, `npx playwright install chromium`, `npm run test:e2e`. `npm run build` kurulu üst klasörü güvenli staging üzerinden günceller. `npm run dev:extension` kaynakları izler; Chrome Reload gerekir. `npm run preview` yalnızca MOCK görsel demodur. `npm run package` tek `dist/TornDashboard.zip` üretir.

- `packages/extension/src/core`: bootstrap/dashboard/panels/travel-dock/widget manager/registry/drag-drop/mode/event/observer.
- `packages/extension/src/services/torn-api.ts`: sabit Torn endpointleri, anahtar kontrolü, cache/backoff, katalog + YATA gözlemi birleştirme.
- `packages/extension/src/background`: trusted storage, yetkili mesajlaşma ve ortak uyarı teslimi.
- `packages/extension/src/widgets`: mount/update/destroy ile kendi yaşam döngüsünü yöneten widgetlar.
- `packages/extension/src/settings`: kişisel API anahtarı, görünüm, çanta ve ülke/tür gruplu takip seçenekleri.
- `packages/shared/src`: CUSTOM/preset/migration, destinasyon filtreleri, stok freshness, bounded bag optimizer, scoring ve restock tahmini.
- `packages/backend`: ilk milestone’dan korunan Node 24 Fastify REST/WebSocket, PostgreSQL/Redis/memory adapterleri. Canlı extension doğrudan Torn + opt-in YATA kullanır; backend anahtar kabul etmez.
- `integrations/bosbot`: geçmiş 0.3 sunucu yamaları, yalnızca tarihsel kaynak; 0.4 bunları çağırmaz veya deploy etmez.
- `tests`: saf veri/API/backend/paket testleri ve gerçek MV3 Chromium kontrolleri. Harici API yanıtları kontrollü fixture transport ile sağlanır; gerçek kişisel anahtar kullanılmaz.

`.env.example` yalnızca geliştirme servisine aittir. PostgreSQL/Redis ayarlanmamışsa memory fallback; ayarlanmış servis başarısızsa startup hata verir. `npm run dev:backend` / `npm start`, `npm run db:migrate` ayrı geliştirme komutlarıdır.
