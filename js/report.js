/* report.js – Report module (extracted from index_desktop.html) */

import { DIMS, PARTS, data, obsData, obsOverride, condResults, userName, _isTA, _currentCaseId, _currentCaseName,
         _userGender, _userBirthday, _caseGender, _caseBirthday, _caseDate, _liunianTable, BETA_VISIBLE_DIMS,
         setNavActive, showPage, _getUserDocRef, calcDim, avgCoeff } from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { collectDetailForPrompt } from './obs_ui.js';

/* ===== Report Save ===== */
export function reportSave(){
  const btn=document.getElementById('report-save-btn');if(!userName)return;
  localStorage.setItem('obs_data_v1',JSON.stringify(obsData));
  localStorage.setItem('obs_override_v1',JSON.stringify(obsOverride));
  _getUserDocRef().set({dataJson:JSON.stringify(data),obsJson:JSON.stringify(obsData),overrideJson:JSON.stringify(obsOverride),updatedAt:new Date().toISOString()},{merge:true})
    .then(()=>{btn.innerText='已儲存 \u2713';btn.style.color='var(--static)';btn.style.borderColor='var(--static)';setTimeout(()=>{btn.innerText='儲存評分';btn.style.color='';btn.style.borderColor='';},2000);})
    .catch(()=>{btn.innerText='失敗，請重試';setTimeout(()=>{btn.innerText='儲存評分';},2000);});
}

/* ===== 流年計算 ===== */
export function calcXuSui(birthday, refDate){
  if(!birthday)return null;
  var bd=new Date(birthday);
  var rd=refDate?new Date(refDate):new Date();
  if(isNaN(bd.getTime())||isNaN(rd.getTime()))return null;
  var age=rd.getFullYear()-bd.getFullYear();
  var m=rd.getMonth()-bd.getMonth();
  if(m<0||(m===0&&rd.getDate()<bd.getDate()))age--;
  return age+1;
}

export function getLiunian(gender, xusui){
  if(!_liunianTable||!gender||!xusui||xusui<1||xusui>99)return null;
  var rows=_liunianTable[gender];
  if(!rows)return null;
  return rows.find(function(r){return r.age===xusui;})||null;
}

export function _getLiunianInfo(){
  var gender, birthday, refDate;
  if(_isTA&&_currentCaseId){
    gender=_caseGender;birthday=_caseBirthday;refDate=_caseDate||null;
  }else if(_isTA&&!_currentCaseId){
    gender=_caseGender;birthday=_caseBirthday;refDate=null;
  }else{
    gender=_userGender;birthday=_userBirthday;refDate=null;
  }
  if(!gender||!birthday)return null;
  var xusui=calcXuSui(birthday,refDate);
  if(!xusui||xusui<1)return null;
  var ln=getLiunian(gender,xusui);
  if(!ln)return null;
  return {xusui:xusui, mark:ln.mark, ln:ln};
}

export function buildLiunianTitleHtml(info){
  if(!info)return '';
  var h=' <span style="font-size:15px;font-weight:700;margin-left:8px">虛歲 '+info.xusui+'</span>';
  if(info.mark){
    h+=' <span style="font-size:12px;color:#fff;background:#c03830;padding:1px 6px;border-radius:4px;font-weight:900;margin-left:6px">'+info.mark+'</span>';
  }
  return h;
}

export function buildLiunianTableHtml(info){
  if(!info)return '';
  var ln=info.ln;
  var bgA='#d6cfc4',bgB='#c8cfd6';
  var lbgA='#ece8e0',lbgB='#e0e5ea';
  var tc='#3a3228';
  var hc1='#4a453e',hc2='#3a4450';
  var rc='border-radius:3px';

  var t='<table style="border-collapse:separate;border-spacing:2px;font-size:13px;width:100%;margin-bottom:6px;font-family:\'Noto Serif TC\',serif">';
  t+='<tr>';
  t+='<td colspan="2" style="padding:4px 8px;font-weight:700;text-align:center;white-space:nowrap;background:'+bgA+';color:'+hc1+';'+rc+'">七十五</td>';
  t+='<td style="padding:4px 8px;font-weight:700;text-align:center;white-space:nowrap;background:'+bgB+';color:'+hc2+';'+rc+'">九執</td>';
  t+='<td style="padding:4px 8px;font-weight:700;text-align:center;white-space:nowrap;background:'+bgA+';color:'+hc1+';'+rc+'">業務</td>';
  t+='<td style="padding:4px 8px;font-weight:700;text-align:center;white-space:nowrap;background:'+bgB+';color:'+hc2+';'+rc+'">親族</td>';
  t+='<td style="padding:4px 8px;font-weight:700;text-align:center;white-space:nowrap;background:'+bgA+';color:'+hc1+';'+rc+'">子女</td>';
  t+='<td style="padding:4px 8px;font-weight:700;text-align:center;white-space:nowrap;background:'+bgB+';color:'+hc2+';'+rc+'">耳鼻</td>';
  t+='<td style="padding:4px 8px;font-weight:700;text-align:center;white-space:nowrap;background:'+bgA+';color:'+hc1+';'+rc+'">五官</td>';
  t+='<td style="padding:4px 8px;font-weight:700;text-align:center;white-space:nowrap;background:'+bgB+';color:'+hc2+';'+rc+'">三停</td>';
  t+='</tr>';
  t+='<tr>';
  t+='<td style="padding:5px 8px;text-align:center;font-weight:700;white-space:nowrap;background:'+lbgA+';color:'+tc+';'+rc+'">'+(ln.name75||'')+'</td>';
  t+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;background:'+lbgA+';color:'+tc+';'+rc+'">'+(ln.area75||'')+'</td>';
  t+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;background:'+lbgB+';color:'+tc+';'+rc+'">'+(ln.jiuzhi||'')+'</td>';
  t+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;background:'+lbgA+';color:'+tc+';'+rc+'">'+(ln.yewu||'')+'</td>';
  t+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;background:'+lbgB+';color:'+tc+';'+rc+'">'+(ln.qinzu||'')+'</td>';
  t+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;background:'+lbgA+';color:'+tc+';'+rc+'">'+(ln.zinv||'')+'</td>';
  t+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;background:'+lbgB+';color:'+tc+';'+rc+'">'+(ln.erbei||'')+'</td>';
  t+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;background:'+lbgA+';color:'+tc+';'+rc+'">'+(ln.wuguan||'')+'</td>';
  t+='<td style="padding:5px 8px;text-align:center;white-space:nowrap;background:'+lbgB+';color:'+tc+';'+rc+'">'+(ln.santing||'')+'</td>';
  t+='</tr></table>';
  return t;
}

/* ===== Show Report ===== */
export function showReport(){
  showPage('report-overlay');
  document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-report');
  recalcFromObs();
  var _lnInfo=_getLiunianInfo();
  document.getElementById('report-name-display').innerHTML=(_currentCaseName||userName||'未命名')+buildLiunianTitleHtml(_lnInfo);
  // 統計數據
  const vTotal=avgCoeff(data, [0,1,2,3,4,5,6,7,8,9,10,11,12]);
  const vPre=avgCoeff(data, [0,1,2,3,4,5]),vLuck=avgCoeff(data, [6,7,8]),vPost=avgCoeff(data, [9,10,11,12]);
  const vLead=avgCoeff(data, [0,1,2]),vSub=avgCoeff(data, [3,4,5]);
  let sT=0,dT=0;DIMS.forEach((d,i)=>{data[i].forEach(v=>{if(!v)return;const tp=v==='A'?d.aT:d.bT;tp==='靜'?sT++:dT++;});});
  const total=sT+dT||1;
  const sPct=(sT/total*100).toFixed(1),dPct=(dT/total*100).toFixed(1);

  // 完整表格（頂部統計 + 維度矩陣）
  const ftEl=document.getElementById('report-full-table');
  if(ftEl){
    const partOrder=[0,1,2,3,4,5,6,7,8];
    const partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
    const dimColors=['#5E8080','#6E9292','#7EA4A4','#527070','#608282','#6E9494','#9E8A5A','#B29E6E','#C6B282','#7A5A50','#8E6C62','#A27E74','#B69088'];
    const dimAlpha=['rgba(94,128,128,0.4)','rgba(110,146,146,0.4)','rgba(126,164,164,0.4)','rgba(82,112,112,0.4)','rgba(96,130,130,0.4)','rgba(110,148,148,0.4)','rgba(158,138,90,0.4)','rgba(178,158,110,0.4)','rgba(198,178,130,0.4)','rgba(122,90,80,0.4)','rgba(142,108,98,0.4)','rgba(162,126,116,0.4)','rgba(182,144,136,0.4)'];
    const SBG='#7A9E7E',DBG='#C17A5A';
    var sChar=DIMS.map(function(d){return d.aT==='靜'?d.a:d.b;});
    var dChar=DIMS.map(function(d){return d.aT==='靜'?d.b:d.a;});
    var colL=DIMS.map(function(d){return d.da;});
    var colR=DIMS.map(function(d){return d.db;});
    var colLIsS=DIMS.map(function(d){var dt=(d.da===d.a)?d.aT:d.bT;return dt==='靜';});
    const bd='border:1px solid rgba(0,0,0,0.15)';
    var rc='border-radius:4px';
    var csTop='border-radius:4px;padding:8px 14px;font-size:18px;font-weight:700;text-align:center';
    var csBlock='border-radius:4px;padding:6px 10px;font-weight:700;text-align:center';
    var nb='background:transparent;border:none;padding:4px';

    // 計算各範圍動靜總數
    function countSD(dimIds){
      var s=0,d=0;
      dimIds.forEach(function(di){
        data[di].forEach(function(v){
          if(!v)return;
          var tp=v==='A'?DIMS[di].aT:DIMS[di].bT;
          if(tp==='靜')s++;else d++;
        });
      });
      return {s:s,d:d};
    }
    var sdAll=countSD([0,1,2,3,4,5,6,7,8,9,10,11,12]);
    var sdPre=countSD([0,1,2,3,4,5]);
    var sdLuck=countSD([6,7,8]);
    var sdPost=countSD([9,10,11,12]);
    var sdLead=countSD([0,1,2]);
    var sdSub=countSD([3,4,5]);
    function sdTag(sd){
      return '<span style="font-weight:700"><span style="color:'+DBG+'">動'+sd.d+'</span>'+
        '<span style="color:#999">/</span><span style="color:'+SBG+'">靜'+sd.s+'</span></span>';
    }
    function cellFlex(label,val,sd,bg,color){
      return '<td style="'+rc+';background:'+bg+';color:'+color+';padding:6px 10px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center">'+
          '<span style="flex:1;text-align:center;font-weight:700">'+label+'　'+val+'</span>'+
          '<span style="font-weight:700;white-space:nowrap">'+sdTag(sd)+'</span>'+
        '</div></td>';
    }

    var _lnTableHtml=buildLiunianTableHtml(_lnInfo);
    // === 單一表格（頂部摘要 + 維度矩陣）===
    let t='<table style="border-collapse:separate;border-spacing:2px;font-size:14px;font-family:\'Noto Serif TC\',serif;white-space:nowrap;width:100%">';

    var pw='width:38px;min-width:38px';

    // --- 頂部摘要 ---
    // 第一列：總係數
    t+='<tr><td style="'+nb+';'+pw+'"></td>'+
      '<td colspan="26" style="'+rc+';background:#c8bfb0;color:#3a3228;padding:8px 14px;font-size:18px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
      '<span style="flex:1;text-align:center;font-weight:700">總係數　'+vTotal+'</span>'+
      '<span style="font-weight:700;white-space:nowrap">'+sdTag(sdAll)+'</span></div></td>'+
      '<td style="'+nb+';'+pw+'"></td></tr>';
    // 第二列：先天12 + 運氣6 + 後天8
    t+='<tr><td rowspan="2" style="'+nb+';'+pw+'"></td>';
    t+=cellFlex('先天係數',vPre,sdPre,'#bdd4d4','#2e4a4a').replace('<td','<td colspan="12"');
    if(BETA_VISIBLE_DIMS>=9){
      t+=cellFlex('運氣係數',vLuck,sdLuck,'#e8dcc8','#5a4a2a').replace('<td','<td colspan="6"');
    }else{
      t+='<td colspan="6" style="border-radius:4px;background:#f0f0ea;color:#bbb;padding:6px 10px;text-align:center;font-weight:700">運氣係數　建置中</td>';
    }
    if(BETA_VISIBLE_DIMS>=13){
      t+=cellFlex('後天係數',vPost,sdPost,'#e0cdc6','#5a3a30').replace('<td','<td colspan="8"');
    }else{
      t+='<td colspan="8" style="border-radius:4px;background:#f0f0ea;color:#bbb;padding:6px 10px;text-align:center;font-weight:700">後天係數　建置中</td>';
    }
    t+='<td rowspan="2" style="'+nb+';'+pw+'"></td></tr>';
    // 第三列：老闆6 + 主管6 + 空6 + 空8
    t+='<tr>';
    t+=cellFlex('老闆係數',vLead,sdLead,'#cce0e0','#2e4a4a').replace('<td','<td colspan="6"');
    t+=cellFlex('主管係數',vSub,sdSub,'#d8eaea','#2e4a4a').replace('<td','<td colspan="6"');
    t+='<td colspan="6" style="'+nb+'"></td><td colspan="8" style="'+nb+'"></td></tr>';

    // --- 維度 header ---
    // 計算每個維度的靜/動部位數
    var dimSCounts=[],dimDCounts=[];
    for(var di2=0;di2<13;di2++){
      var sc=0,dc=0;
      data[di2].forEach(function(v){
        if(!v)return;
        var tp=v==='A'?DIMS[di2].aT:DIMS[di2].bT;
        if(tp==='靜')sc++;else dc++;
      });
      dimSCounts.push(sc);dimDCounts.push(dc);
    }

    // 維度名稱行
    t+='<tr><td rowspan="3" style="padding:4px 6px;background:#e8e3da;font-weight:700;position:sticky;left:0;z-index:2;'+rc+';'+pw+';text-align:center"></td>';
    DIMS.forEach(function(d,i){
      if(i>=BETA_VISIBLE_DIMS){
        t+='<th colspan="2" style="padding:10px 8px;background:#e0e0da;color:#bbb;font-weight:700;text-align:center;letter-spacing:2px;'+rc+'">'+d.dn+'</th>';
      }else{
        t+='<th colspan="2" style="padding:10px 8px;background:'+dimColors[i]+';color:white;font-weight:700;text-align:center;letter-spacing:2px;'+rc+'">'+d.dn+'</th>';
      }
    });
    t+='<td rowspan="3" style="padding:4px 6px;background:#e8e3da;font-weight:700;'+rc+';'+pw+';text-align:center"></td></tr>';
    // 子欄行：靜X｜動X（透明底、棕色字、底線）
    t+='<tr>';
    DIMS.forEach(function(d,i){
      if(i>=BETA_VISIBLE_DIMS){
        t+='<th colspan="2" style="padding:4px 6px;background:transparent;color:#ccc;font-weight:700;text-align:center;border-bottom:2.5px solid #ddd"></th>';
      }else{
        var lBg=colLIsS[i]?SBG:DBG;
        var rBg=colLIsS[i]?DBG:SBG;
        var lCnt=colLIsS[i]?dimSCounts[i]:dimDCounts[i];
        var rCnt=colLIsS[i]?dimDCounts[i]:dimSCounts[i];
        t+='<th style="padding:4px 6px;background:transparent;color:#7a6a50;font-weight:700;text-align:center;border-bottom:2.5px solid '+lBg+'">'+colL[i]+lCnt+'</th>';
        t+='<th style="padding:4px 6px;background:transparent;color:#7a6a50;font-weight:700;text-align:center;border-bottom:2.5px solid '+rBg+'">'+colR[i]+rCnt+'</th>';
      }
    });
    t+='</tr>';
    // 係數格（獨立圓角方塊 + 堆疊橫條）
    t+='<tr>';
    DIMS.forEach(function(d,i){
      if(i>=BETA_VISIBLE_DIMS){
        t+='<td colspan="2" style="padding:4px 6px;vertical-align:top"><div style="background:#e0e0da;color:#bbb;font-weight:700;border-radius:4px;padding:3px 6px;text-align:center;width:100%">—</div></td>';
      }else{
        var res=calcDim(data, i);
        var coeff=res?res.coeff.toFixed(2):'—';
        var sc=dimSCounts[i],dc=dimDCounts[i];
        var coeffBg=res?(res.type==='靜'?SBG:DBG):'var(--bg)';
        var coeffBlock='<div style="background:'+coeffBg+';color:white;font-weight:700;border-radius:4px;padding:3px 6px;text-align:center;margin-bottom:8px;width:100%">'+coeff+'</div>';
        var bars='<div style="display:flex;gap:2px;height:52px;align-items:flex-end;padding-bottom:2px;width:100%">';
        bars+='<div style="flex:1;display:flex;flex-direction:column;gap:2px;align-items:stretch;justify-content:flex-end">';
        for(var b=0;b<sc;b++)bars+='<div style="height:3px;background:'+SBG+';border-radius:1px"></div>';
        bars+='</div>';
        bars+='<div style="flex:1;display:flex;flex-direction:column;gap:2px;align-items:stretch;justify-content:flex-end">';
        for(var b=0;b<dc;b++)bars+='<div style="height:3px;background:'+DBG+';border-radius:1px"></div>';
        bars+='</div></div>';
        t+='<td colspan="2" style="padding:4px 6px;vertical-align:top">'+coeffBlock+bars+'</td>';
      }
    });
    t+='</tr>';

    // === 資料行 ===
    var partCellL='padding:4px 6px;font-weight:700;background:#e8e3da;position:sticky;left:0;z-index:1;'+rc+';'+pw+';text-align:center';
    var partCellR='padding:4px 6px;font-weight:700;background:#e8e3da;'+rc+';'+pw+';text-align:center';
    partOrder.forEach(function(pi,idx){
      // 下停和耳之間加分隔線（idx=3→下停，idx=4→耳）
      if(idx===4){
        t+='<tr><td colspan="28" style="height:2px;background:#b8b0a0;padding:0"></td></tr>';
      }
      t+='<tr>';
      t+='<td style="'+partCellL+'">'+partLabels[idx]+'</td>';
      DIMS.forEach(function(d,di){
        if(di>=BETA_VISIBLE_DIMS){
          t+='<td colspan="2" style="padding:4px 8px;text-align:center;background:#f5f5f0;'+rc+'"></td>';
          return;
        }
        var v=data[di][pi];
        var isStatic=false,isDynamic=false;
        if(v){var tp=v==='A'?d.aT:d.bT;isStatic=tp==='靜';isDynamic=tp==='動';}
        if(isStatic||isDynamic){
          var cellBg=isStatic?SBG:DBG;
          var cellLabel=isStatic?sChar[di]:dChar[di];
          var goLeft=(isStatic&&colLIsS[di])||(isDynamic&&!colLIsS[di]);
          if(goLeft){
            t+='<td style="padding:4px 8px;text-align:center;background:'+cellBg+';color:white;font-weight:700;'+rc+'">'+cellLabel+'</td>';
            t+='<td style="padding:4px 8px;text-align:center;background:'+dimAlpha[di]+';'+rc+'"></td>';
          }else{
            t+='<td style="padding:4px 8px;text-align:center;background:'+dimAlpha[di]+';'+rc+'"></td>';
            t+='<td style="padding:4px 8px;text-align:center;background:'+cellBg+';color:white;font-weight:700;'+rc+'">'+cellLabel+'</td>';
          }
        }else{
          t+='<td style="padding:4px 8px;text-align:center;'+rc+'"></td>';
          t+='<td style="padding:4px 8px;text-align:center;'+rc+'"></td>';
        }
      });
      t+='<td style="'+partCellR+'">'+partLabels[idx]+'</td>';
      t+='</tr>';
    });
    t+='</table>';
    ftEl.innerHTML=_lnTableHtml+t;
  }
}

/* ===== Close Report ===== */
export function closeReport(){document.getElementById('report-overlay').style.display='none';}

/* ===== Export PNG ===== */
export async function exportPNG(){
  var btn=document.getElementById('btn-export');
  btn.innerText='產生中...';btn.disabled=true;
  await new Promise(function(r){setTimeout(r,50);});
  try{
    var canvas=drawReportCanvas();
    var isMobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    var _expName=_currentCaseName||userName||'報告';
    var file=new File([await new Promise(function(r){canvas.toBlob(r,'image/png');})],
      '人相兵法_'+_expName+'.png',{type:'image/png'});
    if(isMobile&&navigator.canShare&&navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file],title:'人相兵法報告',text:_expName+' 的人相兵法報告'});}
      catch(e){if(e.name!=='AbortError')fallbackDownload(canvas);}
    }else{fallbackDownload(canvas);}
  }catch(e){console.error(e);alert('產生失敗，請截圖儲存');}
  btn.innerText='分享報告';btn.disabled=false;
}

export function fallbackDownload(canvas){
  var dataUrl=canvas.toDataURL('image/png');
  var link=document.createElement('a');
  link.download='人相兵法_'+(_currentCaseName||userName||'報告')+'.png';
  link.href=dataUrl;link.click();
}

/* ===== Draw Report Canvas ===== */
export function drawReportCanvas(){
  var SC=2;
  var SBG='#7A9E7E', DBG='#C17A5A';
  var dimColors=['#5E8080','#6E9292','#7EA4A4','#527070','#608282','#6E9494',
                 '#9E8A5A','#B29E6E','#C6B282','#7A5A50','#8E6C62','#A27E74','#B69088'];
  var dimAlphas=['rgba(94,128,128,0.35)','rgba(110,146,146,0.35)','rgba(126,164,164,0.35)',
                 'rgba(82,112,112,0.35)','rgba(96,130,130,0.35)','rgba(110,148,148,0.35)',
                 'rgba(158,138,90,0.35)','rgba(178,158,110,0.35)','rgba(198,178,130,0.35)',
                 'rgba(122,90,80,0.35)','rgba(142,108,98,0.35)','rgba(162,126,116,0.35)',
                 'rgba(182,144,136,0.35)'];
  var partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  // 動態取靜/動標籤（修復 bug）
  // 顯示用陣列（與 showReport 一致）
  var sChar=DIMS.map(function(d){return d.aT==='靜'?d.a:d.b;});
  var dChar=DIMS.map(function(d){return d.aT==='靜'?d.b:d.a;});
  var colL=DIMS.map(function(d){return d.da;});
  var colR=DIMS.map(function(d){return d.db;});
  var colLIsS=DIMS.map(function(d){var dt=(d.da===d.a)?d.aT:d.bT;return dt==='靜';});

  // 佈局參數
  var PAD=20, G=3;
  var PART_W=38, DIM_W=66, SUB_W=DIM_W/2;
  var ROW_H=28, HDR_H=32, SUB_H=22, COEFF_H=82, SUM_H=34, TITLE_H=40, SEP_H=4;
  var LN_HDR_H=24, LN_ROW_H=24;

  var contentW=PART_W + G + 13*(DIM_W+G) + PART_W;
  var totalW=PAD*2+contentW;

  // 流年資訊
  var lnInfo=_getLiunianInfo();
  var hasLn=!!lnInfo;

  // 垂直佈局
  var curY=PAD;
  var yTitle=curY; curY+=TITLE_H+G;
  var yLnHdr=0, yLnRow=0;
  if(hasLn){
    yLnHdr=curY; curY+=LN_HDR_H+G;
    yLnRow=curY; curY+=LN_ROW_H+G*2;
  }
  var ySum1=curY;  curY+=SUM_H+G;
  var ySum2=curY;  curY+=SUM_H+G;
  var ySum3=curY;  curY+=SUM_H+G*3;
  var yDimHdr=curY; curY+=HDR_H+G;
  var ySubHdr=curY; curY+=SUB_H+G;
  var yCoeff=curY;  curY+=COEFF_H+G;
  var yDataStart=curY;
  curY+=4*(ROW_H+G);
  var ySep=curY; curY+=SEP_H+G;
  curY+=5*(ROW_H+G);
  var totalH=curY+PAD;

  // 建立 Canvas
  var canvas=document.createElement('canvas');
  canvas.width=totalW*SC;
  canvas.height=totalH*SC;
  var ctx=canvas.getContext('2d');
  ctx.scale(SC,SC);
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,totalW,totalH);

  // 輔助函式
  function rRect(x,y,w,h,r,fill){
    ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}
  }
  function txtC(text,x,y,w,h,color,size,bold){
    ctx.fillStyle=color;
    ctx.font=(bold?'bold ':'')+size+'px "Noto Serif TC",serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(text,x+w/2,y+h/2);
  }
  function txtR(text,x,y,h,color,size,bold){
    ctx.fillStyle=color;
    ctx.font=(bold?'bold ':'')+size+'px "Noto Serif TC",serif';
    ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillText(text,x,y+h/2);
  }
  function txtL(text,x,y,h,color,size,bold){
    ctx.fillStyle=color;
    ctx.font=(bold?'bold ':'')+size+'px "Noto Serif TC",serif';
    ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText(text,x,y+h/2);
  }

  // 計算數據
  var vTotal=avgCoeff(data, [0,1,2,3,4,5,6,7,8,9,10,11,12]);
  var vPre=avgCoeff(data, [0,1,2,3,4,5]),vLuck=avgCoeff(data, [6,7,8]),vPost=avgCoeff(data, [9,10,11,12]);
  var vLead=avgCoeff(data, [0,1,2]),vSub=avgCoeff(data, [3,4,5]);

  function countSD(ids){
    var s=0,d=0;
    ids.forEach(function(di){
      data[di].forEach(function(v){
        if(!v)return;
        var tp=v==='A'?DIMS[di].aT:DIMS[di].bT;
        tp==='靜'?s++:d++;
      });
    });
    return{s:s,d:d};
  }
  var sdAll=countSD([0,1,2,3,4,5,6,7,8,9,10,11,12]);
  var sdPre=countSD([0,1,2,3,4,5]),sdLuck=countSD([6,7,8]),sdPost=countSD([9,10,11,12]);
  var sdLead=countSD([0,1,2]),sdSub=countSD([3,4,5]);

  var dimSC=[],dimDC=[];
  for(var di=0;di<13;di++){
    var sc=0,dc=0;
    data[di].forEach(function(v){
      if(!v)return;
      var tp=v==='A'?DIMS[di].aT:DIMS[di].bT;
      tp==='靜'?sc++:dc++;
    });
    dimSC.push(sc);dimDC.push(dc);
  }

  // ========== 繪製 ==========

  // --- 1. 標題列（含虛歲+關隘）---
  var displayName=_currentCaseName||userName||'未命名';
  txtL(displayName,PAD,yTitle,TITLE_H,'#3a3228',18,true);
  ctx.font='bold 18px "Noto Serif TC",serif';
  var nx=PAD+ctx.measureText(displayName).width;

  if(lnInfo){
    var ageText='虛歲 '+lnInfo.xusui;
    txtL(ageText,nx+10,yTitle,TITLE_H,'#3a3228',15,true);
    ctx.font='bold 15px "Noto Serif TC",serif';
    nx+=10+ctx.measureText(ageText).width;
    if(lnInfo.mark){
      nx+=6;
      rRect(nx,yTitle+(TITLE_H-18)/2,28,18,4,'#c03830');
      ctx.fillStyle='#ffffff';
      ctx.font='bold 12px "Noto Serif TC",serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(lnInfo.mark,nx+14,yTitle+TITLE_H/2);
      nx+=34;
    }
  }

  txtL('人相兵法係數報告',nx+36,yTitle,TITLE_H,'#888',14,false);

  // --- 2. 流年表格 ---
  if(hasLn){
    var ln=lnInfo.ln;
    var bgA='#d6cfc4',bgB='#c8cfd6';
    var lbgA='#ece8e0',lbgB='#e0e5ea';
    var tc='#3a3228',hc1='#4a453e',hc2='#3a4450';

    var lnCols=[
      {h:'七十五',v1:ln.name75||'',v2:ln.area75||'',span:2},
      {h:'九執',v1:ln.jiuzhi||''},
      {h:'業務',v1:ln.yewu||''},
      {h:'親族',v1:ln.qinzu||''},
      {h:'子女',v1:ln.zinv||''},
      {h:'耳鼻',v1:ln.erbei||''},
      {h:'五官',v1:ln.wuguan||''},
      {h:'三停',v1:ln.santing||''}
    ];

    var totalCols=10;
    var lnColW=Math.floor(contentW/totalCols);
    var lnX=PAD;

    // header 行
    var cx=lnX;
    for(var ci=0;ci<lnCols.length;ci++){
      var col=lnCols[ci];
      var cw=col.span?lnColW*col.span:lnColW;
      var bg=(ci%2===0)?bgA:bgB;
      var hc=(ci%2===0)?hc1:hc2;
      rRect(cx,yLnHdr,cw-2,LN_HDR_H,3,bg);
      txtC(col.h,cx,yLnHdr,cw-2,LN_HDR_H,hc,12,true);
      cx+=cw;
    }

    // 資料行
    cx=lnX;
    for(var ci=0;ci<lnCols.length;ci++){
      var col=lnCols[ci];
      var cw=col.span?lnColW*col.span:lnColW;
      var bg=(ci%2===0)?lbgA:lbgB;
      if(col.span){
        var hw=Math.floor(cw/2);
        rRect(cx,yLnRow,hw-1,LN_ROW_H,3,bg);
        txtC(col.v1,cx,yLnRow,hw-1,LN_ROW_H,tc,12,true);
        rRect(cx+hw,yLnRow,hw-1,LN_ROW_H,3,bg);
        txtC(col.v2||'',cx+hw,yLnRow,hw-1,LN_ROW_H,tc,12,false);
      }else{
        rRect(cx,yLnRow,cw-2,LN_ROW_H,3,bg);
        txtC(col.v1,cx,yLnRow,cw-2,LN_ROW_H,tc,12,false);
      }
      cx+=cw;
    }
  }

  // --- 3. 摘要區 ---
  var sumX=PAD+PART_W+G;
  var sumW=contentW-PART_W*2-G*2;

  function drawSumCell(x,y,w,h,bg,color,label,val,sd){
    rRect(x,y,w,h,4,bg);
    var mainText=label+'　'+val;
    txtC(mainText,x,y,w*0.75,h,color,14,true);
    var rx=x+w-8;
    txtR('靜'+sd.s,rx,y,h,SBG,11,true);
    ctx.font='bold 11px "Noto Serif TC",serif';
    var sW=ctx.measureText('靜'+sd.s).width;
    txtR('/',rx-sW,y,h,'#999',11,false);
    var slW=ctx.measureText('/').width;
    txtR('動'+sd.d,rx-sW-slW,y,h,DBG,11,true);
  }

  drawSumCell(sumX,ySum1,sumW,SUM_H,'#c8bfb0','#3a3228','總係數',vTotal,sdAll);

  var r26=sumW/26;
  var preW=Math.round(r26*12)-G, luckW=Math.round(r26*6)-G, postW=sumW-Math.round(r26*12)-Math.round(r26*6)-G;
  drawSumCell(sumX,ySum2,preW,SUM_H,'#bdd4d4','#2e4a4a','先天係數',vPre,sdPre);
  if(BETA_VISIBLE_DIMS>=9){
    drawSumCell(sumX+preW+G,ySum2,luckW,SUM_H,'#e8dcc8','#5a4a2a','運氣係數',vLuck,sdLuck);
  }else{
    rRect(sumX+preW+G,ySum2,luckW,SUM_H,4,'#f0f0ea');
    txtC('運氣係數　建置中',sumX+preW+G,ySum2,luckW,SUM_H,'#bbb',12,true);
  }
  if(BETA_VISIBLE_DIMS>=13){
    drawSumCell(sumX+preW+luckW+G*2,ySum2,postW,SUM_H,'#e0cdc6','#5a3a30','後天係數',vPost,sdPost);
  }else{
    rRect(sumX+preW+luckW+G*2,ySum2,postW,SUM_H,4,'#f0f0ea');
    txtC('後天係數　建置中',sumX+preW+luckW+G*2,ySum2,postW,SUM_H,'#bbb',12,true);
  }

  var halfW=Math.round(r26*6)-G;
  drawSumCell(sumX,ySum3,halfW,SUM_H,'#cce0e0','#2e4a4a','老闆係數',vLead,sdLead);
  drawSumCell(sumX+halfW+G,ySum3,halfW,SUM_H,'#d8eaea','#2e4a4a','主管係數',vSub,sdSub);

  // --- 4. 維度 header 行 ---
  for(var i=0;i<13;i++){
    var dx=PAD+PART_W+G+i*(DIM_W+G);
    if(i>=BETA_VISIBLE_DIMS){
      rRect(dx,yDimHdr,DIM_W,HDR_H,4,'#e0e0da');
      txtC(DIMS[i].dn,dx,yDimHdr,DIM_W,HDR_H,'#bbb',13,true);
    }else{
      rRect(dx,yDimHdr,DIM_W,HDR_H,4,dimColors[i]);
      txtC(DIMS[i].dn,dx,yDimHdr,DIM_W,HDR_H,'#ffffff',13,true);
    }
  }

  // --- 5. 子欄行 ---
  for(var i=0;i<13;i++){
    var dx=PAD+PART_W+G+i*(DIM_W+G);
    if(i>=BETA_VISIBLE_DIMS){
      // 空白
    }else{
      var lBg=colLIsS[i]?SBG:DBG;
      var rBg=colLIsS[i]?DBG:SBG;
      var lCnt=colLIsS[i]?dimSC[i]:dimDC[i];
      var rCnt=colLIsS[i]?dimDC[i]:dimSC[i];
      txtC(colL[i]+lCnt,dx,ySubHdr,SUB_W,SUB_H,'#7a6a50',11,true);
      ctx.fillStyle=lBg;
      ctx.fillRect(dx,ySubHdr+SUB_H-3,SUB_W,2.5);
      txtC(colR[i]+rCnt,dx+SUB_W,ySubHdr,SUB_W,SUB_H,'#7a6a50',11,true);
      ctx.fillStyle=rBg;
      ctx.fillRect(dx+SUB_W,ySubHdr+SUB_H-3,SUB_W,2.5);
    }
  }

  // --- 6. 係數格+堆疊橫條 ---
  for(var i=0;i<13;i++){
    var dx=PAD+PART_W+G+i*(DIM_W+G);
    if(i>=BETA_VISIBLE_DIMS){
      rRect(dx,yCoeff,DIM_W,22,4,'#e0e0da');
      txtC('—',dx,yCoeff,DIM_W,22,'#bbb',13,true);
    }else{
      var res=calcDim(data, i);
      var coeff=res?res.coeff.toFixed(2):'—';
      var coeffBg=res?(res.type==='靜'?SBG:DBG):'#ddd';
      var cbH=22;
      rRect(dx,yCoeff,DIM_W,cbH,4,coeffBg);
      txtC(coeff,dx,yCoeff,DIM_W,cbH,'#ffffff',13,true);
      var barTop=yCoeff+cbH+4;
      var barH=COEFF_H-cbH-6;
      var sc2=dimSC[i],dc2=dimDC[i];
      var barUnitH=Math.min(3,(barH-2)/(Math.max(sc2,dc2,1)));
      var barLX=dx+4, barW=(DIM_W-12)/2;
      for(var b=0;b<sc2;b++){
        var by=barTop+barH-2-(b+1)*(barUnitH+1);
        rRect(barLX,by,barW,barUnitH,1,SBG);
      }
      var barRX=dx+DIM_W/2+2;
      for(var b=0;b<dc2;b++){
        var by=barTop+barH-2-(b+1)*(barUnitH+1);
        rRect(barRX,by,barW,barUnitH,1,DBG);
      }
    }
  }

  // --- 7. 部位資料行 ---
  function drawPartRow(partIdx,rowIdx,yy){
    var label=partLabels[rowIdx];
    rRect(PAD,yy,PART_W,ROW_H,4,'#e8e3da');
    txtC(label,PAD,yy,PART_W,ROW_H,'#3a3228',12,true);
    var rx=PAD+PART_W+G+13*(DIM_W+G);
    rRect(rx,yy,PART_W,ROW_H,4,'#e8e3da');
    txtC(label,rx,yy,PART_W,ROW_H,'#3a3228',12,true);
    for(var di=0;di<13;di++){
      var dx=PAD+PART_W+G+di*(DIM_W+G);
      if(di>=BETA_VISIBLE_DIMS){
        rRect(dx,yy,DIM_W,ROW_H,4,'#f5f5f0');
        continue;
      }
      var v=data[di][partIdx];
      var isStatic=false,isDynamic=false;
      if(v){
        var tp=v==='A'?DIMS[di].aT:DIMS[di].bT;
        isStatic=tp==='靜';isDynamic=tp==='動';
      }
      if(isStatic||isDynamic){
        var cellBg=isStatic?SBG:DBG;
        var cellLabel=isStatic?sChar[di]:dChar[di];
        var goLeft=(isStatic&&colLIsS[di])||(isDynamic&&!colLIsS[di]);
        if(goLeft){
          rRect(dx,yy,SUB_W,ROW_H,4,cellBg);
          txtC(cellLabel,dx,yy,SUB_W,ROW_H,'#ffffff',12,true);
          rRect(dx+SUB_W,yy,SUB_W,ROW_H,4,dimAlphas[di]);
        }else{
          rRect(dx,yy,SUB_W,ROW_H,4,dimAlphas[di]);
          rRect(dx+SUB_W,yy,SUB_W,ROW_H,4,cellBg);
          txtC(cellLabel,dx+SUB_W,yy,SUB_W,ROW_H,'#ffffff',12,true);
        }
      }
    }
  }

  for(var r=0;r<4;r++){
    drawPartRow(r,r,yDataStart+r*(ROW_H+G));
  }
  ctx.fillStyle='#b8b0a0';
  ctx.fillRect(PAD,ySep,contentW,2);
  var yAfterSep=ySep+SEP_H+G;
  for(var r=0;r<5;r++){
    drawPartRow(r+4,r+4,yAfterSep+r*(ROW_H+G));
  }

  return canvas;
}
