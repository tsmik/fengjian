/* report.js – Report module (extracted from index_desktop.html) */

import { DIMS, PARTS, data, obsData, obsOverride, condResults, userName, _isTA, _currentCaseId, _currentCaseName,
         _userGender, _userBirthday, _caseGender, _caseBirthday, _caseDate, _liunianTable, BETA_VISIBLE_DIMS,
         setNavActive, showPage, _getUserDocRef, calcDim, avgCoeff, currentUser } from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { collectDetailForPrompt } from './obs_ui.js';

/* ===== Report Save ===== */
export function reportSave(){
  const btn=document.getElementById('report-save-btn');if(!currentUser)return;
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
    h+=' <span style="font-size:12px;color:#fff;background:#8E4B50;padding:2px 8px;border-radius:3px;font-weight:700;margin-left:6px">'+info.mark+'</span>';
  }
  return h;
}

export function buildLiunianTableHtml(info){
  if(!info)return '';
  var ln=info.ln;
  // 兩色交替：部位色 和 淺部位色
  var bgA='#E8E4DF', bgB='#F0EDE8';
  var fc='#4A4540';

  var items=[
    {label:'七十五', value:(ln.name75||'')+(ln.area75?'|'+ln.area75:'')},
    {label:'九執', value:ln.jiuzhi||''},
    {label:'業務', value:ln.yewu||''},
    {label:'親族', value:ln.qinzu||''},
    {label:'子女', value:ln.zinv||''},
    {label:'耳鼻', value:ln.erbei||''},
    {label:'五官', value:ln.wuguan||''},
    {label:'三停', value:ln.santing||''}
  ];

  var t='<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:12px">';
  items.forEach(function(item, i){
    var bg=(i%2===0)?bgA:bgB;
    t+='<div style="background:'+bg+';padding:5px 10px;border-radius:3px;font-size:13px;color:'+fc+'">'+
       item.label+'\u3000'+item.value+'</div>';
  });
  t+='</div>';
  return t;
}

/* ===== Show Report ===== */
export function showReport(){
  showPage('report-overlay');
  document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-report');
  if(!window._suppressPushState) history.pushState({page:'report'},'');
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

  // 完整表格（和風配色新版）
  const ftEl=document.getElementById('report-full-table');
  if(ftEl){
    const partOrder=[0,1,2,3,4,5,6,7,8];
    const partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
    const SBG='#7A9E7E',DBG='#C17A5A';
    var sChar=DIMS.map(function(d){return d.aT==='靜'?d.a:d.b;});
    var dChar=DIMS.map(function(d){return d.aT==='靜'?d.b:d.a;});
    var colL=DIMS.map(function(d){return d.da;});
    var colR=DIMS.map(function(d){return d.db;});
    var colLIsS=DIMS.map(function(d){var dt=(d.da===d.a)?d.aT:d.bT;return dt==='靜';});

    // === 和風色彩系統 ===
    // 13 維度淺色（和紙色）
    var dimBg=['#D6E4CC','#C8DCD8','#E2DDD5','#F0DECA','#E8D2D8','#EDE4C8',
               '#CEDDE8','#DDD4E4','#D2DDD6','#D4E2CF','#DED5DF','#CADDD8','#CDDAE6'];
    // 13 維度深色（勾選方塊用）
    var dimDeep=['#6B8C5A','#4A7A6E','#8A8078','#A07850','#9A6878','#9A8A50',
                 '#4A7A9A','#7A6890','#5A8A6A','#5A8A5A','#7A6088','#4A8078','#4A6E8A'];
    // 13 維度文字色（同色系深字）
    var dimText=['#4A6B3A','#3A5E54','#6A6458','#7A5A38','#7A4858','#7A6A38',
                 '#3A5A7A','#5A4870','#3A6A4A','#3A6B3A','#5A4068','#3A6058','#3A5870'];
    // 結構色
    var C_PRE='#8E4B50',C_LUCK='#4C6E78',C_POST='#7B7082';
    var C_BOSS='#6E3A3E',C_MGR='#8C6B4A',C_LUCK_C='#3A5860',C_POST_C='#605768';
    var C_PRE_C='#5A2E32',C_TOTAL_SD='#3C3C40',C_TOTAL='#2C2C30';
    var C_PART_BG='#E8E4DF',C_PART_FC='#4A4540';
    var C_AN_BG='#E8E4DF',C_AN_FC='#4A4540';

    // 維度中文描述
    var dimDesc=['格局','核心價值','成就','責任','能耐','成敗',
                 '天運天機','地運資源','人運人和','戰略','戰術','算略KPI','智略'];

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

    // 13 維度的係數
    var dimCoeffs=[];
    for(var dc2=0;dc2<13;dc2++){
      dimCoeffs.push(calcDim(data,dc2));
    }

    // 13 維度的屬性（動 or 靜）
    var dimAttr=[];
    for(var da2=0;da2<13;da2++){
      var r=dimCoeffs[da2];
      dimAttr.push(r?r.type:null);
    }

    // 勾選方塊 HTML
    function checkMark(di){
      return '<span style="display:inline-block;width:18px;height:18px;background:'+dimDeep[di]+';border-radius:3px;line-height:18px;text-align:center;color:#fff;font-size:12px;font-weight:700">\u2713</span>';
    }

    // === 表格結構定義 ===
    // 三個區塊的維度索引
    var preIdx=[0,1,2,3,4,5]; // 先天：形勢經緯方圓曲直收放緩急
    var luckIdx=[6,7,8]; // 運氣：順逆分合真假
    var postIdx=[9,10,11,12]; // 後天：攻守奇正虛實進退

    var _lnTableHtml=buildLiunianTableHtml(_lnInfo);

    // === 開始生成表格 ===
    var rc='border-radius:3px';
    var t='<table style="border-collapse:separate;border-spacing:2px;white-space:nowrap;font-size:11px;font-family:sans-serif">';

    // --- R2: 先天指數 | 運氣指數 | 後天指數 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>'; // C1 空
    t+='<td colspan="15" style="background:'+C_PRE+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">先天指數</td>';
    t+='<td style="padding:2px 4px"></td>'; // C18 間隔
    t+='<td colspan="9" style="background:'+C_LUCK+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">運氣指數</td>';
    t+='<td style="padding:2px 4px"></td>'; // C28 間隔
    t+='<td colspan="11" style="background:'+C_POST+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">後天指數</td>';
    t+='<td colspan="4" style="padding:2px 4px"></td>'; // 總動靜分析區
    t+='</tr>';

    // --- R3: 維度名（形勢經緯...）+ 動靜分析 + 總動靜分析 ---
    // 先天 6 維度（各佔 2 欄）
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>'; // C1
    for(var i=0;i<6;i++){
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+dimText[i]+';font-weight:700">'+DIMS[i].da+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+dimText[i]+';font-weight:700">'+DIMS[i].db+'</td>';
    }
    // C15-C17: 動靜分析（rowspan=2）
    t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
    t+='<td style="padding:2px 4px"></td>'; // C18
    // 運氣 3 維度
    for(var i=6;i<9;i++){
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+dimText[i]+';font-weight:700">'+DIMS[i].da+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+dimText[i]+';font-weight:700">'+DIMS[i].db+'</td>';
    }
    // C25-C27: 動靜分析（rowspan=2）
    t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
    t+='<td style="padding:2px 4px"></td>'; // C28
    // 後天 4 維度
    for(var i=9;i<13;i++){
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+dimText[i]+';font-weight:700">'+DIMS[i].da+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+dimText[i]+';font-weight:700">'+DIMS[i].db+'</td>';
    }
    // C37-C39: 動靜分析（rowspan=2）
    t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
    // C40-C42: 總動靜分析（rowspan=2）
    t+='<td rowspan="2" colspan="3" style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-size:13px;font-weight:700">總動靜分析</td>';
    t+='<td style="padding:2px 4px"></td>'; // C43
    t+='</tr>';

    // --- R4: 維度描述（格局/核心價值...）---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=0;i<6;i++){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
    }
    // C15-C17 被 rowspan 佔
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<9;i++){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
    }
    // C25-C27 被 rowspan 佔
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<13;i++){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
    }
    // C37-C42 被 rowspan 佔
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R5: 靜/動 標頭行（不合併，每格獨立）---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    function r5Cell(di,isLeft){
      var dimChar=isLeft?colL[di]:colR[di];
      var isS;
      if(isLeft){isS=colLIsS[di];}else{isS=!colLIsS[di];}
      var fc=isS?'#000':'#980000';
      return '<td style="background:'+dimBg[di]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc+';font-weight:700">'+dimChar+'</td>';
    }
    // 先天
    for(var i=0;i<6;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
    // 先天動靜分析 3 格（動/靜/比例）- 不合併
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000;font-weight:700">動</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000;font-weight:700">靜</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
    t+='<td style="padding:2px 4px"></td>';
    // 運氣
    for(var i=6;i<9;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000;font-weight:700">動</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000;font-weight:700">靜</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
    t+='<td style="padding:2px 4px"></td>';
    // 後天
    for(var i=9;i<13;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000;font-weight:700">動</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000;font-weight:700">靜</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
    // 總動靜分析 3 格
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-weight:700">動</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-weight:700">靜</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">比例</td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R6~R14: 部位資料行（頭/上停/中停/下停/耳/眉/眼/鼻/口）---
    function renderPartRow(pi, idx){
      var label=partLabels[idx];
      t+='<tr>';
      // 左部位欄
      t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';

      // 先天 6 維度
      for(var i=0;i<6;i++){
        var v=data[i][pi];
        if(v){
          var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
          var isS=tp==='靜';
          var goLeft=(isS&&colLIsS[i])||(!isS&&!colLIsS[i]);
          if(goLeft){
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center">'+checkMark(i)+'</td>';
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          }else{
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center">'+checkMark(i)+'</td>';
          }
        }else{
          t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
        }
      }
      // 先天動靜分析（動數/靜數/比例）
      var preS=0,preD=0;
      for(var i=0;i<6;i++){var v=data[i][pi];if(v){var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;tp==='靜'?preS++:preD++;}}
      var preTotal=preS+preD;
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preD+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preS+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+(preTotal?(Math.min(preD,preS)/Math.max(preD,preS)||0).toFixed(1):'')+'</td>';

      // 中部位欄
      t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';

      // 運氣 3 維度
      for(var i=6;i<9;i++){
        var v=data[i][pi];
        if(v){
          var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
          var isS=tp==='靜';
          var goLeft=(isS&&colLIsS[i])||(!isS&&!colLIsS[i]);
          if(goLeft){
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center">'+checkMark(i)+'</td>';
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          }else{
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center">'+checkMark(i)+'</td>';
          }
        }else{
          t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
        }
      }
      // 運氣動靜分析
      var luckS=0,luckD=0;
      for(var i=6;i<9;i++){var v=data[i][pi];if(v){var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;tp==='靜'?luckS++:luckD++;}}
      var luckTotal=luckS+luckD;
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckD+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckS+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+(luckTotal?(Math.min(luckD,luckS)/Math.max(luckD,luckS)||0).toFixed(1):'')+'</td>';

      // 右部位欄
      t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';

      // 後天 4 維度
      for(var i=9;i<13;i++){
        var v=data[i][pi];
        if(v){
          var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
          var isS=tp==='靜';
          var goLeft=(isS&&colLIsS[i])||(!isS&&!colLIsS[i]);
          if(goLeft){
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center">'+checkMark(i)+'</td>';
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          }else{
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center">'+checkMark(i)+'</td>';
          }
        }else{
          t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
        }
      }
      // 後天動靜分析
      var postS=0,postD=0;
      for(var i=9;i<13;i++){var v=data[i][pi];if(v){var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;tp==='靜'?postS++:postD++;}}
      var postTotal=postS+postD;
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postD+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postS+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+(postTotal?(Math.min(postD,postS)/Math.max(postD,postS)||0).toFixed(1):'')+'</td>';

      // 總動靜分析
      var allS=preS+luckS+postS, allD=preD+luckD+postD;
      var allTotal=allS+allD;
      t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+allD+'</td>';
      t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+allS+'</td>';
      t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+(allTotal?(Math.min(allD,allS)/Math.max(allD,allS)||0).toFixed(1):'')+'</td>';

      // 最右部位欄
      t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';
      t+='</tr>';
    }

    partOrder.forEach(function(pi,idx){
      if(idx===4){
        t+='<tr><td colspan="43" style="height:2px;background:#b8b0a0;padding:0"></td></tr>';
      }
      renderPartRow(pi,idx);
    });

    // --- R15: 統計行 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    // 先天各維度統計
    for(var i=0;i<6;i++){
      var sn=dimSCounts[i],dn=dimDCounts[i];
      // 左邊放靜還是動取決於 colLIsS
      var lv=colLIsS[i]?sn:dn;
      var rv=colLIsS[i]?dn:sn;
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
    }
    // 先天動靜合計
    var preST=sdPre.s,preDT=sdPre.d,preTT=preST+preDT;
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preDT+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preST+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+(preTT?(Math.min(preDT,preST)/Math.max(preDT,preST)).toFixed(1):'')+'</td>';
    t+='<td style="padding:2px 4px"></td>';
    // 運氣
    for(var i=6;i<9;i++){
      var sn=dimSCounts[i],dn=dimDCounts[i];
      var lv=colLIsS[i]?sn:dn;
      var rv=colLIsS[i]?dn:sn;
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
    }
    var luckST=sdLuck.s,luckDT=sdLuck.d,luckTT=luckST+luckDT;
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckDT+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckST+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+(luckTT?(Math.min(luckDT,luckST)/Math.max(luckDT,luckST)).toFixed(1):'')+'</td>';
    t+='<td style="padding:2px 4px"></td>';
    // 後天
    for(var i=9;i<13;i++){
      var sn=dimSCounts[i],dn=dimDCounts[i];
      var lv=colLIsS[i]?sn:dn;
      var rv=colLIsS[i]?dn:sn;
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
    }
    var postST=sdPost.s,postDT=sdPost.d,postTT=postST+postDT;
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postDT+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postST+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+(postTT?(Math.min(postDT,postST)/Math.max(postDT,postST)).toFixed(1):'')+'</td>';
    // 總
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+sdAll.d+'</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+sdAll.s+'</td>';
    var allTT=sdAll.s+sdAll.d;
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+(allTT?(Math.min(sdAll.d,sdAll.s)/Math.max(sdAll.d,sdAll.s)).toFixed(1):'')+'</td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R16: 屬性行（動/靜 標記）---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=0;i<6;i++){
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+';font-weight:700">'+alabel+'</td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<9;i++){
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+';font-weight:700">'+alabel+'</td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<13;i++){
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+';font-weight:700">'+alabel+'</td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R17: 係數行 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=0;i<6;i++){
      var rcf=dimCoeffs[i];
      var cv=rcf?rcf.coeff.toFixed(2):'';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px;font-weight:700">'+cv+'</td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<9;i++){
      var rcf=dimCoeffs[i];
      var cv=rcf?rcf.coeff.toFixed(2):'';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px;font-weight:700">'+cv+'</td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<13;i++){
      var rcf=dimCoeffs[i];
      var cv=rcf?rcf.coeff.toFixed(2):'';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px;font-weight:700">'+cv+'</td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R18: 架構指數行（老闆/主管/運氣/後天係數）---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>'; // 空
    t+='<td colspan="6" style="background:'+C_BOSS+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">老闆係數</td>';
    t+='<td colspan="6" style="background:'+C_MGR+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">主管係數</td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="6" style="background:'+C_LUCK_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">運氣係數</td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="8" style="background:'+C_POST_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">後天係數</td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R19: 先天係數 | 運氣係數 | 後天係數 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="12" style="background:'+C_PRE_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">先天係數</td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="6" style="background:'+C_LUCK_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700"></td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="8" style="background:'+C_POST_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700"></td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R20: 總係數 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="34" style="background:'+C_TOTAL+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:700">總係數</td>';
    t+='<td colspan="7" style="padding:2px 4px"></td>';
    t+='</tr>';

    t+='</table>';
    ftEl.innerHTML=_lnTableHtml+t;
  }

  // 顯示 AI 評析區域（只在 BETA 全開時顯示）
  var aiSection=document.getElementById('ai-section');
  if(aiSection){
    aiSection.style.display='none'; // AI評析暫時隱藏，等 prompt 到位再開放
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
