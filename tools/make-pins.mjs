/* PIN kodlarını değiştirir — PIN'in kendisi hiçbir dosyaya yazılmaz.

   Kullanım:
     npm run pin                       # rastgele 8 haneli PIN'ler üretir
     npm run pin -- --sor              # PIN'leri sen yazarsın (ekranda görünmez)
     npm run pin -- --yeni-tuz         # tuzu da yeniler (tüm PIN'ler değişir)

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
  {rol:"mudur",  ad:"Ahmet 1", mudurId:"m1"},
  {rol:"mudur",  ad:"Hamdi 2", mudurId:"m2"},
  {rol:"mudur",  ad:"Fatih 3", mudurId:"m3"},
  {rol:"mudur",  ad:"Ömer 4", mudurId:"m4"},
  {rol:"mudur",  ad:"Çetin 5", mudurId:"m5"}
];

const args=process.argv.slice(2);
const sor=args.includes("--sor");
const yeniTuz=args.includes("--yeni-tuz");

const iter=+(html.match(/const PIN_ITER\s*=\s*(\d+)/)||[])[1]||310000;
let salt=(html.match(/const PIN_SALT\s*=\s*"([0-9a-f]+)"/)||[])[1];
if(!salt||yeniTuz)salt=randomBytes(16).toString("hex");

const ozet=pin=>pbkdf2Sync(pin,Buffer.from(salt,"hex"),iter,32,"sha256").toString("hex");
const rastgelePin=()=>Array.from({length:8},()=>randomInt(10)).join("");

let pinler;
if(sor){
  const rl=createInterface({input:process.stdin,output:process.stdout});
  pinler=[];
  for(const k of KISILER){
    let p="";
    while(!/^\d{6,8}$/.test(p)){
      p=(await rl.question(`${k.ad} için PIN (6-8 hane): `)).trim();
      if(!/^\d{6,8}$/.test(p))console.log("  → 6 ile 8 hane arasında, yalnız rakam.");
    }
    pinler.push(p);
  }
  rl.close();
}else{
  pinler=KISILER.map(rastgelePin);
}

const tekil=new Set(pinler);
if(tekil.size!==pinler.length){
  console.error("İki kişiye aynı PIN verilemez — tekrar çalıştırın.");
  process.exit(1);
}

const satirlar=KISILER.map((k,i)=>{
  const alanlar=[`rol:'${k.rol}'`,`ad:'${k.ad.replace(/'/g,"\\'")}'`];
  if(k.mudurId)alanlar.push(`mudurId:'${k.mudurId}'`);
  alanlar.push(`hash:'${ozet(pinler[i])}'`);
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
  console.log(`  ${k.ad.padEnd(16)}  ${k.rol.padEnd(7)}  ${pinler[i]}`);
});
console.log("\nBu liste hiçbir yere kaydedilmedi — şimdi ilgili kişilere ilet.");
console.log("Sonraki adım: npm run check && npm test\n");
