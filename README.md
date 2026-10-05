# TornDashboard

BOSBOT verileriyle çalışan, Liquid Glass temalı Manifest V3 Chrome eklentisi. Savaş, hedefler, hospital, chain, ülkeye göre ürün/stok/kâr, favoriler, restock ve şirket direktörleri için addiction etkisi gösterir. TypeScript kaynakları, testler ve güncelleme araçları aynı proje içindedir.

## Chrome’a yükleme

`chrome://extensions` → **Developer mode** → **Load unpacked** → bu klasörü seç. Seçtiğin klasörde `manifest.json` bulunmalıdır; `development` klasörünü seçme. Options → **Connect BOSBOT account** ile sunucuda hesabını eşleştir.

Mevcut kurulumun klasör yolu korunmuştur: `outputs/torn-companion-extension`. Eklentinin Chrome’daki adı **TornDashboard** olur. Bu klasörü taşımadan aynı dosyaları güncelleyeceğiz. Böylece Chrome kimliği, BOSBOT bağlantısı, favoriler ve panel düzenleri korunur. Güncellemeden sonra Chrome’daki eklenti kartında **Reload**’a basıp Torn sekmelerini yenile.

## Bundan sonraki güncellemeler

Node.js 24 ve npm kurulu olmalıdır. Komutları bu projenin kök klasöründe çalıştır:

```sh
git pull --ff-only
npm run setup
npm run update
```

`update`, lint/typecheck/test kontrollerinden sonra aynı klasördeki eklentiyi yeniler. Build önce geçici bir klasörde tamamlanır ve doğrulanır; başarısız derleme kurulu dosyaları değiştirmez. Eklentiyi kaldırıp tekrar kurmak gerekmez. BOSBOT hesabı ve düzen Chrome storage’da kalır.

Chrome’a klasörden yüklenen eklentiler GitHub’dan kendiliğinden güncellenmez. Normal macOS/Windows kullanıcıları için otomatik dağıtım, aynı **Chrome Web Store** kaydına yeni sürüm yüklenerek yapılır. GitHub sürümleri bu yayın için hazır paket üretir. [Chrome dağıtım kuralları](https://developer.chrome.com/docs/extensions/how-to/distribute).

## Tek sürüm paketi

```sh
npm run package
```

Her seferinde **`development/dist/TornDashboard.zip`** ve `SHA256SUMS` yenilenir. ZIP’te yalnızca 11 eklenti dosyası vardır; kaynaklar, testler, backend ve yerel gizli dosyalar dahil edilmez. ZIP’i doğrudan Chrome Web Store geliştirici paneline yüklemek veya başka bir bilgisayarda sabit bir klasöre açmak için kullanabilirsin. Mevcut kurulumun üzerine güncellerken klasör yolunu koru.

Yeni sürüm hazırlamak için:

```sh
npm run version:set -- 0.3.2
npm run update
npm run test:e2e
npm run package
git add .
git commit -m "Release TornDashboard 0.3.2"
git push
git tag v0.3.2
git push origin v0.3.2
```

Sürüm komutu tüm paket/manifest sürümlerini birlikte artırır. GitHub Actions kodu kontrol eder, gerçek Chromium testlerini çalıştırır ve `v*` etiketi için **TornDashboard.zip** adlı release dosyasını oluşturur. Chrome Web Store’a yayın için geliştirici hesabında aynı mağaza kaydı kullanılmalıdır. Mağaza kimliği mevcut unpacked kimliğinden farklı olabilir; ilk mağaza geçişinde yeniden BOSBOT eşlemesi gerekebilir.

## Proje

- Kök: Chrome’un yüklediği tek eklenti ve Git deposu.
- `development/packages/extension`: Vanilla TypeScript/CSS widget ve güvenli service worker kaynakları.
- `development/packages/shared`: veri sözleşmeleri, filtre/kâr/uyarı mantığı.
- `development/packages/backend`: ilk tasarımdan kalan isteğe bağlı Node 24 geliştirme backend’i; canlı eklenti BOSBOT’a bağlanır.
- `development/tests`: domain/API ve gerçek MV3 tarayıcı testleri.
- `development/integrations/bosbot`: BOSBOT sunucu entegrasyon değişikliklerinin kaynak yamaları.
- `.github/workflows`: doğrulama ve tek ZIP release akışı.

[Özellikler ve geliştirme ayrıntıları](development/README.md) · [Güvenlik](development/docs/SECURITY.md) · [Doğrulama](development/docs/VERIFICATION.md).

Canlı veriler yalnızca BOSBOT’tan gelir. API anahtarı sayfaya veya Git deposuna taşınmaz. Bilinmeyen battle stats/fiyatlar `unknown`, restock tahminleri `estimated` olarak gösterilir. Yerel `npm run preview` sayfası açıkça etiketlenmiş mock demodur.
