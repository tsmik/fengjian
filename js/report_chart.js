/* report_chart.js — 報告圖（staging 測試用）
 * 兩個產生器：
 *   buildRadar2SVG(opts) 係數雷達（13 維度係數放射 + 內圈四象限）
 *   buildRadar0SVG(opts)  係數總覽子彈圖（先天/老闆/主管/運氣/後天/總係數）
 * 依賴：core.js 的 DIMS（取維度名）
 */
import { DIMS as CORE_DIMS } from './core.js';

const S='#7A9E7E', A='#C17A5A';
const CRBG='#f0e9dc', CRT='#7d6643';
const DIMTXT=['#4A6B3A','#3A5E54','#6A6458','#7A5A38','#7A4858','#7A6A38','#3A5A7A','#5A4870','#3A6A4A','#3A6B3A','#5A4068','#3A6058','#3A5870'];
const COEF_MAX=0.8, STEP=360/13;
const cx=200,cy=215,U=150/9,rIn=4*U,rOut=9*U,H=rOut-rIn;
const rad=d=>d*Math.PI/180;
const f=(deg,r)=>[cx+r*Math.sin(rad(deg)),cy-r*Math.cos(rad(deg))];
const PS=p=>p[0].toFixed(2)+','+p[1].toFixed(2);
const facet=(a0,a1,ra,rb)=>`M ${PS(f(a0,ra))} L ${PS(f(a0,rb))} L ${PS(f(a1,rb))} L ${PS(f(a1,ra))} Z`;
function polySector(a0,a1,r){const k0=Math.round(a0/STEP),k1=Math.round(a1/STEP);let pts=[`${cx},${cy}`];for(let k=k0;k<=k1;k++)pts.push(PS(f(k*STEP,r)));return 'M'+pts.join(' L')+' Z';}
function polyArc(a0,a1,r){const k0=Math.round(a0/STEP),k1=Math.round(a1/STEP);let pts=[];for(let k=k0;k<=k1;k++)pts.push(PS(f(k*STEP,r)));return 'M'+pts.join(' L');}
const spans=[];for(let i=0;i<13;i++)spans.push([i*STEP,(i+1)*STEP]);
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
const NAMEPOS=[[14.1,2.395],[40.3,2.320],[69.1,2.318],[97.2,2.300],[128.5,2.340],[155.9,2.401],[180.0,2.504],[204.4,2.406],[233.7,2.390],[261.9,2.332],[290.2,2.365],[319.1,2.357],[345.6,2.398]];
const NUMPOS=[[13.8,1.975],[42.6,1.921],[70.4,1.925],[98.2,1.940],[126.6,1.985],[152.6,2.047],[180.0,2.083],[207.4,2.047],[234.3,2.028],[261.2,1.985],[289.7,1.956],[317.6,1.950],[345.6,1.952]];

// ===== 係數雷達（radar2）=====
export function buildRadar2SVG(opts){
  opts=opts||{};
  const coeff=opts.dimCoeff||new Array(13).fill(0);
  const sfrac=opts.dimSFrac||new Array(13).fill(0.5);
  const nv=x=>(x==null?null:(+x||0));
  const bossV=nv(opts.bossV),mgrV=nv(opts.mgrV),luckV=nv(opts.luckV),postV=nv(opts.postV);
  const preV=(opts.preV===undefined?((bossV||0)+(mgrV||0))/2:nv(opts.preV)), totV=(opts.totV===undefined?(coeff.reduce((a,x)=>a+(+x||0),0)/13):nv(opts.totV));
  const DIM=[];for(let i=0;i<13;i++){const d=CORE_DIMS[i]||{};DIM.push({dn:d.dn||'',c:(coeff[i]==null?null:(+coeff[i]||0)),sf:Math.max(0,Math.min(1,+sfrac[i]||0))});}
  const innerPoly=spans.map(s=>PS(f(s[0],rIn))).join(' ');
  const QUAD=[
    {a0:0,a1:3*STEP,v:bossV,bd:26.7,bf:0.731,bs:10.5,col:'#936A78',tc:'#936A78',nm:'老闆'},
    {a0:3*STEP,a1:6*STEP,v:mgrV,bd:140.0,bf:0.763,bs:10.5,col:'#AE6D4F',tc:'#876D4F',nm:'主管'},
    {a0:6*STEP,a1:9*STEP,v:luckV,bd:207.6,bf:0.767,bs:10.5,col:'#546D77',tc:'#546D77',nm:'運氣'},
    {a0:9*STEP,a1:360,v:postV,bd:302.1,bf:0.770,bs:10.5,col:'#797181',tc:'#797181',nm:'後天'}
  ];
  let svg='';
  svg+=`<polygon points="${innerPoly}" fill="${CRBG}"/>`;
  // 運氣/後天 填色扇形
  QUAD.forEach((q,qi)=>{if(qi<2||q.v==null)return;const r=rIn*Math.sqrt(Math.min(1,q.v/COEF_MAX));svg+=`<path d="${polySector(q.a0,q.a1,r)}" fill="${q.col}" fill-opacity="0.3"/>`;});
  // 先天：多邊扇形（0~6格，覆蓋老闆+主管）
  if(preV!=null){const rpre=rIn*Math.sqrt(Math.min(1,preV/COEF_MAX));svg+=`<path d="${polySector(0,6*STEP,rpre)}" fill="#854F51" fill-opacity="0.3"/>`;}
  // 老闆/主管：只留外輪廓線（疊在先天之上，透明0.8）
  QUAD.forEach((q,qi)=>{if(qi>=2||q.v==null)return;const r=rIn*Math.sqrt(Math.min(1,q.v/COEF_MAX));svg+=`<path d="${polyArc(q.a0,q.a1,r)}" fill="none" stroke="${q.col}" stroke-opacity="0.5" stroke-width="1.5" stroke-linejoin="round"/>`;});
  [[0,1],[3*STEP,0.4],[6*STEP,1],[9*STEP,1]].forEach(([a,op])=>{const p=f(a,rIn);svg+=`<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="#fff" stroke-opacity="${op}" stroke-width="1.5"/>`;});
  svg+=`<polygon points="${innerPoly}" fill="none" stroke="#fff" stroke-width="1.5"/>`;
  function lab2(x,y,name,val,fs,col){const tl=(name.length*fs).toFixed(1);const vstr=(val==null?'--':(+val||0).toFixed(2));const tlAttr=(val==null?'':` textLength="${tl}" lengthAdjust="spacingAndGlyphs"`);svg+=`<text x="${x.toFixed(1)}" y="${(y-3).toFixed(1)}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="700">${name}</text>`+`<text x="${x.toFixed(1)}" y="${(y+9).toFixed(1)}" font-size="${fs}"${tlAttr} text-anchor="middle" fill="${col}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700">${vstr}</text>`;}
  QUAD.forEach(q=>{const p=f(q.bd,rIn*q.bf);lab2(p[0],p[1],q.nm,q.v,q.bs,q.tc);});
  // 係數環：bar 由 rIn 放射、底色＝動/靜色、透明度與分數反比
  const OP_LOW=0.5,OP_HIGH=0.70;
  DIM.forEach((dm,i)=>{if(dm.c==null)return;const[a0,a1]=spans[i];const frac=Math.min(1,dm.c/COEF_MAX);const rT=rIn+frac*H;
    const fill=dm.sf<0.5?A:S;const op=(OP_LOW*(1-frac)+OP_HIGH*frac).toFixed(3);
    svg+=`<path d="${facet(a0,a1,rIn,rT)}" fill="${fill}" fill-opacity="${op}" stroke="#fff" stroke-width="0.8"/>`;});
  // 先天/運氣/後天 群組分隔線（中心→外緣）；方圓|曲直(3格)淡 0.5
  [[0,'#936A78',1],[3*STEP,'#898179',0.5],[6*STEP,'#546D77',1],[9*STEP,'#797181',1]].forEach(([a,col,op])=>{const p1=f(a,rOut);svg+=`<line x1="${cx}" y1="${cy}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="${col}" stroke-opacity="${op}" stroke-width="2"/>`;});
  // 最外圍淡灰 13 邊形
  svg+=`<polygon points="${spans.map(s=>PS(f(s[0],rOut))).join(' ')}" fill="none" stroke="#e6ddd0" stroke-width="1"/>`;
  // 維度名（13邊形外）
  const FSD=10.8;
  DIM.forEach((dm,i)=>{const np=NAMEPOS[i];const lp=f(np[0],rIn*np[1]);const c=Math.sin(rad(np[0]));const an=c>0.25?'start':c<-0.25?'end':'middle';const col=DIMTXT[i];
    svg+=`<text x="${lp[0].toFixed(1)}" y="${lp[1].toFixed(1)}" font-size="${FSD}" text-anchor="${an}" fill="${col}" fill-opacity="0.8" font-weight="600">${dm.dn}</text>`;});
  // 維度係數數字（13邊形內圍；被 bar 蓋到→白字，否則動/靜色）
  DIM.forEach((dm,i)=>{const npp=f(NUMPOS[i][0],rIn*NUMPOS[i][1]);const nx=npp[0],ny=npp[1];
    const rr=Math.hypot(nx-cx,ny-cy);const mcol=dm.sf<0.5?A:S;const rT=(dm.c==null?rIn:rIn+Math.min(1,dm.c/COEF_MAX)*H);const ncol=(dm.c==null)?mcol:((rT>=rr)?'#fff':mcol);
    svg+=`<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" font-size="10.5" text-anchor="middle" fill="${ncol}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700">${(dm.c==null?'--':dm.c.toFixed(2))}</text>`;});
  // 先天框（#854F51，字級同運氣）
  {const p=f(92.4,rIn*0.743);lab2(p[0],p[1],'先天',preV,10.5,'#854F51');}
  // 總係數（中央 13 邊形 #494541 白字）
  {const tg=spans.map(ss=>PS(f(ss[0],22))).join(' ');
   svg+=`<polygon points="${tg}" fill="#494541" fill-opacity="0.92"/>`
     +`<text x="${cx}" y="${(cy-3).toFixed(1)}" font-size="9" text-anchor="middle" fill="#fff">總係數</text>`
     +`<text x="${cx}" y="${(cy+9).toFixed(1)}" font-size="10.5" text-anchor="middle" fill="#fff" font-family="'Helvetica Neue',Arial,sans-serif">${(totV==null?'--':totV.toFixed(2))}</text>`;}
  // 標題（選填，字級＝維度字 FSD，與 radar3 一致；僅在有傳 title 時畫）
  if(opts.title){svg+=`<text x="${cx}" y="36" font-size="${FSD}" text-anchor="middle" fill="#5a4f45" font-weight="700" letter-spacing="1">${esc(opts.title)}</text>`;}
  const VB=opts.viewBox||'20 40 360 360';
  return `<svg viewBox="${VB}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

// ===== 係數雷達 手機版（radar2_m）=====
// 與桌機版差異：移除 老闆/主管 與 方圓|曲直 隔線；係數 0 在中央放動/靜色標記；
// 字級放大（維度字15.5/數字14/框12/總係數1.3x）；攻守 曲直 方圓 等位置另調（NAMEPOS_M/NUMPOS_M）
const NAMEPOS_M=[[14.1,2.395],[40.3,2.320],[68.1,2.242],[103.0,2.253],[128.5,2.340],[155.9,2.401],[180.0,2.504],[204.4,2.406],[233.7,2.390],[260.2,2.261],[290.2,2.365],[319.1,2.357],[345.6,2.398]];
const NUMPOS_M=[[13.8,1.975],[42.6,1.921],[70.4,1.925],[99.1,1.949],[127.2,2.006],[152.6,2.047],[179.6,2.097],[207.4,2.047],[233.0,1.976],[260.6,1.958],[290.8,1.916],[317.0,1.926],[345.6,1.952]];
function labM(p,name,val,fs,col){const x=p[0],y=p[1];const tl=(name.length*fs).toFixed(1);const vstr=(val==null?'--':(+val||0).toFixed(2));const tlAttr=(val==null?'':` textLength="${tl}" lengthAdjust="spacingAndGlyphs"`);
  return `<text x="${x.toFixed(1)}" y="${(y-fs*0.3).toFixed(1)}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="700">${name}</text>`
    +`<text x="${x.toFixed(1)}" y="${(y+fs*0.86).toFixed(1)}" font-size="${fs}"${tlAttr} text-anchor="middle" fill="${col}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700">${vstr}</text>`;}
export function buildRadar2MSVG(opts){
  opts=opts||{};
  const coeff=opts.dimCoeff||new Array(13).fill(0);
  const sfrac=opts.dimSFrac||new Array(13).fill(0.5);
  const nv=x=>(x==null?null:(+x||0));
  const luckV=nv(opts.luckV), postV=nv(opts.postV), preV=nv(opts.preV);
  const totV=(opts.totV===undefined?(coeff.reduce((a,x)=>a+(+x||0),0)/13):nv(opts.totV));
  const DIM=[];for(let i=0;i<13;i++){const d=CORE_DIMS[i]||{};DIM.push({dn:d.dn||'',c:(coeff[i]==null?null:(+coeff[i]||0)),sf:Math.max(0,Math.min(1,+sfrac[i]||0))});}
  const fsName=15.5, fsNum=14, fsBox=13.5, totS=1.3, ZERO_MARK=5, OP_LOW=0.5, OP_HIGH=0.70;
  const innerPoly=spans.map(s=>PS(f(s[0],rIn))).join(' ');
  let svg='';
  svg+=`<polygon points="${innerPoly}" fill="${CRBG}"/>`;
  if(luckV!=null){const r=rIn*Math.sqrt(Math.min(1,luckV/COEF_MAX));svg+=`<path d="${polySector(6*STEP,9*STEP,r)}" fill="#546D77" fill-opacity="0.3"/>`;}
  if(postV!=null){const r=rIn*Math.sqrt(Math.min(1,postV/COEF_MAX));svg+=`<path d="${polySector(9*STEP,360,r)}" fill="#797181" fill-opacity="0.3"/>`;}
  if(preV!=null){const r=rIn*Math.sqrt(Math.min(1,preV/COEF_MAX));svg+=`<path d="${polySector(0,6*STEP,r)}" fill="#854F51" fill-opacity="0.3"/>`;}
  [[0,1],[6*STEP,1],[9*STEP,1]].forEach(([a,op])=>{const p=f(a,rIn);svg+=`<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="#fff" stroke-opacity="${op}" stroke-width="1.5"/>`;});
  svg+=`<polygon points="${innerPoly}" fill="none" stroke="#fff" stroke-width="1.5"/>`;
  svg+=labM(f(211.0,rIn*0.711),'運氣',luckV,fsBox,'#546D77');
  svg+=labM(f(299.9,rIn*0.699),'後天',postV,fsBox,'#797181');
  svg+=labM(f(93.6,rIn*0.687),'先天',preV,fsBox,'#854F51');
  DIM.forEach((dm,i)=>{if(dm.c==null)return;const[a0,a1]=spans[i];const frac=Math.min(1,dm.c/COEF_MAX);const rT=rIn+frac*H;const fill=dm.sf<0.5?A:S;const op=(OP_LOW*(1-frac)+OP_HIGH*frac).toFixed(3);if(frac>0)svg+=`<path d="${facet(a0,a1,rIn,rT)}" fill="${fill}" fill-opacity="${op}" stroke="#fff" stroke-width="0.8"/>`;});
  DIM.forEach((dm,i)=>{if(dm.c==null||dm.c>0)return;const[a0,a1]=spans[i];const fill=dm.sf<0.5?A:S;svg+=`<path d="${facet(a0,a1,rIn,rIn+ZERO_MARK)}" fill="${fill}" fill-opacity="0.9" stroke="#fff" stroke-width="0.8"/>`;});
  [[0,'#854F51',1],[6*STEP,'#546D77',1],[9*STEP,'#797181',1]].forEach(([a,col,op])=>{const p1=f(a,rOut);svg+=`<line x1="${cx}" y1="${cy}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="${col}" stroke-opacity="${op}" stroke-width="2"/>`;});
  svg+=`<polygon points="${spans.map(s=>PS(f(s[0],rOut))).join(' ')}" fill="none" stroke="#e6ddd0" stroke-width="1"/>`;
  DIM.forEach((dm,i)=>{const np=NAMEPOS_M[i];const lp=f(np[0],rIn*np[1]);const c=Math.sin(rad(np[0]));const an=c>0.25?'start':c<-0.25?'end':'middle';svg+=`<text x="${lp[0].toFixed(1)}" y="${lp[1].toFixed(1)}" font-size="${fsName}" text-anchor="${an}" fill="${DIMTXT[i]}" fill-opacity="0.8" font-weight="600">${esc(dm.dn)}</text>`;});
  DIM.forEach((dm,i)=>{const npp=f(NUMPOS_M[i][0],rIn*NUMPOS_M[i][1]);const nx=npp[0],ny=npp[1];const rr=Math.hypot(nx-cx,ny-cy);const mcol=dm.sf<0.5?A:S;const rT=(dm.c==null?rIn:rIn+Math.min(1,dm.c/COEF_MAX)*H);const ncol=(dm.c==null)?mcol:((rT>=rr)?'#fff':mcol);svg+=`<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" font-size="${fsNum}" text-anchor="middle" fill="${ncol}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700">${(dm.c==null?'--':dm.c.toFixed(2))}</text>`;});
  {const rTot=22*totS, lfs=9*totS, vfs=10.5*totS, tl=(21*totS).toFixed(1);const tg=spans.map(ss=>PS(f(ss[0],rTot))).join(' ');
   svg+=`<polygon points="${tg}" fill="#494541" fill-opacity="0.92"/>`
     +`<text x="${cx}" y="${(cy-3*totS).toFixed(1)}" font-size="${lfs.toFixed(1)}" text-anchor="middle" fill="#fff">總係數</text>`
     +`<text x="${cx}" y="${(cy+9*totS).toFixed(1)}" font-size="${vfs.toFixed(1)}" text-anchor="middle" fill="#fff" font-family="'Helvetica Neue',Arial,sans-serif">${(totV==null?'--':totV.toFixed(2))}</text>`;}
  return `<svg viewBox="20 40 360 360" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

// ===== 子彈/動靜 共用 bar 形 =====
const _bR=(x,y,w,h,r)=>{w=Math.max(0,w);r=Math.max(0,Math.min(r,h/2,w));return `M${x.toFixed(1)},${y.toFixed(1)} h${(w-r).toFixed(1)} a${r},${r} 0 0 1 ${r},${r} v${(h-2*r).toFixed(1)} a${r},${r} 0 0 1 ${-r},${r} h${(-(w-r)).toFixed(1)} Z`;};
const _bL=(x,y,w,h,r)=>{w=Math.max(0,w);r=Math.max(0,Math.min(r,h/2,w));return `M${(x+r).toFixed(1)},${y.toFixed(1)} h${(w-r).toFixed(1)} v${h.toFixed(1)} h${(-(w-r)).toFixed(1)} a${r},${r} 0 0 1 ${-r},${-r} v${(-(h-2*r)).toFixed(1)} a${r},${r} 0 0 1 ${r},${-r} Z`;};
const R0_X0=74, R0_BAR=12, R0_GAP=9.6, R0_PAD=8, R0_TW=300, R0_CMAX=0.8;
const R0_TOT='#494541', R0_A='#C17A5A', R0_S='#7A9E7E';

// ===== 係數總覽（6 子彈，無標題）=====
export function buildCoefSVG(opts){
  opts=opts||{};
  const nv=x=>(x==null?null:(+x||0));
  const preV=nv(opts.preV),bossV=nv(opts.bossV),mgrV=nv(opts.mgrV),luckV=nv(opts.luckV),postV=nv(opts.postV),totV=nv(opts.totV);
  // 列順序/強調可由 opts 覆寫；不傳則維持舊版順序（保留 legacy 行為）
  const MAP={
    preV:{name:'先天',v:preV,col:'#8E4B50'},
    bossV:{name:'老闆',v:bossV,col:'#936A78'},
    mgrV:{name:'主管',v:mgrV,col:'#876D4F'},
    luckV:{name:'運氣',v:luckV,col:'#546D77'},
    postV:{name:'後天',v:postV,col:'#797181'},
    totV:{name:'總係數',v:totV,col:R0_TOT}
  };
  const order=opts.order||['preV','bossV','mgrV','luckV','postV','totV'];
  const big=opts.big||[];
  const ROWS=order.map(k=>MAP[k]).filter(Boolean);
  const X0=R0_X0,BAR_H=R0_BAR,GAP=R0_GAP,PAD=R0_PAD,LP=4,TRACKW=R0_TW,COEF_OP=0.7;
  const xOf=v=>X0+(Math.min(1,(v==null?0:v)/R0_CMAX))*TRACKW;
  const n=ROWS.length, cTop=4, stackTop=cTop+PAD, stackBot=stackTop+n*(BAR_H+GAP)-GAP, cBot=stackBot+PAD, tEdge=xOf(totV);
  let s='';
  s+=`<rect x="${X0}" y="${cTop}" width="${TRACKW}" height="${(cBot-cTop).toFixed(1)}" rx="4" fill="#f3eee4"/>`;
  ROWS.forEach((r,i)=>{const y=stackTop+i*(BAR_H+GAP);const cyy=y+BAR_H/2;
    if(r.v!=null)s+=`<path d="${_bR(X0,y,xOf(r.v)-X0,BAR_H,Math.min(3,BAR_H/2))}" fill="${r.col}" fill-opacity="${COEF_OP}"/>`;
    s+=`<text x="${(X0-8).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="${big.indexOf(r.name)>=0?14:12}" text-anchor="end" dominant-baseline="central" fill="${r.col}" font-weight="700">${r.name}</text>`;
    s+=`<text x="${(xOf(r.v)+6).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="11" dominant-baseline="central" fill="${r.col}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700">${(r.v==null?'--':r.v.toFixed(2))}</text>`;});
  if(totV!=null)s+=`<line x1="${tEdge.toFixed(1)}" y1="${(cTop-LP).toFixed(1)}" x2="${tEdge.toFixed(1)}" y2="${(cBot+LP).toFixed(1)}" stroke="${R0_TOT}" stroke-width="1.5"/>`;
  const vbH=Math.ceil(cBot+LP+4);
  return `<svg viewBox="0 0 400 ${vbH}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}

// ===== 總動靜（逐部位 10 條，無標題）=====
export function buildSDSVG(opts){
  opts=opts||{};
  const partD=opts.partD||new Array(9).fill(0), partN=opts.partN||new Array(9).fill(0);
  const PLAB=['頭','上停','中停','下停','耳','眉','眼','鼻','口'], THICK_AFTER=[3,8];
  const SD_ROWS=[];let sumD=0,sumN=0;
  for(let i=0;i<9;i++){const d=+partD[i]||0,nn=+partN[i]||0;SD_ROWS.push({name:PLAB[i],d:d,s:nn-d,t:nn||1});sumD+=d;sumN+=nn;}
  SD_ROWS.push({name:'總計',d:sumD,s:sumN-sumD,t:sumN||1});
  const X0=R0_X0,SDH=(+opts.barH||R0_BAR),GAP=R0_GAP,PAD=R0_PAD,TRACKW=R0_TW,SD_OP=0.85,GT=GAP,GK=GAP+6,prr=Math.min(3,SDH/2);
  const nameFs=(+opts.nameFs||11.5), numFs=(+opts.numFs||10);
  const sdCTop=2, barsTop=sdCTop+PAD;
  let hh=0; SD_ROWS.forEach((r,i)=>{hh+=SDH; if(i<SD_ROWS.length-1) hh+=(THICK_AFTER.indexOf(i)>=0?GK:GT);});
  let s='';
  s+=`<rect x="${X0}" y="${sdCTop}" width="${TRACKW}" height="${(hh+2*PAD).toFixed(1)}" rx="4" fill="#f3eee4"/>`;
  let y=barsTop;
  SD_ROWS.forEach((r,i)=>{const isTot=(i===SD_ROWS.length-1);const op=isTot?Math.min(1,SD_OP+0.18):SD_OP;
    const dW=TRACKW*r.d/r.t, bd=X0+dW, cyy=y+SDH/2;
    s+=`<path d="${_bL(X0,y,dW,SDH,prr)}" fill="${R0_A}" fill-opacity="${op}"/>`;
    s+=`<path d="${_bR(bd,y,TRACKW-dW,SDH,prr)}" fill="${R0_S}" fill-opacity="${op}"/>`;
    s+=`<text x="${(X0-8).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="${nameFs}" text-anchor="end" dominant-baseline="central" fill="#6a6458" font-weight="700">${r.name}</text>`;
    if(dW>10) s+=`<text x="${(bd-4).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="${numFs}" text-anchor="end" dominant-baseline="central" fill="#fff" font-weight="700">${r.d}</text>`;
    if(TRACKW-dW>10) s+=`<text x="${(bd+4).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="${numFs}" text-anchor="start" dominant-baseline="central" fill="#fff" font-weight="700">${r.s}</text>`;
    const gp=(i<SD_ROWS.length-1?(THICK_AFTER.indexOf(i)>=0?GK:GT):0);
    if(THICK_AFTER.indexOf(i)>=0){const ly=y+SDH+gp/2;s+=`<line x1="${X0}" y1="${ly.toFixed(1)}" x2="${(X0+TRACKW).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#b09a6a" stroke-width="1.2"/>`;}
    y+=SDH+gp;
  });
  const vbH=Math.ceil(sdCTop+hh+2*PAD+4);
  return `<svg viewBox="0 0 400 ${vbH}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}

// ===== 總動靜（radar3 動靜全圖）=====
// 每維度三角形由中心放射、靜(內)/動(外) 依面積比例切（rS=rOut·√(靜/total)）；靜1&&total9 固定 57
// 中央米色 13 邊形(42)+先天/運氣/後天 分隔線與文字；8 條動:靜參考環；維度名+係數；主導極字+數量
const R3_DIMPOS=[[13.9,2.477],[38.7,2.404],[67.4,2.331],[97.3,2.246],[128.8,2.319],[155.4,2.424],[180.0,2.436],[206.0,2.392],[232.3,2.334],[262.6,2.233],[293.5,2.316],[319.7,2.407],[345.6,2.454]];
const R3_CORELABELS=[['先天',87.1,0.290],['運氣',207.7,0.347],['後天',304.0,0.328]];
const R3_CORE=42, R3_RING1=57, R3_OP=0.55, R3_Sd='#4f6f53', R3_Ad='#8f5236', R3_FSD=10.8;
export function buildRadar3SVG(opts){
  opts=opts||{};
  const st=opts.dimStatic||new Array(13).fill(0);
  const dy=opts.dimActive||new Array(13).fill(0);
  const coeff=opts.dimCoeff||new Array(13).fill(0);
  // 字級可調（手機版放大）；預設＝桌機原值
  const fsName=(+opts.fsName||R3_FSD), fsNum=(+opts.fsNum||R3_FSD), fsPole=(+opts.fsPole||10), fsCore=(+opts.fsCore||R3_FSD);
  let svg='';
  // 最外圍淡灰 13 邊形
  svg+=`<polygon points="${spans.map(s=>PS(f(s[0],rOut))).join(' ')}" fill="none" stroke="#e6ddd0" stroke-width="1"/>`;
  // 資料環：每維度 靜(內)/動(外) 面積比例切
  for(let i=0;i<13;i++){if(coeff[i]==null)continue;const[a0,a1]=spans[i];const s=+st[i]||0,d=+dy[i]||0,tot=s+d;
    let rS; if(tot===0)rS=0; else if(s===1&&tot===9)rS=R3_RING1; else rS=rOut*Math.sqrt(s/tot);
    svg+=`<path d="${facet(a0,a1,0,rS)}" fill="${S}" fill-opacity="${R3_OP}"/>`;
    svg+=`<path d="${facet(a0,a1,rS,rOut)}" fill="${A}" fill-opacity="${R3_OP}"/>`;}
  // 白色分隔輻線
  spans.forEach(s=>{const p=f(s[0],rOut);svg+=`<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="#fff" stroke-width="1"/>`;});
  // 8 條 動:靜 參考環（靜=1 用 57，其餘面積公式）
  for(let k=1;k<=8;k++){const r=(k===1)?R3_RING1:rOut*Math.sqrt(k/9);
    svg+=`<polygon points="${spans.map(s=>PS(f(s[0],r))).join(' ')}" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="0.7"/>`;}
  // 群組分隔線（中心→外緣）
  [[0,'#936A78'],[3*STEP,'#898179'],[6*STEP,'#546D77'],[9*STEP,'#797181']].forEach(([a,col])=>{const p1=f(a,rOut);svg+=`<line x1="${cx}" y1="${cy}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="${col}" stroke-width="2"/>`;});
  // 中央 13 邊形：米色填滿 + 先天/運氣/後天 分隔線
  svg+=`<polygon points="${spans.map(s=>PS(f(s[0],R3_CORE))).join(' ')}" fill="${CRBG}"/>`;
  [0,6*STEP,9*STEP].forEach(a=>{const p=f(a,R3_CORE);svg+=`<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="#b09a6a" stroke-width="1.2"/>`;});
  svg+=`<polygon points="${spans.map(s=>PS(f(s[0],R3_CORE))).join(' ')}" fill="none" stroke="#cdb892" stroke-width="0.8"/>`;
  // 主導極字 + 數量（靜主導內、動主導外）
  const rInner=rIn+0.25*H, rOuter=rIn+0.75*H;
  for(let i=0;i<13;i++){if(coeff[i]==null)continue;const dm=CORE_DIMS[i]||{};const s=+st[i]||0,d=+dy[i]||0;const mid=(spans[i][0]+spans[i][1])/2;
    const sCh=(dm.aT==='靜')?dm.a:dm.b, aCh=(dm.aT==='靜')?dm.b:dm.a;
    if(s>d){const p=f(mid,rInner);svg+=`<text x="${p[0].toFixed(1)}" y="${(p[1]+fsPole*0.35).toFixed(1)}" font-size="${fsPole}" text-anchor="middle" fill="${R3_Sd}" font-weight="700">${esc(sCh)}${s}</text>`;}
    else{const p=f(mid,rOuter);svg+=`<text x="${p[0].toFixed(1)}" y="${(p[1]+fsPole*0.35).toFixed(1)}" font-size="${fsPole}" text-anchor="middle" fill="${R3_Ad}" font-weight="700">${esc(aCh)}${d}</text>`;}}
  // 維度名 + 係數
  for(let i=0;i<13;i++){const dm=CORE_DIMS[i]||{};const dp=R3_DIMPOS[i];const lp=f(dp[0],rIn*dp[1]);const c=Math.sin(rad(dp[0]));const an=c>0.25?'start':c<-0.25?'end':'middle';const col=DIMTXT[i];const nm=dm.dn||'';const tl=(nm.length*fsName).toFixed(1);const cstr=(coeff[i]==null?'--':(+coeff[i]||0).toFixed(2));const tlAttr=(coeff[i]==null?'':` textLength="${tl}" lengthAdjust="spacingAndGlyphs"`);
    svg+=`<text x="${lp[0].toFixed(1)}" y="${lp[1].toFixed(1)}" font-size="${fsName}" text-anchor="${an}" fill="${col}" fill-opacity="0.8" font-weight="600">${esc(nm)}</text>`
      +`<text x="${lp[0].toFixed(1)}" y="${(lp[1]+fsName+1.2).toFixed(1)}" font-size="${fsNum}"${tlAttr} text-anchor="${an}" fill="${col}" fill-opacity="0.8" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="600">${cstr}</text>`;}
  // 中央 先天/運氣/後天 文字（深米色）
  R3_CORELABELS.forEach(([nm,deg,fr])=>{const p=f(deg,rIn*fr);svg+=`<text x="${p[0].toFixed(1)}" y="${(p[1]+fsCore*0.3).toFixed(1)}" font-size="${fsCore}" text-anchor="middle" fill="#8a7440" font-weight="700">${nm}</text>`;});
  // 標題（畫在預設 viewBox 上方留白處，貼近圖頂、字級＝維度字；僅桌機用，手機版 viewBox 較窄不傳）
  if(opts.title){svg+=`<text x="${cx}" y="36" font-size="${fsName}" text-anchor="middle" fill="#5a4f45" font-weight="700" letter-spacing="1">${esc(opts.title)}</text>`;}
  const VB=opts.viewBox||'0 -34 400 458'; // 手機版傳 "20 40 360 360" 使 13 邊形與 radar2 同大
  return `<svg viewBox="${VB}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}
