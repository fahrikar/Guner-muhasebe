/* PIN kodlarını değiştirir — PIN'in kendisi hiçbir dosyaya yazılmaz.

   Kullanım:
     npm run pin                       # rastgele 4 haneli PIN'ler üretir
     npm run pin -- --sor              # PIN'leri sen yazarsın (4-8 hane)
     npm run pin -- --yeni-tuz         # tuzu da yeniler (tüm PIN'ler değişir)
     npm run pin -- --yalniz ahmet,osman   # yalnız bu kişilere yeni PIN;
                                       # diğerlerinin PIN'i aynı kalır

   Neden script: PIN'ler index.html'e düz yazıldığında, depoyu ya da sayfanın
   kaynağını gören herkes patron PIN'ini okuyabiliyordu. Burada yalnızca
   PBKDF2-SHA256 özeti dosyaya giriyor; PIN ekranda bir kez gösterilip
   unutuluyor.

   NE YAPMAZ: doğrulama hâlâ tarayıcıda. Teknik bilen biri konsoldan rolü
   değiştirebilir. Verinin gerçek koruması Firebase güvenlik kurallarıdır. */
import {readFileSync, writeFileSync} from "node:fs";
import {pbkdf2Sync, randomBytes, randomInt} from "node:crypto";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {createInterface} from "node:readline/promises";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const htmlPath=join(ROOT,"index.html");
let html=readFileSync(htmlPath,"utf8");

/* Kimler var — adları burada, PIN'leri değil. */
const KISILER=[
  {rol:"patron", ad:"Abdurrahman"},
  /* Kimlikler (mudurId) kayıtlarda ve şantiye atamalarında saklanıyor;
     bir kişinin kimliği sonradan değiştirilmemeli. Eski müdürlerin
     (m1…m5) kimlikleri yeniden kullanılmadı ki eski atamalar yanlış
     kişiye geçmesin. */
  {rol:"mudur",  ad:"Ahmet",  mudurId:"ahmet"},
  {rol:"mudur",  ad:"Osman",  mudurId:"osman"},
  {rol:"mudur",  ad:"İdris",  mudurId:"idris"},
  {rol:"mudur",  ad:"Fatih",  mudurId:"fatih"}
];

const args=process.argv.slice(2);
const sor=args.includes("--sor");
const yeniTuz=args.includes("--yeni-tuz");
const yalnizIdx=args.indexOf("--yalniz");
const yalniz=yalnizIdx>=0?(args[yalnizIdx+1]||"").split(",").map(x=>x.trim()).filter(Boolean):null;
const kid=k=>k.mudurId||k.rol;
/* Mevcut özetler: --yalniz ile dokunulmayan kişiler aynı PIN'le kalsın. */
const MEVCUT={};
for(const m of html.matchAll(/\{rol:'(\w+)', ad:'(?:[^'\\]|\\.)*'(?:, mudurId:'([^']+)')?, hash:'([0-9a-f]{64})'\}/g))
  MEVCUT[m[2]||m[1]]=m[3];
if(yalniz&&yeniTuz){ console.error("--yalniz ile --yeni-tuz birlikte olmaz: tuz değişirse herkesin PIN'i değişir."); process.exit(1); }

const iter=+(html.match(/const PIN_ITER\s*=\s*(\d+)/)||[])[1]||310000;
let salt=(html.match(/const PIN_SALT\s*=\s*"([0-9a-f]+)"/)||[])[1];
if(!salt||yeniTuz)salt=randomBytes(16).toString("hex");

const ozet=pin=>pbkdf2Sync(pin,Buffer.from(salt,"hex"),iter,32,"sha256").toString("hex");
const rastgelePin=()=>Array.from({length:4},()=>randomInt(10)).join("");

let pinler;
/* Bu kişiye yeni PIN üretilecek mi? (--yalniz yoksa herkese; varsa listedekilere
   ve özeti hiç olmayan yeni kişilere.) */
const uret=k=>!yalniz||yalniz.includes(kid(k))||!MEVCUT[kid(k)];
if(yalniz){
  const bilinmeyen=yalniz.filter(x=>!KISILER.some(k=>kid(k)===x));
  if(bilinmeyen.length){ console.error("Listede olmayan kişi: "+bilinmeyen.join(", ")); process.exit(1); }
}
if(sor){
  const rl=createInterface({input:process.stdin,output:process.stdout});
  pinler=[];
  for(const k of KISILER){
    if(!uret(k)){ pinler.push(null); continue; }
    let p="";
    while(!/^\d{4,8}$/.test(p)){
      p=(await rl.question(`${k.ad} için PIN (4-8 hane): `)).trim();
      if(!/^\d{4,8}$/.test(p))console.log("  → 4 ile 8 hane arasında, yalnız rakam.");
    }
    pinler.push(p);
  }
  rl.close();
}else{
  pinler=KISILER.map(k=>uret(k)?rastgelePin():null);
}

const yeniler=pinler.filter(Boolean);
const tekil=new Set(yeniler.map(ozet));
/* Aynı PIN iki kişide olursa giriş yanlış kişiyi seçer: eski özetlerle de çakışmamalı. */
const eskiOzetler=KISILER.filter(k=>!uret(k)).map(k=>MEVCUT[kid(k)]);
if(tekil.size!==yeniler.length||eskiOzetler.some(h=>tekil.has(h))){
  console.error("İki kişiye aynı PIN verilemez — tekrar çalıştırın.");
  process.exit(1);
}

const satirlar=KISILER.map((k,i)=>{
  const alanlar=[`rol:'${k.rol}'`,`ad:'${k.ad.replace(/'/g,"\\'")}'`];
  if(k.mudurId)alanlar.push(`mudurId:'${k.mudurId}'`);
  alanlar.push(`hash:'${pinler[i]?ozet(pinler[i]):MEVCUT[kid(k)]}'`);
  return `  {${alanlar.join(", ")}}`;
}).join(",\n");

html=html.replace(/const PIN_SALT\s*=\s*"[0-9a-f]*";/,`const PIN_SALT="${salt}";`);
const roleRe=/let BASE_ROLES=\[[\s\S]*?\n\];/;
if(!roleRe.test(html)){
  console.error("index.html içindeki BASE_ROLES bloğu bulunamadı.");
  process.exit(1);
}
html=html.replace(roleRe,`let BASE_ROLES=[\n${satirlar}\n];`);
writeFileSync(htmlPath,html);

console.log("\nPIN'ler güncellendi. index.html'e yalnızca özetler yazıldı.\n");
console.log("  Kişi              Rol      PIN");
console.log("  ────────────────  ───────  ────────");
KISILER.forEach((k,i)=>{
  console.log(`  ${k.ad.padEnd(16)}  ${k.rol.padEnd(7)}  ${pinler[i]||"(değişmedi)"}`);
});
console.log("\nBu liste hiçbir yere kaydedilmedi — şimdi ilgili kişilere ilet.");
console.log("Sonraki adım: npm run check && npm test\n");
