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
async function setupPins(temizle){
  await page.evaluate(async([p,m,t])=>{
    BASE_ROLES=[{rol:'patron',ad:'Test Patron',mudurId:'p0',hash:await pinHash(p)},
                {rol:'mudur', ad:'Test Müdür',mudurId:'m1',hash:await pinHash(m)}];
    if(t){PIN_OVERRIDES={};await Store.set('pins',{});}
    applyPinOverrides();
  },[TEST_PATRON,TEST_MUDUR,!!temizle]);
}
/* Her kayıt artık onay penceresinden geçiyor. Kaydetme çağrıları
   BEKLENMEDEN yapılmalı (pencere açıkken söz veren promise askıda kalır),
   sonra bu yardımcı Kaydet'e basar. */
async function onayVer(){
  await page.waitForSelector("#onayKat",{state:"visible",timeout:5000});
  await page.evaluate(()=>onayla());
  await page.waitForTimeout(150);
}
async function login(pin,hatirla=false){
  if(await page.isVisible("#rememberMe"))await page.setChecked("#rememberMe",hatirla);
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
  /* Gerçek taban özet: "beni hatırla" yenilemesini, hiçbir PIN bilmeden
     bu özet üzerinden sınayacağız (yenilemeden sonra BASE_ROLES gerçek
     listeye döndüğü için sahte PIN'ler orada bulunmaz). */
  const GERCEK_HASH=await page.evaluate(()=>BASE_ROLES[0].hash);
  await setupPins(true);

  /* PIN'ler kaynakta düz durmuyor: yalnız özet var. */
  check("PIN'ler kaynakta açık değil",
    await page.evaluate(()=>ROLES.every(r=>r.hash&&r.hash.length===64&&!('pin'in r))));

  /* 1 — giriş yapılmadan içeri girilemiyor */
  check("giriş ekranı açık",await page.isVisible("#login"));
  check("alt menü giriş öncesi gizli",!(await page.isVisible("nav")));
  /* Ayarlarda çıkış, yedek ve PIN değişimi var; giriş öncesi açılmamalı. */
  check("ayarlar dişlisi giriş öncesi gizli",!(await page.isVisible("#btnAyar")));
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

  /* sesli kayıt yerine metinden kayıt — biri borç, biri alacak tarafına */
  await page.evaluate(()=>{document.getElementById('voiceText').value='emanet beş bin, yakıt 2.500, tahsilat 12.000';});
  page.evaluate(()=>{saveNote('voice');});
  await onayVer();
  await page.waitForTimeout(300);
  await page.evaluate(()=>go('notes'));
  const tablo=await page.textContent("#tableBox");
  check("konuşma kalemlere ayrıldı",tablo.includes("Emanet")&&tablo.includes("Yakıt"),tablo.slice(0,120));

  /* --- borç / alacak ayrımı --- */
  check("tabloda BORÇ ve ALACAK blokları ayrı",
    tablo.includes("BORÇ")&&tablo.includes("ALACAK")&&tablo.includes("NET"),tablo.slice(0,160));
  const yon=await page.evaluate(()=>{
    const y=yonAyir(allItems(NOTES));
    return {borc:y.borc.map(i=>i.known),alacak:y.alacak.map(i=>i.known),
            tBorc:y.tBorc,tAlacak:y.tAlacak,net:y.net};
  });
  check("tahsilat alacak tarafında",yon.alacak.includes("Tahsilat"),JSON.stringify(yon.alacak));
  check("gider kalemleri borç tarafında",
    yon.borc.includes("Yakıt")&&yon.borc.includes("Emanet"),JSON.stringify(yon.borc));
  check("net = alacak − borç",yon.net===yon.tAlacak-yon.tBorc,JSON.stringify(yon));
  check("borç ve alacak tek toplamda karışmıyor",yon.tBorc>0&&yon.tAlacak>0&&yon.net!==yon.tBorc+yon.tAlacak);

  /* --- sözlükte olmayan kalem de kaydediliyor ---
     Asıl dert buydu: sözlükte olmayan bir şey söylenince kayıt sessizce
     düşüyor, ekran "Tanınan kalem yok" diyordu. Artık sözlük bir şart
     değil; onaylanan her kalem kaydediliyor ve tabloya giriyor. */
  page.evaluate(()=>{document.getElementById('voiceText').value='zımbırtı 4321';saveNote('voice');});
  await page.waitForSelector("#onayKat",{state:"visible",timeout:5000});
  check("onay penceresi duyulan cümleyi gösteriyor",
    (await page.textContent("#onayDuyulan")).includes('zımbırtı 4321'));
  check("sözlükte olmayan kalemin yönü seçilebiliyor",
    await page.isVisible('#onaySatirlar button:has-text("Alacak (giren)")'));
  await page.evaluate(()=>onayla());
  await page.waitForTimeout(250);
  await page.evaluate(()=>{go('notes');renderTable();});
  const serbestTablo=await page.textContent("#tableBox");
  check("sözlükte olmayan kalem tabloya girdi",
    serbestTablo.includes("Zımbırtı")&&serbestTablo.includes("4.321"),serbestTablo.slice(0,160));
  check("sözlükte olmayan kalem Excel'e de girer (known dolu)",
    await page.evaluate(()=>allItems(NOTES).some(i=>i.known==='Zımbırtı'&&i.amount===4321)));

  /* Seçilen yön saklanmalı: aksi hâlde serbest kalem her zaman borç
     tarafına düşer ve kişi seçse bile bir şey değişmez. */
  page.evaluate(()=>{document.getElementById('voiceText').value='hurda satışı 3000';saveNote('voice');});
  await page.waitForSelector("#onayKat",{state:"visible",timeout:5000});
  await page.evaluate(()=>{onayYon(0,'alacak');onayla();});
  await page.waitForTimeout(250);
  check("seçilen yön kaydediliyor",
    await page.evaluate(()=>yonOf('Hurda satışı')==='alacak'),
    await page.evaluate(()=>JSON.stringify(SERBEST_YON)));
  await page.evaluate(()=>{go('notes');renderTable();});
  check("alacak seçilen serbest kalem alacak tarafında",
    await page.evaluate(()=>yonAyir(allItems(NOTES)).alacak.some(i=>i.known==='Hurda satışı')));

  /* Onay penceresinde satır silinebilmeli ve hepsi silinince kayıt olmamalı. */
  const oncekiN=await page.evaluate(()=>NOTES.length);
  page.evaluate(()=>{document.getElementById('voiceText').value='saçmalık 111';saveNote('voice');});
  await page.waitForSelector("#onayKat",{state:"visible",timeout:5000});
  await page.evaluate(()=>{onaySil(0);onayla();});
  await page.waitForTimeout(200);
  check("bütün satırlar silinince uyarı veriliyor, kayıt oluşmuyor",
    (await page.textContent("#onayUyari")).includes("Kaydedilecek kalem yok")
    &&await page.evaluate(n=>NOTES.length===n,oncekiN));
  await page.evaluate(()=>onayKapat(null));
  await page.waitForTimeout(150);

  /* Sürüm ekranda görünmeli: telefonda eski yapıda kalınıp kalınmadığını
     anlamanın tek yolu bu. */
  /* Ayarlar artık başlıktaki dişlinin arkasında; tabloyu doldurmuyor. */
  check("tablo ekranı ayar kartlarıyla dolmuyor",
    !serbestTablo.includes("Sesli uyarılar")&&!serbestTablo.includes("Yedekleme"),
    serbestTablo.slice(-120));
  check("ayarlar dişlisi görünüyor",await page.isVisible("#btnAyar"));
  await page.click("#btnAyar");
  await page.waitForSelector("#ayarKat",{state:"visible",timeout:5000});
  const ayarMetin=await page.textContent("#ayarIcerik");
  check("ayarlar penceresinde ses, güvenlik ve yedek var",
    ayarMetin.includes("Sesli uyarılar")&&ayarMetin.includes("Güvenlik")&&ayarMetin.includes("Yedekleme"),
    ayarMetin.slice(0,140));
  check("sürüm ayarlar penceresinde yazıyor",
    ayarMetin.includes(await page.evaluate(()=>APP_VERSION)),ayarMetin.slice(-80));
  /* Anahtar tabloyu değil pencereyi tazelemeli; renderTable çağrılsaydı
     düğme eski hâlinde kalırdı. */
  const oncekiSes=await page.evaluate(()=>SETTINGS.anomali!==false);
  await page.evaluate(()=>toggleSes('anomali'));
  await page.waitForTimeout(200);
  check("ses anahtarı pencerede güncelleniyor",
    await page.evaluate(o=>SETTINGS.anomali!==false!==o,oncekiSes)
    &&(await page.textContent("#ayarIcerik")).includes("Olağandışı uyarı"));
  await page.evaluate(()=>toggleSes('anomali'));
  await page.evaluate(()=>ayarKapat());
  await page.waitForTimeout(150);
  check("ayarlar penceresi kapanıyor",!(await page.isVisible("#ayarKat")));

  await page.evaluate(()=>go('voice'));
  page.evaluate(()=>{document.getElementById('voiceText').value='yakıt 900';autoSaveVoice();});
  await onayVer();
  await page.waitForTimeout(1400);
  const iyiKutu=await page.evaluate(()=>document.getElementById('liveBox').innerHTML);
  check("kayıt kutusu kalemi gösteriyor",
    iyiKutu.includes('Kaydedildi')&&iyiKutu.includes('Yakıt'),iyiKutu.slice(0,160));

  /* Rakam geçmeyen cümle: onay penceresi hiç açılmamalı, kayıt olmamalı. */
  const oncekiN2=await page.evaluate(()=>NOTES.length);
  await page.evaluate(()=>{document.getElementById('voiceText').value='merhaba nasılsın';autoSaveVoice();});
  await page.waitForTimeout(1200);
  check("rakamsız cümlede onay penceresi açılmıyor",!(await page.isVisible("#onayKat")));
  check("rakamsız cümle kaydedilmiyor",await page.evaluate(n=>NOTES.length===n,oncekiN2));

  /* Rapor kategori toplamlarını gösterir; ham konuşma metinleri artık
     listelenmiyor (sayfayı dolduruyordu). */
  await page.evaluate(()=>{go('reports');report('month');});
  await page.waitForTimeout(300);
  const rapor=await page.textContent("#reportBox");
  check("raporda kategori toplamları var",
    rapor.includes("BORÇ")&&rapor.includes("Yakıt"),rapor.slice(0,140));
  check("raporda ham konuşma metni listelenmiyor",
    !rapor.includes("zımbırtı 4321")&&!rapor.includes("hurda satışı 3000"),rapor.slice(0,200));

  check("patrona belge sorulmuyor",
    !(await page.isVisible("#belgeKat")),"belge penceresi patrona açıldı");

  /* --- belge zorunluluğu: müdür gider girerken dekont/çek/slip vermeli --- */
  await page.evaluate(()=>logout());
  await page.waitForTimeout(200);
  await login(TEST_MUDUR);
  check("müdür giriş yaptı (belge testi)",await page.isVisible("#home"));

  // 1) gider girişi belge penceresini açar ve vazgeçilirse kayıt oluşmaz
  const oncekiSayi=await page.evaluate(()=>NOTES.length);
  page.evaluate(()=>{document.getElementById('voiceText').value='yakıt 900';saveNote('voice');});
  await onayVer();
  await page.waitForTimeout(300);
  check("müdürün gider girişinde belge penceresi açılıyor",await page.isVisible("#belgeKat"));
  check("belge türü seçilmeden kaydedilmiyor",await page.evaluate(()=>{
    belgeOnayla();
    return document.getElementById('belgeUyari').textContent.includes('tür');
  }));
  await page.evaluate(()=>{belgeCoz&&belgeKapat(null);});   // vazgeç (onay kutusu olmadan)
  await page.waitForTimeout(300);
  check("belge verilmeyince gider kaydedilmiyor",
    await page.evaluate(n=>NOTES.length===n,oncekiSayi));

  // 2) belge verilince kaydediliyor ve belge kayda işleniyor
  page.evaluate(()=>{document.getElementById('voiceText').value='yakıt 900';saveNote('voice');});
  await onayVer();
  await page.waitForTimeout(300);
  await page.evaluate(()=>{
    belgeTurSec(document.querySelector('#belgeTurler button[data-tur="Dekont"]'));
    document.getElementById('belgeNo').value='4821';
    belgeOnayla();
  });
  await page.waitForTimeout(300);
  check("belge verilince gider kaydediliyor",
    await page.evaluate(()=>NOTES.some(n=>n.belgeTur==='Dekont'&&n.belgeNo==='4821')));

  // 3) tahsilat (alacak) gider değil — belge sorulmamalı
  page.evaluate(()=>{document.getElementById('voiceText').value='tahsilat 700';saveNote('voice');});
  await onayVer();
  await page.waitForTimeout(300);
  check("gelir girişinde belge sorulmuyor",!(await page.isVisible("#belgeKat")));

  // 4) Ömer muaf: müdür olmasına rağmen belge sorulmuyor
  check("Ömer (m4) belgeden muaf",await page.evaluate(()=>{
    const eski=CURRENT;
    CURRENT={rol:'mudur',ad:'Ömer 4',mudurId:'m4'};
    const sonuc=belgeGerekir([{known:'Yakıt',amount:100}]);
    CURRENT=eski;
    return sonuc===false;
  }));
  check("muaf olmayan müdüre belge gerekiyor",await page.evaluate(()=>{
    const eski=CURRENT;
    CURRENT={rol:'mudur',ad:'Ahmet 1',mudurId:'m1'};
    const sonuc=belgeGerekir([{known:'Yakıt',amount:100}]);
    CURRENT=eski;
    return sonuc===true;
  }));

  await page.evaluate(()=>logout());
  await page.waitForTimeout(200);
  await login(TEST_PATRON);

  /* Excel'de de yön taşınıyor mu */
  const excelYon=await page.evaluate(()=>{
    let sheets=null;
    const orj=XLSX.write;
    XLSX.write=(wb,o)=>{sheets=Object.keys(wb.Sheets).map(n=>XLSX.utils.sheet_to_json(wb.Sheets[n]));return orj(wb,o);};
    exportTable();
    XLSX.write=orj;
    return JSON.stringify(sheets);
  });
  check("Excel'de borç/alacak blokları ve net var",
    excelYon.includes("BORÇ")&&excelYon.includes("ALACAK")&&excelYon.includes("NET"),
    excelYon.slice(0,200));

  /* --- kayıt sonrası sesli teyit kapalı --- */
  /* saveNote onay penceresini açıp bekliyor; beklenmeden çağrılır, konuşma
     dinleyicisi pencere kapandıktan sonra okunur. */
  await page.evaluate(()=>{
    window.__soylenen=[];
    window.__orjSpeak=window.speechSynthesis&&window.speechSynthesis.speak;
    if(window.speechSynthesis)window.speechSynthesis.speak=u=>window.__soylenen.push(u.text);
    document.getElementById('voiceText').value='kira 3.000';
    saveNote('voice');
  });
  await onayVer();
  await page.waitForTimeout(300);
  const konusma=await page.evaluate(()=>{
    if(window.speechSynthesis&&window.__orjSpeak)window.speechSynthesis.speak=window.__orjSpeak;
    return window.__soylenen;
  });
  check("kayıttan sonra sesli teyit yok",konusma.length===0,JSON.stringify(konusma));
  await page.waitForTimeout(200);

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

  /* 13 — "beni hatırla": ikinci açılışta PIN sorulmuyor */
  await page.evaluate(()=>logout());
  await page.waitForTimeout(200);
  await login(TEST_PATRON,true);
  check("hatırla işaretliyken giriş yapıldı",await page.isVisible("#home"));
  check("oturum saklandı (PIN değil, özeti)",
    await page.evaluate(async p=>{
      const s=await Store.get('session',null);
      return !!s&&s.hash===await pinHash(p)&&!('pin'in s);
    },TEST_PATRON));

  /* Yenilemeyi gerçek taban özetle sına: sayfa yeniden yüklendiğinde
     BASE_ROLES kaynaktaki hâline döner, testin sahte PIN'i orada yoktur. */
  await page.evaluate(h=>Store.set('session',{hash:h,at:Date.now()}),GERCEK_HASH);
  await page.reload();
  await page.waitForTimeout(1000);
  check("yenilemede PIN sorulmadı",
    !(await page.isVisible("#login"))&&await page.evaluate(()=>CURRENT!==null));
  check("hatırlanan oturumda menü açık",await page.isVisible("nav"));

  /* süresi geçmiş oturum kabul edilmemeli */
  await page.evaluate(h=>Store.set('session',{hash:h,at:Date.now()-40*24*60*60*1000}),GERCEK_HASH);
  await page.reload();
  await page.waitForTimeout(800);
  check("süresi dolmuş oturum reddediliyor",await page.isVisible("#login"));

  /* çıkış hatırlamayı da bırakmalı */
  await setupPins();
  await login(TEST_PATRON,true);
  await page.evaluate(()=>logout());
  await page.reload();
  await page.waitForTimeout(700);
  check("çıkıştan sonra tekrar PIN soruluyor",await page.isVisible("#login"));
  await setupPins();
  await login(TEST_PATRON,true);

  /* 14 — uygulama içinden PIN değiştirme (ayarlar penceresinde) */
  const YENI_PIN="33333333";
  await page.click("#btnAyar");
  await page.waitForSelector("#ayarKat",{state:"visible",timeout:5000});
  await page.click('button:has-text("PIN\'imi değiştir")');
  await page.fill("#pinOld","99999999");
  await page.fill("#pinNew",YENI_PIN);
  await page.fill("#pinNew2",YENI_PIN);
  await page.click('button:has-text("PIN\'i kaydet")');
  await page.waitForTimeout(600);
  check("yanlış mevcut PIN ile değiştirilemiyor",
    (await page.textContent("#pinStatus")).includes("yanlış"),
    await page.textContent("#pinStatus"));

  await page.fill("#pinOld",TEST_PATRON);
  await page.fill("#pinNew",YENI_PIN);
  await page.fill("#pinNew2","44444444");
  await page.click('button:has-text("PIN\'i kaydet")');
  await page.waitForTimeout(600);
  check("iki yeni PIN uyuşmazsa reddediliyor",
    (await page.textContent("#pinStatus")).includes("aynı değil"),
    await page.textContent("#pinStatus"));

  await page.fill("#pinOld",TEST_PATRON);
  await page.fill("#pinNew",YENI_PIN);
  await page.fill("#pinNew2",YENI_PIN);
  await page.click('button:has-text("PIN\'i kaydet")');
  await page.waitForTimeout(900);
  check("PIN değiştirildi",lastDialog.includes("PIN değiştirildi"),lastDialog);

  /* Hatırlanan oturum PIN özetine bağlı; değişiklikle birlikte yenilenmeli,
     yoksa kullanıcı bir sonraki açılışta sebepsiz dışarı düşer. */
  check("PIN değişince hatırlanan oturum yenilendi",
    await page.evaluate(async p=>{
      const s=await Store.get('session',null);
      return !!s&&s.hash===await pinHash(p);
    },YENI_PIN));

  await page.evaluate(()=>logout());
  await page.waitForTimeout(200);
  await login(TEST_PATRON);
  check("eski PIN artık çalışmıyor",
    (await page.textContent("#loginStatus")).includes("Hatalı"),
    await page.textContent("#loginStatus"));
  await login(YENI_PIN);
  check("yeni PIN ile giriliyor",await page.isVisible("#home"));

  /* 15 — yayından PIN yenilenirse (npm run pin) cihazdaki değişiklik düşer */
  await page.evaluate(async()=>{
    BASE_ROLES=[{rol:'patron',ad:'Test Patron',mudurId:'p0',hash:await pinHash('55555555')}];
    applyPinOverrides();                    // `from` artık tutmuyor
  });
  check("yayından PIN sıfırlama cihaz değişikliğini geçersiz kılıyor",
    await page.evaluate(async()=>ROLES[0].hash===await pinHash('55555555')));

  check("sayfada JS hatası yok",errs.length===0,errs.join(" | "));
}catch(e){ failed++; console.log("  HATA istisna → "+e.message); }
finally{ await b.close(); srv.close(); }
console.log(failed?`\n${failed} kontrol başarısız.`:"\nHepsi geçti.");
process.exit(failed?1:0);
