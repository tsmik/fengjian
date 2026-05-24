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
const spans=[];for(let i=0;i<13;i++)spans.push([i*STEP,(i+1)*STEP]);
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
const NAMEPOS=[[14.1,2.395],[40.3,2.320],[69.1,2.318],[97.2,2.300],[128.5,2.340],[155.9,2.401],[180.0,2.504],[204.4,2.406],[233.7,2.390],[261.9,2.332],[290.2,2.365],[319.1,2.357],[345.6,2.398]];
const NUMPOS=[[13.8,1.975],[42.6,1.921],[70.4,1.925],[98.2,1.940],[126.6,1.985],[152.6,2.047],[180.0,2.083],[207.4,2.047],[234.3,2.028],[261.2,1.985],[289.7,1.956],[317.6,1.950],[345.6,1.952]];

// ===== 係數雷達（radar2）=====
export function buildRadar2SVG(opts){
  opts=opts||{};
  const coeff=opts.dimCoeff||new Array(13).fill(0);
  const sfrac=opts.dimSFrac||new Array(13).fill(0.5);
  const bossV=+opts.bossV||0,mgrV=+opts.mgrV||0,luckV=+opts.luckV||0,postV=+opts.postV||0;
  const DIM=[];for(let i=0;i<13;i++){const d=CORE_DIMS[i]||{};DIM.push({dn:d.dn||'',c:(+coeff[i]||0),sf:Math.max(0,Math.min(1,+sfrac[i]||0))});}
  const innerPoly=spans.map(s=>PS(f(s[0],rIn))).join(' ');
  const QUAD=[
    {a0:0,a1:3*STEP,v:bossV,bd:43.2,bf:0.598,bs:10.5,col:'#936A78',tc:'#936A78',nm:'老闆'},
    {a0:3*STEP,a1:6*STEP,v:mgrV,bd:124.7,bf:0.597,bs:10.5,col:'#AE6D4F',tc:'#876D4F',nm:'主管'},
    {a0:6*STEP,a1:9*STEP,v:luckV,bd:207.3,bf:0.597,bs:10.5,col:'#546D77',tc:'#546D77',nm:'運氣'},
    {a0:9*STEP,a1:360,v:postV,bd:306.2,bf:0.556,bs:10.5,col:'#797181',tc:'#797181',nm:'後天'}
  ];
  let svg='';
  svg+=`<polygon points="${innerPoly}" fill="${CRBG}"/>`;
  QUAD.forEach(q=>{const r=rIn*Math.sqrt(Math.min(1,q.v/COEF_MAX));svg+=`<path d="${polySector(q.a0,q.a1,r)}" fill="${q.col}" fill-opacity="0.3"/>`;});
  [[0,1],[3*STEP,0.4],[6*STEP,1],[9*STEP,1]].forEach(([a,op])=>{const p=f(a,rIn);svg+=`<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="#fff" stroke-opacity="${op}" stroke-width="1.5"/>`;});
  svg+=`<polygon points="${innerPoly}" fill="none" stroke="#fff" stroke-width="1.5"/>`;
  function lab2(x,y,name,val,fs,col){const tl=(name.length*fs).toFixed(1);svg+=`<text x="${x.toFixed(1)}" y="${(y-3).toFixed(1)}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="700">${name}</text>`+`<text x="${x.toFixed(1)}" y="${(y+9).toFixed(1)}" font-size="${fs}" textLength="${tl}" lengthAdjust="spacingAndGlyphs" text-anchor="middle" fill="${col}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700">${(+val||0).toFixed(2)}</text>`;}
  QUAD.forEach(q=>{const p=f(q.bd,rIn*q.bf);lab2(p[0],p[1],q.nm,q.v,q.bs,q.tc);});
  // 係數環：bar 由 rIn 放射、底色＝動/靜色、透明度與分數反比
  const OP_LOW=1.00,OP_HIGH=0.70;
  DIM.forEach((dm,i)=>{const[a0,a1]=spans[i];const frac=Math.min(1,dm.c/COEF_MAX);const rT=rIn+frac*H;
    const fill=dm.sf<0.5?A:S;const op=(OP_LOW*(1-frac)+OP_HIGH*frac).toFixed(3);
    svg+=`<path d="${facet(a0,a1,rIn,rT)}" fill="${fill}" fill-opacity="${op}" stroke="#fff" stroke-width="0.8"/>`;});
  // 先天/運氣/後天 群組分隔線（中心→外緣）
  [[0,'#936A78'],[3*STEP,'#898179'],[6*STEP,'#546D77'],[9*STEP,'#797181']].forEach(([a,col])=>{const p1=f(a,rOut);svg+=`<line x1="${cx}" y1="${cy}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="${col}" stroke-width="2"/>`;});
  // 最外圍淡灰 13 邊形
  svg+=`<polygon points="${spans.map(s=>PS(f(s[0],rOut))).join(' ')}" fill="none" stroke="#e6ddd0" stroke-width="1"/>`;
  // 維度名（13邊形外）
  const FSD=10.8;
  DIM.forEach((dm,i)=>{const np=NAMEPOS[i];const lp=f(np[0],rIn*np[1]);const c=Math.sin(rad(np[0]));const an=c>0.25?'start':c<-0.25?'end':'middle';const col=DIMTXT[i];
    svg+=`<text x="${lp[0].toFixed(1)}" y="${lp[1].toFixed(1)}" font-size="${FSD}" text-anchor="${an}" fill="${col}" fill-opacity="0.8" font-weight="600">${dm.dn}</text>`;});
  // 維度係數數字（13邊形內圍；被 bar 蓋到→白字，否則動/靜色）
  DIM.forEach((dm,i)=>{const rT=rIn+Math.min(1,dm.c/COEF_MAX)*H;const npp=f(NUMPOS[i][0],rIn*NUMPOS[i][1]);const nx=npp[0],ny=npp[1];
    const rr=Math.hypot(nx-cx,ny-cy);const mcol=dm.sf<0.5?A:S;const ncol=(rT>=rr)?'#fff':mcol;
    svg+=`<text x="${nx.toFixed(1)}" y="${ny.toFixed(1)}" font-size="10.5" text-anchor="middle" fill="${ncol}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700">${dm.c.toFixed(2)}</text>`;});
  // 學員姓名
  {const p=f(322.8,rIn*3.596);svg+=`<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" font-size="13.5" text-anchor="middle" fill="#9a9188" font-weight="600">${esc(opts.name||'')}</text>`;}
  // 標題
  {const p=f(31.6,rIn*3.395);svg+=`<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" font-size="13.6" text-anchor="middle" fill="#3d3b39" font-weight="700" letter-spacing="2">人相兵法報告圖</text>`;}
  // 動靜圖例
  {const p=f(221.2,rIn*3.773);const lx=p[0],ly=p[1];const ls=10/12,fz=12*ls;
   svg+=`<rect x="${lx.toFixed(1)}" y="${(ly-9*ls).toFixed(1)}" width="${(11*ls).toFixed(1)}" height="${(11*ls).toFixed(1)}" rx="2" fill="${S}"/>`
     +`<text x="${(lx+15*ls).toFixed(1)}" y="${ly.toFixed(1)}" font-size="${fz.toFixed(1)}" fill="#9a9188">靜</text>`
     +`<rect x="${(lx+40*ls).toFixed(1)}" y="${(ly-9*ls).toFixed(1)}" width="${(11*ls).toFixed(1)}" height="${(11*ls).toFixed(1)}" rx="2" fill="${A}"/>`
     +`<text x="${(lx+55*ls).toFixed(1)}" y="${ly.toFixed(1)}" font-size="${fz.toFixed(1)}" fill="#9a9188">動</text>`;}
  return `<svg viewBox="0 -34 400 458" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

// ===== 係數總覽（radar0）：係數子彈圖 + 逐部位總動靜 =====
const _bR=(x,y,w,h,r)=>{w=Math.max(0,w);r=Math.max(0,Math.min(r,h/2,w));return `M${x.toFixed(1)},${y.toFixed(1)} h${(w-r).toFixed(1)} a${r},${r} 0 0 1 ${r},${r} v${(h-2*r).toFixed(1)} a${r},${r} 0 0 1 ${-r},${r} h${(-(w-r)).toFixed(1)} Z`;};
const _bL=(x,y,w,h,r)=>{w=Math.max(0,w);r=Math.max(0,Math.min(r,h/2,w));return `M${(x+r).toFixed(1)},${y.toFixed(1)} h${(w-r).toFixed(1)} v${h.toFixed(1)} h${(-(w-r)).toFixed(1)} a${r},${r} 0 0 1 ${-r},${-r} v${(-(h-2*r)).toFixed(1)} a${r},${r} 0 0 1 ${r},${-r} Z`;};
export function buildRadar0SVG(opts){
  opts=opts||{};
  const preV=+opts.preV||0,bossV=+opts.bossV||0,mgrV=+opts.mgrV||0,luckV=+opts.luckV||0,postV=+opts.postV||0,totV=+opts.totV||0;
  const partD=opts.partD||new Array(9).fill(0), partN=opts.partN||new Array(9).fill(0);
  const PLAB=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  const TOTCOL='#494541';
  const ROWS=[
    {name:'先天',v:preV,col:'#8E4B50'},{name:'老闆',v:bossV,col:'#936A78'},{name:'主管',v:mgrV,col:'#876D4F'},
    {name:'運氣',v:luckV,col:'#546D77'},{name:'後天',v:postV,col:'#797181'},{name:'總係數',v:totV,col:TOTCOL}
  ];
  // 逐部位動靜
  const SD_ROWS=[];let sumD=0,sumN=0;
  for(let i=0;i<9;i++){const d=+partD[i]||0,nn=+partN[i]||0;SD_ROWS.push({name:PLAB[i],d:d,s:nn-d,t:nn||1});sumD+=d;sumN+=nn;}
  SD_ROWS.push({name:'總計',d:sumD,s:sumN-sumD,t:sumN||1});
  const THICK_AFTER=[3,8];
  const CMAX=0.8,X0=74,BAR_H=12,GAP=9.6,PAD=8,LP=4,TRACKW=300,COEF_OP=0.7,SD_OP=0.85,GT=GAP,GK=GAP+6;
  const A2='#C17A5A',S2='#7A9E7E';
  const xOf=v=>X0+(Math.min(1,v/CMAX))*TRACKW;
  let s='';
  // 標題：左上姓名、右上 人相兵法係數總覽
  s+=`<text x="${X0}" y="20" font-size="11.5" text-anchor="start" fill="#9a9188" font-weight="600">${esc(opts.name||'')}</text>`;
  s+=`<text x="${(X0+TRACKW).toFixed(1)}" y="20" font-size="14" text-anchor="end" fill="#3d3b39" font-weight="700" letter-spacing="1">人相兵法係數總覽</text>`;
  // 係數總覽（6 子彈）
  const n=ROWS.length, cTop=34, stackTop=cTop+PAD, stackBot=stackTop+n*(BAR_H+GAP)-GAP, cBot=stackBot+PAD, tEdge=xOf(totV);
  s+=`<rect x="${X0}" y="${cTop}" width="${TRACKW}" height="${(cBot-cTop).toFixed(1)}" rx="4" fill="#f3eee4"/>`;
  ROWS.forEach((r,i)=>{const y=stackTop+i*(BAR_H+GAP);const cyy=y+BAR_H/2;
    s+=`<path d="${_bR(X0,y,xOf(r.v)-X0,BAR_H,Math.min(3,BAR_H/2))}" fill="${r.col}" fill-opacity="${COEF_OP}"/>`;
    s+=`<text x="${(X0-8).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="12" text-anchor="end" dominant-baseline="central" fill="${r.col}" font-weight="700">${r.name}</text>`;
    s+=`<text x="${(xOf(r.v)+6).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="11" dominant-baseline="central" fill="${r.col}" font-family="'Helvetica Neue',Arial,sans-serif" font-weight="700">${r.v.toFixed(2)}</text>`;});
  s+=`<line x1="${tEdge.toFixed(1)}" y1="${(cTop-LP).toFixed(1)}" x2="${tEdge.toFixed(1)}" y2="${(cBot+LP).toFixed(1)}" stroke="${TOTCOL}" stroke-width="1.5"/>`;
  // 總動靜（逐部位）
  const SDH=BAR_H, prr=Math.min(3,SDH/2);
  const headBoxTop=cBot+GAP, headBase=headBoxTop+12, sdCTop=headBoxTop+16+GAP, barsTop=sdCTop+PAD;
  let hh=0; SD_ROWS.forEach((r,i)=>{hh+=SDH; if(i<SD_ROWS.length-1) hh+=(THICK_AFTER.indexOf(i)>=0?GK:GT);});
  s+=`<text x="${(X0+TRACKW).toFixed(1)}" y="${headBase.toFixed(1)}" font-size="14" text-anchor="end" fill="#3d3b39" font-weight="700" letter-spacing="1">總動靜</text>`;
  s+=`<rect x="${X0}" y="${sdCTop.toFixed(1)}" width="${TRACKW}" height="${(hh+2*PAD).toFixed(1)}" rx="4" fill="#f3eee4"/>`;
  let y=barsTop;
  SD_ROWS.forEach((r,i)=>{const isTot=(i===SD_ROWS.length-1);const op=isTot?Math.min(1,SD_OP+0.18):SD_OP;
    const dW=TRACKW*r.d/r.t, bd=X0+dW, cyy=y+SDH/2;
    s+=`<path d="${_bL(X0,y,dW,SDH,prr)}" fill="${A2}" fill-opacity="${op}"/>`;
    s+=`<path d="${_bR(bd,y,TRACKW-dW,SDH,prr)}" fill="${S2}" fill-opacity="${op}"/>`;
    s+=`<text x="${(X0-8).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="11.5" text-anchor="end" dominant-baseline="central" fill="#6a6458" font-weight="700">${r.name}</text>`;
    if(dW>10) s+=`<text x="${(bd-4).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="10" text-anchor="end" dominant-baseline="central" fill="#fff" font-weight="700">${r.d}</text>`;
    if(TRACKW-dW>10) s+=`<text x="${(bd+4).toFixed(1)}" y="${cyy.toFixed(1)}" font-size="10" text-anchor="start" dominant-baseline="central" fill="#fff" font-weight="700">${r.s}</text>`;
    const gp=(i<SD_ROWS.length-1?(THICK_AFTER.indexOf(i)>=0?GK:GT):0);
    if(THICK_AFTER.indexOf(i)>=0){const ly=y+SDH+gp/2;s+=`<line x1="${X0}" y1="${ly.toFixed(1)}" x2="${(X0+TRACKW).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#b09a6a" stroke-width="1.2"/>`;}
    y+=SDH+gp;
  });
  const vbH=Math.ceil(sdCTop+hh+2*PAD+6);
  return `<svg viewBox="0 0 400 ${vbH}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}
