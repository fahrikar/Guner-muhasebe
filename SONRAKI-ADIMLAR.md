# Sıradaki adımlar

Bu dosya, bir sonraki oturumun (ya da birkaç hafta sonra dönen sen'in)
nerede kalındığını hatırlaması için. İşler bitince silinebilir.

## Nerede kalındı

Uygulama çalışır durumda ve `main`'de. `npm run check` + `npm test`
(11 + 53 kontrol) geçiyor. Ayrıntılı anlatım `README.md`'de.

**Uygulama henüz yayında değil, ama yayın düzeneği kuruldu.**
`.github/workflows/pages.yml` hazır: `main`'e her yazışta siteyi
GitHub Pages'e basıyor. Eksik olan tek şey aşağıdaki **bir tık**.

## Yapılacaklar — ikisi de bir siteye giriş yapmayı gerektiriyor

### 1. Pages'i aç — bir tık, sonrası kendiliğinden

Depo **public** olduğu için Pages ücretsiz. Ama Pages'i ilk kez açmak
depo sahibi yetkisi istiyor; workflow'un kendi token'ı bunu yapamıyor
(`Resource not accessible by integration`). Bu yüzden tek seferlik:

1. https://github.com/fahrikar/Guner-muhasebe/settings/pages
2. **Build and deployment → Source** → **GitHub Actions** seç
   (**"Deploy from a branch" değil** — o seçilirse buradaki workflow
   boşa çalışır)
3. https://github.com/fahrikar/Guner-muhasebe/actions/workflows/pages.yml
   → **Run workflow** → `main`

Bir iki dakika sonra adres: **https://fahrikar.github.io/Guner-muhasebe/**

Herkese **aynı link** verilir; kim olduklarını PIN belirler. Bundan sonra
`main`'e her yazış siteyi kendiliğinden günceller.

### 2. Firebase güvenlik kurallarını yayınla

Bu yapılmadığı sürece veritabanı korumasız. `database.rules.json`
dosyasının tamamı:

- Konsol → https://console.firebase.google.com → `guner-fc41b` →
  **Build → Realtime Database → Rules** → yapıştır → **Publish**
- ya da `firebase deploy --only database` (`firebase.json` hazır)

## Bilinmesi gereken kararlar

**Depo public kalıyor — bilerek.** Önceki plan depoyu private yapıp
Netlify'dan yayınlamaktı. Bunun yerine GitHub Pages seçildi; Free planda
Pages yalnız public depodan yayın yapıyor, yani ikisi bir arada olmuyor.
Private'a dönülürse yayın durur ve Netlify'a geçmek gerekir. Public
kalması bir şey sızdırmıyor: PIN'ler repoda yok (aşağıda), Firebase
adresi ise zaten tarayıcıya inen `index.html`'in içinde — depo private
olsa da site açık olduğu için görünürdü. Veriyi koruyan şey deponun
görünürlüğü değil, aşağıdaki kurallar.

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
