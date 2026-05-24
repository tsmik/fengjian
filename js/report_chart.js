/* report_chart.js — 一目了然人相兵法報告圖（staging 測試用）
 * buildReportChartSVG(opts) → 回傳完整 <svg> 字串（靜態，無拖曳工具）
 * opts:
 *   name      學員/個案姓名
 *   dimSFrac  [13] 各維度「靜佔比」0..1（s/(s+d)）
 *   dimCoeff  [13] 各維度係數
 *   preV/luckV/postV  先天/運氣/後天係數
 *   bossV/mgrV        老闆/主管係數
 * 依賴：core.js 的 DIMS（取維度名與兩極字）
 */
import { DIMS as CORE_DIMS } from './core.js';

const DIMTXT=['#4A6B3A','#3A5E54','#6A6458','#7A5A38','#7A4858','#7A6A38','#3A5A7A','#5A4870','#3A6A4A','#3A6B3A','#5A4068','#3A6058','#3A5870'];
const S='#7A9E7E', A='#C17A5A';
const CRBG='#f0e9dc', CRT='#7d6643';
const Sm='#90b094', Am='#cc9173', Sd='#4f6f53', Ad='#8f5236';
const COEF_MAX=0.8;
const cx=200,cy=215,U=150/9,rIn=4*U,rOut=9*U,H=rOut-rIn,rBal=rIn+0.5*H;
const STEP=360/13;
const rad=d=>d*Math.PI/180;
const f=(deg,r)=>[cx+r*Math.sin(rad(deg)),cy-r*Math.cos(rad(deg))];
const PS=p=>p[0].toFixed(2)+','+p[1].toFixed(2);
const facet=(a0,a1,ra,rb)=>`M ${PS(f(a0,ra))} L ${PS(f(a0,rb))} L ${PS(f(a1,rb))} L ${PS(f(a1,ra))} Z`;
function polySector(a0,a1,r){const k0=Math.round(a0/STEP),k1=Math.round(a1/STEP);let pts=[`${cx},${cy}`];for(let k=k0;k<=k1;k++)pts.push(PS(f(k*STEP,r)));return 'M'+pts.join(' L')+' Z';}
function esc(s){return String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}

export function buildReportChartSVG(opts){
  opts=opts||{};
  const name=opts.name||'';
  const coeff=opts.dimCoeff||new Array(13).fill(0);
  const sfrac=opts.dimSFrac||new Array(13).fill(0.5);
  const DIM=[];
  for(let i=0;i<13;i++){
    const d=CORE_DIMS[i]||{};
    const jc=(d.aT==='靜')?d.a:d.b; // 靜字
    const dc=(d.aT==='靜')?d.b:d.a; // 動字
    DIM.push({dn:d.dn||'',jc:jc||'',dc:dc||'',c:(+coeff[i]||0),sf:Math.max(0,Math.min(1,+sfrac[i]||0))});
  }
  const spans=[];for(let i=0;i<13;i++)spans.push([i*STEP,(i+1)*STEP]);
  const innerPoly=spans.map(s=>PS(f(s[0],rIn))).join(' ');
  const preV=+opts.preV||0, luckV=+opts.luckV||0, postV=+opts.postV||0, bossV=+opts.bossV||0, mgrV=+opts.mgrV||0;
  const QUAD=[
    {name:'老闆',a0:0,a1:3*STEP,v:bossV,bd:43.5,bf:0.713,bs:10.5,col:'#936A78',tc:'#936A78'},
    {name:'主管',a0:3*STEP,a1:6*STEP,v:mgrV,bd:136.4,bf:0.751,bs:10.4,col:'#AE6D4F',tc:'#876D4F'},
    {name:'運氣',a0:6*STEP,a1:9*STEP,v:luckV,bd:214.9,bf:0.763,bs:10.5,col:'#546D77',tc:'#546D77'},
    {name:'後天',a0:9*STEP,a1:360,v:postV,bd:302.0,bf:0.721,bs:10.5,col:'#797181',tc:'#797181'}
  ];
  let svg='';
  // 外圈邊框
  svg+=`<polygon points="${spans.map(s=>PS(f(s[0],rOut))).join(' ')}" fill="none" stroke="#e6ddd0" stroke-width="1"/>`;
  // 內圈四象限面積（老闆/主管/運氣/後天）
  svg+=`<polygon points="${innerPoly}" fill="${CRBG}"/>`;
  QUAD.forEach(q=>{const r=rIn*Math.sqrt(Math.min(1,q.v/COEF_MAX));svg+=`<path d="${polySector(q.a0,q.a1,r)}" fill="${q.col}" fill-opacity="0.3"/>`;});
  [[0,1],[3*STEP,0.4],[6*STEP,1],[9*STEP,1]].forEach(([a,op])=>{const p=f(a,rIn);svg+=`<line x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="#fff" stroke-opacity="${op}" stroke-width="1.5"/>`;});
  svg+=`<polygon points="${innerPoly}" fill="none" stroke="#fff" stroke-width="1.5"/>`;
  // 核心文字框（老闆/主管/運氣/後天 + 先天）
  function lab2(x,y,nm,val,fs,col){const tl=(nm.length*fs).toFixed(1);svg+=`<text x="${x.toFixed(1)}" y="${(y-3).toFixed(1)}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="700">${nm}</text>`+`<text x="${x.toFixed(1)}" y="${(y+9).toFixed(1)}" font-size="${fs}" textLength="${tl}" lengthAdjust="spacingAndGlyphs" text-anchor="middle" fill="${col}" font-family="monospace" font-weight="700">${(+val||0).toFixed(2)}</text>`;}
  QUAD.forEach(q=>{const p=f(q.bd,rIn*q.bf);lab2(p[0],p[1],q.name,q.v,q.bs,q.tc);});
  {const p=f(92.7,rIn*0.679);lab2(p[0],p[1],'先天',preV,11.2,'#854F51');}
  // 資料環（靜綠/動橘）
  DIM.forEach((dm,i)=>{const[a0,a1]=spans[i];const rS=rIn+dm.sf*H;
    svg+=`<path d="${facet(a0,a1,rIn,rS)}" fill="${S}" fill-opacity="0.40"/>`;
    svg+=`<path d="${facet(a0,a1,rS,rOut)}" fill="${A}" fill-opacity="0.40"/>`;});
  spans.forEach(s=>svg+=`<line x1="${f(s[0],rIn)[0].toFixed(1)}" y1="${f(s[0],rIn)[1].toFixed(1)}" x2="${f(s[0],rOut)[0].toFixed(1)}" y2="${f(s[0],rOut)[1].toFixed(1)}" stroke="#fff" stroke-width="1"/>`);
  // 平衡線
  svg+=`<polygon points="${spans.map(s=>PS(f(s[0],rBal))).join(' ')}" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="0.8"/>`;
  // 動靜交界線（主導極上色）
  DIM.forEach((dm,i)=>{const[a0,a1]=spans[i];const rS=rIn+dm.sf*H;const g=(a1-a0)*0.04;
    const dDom=dm.sf<0.5;const col=dDom?Am:Sm;const p0=f(a0+g,rS),p1=f(a1-g,rS);
    svg+=`<line x1="${p0[0].toFixed(1)}" y1="${p0[1].toFixed(1)}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="${col}" stroke-width="3.2" stroke-linecap="round"/>`;});
  // 只標主導極字
  const rInner=rIn+0.25*H, rOuter=rIn+0.75*H;
  DIM.forEach((dm,i)=>{const mid=(spans[i][0]+spans[i][1])/2;const jDom=dm.sf>=0.5;
    if(jDom){const pj=f(mid,rInner);svg+=`<text x="${pj[0].toFixed(1)}" y="${(pj[1]+3.5).toFixed(1)}" font-size="10" text-anchor="middle" fill="${Sd}" font-weight="700">${dm.jc}</text>`;}
    else{const pd=f(mid,rOuter);svg+=`<text x="${pd[0].toFixed(1)}" y="${(pd[1]+3.5).toFixed(1)}" font-size="10" text-anchor="middle" fill="${Ad}" font-weight="700">${dm.dc}</text>`;}});
  // 維度名+係數（位置寫死 [deg, frac]）
  const FSD=10.8;
  const DIMPOS=[[13.9,2.477],[38.7,2.404],[67.4,2.331],[98.2,2.292],[129.4,2.355],[155.4,2.454],[180.0,2.477],[206.0,2.422],[233.3,2.388],[262.8,2.300],[292.9,2.336],[319.5,2.397],[345.3,2.457]];
  DIM.forEach((dm,i)=>{const dp=DIMPOS[i];const lp=f(dp[0],rIn*dp[1]);const c=Math.sin(rad(dp[0]));const an=c>0.25?'start':c<-0.25?'end':'middle';const col=DIMTXT[i];const tl=(dm.dn.length*FSD).toFixed(1);
    svg+=`<text x="${lp[0].toFixed(1)}" y="${lp[1].toFixed(1)}" font-size="${FSD}" text-anchor="${an}" fill="${col}" fill-opacity="0.8" font-weight="600">${dm.dn}</text>`
       +`<text x="${lp[0].toFixed(1)}" y="${(lp[1]+12).toFixed(1)}" font-size="${FSD}" textLength="${tl}" lengthAdjust="spacingAndGlyphs" text-anchor="${an}" fill="${col}" fill-opacity="0.8" font-family="monospace" font-weight="600">${dm.c.toFixed(2)}</text>`;});
  // 學員姓名
  {const p=f(322.8,rIn*3.596);svg+=`<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" font-size="13.5" text-anchor="middle" fill="#9a9188" font-weight="600">${esc(name)}</text>`;}
  // 標題
  {const p=f(31.6,rIn*3.395);svg+=`<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" font-size="13.6" text-anchor="middle" fill="#3d3b39" font-weight="700" letter-spacing="2">人相兵法報告圖</text>`;}
  // 總係數（中央；黑透明底白字）
  {const tcx=200,tcy=215,totV=+opts.totalV||0;
   svg+=`<rect x="${tcx-17}" y="${tcy-14}" width="34" height="28" rx="5" fill="#000" fill-opacity="0.45"/>`
     +`<text x="${tcx}" y="${tcy-2}" font-size="9" text-anchor="middle" fill="#fff" font-weight="700">總係數</text>`
     +`<text x="${tcx}" y="${tcy+10}" font-size="10.5" textLength="27" lengthAdjust="spacingAndGlyphs" text-anchor="middle" fill="#fff" font-family="monospace" font-weight="700">${totV.toFixed(2)}</text>`;}
  // 動靜圖例
  {const p=f(221.2,rIn*3.773);const lx=p[0],ly=p[1];const ls=10/12,fz=12*ls;
   svg+=`<rect x="${lx.toFixed(1)}" y="${(ly-9*ls).toFixed(1)}" width="${(11*ls).toFixed(1)}" height="${(11*ls).toFixed(1)}" rx="2" fill="${S}"/>`
     +`<text x="${(lx+15*ls).toFixed(1)}" y="${ly.toFixed(1)}" font-size="${fz.toFixed(1)}" fill="#9a9188">靜</text>`
     +`<rect x="${(lx+40*ls).toFixed(1)}" y="${(ly-9*ls).toFixed(1)}" width="${(11*ls).toFixed(1)}" height="${(11*ls).toFixed(1)}" rx="2" fill="${A}"/>`
     +`<text x="${(lx+55*ls).toFixed(1)}" y="${ly.toFixed(1)}" font-size="${fz.toFixed(1)}" fill="#9a9188">動</text>`;}
  return `<svg viewBox="0 -34 400 458" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}
