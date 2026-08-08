# Güner · Sesli Kayıt

Gider kalemlerini konuşarak gir, stok ve çek ödemelerini takip et, hepsini
Excel/CSV olarak dışa aktar. Tek dosyalık web uygulaması — build adımı yok,
`index.html` tarayıcıda açılıyor.

## Kullanım

1. PIN ile giriş yap.
2. Ana ekranda mikrofona **basılı tut**, konuş, bırak. Konuşma yazıya
   dökülür, tutarlar ayrıştırılıp kategorilere bağlanır ve kaydedilir.
3. **Tablo** ekranında kalemleri gör, tanınmayanları bir kez öğret.
4. **Rapor**, **Stok**, **Çekler** ekranları (yalnız patron).
5. Excel / CSV çıktısı her ekranın kendi düğmesinden alınır.

Sesli komutla stok da hareket ettirilebilir: "boya 10 kg çıktı" gibi bir
cümle stoktan düşer.

## Roller

| Rol | Görebildiği |
|---|---|
| patron | hepsi — rapor, stok, çekler, bütün müdürlerin girdileri |
| müdür | yalnız ana ekran ve tablo (kendi gider girişi) |

Kişiler ve rolleri `tools/make-pins.mjs` içindeki listede tanımlı.

## PIN kodları

PIN'ler **kaynak dosyada tutulmaz**. `index.html` yalnızca PBKDF2-SHA256
özetlerini taşır; PIN'in kendisi hiçbir dosyada, git geçmişinde ya da
sunucuda bulunmaz.

```bash
npm run pin                 # rastgele 8 haneli PIN üretir, ekranda gösterir
npm run pin -- --sor        # PIN'leri sen yazarsın
npm run pin -- --yeni-tuz   # tuzu da yeniler
```

Komut PIN'leri bir kez ekrana basar ve hiçbir yere kaydetmez — oradan
kişilere iletilmeli.

### Bunun sınırı

Bu değişiklik, **kaynağı görüntüleyen birinin PIN'i doğrudan okumasını**
engeller. Engellemediği şey: doğrulama hâlâ tarayıcıda yapılıyor, yani
tarayıcı konsolunu kullanmayı bilen biri `CURRENT` değişkenini değiştirip
patron gibi davranabilir. Buna kod tarafında kapatılabilecek bir çözüm yok —
istemciye gönderilen hiçbir kontrol güvenlik sınırı değildir.

**Verinin gerçek koruması Firebase güvenlik kurallarıdır.** Kurallar
yayınlanmadığı sürece, veritabanı adresini bilen biri PIN'e hiç
dokunmadan bütün kayıtları okuyabilir.

## Firebase kurulumu

`firebase-rules.json` dosyasındaki kurallar Firebase konsolunda
**Realtime Database → Rules** bölümüne yapıştırılıp **Publish** edilmeli.
Varsayılan "test modu" kuralları (`.read: true`, `.write: true`) herkese
tam erişim verir ve bir süre sonra kendiliğinden kapanıp uygulamayı da
bozar.

`index.html` içindeki `FIREBASE_CONFIG` gizli bir bilgi değildir —
`apiKey` Firebase'de proje tanımlayıcısıdır, parola değil. Erişimi
belirleyen tek şey yukarıdaki kurallardır.

Uzun vadeli doğru çözüm: anonim giriş yerine Firebase Authentication
(e-posta/parola) + kullanıcı rollerinin veritabanında tutulması + rolü
kuralların içinde kontrol etmek. O zaman rol kontrolü istemciden çıkar.

## Veri nerede duruyor

Kayıtlar, stok, çekler, öğrenilen kelimeler ve ayarlar telefonun
`localStorage`'ında (`gm_` önekiyle). Patron oturumunda müdürlerin bulut
kayıtları da canlı olarak birleştirilir.

Tablo ekranındaki **Yedek Al** bütün veriyi tek bir JSON dosyasına yazar;
**Geri Yükle** onu okur. Telefon değişiminde ya da tarayıcı verisi
silinmeden önce kullanılmalı.

## Çevrimdışı çalışma ve kurulum

Uygulama ana ekrana eklenebilir (PWA) ve internet olmadan açılır. Excel
kütüphanesi (`xlsx.full.min.js`) repoda tutuluyor, bu yüzden **çevrimdışıyken
de Excel üretilebilir**. Ağ gerektiren işler:

| İş | İnternet |
|---|---|
| Kayıt girme, tablo, stok, çekler, Excel, CSV | gerekmez |
| Sesli komut (tarayıcı ses tanıma) | gerekir |
| Fotoğraftan metin okuma (OCR) | gerekir |
| PDF çıktısı | gerekir |
| Bulut senkron (müdür → patron) | gerekir |

Güncelleme otomatik: `sw.js` "ağ önce" çalıştığı için uygulama bir sonraki
açılışta yeni sürümü alır. Uygulama açıkken yeni sürüm inerse üstte
"Yeni sürüm hazır · Yenile" çubuğu çıkar — kayıt girilirken veri kaybolmasın
diye sayfa kendiliğinden yenilenmez.

Yeni sürüm yayınlarken **iki yerdeki sürüm birlikte** artırılmalı
(`index.html` → `APP_VERSION`, `sw.js` → `VERSION`); `npm run bump` bunu
tek komutta yapar, `npm run check` ayrışmayı yakalar.

## Dosyalar

```
index.html              uygulamanın tamamı (HTML + CSS + JS)
sw.js                   service worker — çevrimdışı çalışma + otomatik güncelleme
manifest.webmanifest    ana ekrana kurulum
icon.svg, icon-*.png    üretilmiş dosyalar — elle düzenlemeyin, npm run ikon
xlsx.full.min.js        SheetJS 0.18.5, repoda tutuluyor (CDN yok)
firebase-rules.json     Firebase'e yapıştırılacak güvenlik kuralları
tools/                  geliştirme araçları (yayına etkisi yok)
```

## Kontroller

```bash
npm install      # sadece test aracı (playwright-core); uygulama bağımlılıksız
npm run check    # sözdizimi, sürüm ikilisi, onclick bağlantıları, manifest, PIN özetleri
npm test         # gerçek tarayıcıda uçtan uca: kalıcılık, rol ayrımı, çevrimdışı
npm run bump     # yayın öncesi iki dosyadaki sürümü birlikte artırır
npm run pin      # PIN kodlarını değiştirir
npm run ikon     # simgeleri yeniden üretir
```

`npm test` özellikle **kalıcılığı** yokluyor: kayıt gir, sayfayı yenile,
kayıtlar duruyor mu. Bu testin sebebi, uygulamanın bir dönem hiçbir şeyi
saklamıyor olması — `window.storage` diye var olmayan bir API aranıyordu,
koşul hiç tutmuyordu ve her şey sayfa kapanınca siliniyordu.

## Bilinen sınırlar

- SheetJS 0.18.5'te `xlsx.read` için bilinen bir güvenlik açığı var
  (CVE-2023-30533). Bu uygulama Excel **yazıyor**, hiç okumuyor; bu yüzden
  etkilenmiyor. Yine de kütüphane güncellenirse iyi olur.
- Çek hatırlatması yalnız uygulama açıkken/öne geldiğinde çalışır; arka
  planda bildirim gönderen bir servis yok.
- Sesli komut iPhone/iPad tarayıcılarında çalışmaz (Safari canlı ses
  tanımayı desteklemiyor); metin elle de yazılabilir.
