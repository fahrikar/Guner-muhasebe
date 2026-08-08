# Güner · Sesli Kayıt

Gider kalemlerini konuşarak gir, stok ve çek ödemelerini takip et, hepsini
Excel/CSV olarak dışa aktar. Tek dosyalık web uygulaması — build adımı yok,
`index.html` tarayıcıda açılıyor.

## Kullanım

1. PIN ile giriş yap.
2. Ana ekranda mikrofona **basılı tut**, konuş, bırak. Konuşma yazıya
   dökülür, tutarlar ayrıştırılıp kategorilere bağlanır ve kaydedilir.
3. **Tablo** ekranında kalemleri gör (borç ve alacak ayrı bloklarda),
   tanınmayanları bir kez öğret.
4. **Rapor**, **Stok**, **Çekler** ekranları (yalnız patron).
5. Excel / CSV çıktısı her ekranın kendi düğmesinden alınır.

Sesli komutla stok da hareket ettirilebilir: "boya 10 kg çıktı" gibi bir
cümle stoktan düşer.

## Borç / Alacak

Tablo ve raporlar kalemleri iki ayrı blokta gösterir; tek listede iç içe
durmazlar:

| Blok | Ne | Renk |
|---|---|---|
| **BORÇ** | çıkan para — gider, ödeme, hammadde alımı | kırmızı |
| **ALACAK** | giren para — tahsilat | yeşil |
| **TANIMSIZ** | kategorisi tanınmayan; hiçbir tarafa ve Excel'e girmez | sarı |

Her bloğun kendi çizgisi ve kendi toplamı var; altta **NET = alacak − borç**.
Excel, CSV, Word ve PDF çıktıları da aynı ayrımı taşır (`Yön` kolonu +
ayrı toplamlar + net).

Bir kalem hangi tarafa düşüyor? `index.html` içindeki `CATEGORY_MAP`
listesinde her kategorinin `yon` alanı var. Şu an **yalnız Tahsilat**
alacak, diğerlerinin hepsi borç tarafında. Bir kategori yanlış taraftaysa
o satırdaki `yon` değerini değiştirmek yeter — tablo, rapor ve Excel'in
üçü de aynı yerden okuyor, geçmiş kayıtlar da kendiliğinden düzelir
(yön kayıtlarda saklanmıyor, kategoriden okunuyor).

> Dikkat: **Emanet** şu an borç (çıkan) tarafında. İşletmede bunun anlamı
> farklıysa `CATEGORY_MAP` içinde `yon:'alacak'` yap.

## Roller

| Rol | Görebildiği |
|---|---|
| patron | hepsi — rapor, stok, çekler, bütün müdürlerin girdileri |
| müdür | yalnız ana ekran ve tablo (kendi gider girişi) |

Kişiler ve rolleri `tools/make-pins.mjs` içindeki listede tanımlı.

## Giriş ve "beni hatırla"

Giriş ekranındaki **Beni hatırla** işaretliyken (varsayılan açık) PIN bir kez
girilir; uygulama sonraki açılışlarda doğrudan içeri girer. Saklanan şey PIN
değil, PIN'in özeti — ve her açılışta süre tazelenir, yani günlük kullanımda
bir daha sorulmaz. Telefon 30 gün hiç açılmazsa oturum düşer ve PIN yeniden
istenir. **Çıkış Yap** (Tablo → Yedekleme) hatırlamayı da bırakır.

> Hatırlanan oturum, telefonu eline alan herkesin uygulamaya girebilmesi
> demektir. Telefonun kendi ekran kilidi bu yüzden önemli. Ortak kullanılan
> bir cihazda kutunun işaretini kaldırın.

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

### Kullanıcı kendi PIN'ini değiştirebilir

Uygulama içinde: **Tablo → Güvenlik → PIN'imi değiştir**. Mevcut PIN sorulur,
yeni PIN 6-8 hane olmalı ve başka bir kullanıcınınkiyle çakışamaz.

Bu değişiklik **yalnız o cihazda** geçerlidir: sayfa kendi kaynağını
yazamadığı için değişiklik telefonun kendi deposunda tutuluyor. Aynı kişi
başka bir telefondan girerse orada eski PIN çalışmaya devam eder. Herkes için
kalıcı değişiklik `npm run pin` + yayın ile yapılır.

`npm run pin` çalıştırıldığında cihazlardaki değişiklikler kendiliğinden
düşer (her değişiklik hangi taban PIN'in yerine geçtiğini tutar). Yani bir
kullanıcı PIN'ini unutursa yayından sıfırlamak her zaman işe yarar.

### Bunun sınırı

Bu değişiklik, **kaynağı görüntüleyen birinin PIN'i doğrudan okumasını**
engeller. Engellemediği şey: doğrulama hâlâ tarayıcıda yapılıyor, yani
tarayıcı konsolunu kullanmayı bilen biri `CURRENT` değişkenini değiştirip
patron gibi davranabilir. Buna kod tarafında kapatılabilecek bir çözüm yok —
istemciye gönderilen hiçbir kontrol güvenlik sınırı değildir.

**Verinin korunması Firebase güvenlik kurallarına bağlı.** Kurallar
yayınlanmadığı sürece, veritabanı adresini bilen biri PIN'e hiç dokunmadan
bütün kayıtları okuyabilir ve silebilir. Aşağıdaki Firebase bölümüne bak.

## Firebase kurulumu

Kurallar `database.rules.json` dosyasında. **Repoda durması hiçbir şeyi
korumaz** — Firebase'de yayınlanmaları gerekir. İki yol var:

**Konsoldan (hesap dışında bir şey gerekmez)**

1. https://console.firebase.google.com → `guner-fc41b` projesi
2. Sol menü **Build → Realtime Database** → üstteki **Rules** sekmesi
3. Kutudaki her şeyi sil, `database.rules.json` dosyasının tamamını yapıştır
4. **Publish** → "Rules published" yazısını gör

**Komut satırından**

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only database
```

`firebase.json` ve `.firebaserc` repoda hazır; proje `guner-fc41b` olarak
tanımlı, başka ayar gerekmiyor.

### Kurallar ne yapıyor, ne yapmıyor

| | |
|---|---|
| Kök varsayılan kapalı | tanımsız hiçbir düğüm okunamaz/yazılamaz |
| `kayitlar` okuma | yalnız giriş yapmış istemciler |
| Kayıt yazma | **yalnız ekleme** — var olan kayıt değiştirilemez, silinemez |
| Alan doğrulama | tip ve uzunluk kontrolü; kota şişiren dev veri yazılamaz |

**Yapmadığı şey — bunu bilerek kullan:** uygulama anonim girişle bağlanıyor
ve anonim giriş herkese açık. Yani `auth != null` pratikte "veritabanı
adresini bilen herkes" demek. Bu kurallar veriyi **bozulmaya karşı** korur,
**gizlilik sağlamaz**.

Gerçek gizlilik için: Authentication → Sign-in method'da **Anonymous'ı
kapat**, **Email/Password**'ü aç, altı kişi için hesap aç; sonra uygulamanın
girişi PIN yerine bu hesaplara bağlanmalı ve kurallarda okuma izni
`auth.uid` ile sınırlanmalı. Bu, uygulama tarafında da değişiklik isteyen
ayrı bir iş.

`index.html` içindeki `FIREBASE_CONFIG` gizli bir bilgi değildir —
`apiKey` Firebase'de proje tanımlayıcısıdır, parola değil. Erişimi
belirleyen tek şey kurallardır.

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
database.rules.json     Firebase güvenlik kuralları (yayınlanmalı)
firebase.json           firebase deploy --only database için
tools/                  geliştirme araçları (yayına etkisi yok)
```

## Kontroller

```bash
npm install      # sadece test aracı (playwright-core); uygulama bağımlılıksız
npm run check    # sözdizimi, sürüm, onclick bağlantıları, manifest, PIN özetleri, Firebase kuralları
npm test         # gerçek tarayıcıda uçtan uca: kalıcılık, rol ayrımı, çevrimdışı
npm run bump     # yayın öncesi iki dosyadaki sürümü birlikte artırır
npm run pin      # PIN kodlarını yayın için değiştirir
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
- Kayıt sonrası teyit artık sesli okunmuyor; onay kutusu ekranda görünüyor.
  Stok teyidi, olağandışı tutar uyarısı ve öğrenme teyidi sesli kalmaya
  devam ediyor (Tablo → Sesli uyarılar'dan kapatılabilir).
- Çek hatırlatması yalnız uygulama açıkken/öne geldiğinde çalışır; arka
  planda bildirim gönderen bir servis yok.
- Uygulama içinden yapılan PIN değişikliği cihazlar arasında eşitlenmiyor.
  Bunun için PIN özetlerinin Firebase'e yazılması gerekir; kimliğin hâlâ
  istemcide doğrulandığı bir kurulumda bunu eklemek yeni bir açık yaratır,
  bu yüzden Firebase Authentication'a geçilmeden yapılmadı.
- Sesli komut iPhone/iPad tarayıcılarında çalışmaz (Safari canlı ses
  tanımayı desteklemiyor); metin elle de yazılabilir.
