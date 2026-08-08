# Sıradaki adımlar

Bu dosya, bir sonraki oturumun (ya da birkaç hafta sonra dönen sen'in)
nerede kalındığını hatırlaması için. İşler bitince silinebilir.

## Nerede kalındı

Uygulama çalışır durumda ve `main`'de. `npm run check` + `npm test`
(11 + 53 kontrol) geçiyor. Ayrıntılı anlatım `README.md`'de.

**Ama uygulama henüz hiçbir yerde yayında değil.** GitHub Pages kapalı,
Netlify bağlı değil. Kimse kullanamıyor.

## Yapılacaklar — üçü de bir siteye giriş yapmayı gerektiriyor

### 1. Yayına al (Netlify)

Depo private olacağı için GitHub Pages kullanılamıyor (Free planda private
depo Pages ile yayınlanamaz). Netlify private depodan da yayın yapıyor.

1. https://app.netlify.com → **Add new site → Import an existing project**
2. GitHub → `fahrikar/Guner-muhasebe`
3. Branch **`main`**, build komutu **boş**, publish directory **`.`** (nokta)
4. Deploy → `https://….netlify.app` adresi çıkar
5. Site settings → Change site name ile adres kısaltılabilir

Adres belli olunca herkese **aynı link** verilir; kim olduklarını PIN belirler.

### 2. Depoyu private yap

GitHub → Settings → en altta Danger Zone → **Change repository visibility**
→ Private. Netlify bağlantısı bundan etkilenmez.

### 3. Firebase güvenlik kurallarını yayınla

Bu yapılmadığı sürece veritabanı korumasız. `database.rules.json`
dosyasının tamamı:

- Konsol → https://console.firebase.google.com → `guner-fc41b` →
  **Build → Realtime Database → Rules** → yapıştır → **Publish**
- ya da `firebase deploy --only database` (`firebase.json` hazır)

## Bilinmesi gereken kararlar

**PIN'ler repoda yok.** `index.html` yalnızca PBKDF2 özetlerini taşıyor.
PIN listesi hiçbir dosyada durmuyor; değiştirmek için `npm run pin`
(komut yeni PIN'leri bir kez ekrana basar).

**Emanet kategorisi borç (çıkan) tarafında.** İşletmede anlamı farklıysa
`index.html` → `CATEGORY_MAP` → o satırdaki `yon` değiştirilir; geçmiş
kayıtlar kendiliğinden düzelir.

**Uygulama içinden PIN değişikliği yalnız o cihazda geçerli.** Sayfa kendi
kaynağını yazamadığı için değişiklik telefonun deposunda tutuluyor.

## Açık kalan asıl güvenlik işi

Uygulama Firebase'e **anonim** bağlanıyor. Anonim giriş herkese açık
olduğu için kurallardaki `auth != null` pratikte "veritabanı adresini bilen
herkes" demek. Yani kurallar veriyi **bozulmaya karşı** korur (kayıtlar
yalnız eklenebilir, değiştirilemez/silinemez) ama **gizlilik sağlamaz**.

Gerçek çözüm: Authentication → Sign-in method'da Anonymous kapatılıp
**Email/Password** açılacak, altı kişiye hesap verilecek, uygulamanın girişi
PIN yerine bu hesaplara bağlanacak ve kurallarda okuma izni `auth.uid` ile
sınırlanacak. Bu, uygulama tarafında da değişiklik isteyen ayrı bir iş —
istenirse yapılabilir.

## Ayrı depo, karıştırma

`fahrikar/gunkar-hammadde-siparis` **başka bir uygulama** (tedarikçiye
oluklu mukavva levha siparişi). Onun da bir iyileştirme dalı var
(`claude/app-improvements-quality-pat519`), `main`'e alınmadı — alınırsa
GitHub Pages üzerinden doğrudan telefonlardaki uygulama güncellenir.
