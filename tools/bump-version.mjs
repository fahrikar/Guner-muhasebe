/* Sürüm numarasını iki dosyada birlikte artırır.

   Kullanım:
     node tools/bump-version.mjs            # bugünün tarihi, gerekirse .2, .3
     node tools/bump-version.mjs 2026-09-01.1

   Neden script: index.html'deki APP_VERSION ile sw.js'teki VERSION ayrı
   yerlerde ve ikisi birlikte artmazsa güncelleme sessizce durur — sw.js
   baytı değişmezse tarayıcı yeni sürüm olduğunu anlamaz, kullanıcı eski
   sürümde kalır. Elle iki yeri düzenlemek unutulabilecek bir adım; burada
   tek komut. */
import {readFileSync, writeFileSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");

const htmlPath=join(ROOT,"index.html"), swPath=join(ROOT,"sw.js");
let html=readFileSync(htmlPath,"utf8"), sw=readFileSync(swPath,"utf8");

const appRe=/(const APP_VERSION\s*=\s*")([^"]+)(")/;
const swRe=/(const VERSION\s*=\s*")([^"]+)(")/;
const cur=(html.match(appRe)||[])[2];
const curSw=(sw.match(swRe)||[])[2];
if(!cur){console.error("index.html içinde APP_VERSION bulunamadı.");process.exit(1);}
if(!curSw){console.error("sw.js içinde VERSION bulunamadı.");process.exit(1);}

let next=process.argv[2];
if(!next){
  const d=new Date();
  const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  /* Aynı gün ikinci kez yayınlanırsa .2, .3 diye devam eder. */
  const m=cur.match(/^(\d{4}-\d{2}-\d{2})\.(\d+)$/);
  next=(m&&m[1]===today)?`${today}.${+m[2]+1}`:`${today}.1`;
}
if(next===cur&&next===curSw){
  console.error(`Sürüm zaten ${next}. Yeni bir değer verin veya tarihi değiştirin.`);
  process.exit(1);
}

writeFileSync(htmlPath,html.replace(appRe,`$1${next}$3`));
writeFileSync(swPath,sw.replace(swRe,`$1${next}$3`));
console.log(`Sürüm: ${cur} → ${next}`);
console.log("  index.html APP_VERSION ✓");
console.log("  sw.js      VERSION     ✓");
console.log("\nSırada: npm run check && npm test");
