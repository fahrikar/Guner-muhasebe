/* Statik kontroller — tarayıcı gerektirmez, saniyeler sürer.
   Çalıştır: npm run check

   Bu uygulamada hatalar bağırmıyor: tek dosyalık sayfada bir yazım hatası
   ekranı tamamen boş bırakır, satır içi bir onclick yanlış ada bakarsa düğme
   sessizce ölür, manifest bozulursa uygulama "tarayıcı kısayolu" olarak
   kurulur. Buradaki kontroller bunları erken yakalar. */
import {readFileSync, mkdtempSync, writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const fails=[];
const ok=m=>console.log("  ok   "+m);
const bad=m=>{fails.push(m);console.log("  HATA "+m);};

const html=readFileSync(join(ROOT,"index.html"),"utf8");
const sw=readFileSync(join(ROOT,"sw.js"),"utf8");
const tmp=mkdtempSync(join(tmpdir(),"gm-check-"));

/* 1 — sözdizimi */
const blocks=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(!blocks.length)bad("index.html içinde gömülü <script> bulunamadı.");
blocks.forEach((code,i)=>{
  const f=join(tmp,`inline-${i}.js`);
  writeFileSync(f,code);
  try{execFileSync(process.execPath,["--check",f],{stdio:"pipe"});ok(`index.html script #${i+1} sözdizimi`);}
  catch(e){bad(`index.html script #${i+1}: ${String(e.stderr||e.message).trim().split("\n")[0]}`);}
});
try{execFileSync(process.execPath,["--check",join(ROOT,"sw.js")],{stdio:"pipe"});ok("sw.js sözdizimi");}
catch(e){bad(`sw.js: ${String(e.stderr||e.message).trim().split("\n")[0]}`);}

/* 2 — sürüm ikilisi: ayrışırsa otomatik güncelleme sessizce durur */
const appVer=(html.match(/const APP_VERSION\s*=\s*"([^"]+)"/)||[])[1];
const swVer=(sw.match(/const VERSION\s*=\s*"([^"]+)"/)||[])[1];
if(!appVer)bad("index.html içinde APP_VERSION bulunamadı.");
else if(!swVer)bad("sw.js içinde VERSION bulunamadı.");
else if(appVer!==swVer)
  bad(`sürümler ayrışmış: index.html="${appVer}", sw.js="${swVer}". `
     +"Birlikte artırılmalı, yoksa uygulama kendini güncellemez.");
else ok(`sürüm ikilisi tutarlı (${appVer})`);

/* 3 — service worker'ın ön yüklediği dosyalar gerçekten var mı? */
const assets=(sw.match(/const ASSETS\s*=\s*\[([\s\S]*?)\]/)||["",""])[1]
  .split(",").map(s=>s.trim().replace(/^["']|["']$/g,"")).filter(s=>s&&s!=="./");
for(const a of assets){
  try{readFileSync(join(ROOT,a));ok(`sw.js ön yükleme: ${a}`);}
  catch{bad(`sw.js ASSETS içindeki ${a} repoda yok — önbellek eksik kalır.`);}
}

/* 4 — satır içi onclick'ler gerçek bir fonksiyona bağlı mı?
   Arayüz baştan sona onclick="fn()" ile kurulu; bir ad değişince sayfa
   açılır ama düğme çalışmaz ve bunu yalnız o düğmeye basan görür. */
const script=blocks.join("\n");
const defined=new Set([
  ...[...script.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]),
  ...[...script.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\()/g)].map(m=>m[1])
]);
/* `onkeydown="if(...)"` gibi gömülü deyimler çağrı sanılmasın. */
const KEYWORDS=new Set(["if","for","while","switch","return","typeof","do","else",
                        "try","catch","function","new","delete","void","await","throw"]);
const called=new Set([...html.matchAll(/\bon\w+="\s*([A-Za-z_$][\w$]*)\s*\(/g)]
  .map(m=>m[1]).filter(n=>!KEYWORDS.has(n)));
const missing=[...called].filter(n=>!defined.has(n));
if(missing.length)bad(`HTML'deki olay bağlantıları tanımsız fonksiyona bakıyor: ${missing.join(", ")}`);
else ok(`satır içi olay bağlantıları (${called.size} fonksiyon) tanımlı`);

/* 5 — ana ekran kurulumu */
if(!/<link[^>]+rel="manifest"/.test(html))bad('index.html içinde <link rel="manifest"> yok.');
else ok("index.html manifest'e bağlı");
let manifest=null;
try{manifest=JSON.parse(readFileSync(join(ROOT,"manifest.webmanifest"),"utf8"));ok("manifest.webmanifest okunabiliyor");}
catch(e){bad(`manifest.webmanifest okunamadı: ${e.message}`);}
if(manifest){
  for(const key of ["name","start_url","display","icons"])
    if(!manifest[key])bad(`manifest.webmanifest içinde ${key} yok.`);
  for(const ic of manifest.icons||[]){
    try{readFileSync(join(ROOT,ic.src));}catch{bad(`manifest'teki ikon repoda yok: ${ic.src}`);}
  }
  if(!(manifest.icons||[]).some(i=>String(i.purpose||"").includes("maskable")))
    bad("manifest'te maskable ikon yok — Android'de simge beyaz kutu içinde görünür.");
  ok("manifest ikonları yerinde");
}

/* 6 — Excel kütüphanesi repodan mı geliyor?
   CDN'e dönerse uygulama çevrimdışıyken Excel üretemez hâle gelir. */
if(/<script[^>]+src="https?:[^"]*xlsx/i.test(html))
  bad("xlsx hâlâ CDN'den çekiliyor — çevrimdışıyken Excel üretilemez.");
else if(!/<script[^>]+src="xlsx\.full\.min\.js"/.test(html))
  bad("index.html yerel xlsx.full.min.js'e bağlı değil.");
else{
  try{readFileSync(join(ROOT,"xlsx.full.min.js"));ok("xlsx repoda ve yerelden yükleniyor");}
  catch{bad("xlsx.full.min.js repoda yok.");}
}

/* 7 — PIN'ler kaynağa geri sızmasın.
   Sayfa herkese servis edilen bir dosya; buraya düz yazılan bir PIN'i
   kaynağı görüntüleyen herkes okur. Yalnız PBKDF2 özetleri durmalı. */
const rolesBlock=(html.match(/let BASE_ROLES=\[[\s\S]*?\n\];/)||[""])[0];
if(!rolesBlock)bad("index.html içinde BASE_ROLES bloğu bulunamadı.");
else{
  const acikPin=/['"]\d{4,8}['"]\s*:/.test(rolesBlock)||/\bpin\s*:/i.test(rolesBlock);
  const ozetler=[...rolesBlock.matchAll(/hash:'([0-9a-f]{64})'/g)];
  if(acikPin)bad("ROLES içinde açık PIN var — `npm run pin` ile özete çevirin.");
  else if(!ozetler.length)bad("ROLES içinde PBKDF2 özeti yok; giriş çalışmaz.");
  else ok(`PIN'ler özetlenmiş (${ozetler.length} kişi)`);
  const iter=+((html.match(/const PIN_ITER\s*=\s*(\d+)/)||[])[1]||0);
  if(iter<100000)bad(`PIN_ITER çok düşük (${iter}) — kaba kuvvet ucuzlar.`);
  else ok(`PBKDF2 tur sayısı yeterli (${iter.toLocaleString("tr-TR")})`);
}

/* 8 — Firebase kural dosyası yayınlanabilir mi?
   Firebase yalnız tek bir "rules" anahtarı kabul ediyor; yanına açıklama
   anahtarı konursa dosya "unexpected key" diye reddediliyor ve kurallar
   yayınlanmadan kalıyor — yani veritabanı korumasız kalıyor. */
try{
  const ham=readFileSync(join(ROOT,"database.rules.json"),"utf8");
  const temiz=ham.split("\n").filter(l=>!/^\s*\/\//.test(l)).join("\n");
  const kural=JSON.parse(temiz);
  const ust=Object.keys(kural);
  if(ust.length!==1||ust[0]!=="rules")
    bad(`database.rules.json üst düzeyinde yalnız "rules" olmalı, şunlar var: ${ust.join(", ")}`);
  else if(kural.rules[".read"]!==false||kural.rules[".write"]!==false)
    bad("database.rules.json kökü kapalı değil — tanımsız düğümler herkese açık kalır.");
  else ok("database.rules.json yayınlanabilir (kök kapalı)");
}catch(e){ bad(`database.rules.json okunamadı: ${e.message}`); }

/* 9 — engelleyici <script> kalmasın: ilk çizimi geciktiriyor */
const blocking=[...html.matchAll(/<script(?![^>]*\bdefer\b)(?![^>]*\basync\b)[^>]*\ssrc="[^"]+"[^>]*>/g)];
if(blocking.length)bad(`${blocking.length} adet defer'siz <script src> var; sayfa yüklenene kadar boş kalır.`);
else ok("dış script'lerin hepsi defer");

/* 10 — sesli komut ayrıştırıcısı.
   Bu bölüm iki kez bozuldu ve iki kez "tanınan kalem yok" diye geri geldi;
   çünkü tek testi "beş bin" idi, yani yalnız çalışan yolu deniyordu. Buradaki
   cümleler bozulan yolları tutuyor:
     - rakam + çarpan kelimesi ("12 bin") — çarpan düşünce 12.000 ₺ 12 ₺ olur
     - tutarın kategoriden ÖNCE söylenmesi ("5000 fabrika gideri")
     - ondalık ("1,5 milyon") — virgül silinince on kat şişer
   Ayrıştırıcı index.html'den olduğu gibi okunur; kopya tutulmaz ki
   uygulamayla test birbirinden ayrı düşmesin. */
{
  const bas=html.indexOf("const NUMW="), son=html.indexOf("function money(n)");
  if(bas<0||son<0||son<=bas)bad("ayrıştırıcı index.html içinde bulunamadı (test güncellenmeli).");
  else{
    const durumlar=[
      ["işçi ödemesi 12 bin",              [["İşçi Ödemesi",12000]]],
      ["kira 15 bin lira ödedim",          [["Kira",15000]]],
      ["tahsilat 50 bin geldi",            [["Tahsilat",50000]]],
      ["5000 fabrika gideri",              [["Fabrika Gideri",5000]]],
      ["yüz bin tahsilat",                 [["Tahsilat",100000]]],
      ["boya beş bin",                     [["Boya Hammaddesi",5000]]],
      ["mazot on iki bin",                 [["Yakıt",12000]]],
      ["fabrika gideri 5000",              [["Fabrika Gideri",5000]]],
      ["1,5 milyon çek",                   [["Çek",1500000]]],
      ["işçi 2 bin 500",                   [["İşçi Ödemesi",2500]]],
      ["boya 2500 ve tiner 800",           [["Boya Hammaddesi",2500],["Boya Hammaddesi",800]]],
      ["bugün fabrika gideri 5000 tl oldu",[["Fabrika Gideri",5000]]],
      ["çimento 7.500 tl",                 [["İnşaat Malzemesi",7500]]],
      ["5000 fabrika gideri 3000 boya",    [["Fabrika Gideri",5000],["Boya Hammaddesi",3000]]],
      ["elektrik 4200 su faturası 1300",   [["Elektrik",4200],["Su",1300]]],
      ["emanet beş bin, yakıt 2.500, tahsilat 12.000",
                                           [["Emanet",5000],["Yakıt",2500],["Tahsilat",12000]]],
      ["2.500,75 nakliye",                 [["Nakliye",2500.75]]],
      /* 'cek' anahtarı gelecek zaman ekine takılıyordu: "ödeyecek" çek
         kaydına dönüşüyordu. Anahtar artık kelime başında aranıyor. */
      ["ödeyecek 5000",                    [[null,5000]]],
      ["ödeyeceğim 1500",                  [[null,1500]]],
      ["gelecek hafta boya 2000",          [["Boya Hammaddesi",2000]]],
      ["çek 5000",                         [["Çek",5000]]],
      ["çekle ödedim 3000",                [["Çek",3000]]],
      ["cek 1200",                         [["Çek",1200]]],
      /* Tarihler tutar sanılıyordu: "ayın 26'sı" 26 ₺ olup asıl tutarı da
         sahipsiz bırakıyordu. */
      ["ayın 26sı fabrika gideri 5000",    [["Fabrika Gideri",5000]]],
      ["ayın 26 sı boya 2000",             [["Boya Hammaddesi",2000]]],
      ["ayın 26sında kira 15 bin",         [["Kira",15000]]],
      ["Ayın 26sı yakıt 900",              [["Yakıt",900]]],
      ["26 ocak yakıt 900",                [["Yakıt",900]]],
      ["26 ocakta nakliye 1500",           [["Nakliye",1500]]],
      ["26.01.2026 elektrik 4200",         [["Elektrik",4200]]],
      /* Süre ifadeleri de tutar sanılıyordu: "10 milyon verildi 15 gün sonra
         alınacak" iki kalem çıkarıyordu — 10.000.000 ve olmayan bir
         "Verildi 15 ₺". Son ikisi sıranın kanıtı: süre temizliği sayı
         birleştirmeden önce çalışmazsa vadedeki sayı tutara karışıyor
         (15 bin + 2 hafta -> 15002). */
      ["Mehmet güner'e 10 milyon verildi 15 gün sonra alınacak",
                                           [[null,10000000]]],
      ["Hamdiye 3 milyon verildi 27 Eylül'de geri verecek",
                                           [[null,3000000]]],
      ["boya 2000 3 ay sonra ödenecek",     [["Boya Hammaddesi",2000]]],
      ["yakıt 900 30 gün vadeli",           [["Yakıt",900]]],
      ["kira 15 bin 2 hafta içinde",        [["Kira",15000]]],
      ["nakliye 1200 bir yıl sonra",        [["Nakliye",1200]]],
    ];
    try{
      // LEXICON dilimin içinde zaten tanımlı (öğrenen sözlük, boş başlar).
      const parse=new Function(html.slice(bas,son)+"\nreturn parseItems;")();
      const kotu=durumlar.filter(([cumle,bekle])=>
        JSON.stringify(parse(cumle).map(i=>[i.known,i.amount]))!==JSON.stringify(bekle));
      if(kotu.length){
        kotu.forEach(([cumle,bekle])=>bad(`ayrıştırıcı "${cumle}" -> `
          +`beklenen ${JSON.stringify(bekle)}, çıkan `
          +`${JSON.stringify(parse(cumle).map(i=>[i.known,i.amount]))}`));
      }else ok(`sesli komut ayrıştırıcısı (${durumlar.length} cümle)`);
    }catch(e){ bad(`ayrıştırıcı çalıştırılamadı: ${e.message}`); }
  }
}

/* 11 — verilen borç algılaması.
   İki şart birden aranıyor: verme fiili VE geri dönüş fiili. Yalnız
   "verildi"ye bakılsaydı "işçi ödemesi verildi" de alacak sanılır, gerçek
   gider tablodan düşerdi. Aşağıdaki olumsuz durumlar o çizgiyi tutuyor. */
{
  const bas=html.indexOf("const NUMW="), son=html.indexOf("function money(n)");
  if(bas<0||son<0)bad("borç algılayıcı bulunamadı (test güncellenmeli).");
  else try{
    const api=new Function("const pad=n=>String(n).padStart(2,'0');"+html.slice(bas,son)
      +"\nreturn {detectLoan,vadeCoz};")();
    const G="2026-08-09T12:00:00";
    const borclar=[
      ["Mehmet güner'e 10 milyon verildi 15 gün sonra alınacak",10000000,"2026-08-24"],
      ["Mehmet'e 16 milyon verildi 26 Eylül'de geri alınacak",   16000000,"2026-09-26"],
      ["Hamdiye'ye 26 milyon verildi Ağustos 28'de tekrar ödeyecek",26000000,"2026-08-28"],
      ["Ali'ye 5 bin borç verdim ayın 26sında ödeyecek",             5000,"2026-08-26"],
      ["Veli'ye 2 milyon ödünç verildi üç ay sonra geri alacağım",2000000,"2026-11-09"],
    ];
    const giderler=["işçi ödemesi 12 bin verildi","yakıt 900","fabrika gideri 5000 ödendi",
                    "emanet beş bin","boya 2000 3 ay sonra ödenecek"];
    const kotu=[];
    borclar.forEach(([c,tutar,vade])=>{
      const r=api.detectLoan(c);
      if(!r)kotu.push(`"${c}" borç olarak algılanmadı`);
      else if(r.tutar!==tutar)kotu.push(`"${c}" tutarı ${r.tutar}, beklenen ${tutar}`);
      else if(api.vadeCoz(c,G)!==vade)kotu.push(`"${c}" vadesi ${api.vadeCoz(c,G)||"boş"}, beklenen ${vade}`);
    });
    giderler.forEach(c=>{ if(api.detectLoan(c))kotu.push(`"${c}" borç sanıldı — gerçek gider tablodan düşer`); });
    if(kotu.length)kotu.forEach(m=>bad("borç algılama: "+m));
    else ok(`verilen borç algılaması (${borclar.length} borç, ${giderler.length} gider)`);
  }catch(e){ bad(`borç algılayıcı çalıştırılamadı: ${e.message}`); }
}

/* 12 — belge muafiyeti doğru kişilere bakıyor mu?
   Muafiyet 'patron' ve 'm4' diye kişi kimliğiyle yazılı. Rol listesindeki
   sıra değişir de Ömer başka bir mudurId alırsa muafiyet sessizce yanlış
   kişiye geçer — kimse fark etmez. Burası o bağı tutuyor. */
{
  const muaf=(html.match(/const BELGE_MUAF\s*=\s*\[([^\]]*)\]/)||[])[1];
  const omer=(html.match(/rol:'mudur',\s*ad:'Ömer[^']*',\s*mudurId:'([^']+)'/)||[])[1];
  if(muaf===undefined)bad("BELGE_MUAF bulunamadı — belge muafiyeti tanımsız.");
  else if(!omer)bad("Ömer rol listesinde bulunamadı — belge muafiyeti doğrulanamıyor.");
  else if(!/rol==='patron'\)return true/.test(html))
    bad("Patron muafiyeti rolden okunmuyor — Abdurrahman'a belge sorulabilir.");
  else{
    const liste=muaf.split(",").map(s=>s.trim().replace(/^['"]|['"]$/g,"")).filter(Boolean);
    if(!liste.includes(omer))bad(`Ömer '${omer}' ama BELGE_MUAF şunları taşıyor: ${liste.join(", ")||"(boş)"}.`);
    else ok(`belge muafiyeti doğru kişilerde (patron, Ömer=${omer})`);
  }
}

console.log(fails.length?`\n${fails.length} kontrol başarısız.`:"\nTüm kontroller geçti.");
process.exit(fails.length?1:0);
