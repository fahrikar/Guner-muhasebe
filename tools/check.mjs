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

/* 8 — engelleyici <script> kalmasın: ilk çizimi geciktiriyor */
const blocking=[...html.matchAll(/<script(?![^>]*\bdefer\b)(?![^>]*\basync\b)[^>]*\ssrc="[^"]+"[^>]*>/g)];
if(blocking.length)bad(`${blocking.length} adet defer'siz <script src> var; sayfa yüklenene kadar boş kalır.`);
else ok("dış script'lerin hepsi defer");

console.log(fails.length?`\n${fails.length} kontrol başarısız.`:"\nTüm kontroller geçti.");
process.exit(fails.length?1:0);
