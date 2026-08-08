/* Ana ekran ikonlarını üretir — bağımlılıksız PNG yazıcı.

   Kullanım: npm run ikon

   Neden script: ikon repoya kaynağı belirsiz bir ikili dosya olarak
   girmesin. Burada koddan çiziliyor; renk ya da biçim değişince
   dosyalar yeniden üretilebilir.

   Çizim: uygulamanın simgesi olan mikrofon (giriş ekranındakiyle aynı biçim).
   Üretilenler: icon-192.png, icon-512.png, icon-maskable-512.png, icon.svg */
import {writeFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const BG=[0x3a,0x3a,0x3c];     // --graphite
const FG=[0xc9,0xa7,0x65];     // --gold2

/* ---------- PNG yazıcı (truecolor, filtre yok) ---------- */
const CRC_TABLE=(()=>{
  const t=new Int32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
    t[n]=c;
  }
  return t;
})();
function crc32(buf){
  let c=-1;
  for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8);
  return (c^-1)>>>0;
}
function chunk(type,data){
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
  const body=Buffer.concat([Buffer.from(type,"latin1"),data]);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len,body,crc]);
}
function encodePng(w,h,rgb){
  const raw=Buffer.alloc(h*(1+w*3));
  for(let y=0;y<h;y++){
    raw[y*(1+w*3)]=0;                                  // filtre: None
    rgb.copy(raw,y*(1+w*3)+1,y*w*3,(y+1)*w*3);
  }
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);
  ihdr[8]=8;ihdr[9]=2;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0; // 8 bit, truecolor
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk("IHDR",ihdr),
    chunk("IDAT",deflateSync(raw,{level:9})),
    chunk("IEND",Buffer.alloc(0))
  ]);
}

/* ---------- geometri ----------
   Tek yerde tanımlı; hem PNG hem SVG aynı ölçüleri kullanıyor. */
function geom(size,content){
  const w=size*content, cx=size/2, cy=size/2-w*0.019;   // uçları hesaba katıp ortala
  return {
    w,cx,cy,
    t:w*0.075,                       // çizgi kalınlığı
    capR:w*0.17,                     // mikrofon başlığının yarıçapı
    capTop:cy-w*0.42, capBot:cy+w*0.10,
    arcR:w*0.30, arcCy:cy,           // altındaki yay
    baseY:cy+w*0.42, baseW:w*0.36    // ayak
  };
}
/* Nokta–doğru parçası uzaklığı: yuvarlak uçlu çizgi demek. */
function segDist(x,y,x1,y1,x2,y2){
  const dx=x2-x1, dy=y2-y1, L=dx*dx+dy*dy;
  const u=L?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/L)):0;
  return Math.hypot(x-(x1+u*dx),y-(y1+u*dy));
}

function drawIcon(size,content){
  const SS=3, N=size*SS;                                // kenar yumuşatma
  const g=geom(N,content);
  const out=Buffer.alloc(size*size*3);
  const acc=new Uint8Array(N*N);

  for(let py=0;py<N;py++){
    for(let px=0;px<N;px++){
      const x=px+0.5, y=py+0.5;
      let on=false;
      // başlık: dikey kapsül
      if(segDist(x,y,g.cx,g.capTop+g.capR,g.cx,g.capBot-g.capR)<=g.capR)on=true;
      // yay: yalnız alt yarım, yuvarlak uçlarla
      if(!on){
        const d=Math.hypot(x-g.cx,y-g.arcCy);
        if(y>=g.arcCy&&Math.abs(d-g.arcR)<=g.t/2)on=true;
        else if(Math.hypot(x-(g.cx-g.arcR),y-g.arcCy)<=g.t/2)on=true;
        else if(Math.hypot(x-(g.cx+g.arcR),y-g.arcCy)<=g.t/2)on=true;
      }
      // sap
      if(!on&&segDist(x,y,g.cx,g.arcCy+g.arcR,g.cx,g.baseY)<=g.t/2)on=true;
      // ayak
      if(!on&&segDist(x,y,g.cx-g.baseW/2,g.baseY,g.cx+g.baseW/2,g.baseY)<=g.t/2)on=true;
      if(on)acc[py*N+px]=1;
    }
  }
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      let s=0;
      for(let j=0;j<SS;j++)for(let i=0;i<SS;i++)s+=acc[(y*SS+j)*N+(x*SS+i)];
      const a=s/(SS*SS), o=(y*size+x)*3;
      for(let c=0;c<3;c++)out[o+c]=Math.round(BG[c]+(FG[c]-BG[c])*a);
    }
  }
  return encodePng(size,size,out);
}

/* Aynı çizimin vektör hâli — sekme simgesi ve büyük ekranlar için. */
function drawSvg(size,content){
  const hex=c=>"#"+c.map(v=>v.toString(16).padStart(2,"0")).join("");
  const g=geom(size,content), n=v=>Math.round(v*100)/100;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<title>Güner · Sesli Kayıt</title>
<rect width="${size}" height="${size}" fill="${hex(BG)}"/>
<g fill="none" stroke="${hex(FG)}" stroke-linecap="round">
<path d="M${n(g.cx)},${n(g.capTop+g.capR)}V${n(g.capBot-g.capR)}" stroke-width="${n(g.capR*2)}"/>
<path d="M${n(g.cx-g.arcR)},${n(g.arcCy)}A${n(g.arcR)},${n(g.arcR)} 0 0 0 ${n(g.cx+g.arcR)},${n(g.arcCy)}" stroke-width="${n(g.t)}"/>
<path d="M${n(g.cx)},${n(g.arcCy+g.arcR)}V${n(g.baseY)}" stroke-width="${n(g.t)}"/>
<path d="M${n(g.cx-g.baseW/2)},${n(g.baseY)}H${n(g.cx+g.baseW/2)}" stroke-width="${n(g.t)}"/>
</g>
</svg>
`;
}

const files=[
  ["icon-192.png",192,0.70],
  ["icon-512.png",512,0.70],
  ["icon-maskable-512.png",512,0.52]   // güvenli alan: ikonun ortadaki %80'i
];
for(const [name,size,content] of files){
  const buf=drawIcon(size,content);
  writeFileSync(join(ROOT,name),buf);
  console.log(`  ${name}  ${size}×${size}  ${(buf.length/1024).toFixed(1)} kB`);
}
const svg=drawSvg(512,0.70);
writeFileSync(join(ROOT,"icon.svg"),svg);
console.log(`  icon.svg  vektör  ${(Buffer.byteLength(svg)/1024).toFixed(1)} kB`);
console.log("\nİkonlar üretildi. manifest.webmanifest bu dosyalara işaret ediyor.");
