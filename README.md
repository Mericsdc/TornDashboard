# TornDashboard

Kişisel Torn API anahtarıyla çalışan, Liquid Glass görünümlü Manifest V3 Chrome eklentisi. Seyahat, ülkeye ait ürünler, alışveriş planı, favori stok uyarıları ve savaş hedeflerini gösterir. Stok gözlemleri isteğe bağlı, hesap gerektirmeyen YATA servisinden gelir. BOSBOT üyeliği veya sunucu bağlantısı gerekmez.

## Chrome’da güncelleme ve bağlantı

Mevcut kurulumun **klasör yolunu koru**: `outputs/torn-companion-extension` sabit kalır. `chrome://extensions` → mevcut **TornDashboard** kartında **Reload** → Torn sekmelerini yenile. İlk kurulumda Developer mode → Load unpacked → bu kök klasörü seç (`development` değil).

Options → **Personal Torn API** bölümüne kendi anahtarını gir → **Connect Torn API**. Anahtarı sohbet/GitHub’a gönderme. Minimal erişim seyahat ve herkese açık faction verilerini kapsar. Direktör çalışan verileri için Limited veya uygun custom company izinleri gerekir. **Use YATA shared stock observations** seçeneğini aç → **Save settings**; Chrome’un YATA erişim isteğini kabul et. Anahtar yalnızca Torn’a gönderilir.

**0.4.1:** Connect, Chrome’da kısıtlanmış `api.torn.com` erişimini bağlantıdan önce ister; çıkan izni kabul et. **Test connection**, anahtar göndermeden Chrome iznini ve gerçek Torn API erişimini kontrol eder. Geçici ağ kesintilerinde tek tekrar yapılır; izin eksikliği, çevrimdışı bağlantı ve zaman aşımı ayrı mesajlarla gösterilir. API/HTTP hatalarında ağ tekrarı yapılmaz. Test başarılı ama Connect başarısızsa gösterilen anahtar/erişim hatasını esas al. Ağ testi de başarısızsa API alanını engelleyen Chrome eklentisi, VPN/proxy veya ağ filtresini kontrol et. [Chrome izin akışı](https://developer.chrome.com/docs/extensions/reference/api/permissions#method-request).

“Remember on this browser” açıkken anahtar güvenilir extension storage’da kalır; kapalıyken Chrome kapanınca silinir. Storage şifreli bir kasa değildir. **Remove API key** ile kaldırabilirsin. Eski BOSBOT bağlantısı yerel olarak silinir; favoriler ve görünüm tercihleri korunur. Eski presetlerdeki ek widgetlar CUSTOM düzenine aktarılır. İstenirse eski bot tarayıcı yetkisi botun kendi panelinden ayrıca iptal edilebilir.

## Kullanım

- **WAR:** yalnızca Chain ve Recommended Targets. Aktif ranked war’ın rakip faction’ı Torn API’den otomatik yüklenir. Hospital/seyahat durumları hedef sıralamasında dikkate alınır. Battle stats ve fair fight verisi yoksa `unknown` kalır.
- **TRAVEL:** seyahat durumu, destinasyona ait takip edilen ürünler ve restock. **Travel Market + Travel Profit Calculator** uçuş panelinin altında yer alır. Chain gösterilmez. Dönüşte “Dubai → Torn” rotası UAE ürünlerine eşlenir; bilinmeyen destinasyon başka ülkelerin ürünlerini açmaz.
- **NORMAL:** chain, gruplu favoriler/restock ve doğrulanmış şirket direktörüne çalışan addiction verimlilik etkisi.
- **CUSTOM:** widgetları serbest seç; seyahat hesaplayıcısı aktif seyahat koşulunu korur.

**Arrange** ile sürükleme/taşıma kontrollerini aç; **Done** ile kapat. Her preset kendi sıralamasını hatırlar. Comfortable yalnızca boşluk ve okunabilirliği artırır. İstenen genişlik boş alanın boyutuna uyarlanır; 340 px yer bulamazsa panel daralır. Gerekirse tek kenarda sıralanır; dar ekranda sayfanın üstüne geçer.

Görünüm, genişlik, düzen ve otomatik mod ayarları yalnızca Torn içindeki **⚙ → Save settings** ile uygulanır. Options’da API, stok kaynağı, çanta ve uyarılar için ayrı kayıt düğmesi vardır; görünüm bölümü kaldırılmıştır. Options’da kayıt almak Torn içindeki görünüm tercihlerini değiştirmez. Ürün arama, kategori, stokta olanlar, favoriler ve sıralama filtreleri kalıcıdır. Takip edilen ürünler ülke ve ürün türüne göre gruplanır; stok eşiği/uyarı her ürün için düzenlenir.

Hesaplayıcıya **kalan boş çanta kapasitesini** gir. Torn API bu alanı sağlamaz; kapasite tahmin edilmez. İsteğe bağlı bütçe, satış ücreti ve favori tercihiyle **Optimize Bag** güncel stoklara göre ürün/adet planı çıkarır. Cost, Torn value, tahmini kâr ve saatlik kâr gösterilir. Tur süresi girilmezse mevcut uçuş süresinin iki katı **tahmini** tur olarak etiketlenir; alışveriş beklemesi ve seyahat giderleri hariçtir. Torn value kesin satış fiyatı değildir.

YATA stokları ortak gözlemdir; üç dakikadan eski stok `unknown` olur. Restock için en az üç gözlenen sıfır→pozitif geçiş gerekir; yeterli geçmiş yoksa zaman uydurulmaz. Chain 30 saniyeye geldiğinde ses ve Chrome bildirimi; takip edilen stok eşik altından üstüne geçtiğinde stok uyarısı vardır. Chrome açık/uyanık olmalıdır. **Test warning sound** ile sesi kontrol et.

## Geliştirme ve aynı klasöre güncelleme

Node.js **24.x** ve npm. Komutları bu kökte çalıştır:

```sh
npm run setup
npm run update
npm run test:e2e
npm run package
```

`update` lint/typecheck/test/build yapıp aynı kurulu klasörü yeniler. Başarısız build kurulu dosyaları değiştirmez. Tek paket **`development/dist/TornDashboard.zip`** ve `SHA256SUMS` aynı adlarla yenilenir. ZIP’te yalnızca 11 çalışma dosyası vardır; kaynak/backend/.env/anahtarlar yer almaz.

```sh
npm run dev:extension
npm run preview
```

`http://127.0.0.1:4319/?sid=travel` etiketli MOCK görsel demodur. Gerçek veriler yüklenen Chrome eklentisinde kullanılır. Kaynak/testler `development` altındadır. İsteğe bağlı Fastify/PostgreSQL/Redis geliştirme servisi canlı eklentinin veri yolunda değildir.

GitHub’dan yeni kodu almak: `git pull --ff-only`, `npm run setup`, `npm run update`; sonra Chrome Reload. Sonraki sürüm örneği: `npm run version:set -- 0.4.2`, kontroller, commit/push ve eşleşen `v0.4.2` etiketi. GitHub Actions doğrulayıp **TornDashboard.zip** release dosyasını oluşturur. Unpacked eklenti GitHub’dan otomatik güncellenmez; mağaza üzerinden otomatik dağıtım için aynı Chrome Web Store kaydı kullanılmalıdır.

[Kaynak mimarisi](development/docs/ARCHITECTURE.md) · [Güvenlik](development/docs/SECURITY.md) · [Doğrulama](development/docs/VERIFICATION.md) · [Torn API resmi sözleşmesi](https://www.torn.com/swagger.php) · [YATA ortak stok servisi](https://yata.yt/api/v1/travel/export/)
