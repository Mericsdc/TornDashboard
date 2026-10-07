# TornDashboard 0.5.2 — War / Travel veri yükleme

2026-10-07. Aynı kurulu extension klasörü ve tek ZIP güncellenir. BOSBOT kodu yalnızca savaş algılama karşılaştırması için okunmuştur; bot dosyaları, anahtarı, sunucusu veya erişim yetkileri değiştirilmez.

## Doğrulanan kök sorunlar

- Tek HTTP/ağ hatası hesap genelindeki beklemeyi açıyordu. Chain, profil veya seyahat endpoint'i hata verdiğinde sonraki savaş/fiyat okumaları da kesiliyordu. Artık HTTP 429 ve Torn hız limiti kodları hesap genelindedir; diğer sorunlar yalnızca ilgili endpoint'e bekleme uygular. Geçersiz anahtar tüm authenticated okumaları durdurur. Geçerli önbellek değerleri bekleme sırasında da okunabilir.
- Savaş tek, implicit `faction/wars` yanıtına bağlıydı. Faction güncel profile göre belirlenir; `faction/{id}/wars` okunur. Aktif savaş yoksa/yanıt başarısızsa `faction/{id}/rankedwars?limit=20` yedek okuması yapılır. Başlangıcı geçmiş, bitişi ve kazananı olmayan, kullanıcının faction'ını içeren kayıt seçilir. Gelecek ve tamamlanmış savaşlar aktif sayılmaz. Karşı faction üyeleri mevcut worker-only Torn API katmanından yüklenir. IDs 49122/54175 yalnızca regresyon testindedir; çalışma kodunda hardcode yoktur.
- Torn kataloğu olmadan YATA verisi boş ürün listesine eşleştiriliyordu. YATA'nın anonim export yanıtındaki country/id/name/cost bilgisi kataloğu kurabilir. Torn market value ayrıca id ile eşleştirilir; fiyat hatası stokları, stok hatası son bilinen fiyatları silmez. Eski gözlemler güncel stok garantisi sayılmaz.
- Bozuk/eski endpoint cache, TTL bitene kadar tekrar tekrar reddedilebiliyordu. Uyumsuz önbellek atılır ve endpoint yeniden okunur. Hesap sahipliği korunur; anahtar key/info cache'den geri yüklenmez.
- Eski `user/travel` hedefi/zamanı mevcut `Okay` profilinden üstün tutuluyordu. Profil `Traveling` ise uçuş, `Abroad` ise yabancı zemin, `Okay` ise Torn esas alınır. Diğer belirsiz durumlarda yeni ülke uydurulmaz; bilinen oturum korunur. Foreign Hospital durumunda mevcut yabancı ülke bağlamı silinmez.
- Extension kapalıyken dönüş uçuşu kaçırıldıysa eski tur sonsuza kadar Travel'da kalabiliyordu. Son aşamadan en az 45 saniye sonraki API eve dönüş kanıtı LANDED'e geçirir; 15 saniyelik stabilizasyon sonrası normal/war modu kullanılabilir. Defter ve ülke LANDED boyunca korunur. Logları bekleyen tur en fazla beş dakika bekler, sonra eksik kanıt etiketiyle arşivlenir; bilinmeyen miktar/fiyat/gerçek kazanç oluşturulmaz.
- Geçici member okuma hatası aynı savaşın önbellekteki roster'ını siliyordu. Aynı savaş/rakip için son geçerli roster korunur. Zaman damgası değiştirilmez; iki dakikadan eski statüler saldırılabilir öneri sayılmaz. Başka rakibin roster'ı yeni savaşa aktarılmaz.

## Görünür durum

Options'daki **Data status** hesap faction ID'si, aktif rakip, hedef sayısı ve gözlem yaşı, seyahat aşaması/ülkesi, fiyatlı ve stok gözlemi bulunan ürün sayısını gösterir. Endpoint hata nedenleri sabit/sanitized mesajlardır; ham yanıt, log veya anahtar gösterilmez. Torn üzerindeki kısa bildirim bu bölüme yönlendirir; normal modda savaş verisi hatası da görünür.

UI hâlâ kompakt sidebar düzenidir. Travel Market, Travel Status ve ayrı Restock geri eklenmez. Watched Products tek karttır. BOSBOT'un FFScouter tahminleri kişisel Torn API'den alınmaz; battle stats / fair fight `unknown` kalır. Bu sürüm FFScouter entegrasyonu yapmaz.

## Doğrulama kapsamı

Torn resmi OpenAPI 6.13.6 sözleşmesi 2026-10-07 tekrar indirilerek endpoint/yanıt şekilleri kontrol edildi. Anonim canlı YATA export yanıtı 11 ülkede 227 ürünle kontrol edildi; aynı anonim yanıt regresyon fixture'ı olarak saklandı. Savaş fixture'ı BOS/EPIC ID'lerini kullanır, ancak canlı savaş skorunu/id'sini temsil etmez.

Kullanıcının kişisel anahtarı veya Torn oturumuna erişilmedi. Dolayısıyla bu hesaptaki canlı API yanıtının hangi hatayı verdiği ve mevcut savaşın gerçek id/skoru bağımsız doğrulanmadı. Çalışan build ve fixture testleri canlı hesap doğrulaması yerine geçmez.

## Kullanıcı kontrolü

1. Chrome extension kartındaki Reload ile aynı klasörden **0.5.2** yükle; açık Torn sekmelerini yenile. Yeni eklenti kurmaya veya anahtarı silmeye gerek yok.
2. Options → Data status: BOS hesabında Faction **#49122** görünmeli. Farklıysa anahtarın bağlı olduğu kişisel faction esas alınır; BOS hardcode edilmez.
3. Aktif savaş sırasında War **EPIC Warmong3rs**, Targets sıfırdan büyük görünmeli. WAR → Recommendations aynı rakipten uygun üyeleri göstermeli. Hospital/travel üyeleri saldırılabilir öneri listesine girmez.
4. Travel bölümünde YATA açık olsun, Save settings ve Chrome yata.yt erişimi verilmiş olsun. Product seçicisinde country grupları yüklenmeli. Takip edilen ürün yalnızca seyahat ülkesiyle eşleşmeli; dönüşte son yabancı ülke korunmalı.
5. Torn fiyat servisi geçici hata verirse mevcut stok/ad/maliyet kalmalı; eski Torn fiyatı varsa yaş etiketiyle korunmalı. Hiç fiyat bilinmiyorsa kâr hesaplanmamalı.
6. Eve döndükten veya extension kapalıyken tamamlanan turdan sonra yenile: güvenli home doğrulaması sonrası aktif savaş varsa WAR seçilmeli. Geçmiş tur ve alışverişler silinmemeli.
7. Sorun sürerse Data status'taki faction/savaş/stock durumunu ve hata mesajını paylaş. API anahtarını, ham provider yanıtını veya storage içeriğini paylaşma.

## Dosyalar

`services/torn-api.ts`: endpoint beklemeleri, cache doğrulama, faction/war yedeği, seyahat kanıtı ve YATA katalog eşlemesi. `background/travel-store.ts`: güvenli bağlantı hatası durumu. `shared/contracts.ts`: normalized faction ID. `shared/trip-engine.ts`: missed-return, bounded finalization ve roster koruma. `core/mode-manager.ts`: kesin eve dönüş sonrası war geçişi. `core/dashboard.ts`: ilgili veri hata bildirimi. `settings/options.ts` / `options.html`: Data status. Provider/domain/Chromium testleri ve anonim YATA fixture'ı. Sürüm manifestleri, lockfile ve aynı klasördeki üretilmiş runtime dosyaları güncellenir.

Kaynaklar: [Torn resmi OpenAPI](https://www.torn.com/swagger/openapi.json), [Torn API](https://www.torn.com/api.html), [YATA anonim export](https://yata.yt/api/v1/travel/export/).
