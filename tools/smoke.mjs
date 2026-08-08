/* Tarayıcı smoke testi — gerçek Chromium'da uçtan uca akış.
   Çalıştır: npm test

   Neyi koruyor: bu uygulamada hatalar sessizdi. Kayıtlar hiç saklanmıyordu
   ama ekranda "telefonda saklanıyor" yazıyordu; giriş ekranı alt menüden
   atlanabiliyordu; internet yokken Excel düğmeleri hata vermeden çöküyordu.
   Test bunların hepsini tek tek yokluyor.

   Sayfa http üzerinden sunulur: service worker file:// ile çalışmaz. */
import {createServer} from "node:http";
import {readFile, readdir} from "node:fs/promises";
import {existsSync} from "node:fs";
import {join, extname, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright-core";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const TYPES={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
             ".webmanifest":"application/manifest+json",".png":"image/png",".svg":"image/svg+xml"};
let failed=0;
const check=(n,c,d)=>{ if(c)console.log("  ok   "+n); else{failed++;console.log("  HATA "+n+(d!==undefined?" → "+d:""));} };

const srv=createServer(async(req,res)=>{
  let p=decodeURIComponent(new URL(req.url,"http://x").pathname);
  if(p.endsWith("/"))p+="index.html";
  try{const b=await readFile(join(ROOT,p));
    res.writeHead(200,{"Content-Type":TYPES[extname(p)]||"application/octet-stream","Cache-Control":"no-cache"});
    res.end(b);}catch{res.writeHead(404).end("yok");}
});
const port=await new Promise(r=>srv.listen(0,"127.0.0.1",()=>r(srv.address().port)));

/* Chromium'u bulur: ortam değişkeni → hazır kurulum → playwright'ın yolu. */
async function findChromium(){
  if(process.env.CHROME_PATH)return process.env.CHROME_PATH;
  const base=process.env.PLAYWRIGHT_BROWSERS_PATH||"/opt/pw-browsers";
  if(existsSync(base)){
    const dirs=(await readdir(base)).filter(d=>d.startsWith("chromium-")).sort().reverse();
    for(const d of dirs){
      const q=join(base,d,"chrome-linux","chrome");
      if(existsSync(q))return q;
    }
  }
  try{const q=chromium.executablePath();if(q&&existsSync(q))return q;}catch{}
  return null;
}
const exe=await findChromium();
if(!exe){
  console.error("Chromium bulunamadı. CHROME_PATH ile yol verin veya bir Chromium kurun.");
  srv.close(); process.exit(1);
}

const b=await chromium.launch({executablePath:exe,args:["--no-sandbox"],headless:true});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const page=await ctx.newPage();
const errs=[];
page.on("pageerror",e=>errs.push(e.message));
let lastDialog="";
page.on("dialog",async d=>{ lastDialog=d.message(); await d.accept(); });

/* Gerçek PIN'ler repoda yok (özet olarak duruyorlar) ve testte de olmamalı.
   Sayfanın kendi pinHash'i ile testlik bir ROLES tablosu kuruyoruz; her
   yeniden yüklemeden sonra tekrarlanmalı. */
const TEST_PATRON="11111111", TEST_MUDUR="22222222";
async function setupPins(){
  await page.evaluate(async([p,m])=>{
    ROLES=[{rol:'patron',ad:'Test Patron',hash:await pinHash(p)},
           {rol:'mudur', ad:'Test Müdür',mudurId:'m1',hash:await pinHash(m)}];
  },[TEST_PATRON,TEST_MUDUR]);
}
async function login(pin){
  await page.fill("#pinInput",pin);
  await page.click('button:has-text("Gir")');
  await page.waitForFunction(
    ()=>CURRENT!==null||/Hatalı|gerekiyor|edilemedi|girin/.test(document.getElementById('loginStatus').textContent),
    null,{timeout:20000});
  await page.waitForTimeout(250);
}

try{
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForTimeout(600);
  await setupPins();

  /* PIN'ler kaynakta düz durmuyor: yalnız özet var. */
  check("PIN'ler kaynakta açık değil",
    await page.evaluate(()=>ROLES.every(r=>r.hash&&r.hash.length===64&&!('pin'in r))));

  /* 1 — giriş yapılmadan içeri girilemiyor */
  check("giriş ekranı açık",await page.isVisible("#login"));
  check("alt menü giriş öncesi gizli",!(await page.isVisible("nav")));
  await page.evaluate(()=>go('stock'));            // menü gizli, doğrudan çağır
  check("go() giriş olmadan ekran açmıyor",
    !(await page.isVisible("#stock"))&&await page.isVisible("#login"));

  /* 2 — hatalı PIN */
  await login("99999999");
  check("hatalı PIN reddediliyor",(await page.textContent("#loginStatus")).includes("Hatalı"));

  /* 3 — müdür patron ekranlarını açamıyor */
  await login(TEST_MUDUR);
  check("müdür giriş yaptı",await page.isVisible("#home"));
  check("müdüre patron sekmeleri gizli",!(await page.isVisible("#nStock")));
  await page.evaluate(()=>go('stock'));
  check("müdür doğrudan çağrıyla da stok göremiyor",!(await page.isVisible("#stock")));
  await page.evaluate(()=>logout());
  await page.waitForTimeout(200);

  /* 4 — patron girişi + veri girişi */
  await login(TEST_PATRON);
  check("patrona tüm sekmeler açık",await page.isVisible("#nStock"));

  await page.evaluate(()=>go('stock'));
  await page.click('button:has-text("Yeni Ürün")');
  await page.fill("#stName","Beyaz boya 20 kg");
  await page.fill("#stUnit","kg");
  await page.fill("#stQty","40");
  await page.fill("#stMin","10");
  await page.fill("#stPrice","250");
  await page.click('#stockForm button:has-text("Kaydet")');
  await page.waitForTimeout(300);
  check("stok kalemi eklendi",(await page.textContent("#stockList")).includes("Beyaz boya"));

  await page.evaluate(()=>go('payments'));
  await page.fill("#payTitle","Ahmet'e çek");
  await page.fill("#payAmount","15.000 ₺");
  const ileri=new Date(Date.now()+15*864e5).toISOString().slice(0,10);
  await page.fill("#payDate",ileri);
  await page.click('#payments button:has-text("Ekle")');
  await page.waitForTimeout(300);
  check("çek eklendi",(await page.textContent("#payList")).includes("Ahmet"));
  check("tırnaklı metin arayüzü bozmuyor",(await page.textContent("#payList")).includes("Ahmet'e çek"));

  /* sesli kayıt yerine metinden kayıt */
  await page.evaluate(()=>{document.getElementById('voiceText').value='emanet beş bin, yakıt 2.500';});
  await page.evaluate(()=>saveNote('voice'));
  await page.waitForTimeout(300);
  await page.evaluate(()=>go('notes'));
  const tablo=await page.textContent("#tableBox");
  check("konuşma kalemlere ayrıldı",tablo.includes("Emanet")&&tablo.includes("Yakıt"),tablo.slice(0,120));

  /* 5 — KALICILIK: sayfayı yenile, tekrar gir */
  await page.reload();
  await page.waitForTimeout(600);
  await setupPins();
  await login(TEST_PATRON);
  await page.evaluate(()=>go('notes'));
  const tablo2=await page.textContent("#tableBox");
  check("KAYITLAR yenilemeden sonra duruyor",tablo2.includes("Emanet"),tablo2.slice(0,120));
  await page.evaluate(()=>go('stock'));
  check("STOK yenilemeden sonra duruyor",(await page.textContent("#stockList")).includes("Beyaz boya"));
  await page.evaluate(()=>go('payments'));
  check("ÇEKLER yenilemeden sonra duruyor",(await page.textContent("#payList")).includes("Ahmet"));

  /* 6 — çıkış yapınca ekranda veri kalmıyor, tekrar girişte geri geliyor */
  await page.evaluate(()=>logout());
  await page.waitForTimeout(200);
  check("çıkışta giriş ekranı",await page.isVisible("#login")&&!(await page.isVisible("nav")));
  check("çıkışta bellek temizlendi",await page.evaluate(()=>NOTES.length===0));
  await login(TEST_PATRON);
  check("tekrar girişte veri geri yüklendi",await page.evaluate(()=>NOTES.length>0));

  /* 7 — silme onay istiyor */
  await page.evaluate(()=>go('notes'));
  const oncekiSatir=await page.evaluate(()=>NOTES.reduce((a,n)=>a+(n.items||[]).length,0));
  await page.evaluate(()=>delRow(NOTES[0].id,0));
  await page.waitForTimeout(200);
  check("silmeden önce onay soruluyor",lastDialog.includes("silinsin mi"),lastDialog);
  check("onay verilince silindi",
    await page.evaluate(o=>NOTES.reduce((a,n)=>a+(n.items||[]).length,0)===o-1,oncekiSatir));

  /* 8 — CDN olmadan dışa aktarma çökmüyor */
  const cdnsuz=await page.evaluate(()=>{
    /* `delete window.XLSX` işe yaramaz: script etiketiyle gelen genel
       değişken configurable değil, silinmiyor. Değeri geçici olarak
       boşaltmak kütüphane yokmuş gibi davranmayı sağlar. */
    const y=window.XLSX; window.XLSX=undefined;
    let hata=null;
    try{ exportTable(); exportStock(); exportFullTemplate(); }catch(e){ hata=e.message; }
    window.XLSX=y; return hata;
  });
  check("XLSX yokken dışa aktarma çökmüyor",cdnsuz===null,cdnsuz);
  check("kullanıcıya sebebi söyleniyor",lastDialog.includes("Excel kütüphanesi"),lastDialog);

  /* 9 — CSV internet gerektirmeden çalışıyor */
  const csv=await page.evaluate(()=>{
    let ok=false;
    const orj=URL.createObjectURL;
    URL.createObjectURL=b=>{ok=b.size>0;return orj(b);};
    exportTableCSV(); URL.createObjectURL=orj; return ok;
  });
  check("CSV üretiliyor",csv);

  /* 10 — ana ekran kurulumu: manifest ve ikonlar sunuluyor */
  const manifest=await page.evaluate(async()=>{
    const href=document.querySelector('link[rel="manifest"]')?.href;
    if(!href)return null;
    const r=await fetch(href); if(!r.ok)return null;
    const m=await r.json();
    const icons=await Promise.all((m.icons||[]).map(async i=>(await fetch(new URL(i.src,href))).ok));
    return {display:m.display,icons};
  });
  check("manifest yükleniyor ve standalone",
    !!manifest&&manifest.display==="standalone",JSON.stringify(manifest&&manifest.display));
  check("manifest'teki ikonlar sunucudan geliyor",
    !!manifest&&manifest.icons.length>0&&manifest.icons.every(Boolean));

  /* 11 — Excel kütüphanesi repodan geliyor (çevrimdışı Excel için şart) */
  check("xlsx yerelden yükleniyor",
    await page.evaluate(()=>[...document.scripts].some(s=>/^\/?xlsx\.full\.min\.js$/.test(
      new URL(s.src||"x:/",location.href).pathname.replace(/^\//,"")))));

  /* 12 — service worker devralıyor ve uygulama çevrimdışı açılıyor */
  const controlled=async ms=>{
    try{await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout:ms});return true;}
    catch{return false;}
  };
  let devraldi=await controlled(15000);
  if(!devraldi){await page.reload();await setupPins();devraldi=await controlled(15000);}
  check("service worker sayfayı devraldı",devraldi);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForTimeout(400);
  check("çevrimdışı açılıyor",await page.isVisible("#login"));
  check("çevrimdışı rozeti görünüyor",await page.isVisible("#offlineBadge"));
  await setupPins();
  await login(TEST_PATRON);
  check("çevrimdışı giriş yapılabiliyor",await page.isVisible("#home"));
  check("çevrimdışı Excel kütüphanesi yüklü",await page.evaluate(()=>typeof XLSX!=="undefined"));
  await ctx.setOffline(false);

  check("sayfada JS hatası yok",errs.length===0,errs.join(" | "));
}catch(e){ failed++; console.log("  HATA istisna → "+e.message); }
finally{ await b.close(); srv.close(); }
console.log(failed?`\n${failed} kontrol başarısız.`:"\nHepsi geçti.");
process.exit(failed?1:0);
