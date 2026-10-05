# TornDashboard 0.3.1

Vanilla TypeScript/CSS Manifest V3 Chrome extension. **Tüm canlı widgetlar yalnızca BOSBOT hesabından veri alır.** API anahtarları sunucuda kalır; eksik veya eski veri `Unknown` olur. Liquid Glass kartları responsive Torn içerik sınırına yerleşir. Sürükleme, sol/sağ paneller arası taşıma ve her preset için kalıcı düzen vardır.

## Kullanım

Chrome → `chrome://extensions` → Developer mode → Load unpacked → projenin kök klasörü (`manifest.json` burada). Mevcut kurulumda aynı klasörü güncelle, Reload’a bas ve Torn sekmelerini yenile. Options → **Connect BOSBOT account** → açılan BOSBOT sayfasında giriş yap ve tarayıcı kimliğini karşılaştırarak onayla. Anahtar/token yazman gerekmez.

BOSBOT adresi: `https://lrx-server.tail2b0396.ts.net:8443`. Sunucuda **0.24.6 Beta** etkin olmalıdır. 0.24.5 temel bağlantıyı sağlar ama ürün fiyatları ve yeni kişisel görünümler eksiktir. Bu projenin Node backend’ini BOSBOT için çalıştırmak gerekmez. Mevcut hesap/sayfa izinleri korunur; üyeler aynı ortak gözlemleri kullanır. Her tarayıcı bağlantısı 30 gün geçerlidir. Options veya BOSBOT `/extension/devices` üzerinden iptal edilebilir.

Otomatik mod açık gelir: aktif seyahat **TRAVEL**, seyahat yokken aktif savaş **WAR**, diğer durumda **NORMAL**. Panelden preset seçmek manuel moda geçer. İlk 0.3 güncellemesi mevcut düzenleri korur, yeni widgetları ekler ve BOSBOT/otomatik mod/Liquid Glass ayarlarını etkinleştirir. Sonraki kullanıcı tercihleri korunur.

- **Travel Market:** BOSBOT kişisel seyahat verisinden ülkeyi seçer. Tüm ürünler, stock, Cost, Torn value, birim kâr ve gözlem zamanı görünür. Arama, ülke, ürün türü, stokta olanlar, favoriler ve kâr/ROI/stok/isim sıralaması kalıcıdır. En kârlı kart yalnızca o ülkedeki güncel, fiyatı bilinen, stokta olan pozitif kârlı ürünü önerir. Dönüşte ayrıldığın ülkeyi kullanır; ülke bilinmiyorsa manuel seçim yapılabilir.
- **Travel Profit Calculator:** yalnızca güncel, aktif seyahatte görünür. Ürün, adet ve isteğe bağlı satış ücreti ile Cost/Torn value toplamı ve tahmini kâr hesaplar. Bilinmeyen/eski fiyat hesaplanmaz. Torn value kesin satış fiyatı değildir; seyahat giderleri dahil değildir.
- **War Status / Recommended Targets / Hospital Timers:** BOSBOT mevcut ranked-war rakibini otomatik yükler. Kişisel hedef sıralaması/nedenler BOSBOT’tan gelir. Gerçek kaynaklı battle-stat bilgisi yoksa `unknown`; seviye tabanlı uydurma güç/FF kullanılmaz.
- **Chain:** kalan süre ve bonus; 30 saniyeye girildiğinde tarayıcı bildirimi ve ses. Aynı durum birden fazla sekmede veya yeniden açılışta tekrar çalmaz; yeni hit ile yenilenen süre yeniden uyarılabilir.
- **Travel Favorites / Restock:** ürün satırındaki yıldız veya Options üzerinden takip; minimum stock ve bildirim tercihi değiştirilebilir. Bildirim, güncel gözlem eşik altından üstüne geçtiğinde gelir. İlk açılış, eski veya sırası bozulmuş gözlem bildirim üretmez. Restock penceresinden 30 saniye önce hatırlatma desteklenir; gözlemden üretilen zamanlar daima **estimated** olarak etiketlenir.
- **Company Addiction:** yalnızca BOSBOT’un şirket direktörü olarak doğruladığı hesapta görünür. Çalışan addiction **verimlilik etkisini/cezasını** gösterir; ham bağımlılık puanı değildir. Eksik alan `Unknown` kalır.

Options → **Test warning sound** ile sesi kontrol et. Chrome ve işletim sisteminde bildirim/ses açık olmalıdır. Chrome kapalıyken veya bilgisayar uyurken zamanında uyarı gelmez. Torn sekmesi açıkken saniyelik kontrol kullanılır; arka plan Chrome alarmı gecikebilir ([Chrome alarm davranışı](https://developer.chrome.com/docs/extensions/reference/api/alarms)). **Refresh BOSBOT data** anlık yeniden okuma yapar; bağlantı durumu hesabın yalnızca eşlenmiş olmasını ve canlı feed’in doğrulanmasını ayrı gösterir.

`Import BOSBOT favorites` ürün favorilerini tarayıcıya alır. İlk bağlantıda tarayıcı favorileri boşsa otomatik alınır. Yerel düzenlemeler Discord aboneliklerini değiştirmez. Ürün kimlikleri BOSBOT’un gerçek ürün adı/ülke kataloğuyla eşlenir.

## Geliştirme ve doğrulama

Node.js **24.x** ve npm:

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

```sh
npm run dev:extension
npm run build
npm run preview
```

`http://127.0.0.1:4319/?sid=travel` açıkça etiketlenmiş **MOCK** görsel demodur. Canlı hesaba bağlanmaz. Demo senaryo seçicisi bu yerel sayfaya aittir; Chrome extension’da mock/alternatif kaynak seçeneği bulunmaz.

| Komut | İşlev |
| --- | --- |
| `npm run build` | Extension, görsel demo, geliştirme backend’i |
| `npm run check` | Lint, strict typecheck, birim/API testleri, build |
| `npm run test:e2e` | Gerçek unpacked MV3: eşleme, ses, filtre, hesap, düzen, gizlilik, restart/iptal |
| `npm run dev:extension` | Extension kaynak izlemesi; Chrome Reload gerekir |
| `npm run preview` | Sadece yerel görsel demo |
| `npm run dev:backend` / `npm start` | Ayrı Node geliştirme servisi |
| `npm run db:migrate` | İsteğe bağlı PostgreSQL gözlem şeması |

## Yapı

```text
packages/extension/src/core/        bootstrap, dashboard, panels, widget manager/registry,
                                    drag-drop, mode-manager, event-bus, torn-observer
packages/extension/src/widgets/     war-status, recommended-targets, hospital-timers, chain,
                                    travel-status, travel-market, travel-profit,
                                    travel-favorites, restock, company-addiction
packages/extension/src/background/  trusted service worker, alert broker, sender authorization
packages/extension/src/offscreen/   paket içi ses oynatıcısı
packages/extension/src/settings/    Options
packages/shared/src/               contracts, presets, travel/profit/filter domain, alert domain,
                                    development-only mocks/scoring/restock estimator
packages/backend/                  Node 24 Fastify REST/WS + memory/PostgreSQL/Redis foundation
scripts/                           build/watch, görsel demo
 tests/                            birim/API + Chromium testleri ve Python BOSBOT sözleşme fixture'ı
 docs/                             mimari, güvenlik, doğrulama ve tarayıcı görüntüleri
```

Widget standardı `id/title/defaultPosition/defaultOrder/modes/settings/create` ve her instance için `mount/update/destroy` içerir. `visible` seyahat ve direktör koşullarını uygular. Kullanıcı widgetları presetler arasında taşıyabilir; yalnız seyahatte gösterilen hesaplayıcı bu şartı korur.

Node geliştirme backend’i `.env.example` ile ayağa kalkar; PostgreSQL/Redis boşsa memory adapterleri kullanır. Ayarlanmış veritabanı başarısızsa başlangıç hata verir. REST/WebSocket/test fixture altyapısı korunmuştur ve Chrome extension’ın canlı veri yolu değildir. `.env` ve gerçek anahtarlar paketlere konmaz.

BOSBOT değişiklikleri `dashboard/extension_feed.py`, `dashboard/extension_personal.py` ve mevcut device API üzerinden sağlanır. Gözlem süreleri: chain 10s ortak cache; savaş 60s; hedef status 20s; kişisel seyahat 20s, anahtarsız üyelerde faction cache 60s; restock ortak60s/monitor30s; Torn market value 1h; şirket sahipliği60s/çalışanlar180s. Gözlem zamanları istemcide ayrı doğrulanır.

Testler geçici Chromium profili ve kontrollü BOSBOT fixture’ı kullanır. Gerçek Torn oturumu, üretim kullanıcı hesabı ve fiziksel ses/bildirim kabulü ayrıca kontrol edilmelidir. Ayrıntılar `docs/VERIFICATION.md` içindedir.
