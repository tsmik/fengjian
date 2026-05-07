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
  var h=' <span style="font-size:15px;font-weight:400;margin-left:8px">虛歲 '+info.xusui+'</span>';
  if(info.mark){
    h+=' <span style="font-size:12px;color:#fff;background:#8E4B50;padding:2px 8px;border-radius:3px;font-weight:400;margin-left:6px">'+info.mark+'</span>';
  }
  return h;
}

export function buildLiunianTableHtml(info){
  if(!info)return '';
  var ln=info.ln;
  var bgA='#E8E4DF', bgB='#F0EDE8';
  var fc='#4A4540';

  var items=[
    {label:'七十五', value:(ln.name75||'')+(ln.area75?'／'+ln.area75:'')},
    {label:'九執', value:ln.jiuzhi||''},
    {label:'業務', value:ln.yewu||''},
    {label:'親族', value:ln.qinzu||''},
    {label:'子女', value:ln.zinv||''},
    {label:'耳鼻', value:ln.erbei||''},
    {label:'五官', value:ln.wuguan||''},
    {label:'三停', value:ln.santing||''}
  ];

  var h='<div style="display:flex;gap:3px;flex-wrap:wrap">';
  items.forEach(function(item, i){
    var bg=(i%2===0)?bgA:bgB;
    h+='<div style="background:'+bg+';padding:5px 10px;border-radius:3px;font-size:13px;color:'+fc+';font-family:sans-serif">'+
       item.label+' | '+item.value+'</div>';
  });
  h+='</div>';
  return h;
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

  // === 可見維度計算 ===
  var visiblePre = Math.min(6, BETA_VISIBLE_DIMS);
  var visibleLuck = Math.max(0, Math.min(3, BETA_VISIBLE_DIMS - 6));
  var visiblePost = Math.max(0, Math.min(4, BETA_VISIBLE_DIMS - 9));
  var showLuck = visibleLuck > 0;
  var showPost = visiblePost > 0;
  var totalCols = 1 + visiblePre*2 + 3 + (showLuck ? 1 + visibleLuck*2 + 3 : 0) + (showPost ? 1 + visiblePost*2 + 3 : 0) + 3 + 1;
  var visibleDimIds = [];
  for(var vi=0;vi<BETA_VISIBLE_DIMS;vi++) visibleDimIds.push(vi);

  // 統計數據
  const vTotal=(BETA_VISIBLE_DIMS>=13)?avgCoeff(data,visibleDimIds):null;
  const vPre=(visiblePre>=6)?avgCoeff(data,[0,1,2,3,4,5]):null;
  const vLuck=(visibleLuck>=3)?avgCoeff(data,[6,7,8]):null;
  const vPost=(visiblePost>=4)?avgCoeff(data,[9,10,11,12]):null;
  const vLead=(visiblePre>=3)?avgCoeff(data,[0,1,2]):null;
  const vSub=(visiblePre>=6)?avgCoeff(data,[3,4,5]):null;
  let sT=0,dT=0;
  for(var si=0;si<BETA_VISIBLE_DIMS;si++){data[si].forEach(function(v){if(!v)return;var tp=v==='A'?DIMS[si].aT:DIMS[si].bT;tp==='靜'?sT++:dT++;});}
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
    var dimBg=['#D6E4CC','#C8DCD8','#E2DDD5','#F0DECA','#E8D2D8','#EDE4C8',
               '#CEDDE8','#DDD4E4','#D2DDD6','#D4E2CF','#DED5DF','#CADDD8','#CDDAE6'];
    var dimDeep=['#6B8C5A','#4A7A6E','#8A8078','#A07850','#9A6878','#9A8A50',
                 '#4A7A9A','#7A6890','#5A8A6A','#5A8A5A','#7A6088','#4A8078','#4A6E8A'];
    var dimText=['#4A6B3A','#3A5E54','#6A6458','#7A5A38','#7A4858','#7A6A38',
                 '#3A5A7A','#5A4870','#3A6A4A','#3A6B3A','#5A4068','#3A6058','#3A5870'];
    var C_PRE='#8E4B50',C_LUCK='#4C6E78',C_POST='#7B7082';
    var C_BOSS='#8E4B50',C_MGR='#8C6B4A',C_LUCK_C='#4C6E78',C_POST_C='#7B7082';
    var C_PRE_C='#8E4B50',C_TOTAL_SD='#3C3C40',C_TOTAL='#4A4540';
    var C_PART_BG='#E8E4DF',C_PART_FC='#4A4540';
    var C_AN_BG='#E8E4DF',C_AN_FC='#4A4540';

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
    var visiblePreIds=[];for(var vpi=0;vpi<visiblePre;vpi++) visiblePreIds.push(vpi);
    var visibleLuckIds=[];for(var vli=6;vli<6+visibleLuck;vli++) visibleLuckIds.push(vli);
    var visiblePostIds=[];for(var vpoi=9;vpoi<9+visiblePost;vpoi++) visiblePostIds.push(vpoi);
    var sdAll=countSD(visibleDimIds);
    var sdPre=countSD(visiblePreIds);
    var sdLuck=countSD(visibleLuckIds);
    var sdPost=countSD(visiblePostIds);

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

    // 未填完判斷（沿用 drawReportCanvas checkComplete 邏輯）：data[di][pi] 內若有 null cell 該維度算未填完
    var dimComplete=[];
    for(var dcc=0;dcc<13;dcc++){
      var ok=true;
      for(var pcc=0;pcc<9;pcc++){
        if(data[dcc][pcc]===null||data[dcc][pcc]===undefined){ok=false;break;}
      }
      dimComplete.push(ok);
    }
    function isGroupOk(ids){return ids.every(function(i){return dimComplete[i];});}
    var INC='未填完';

    // 13 維度的屬性（動 or 靜）
    var dimAttr=[];
    for(var da2=0;da2<13;da2++){
      var r=dimCoeffs[da2];
      dimAttr.push(r?r.type:null);
    }

    // 勾選方塊 HTML
    function checkMark(di){
      return '<span style="display:inline-block;width:18px;height:18px;background:'+dimDeep[di]+';border-radius:3px;line-height:18px;text-align:center;color:#fff;font-size:12px;font-weight:400">\u2713</span>';
    }

    var _lnTableHtml=buildLiunianTableHtml(_lnInfo);

    // === 開始生成表格 ===
    var rc='border-radius:3px';
    var t='<table style="border-collapse:separate;border-spacing:2px;white-space:nowrap;font-size:11px;font-family:sans-serif;width:100%">';

    // --- R1: 流年（如果有的話）---
    if(_lnTableHtml){
      t+='<tr><td colspan="'+totalCols+'" style="padding:0 0 8px 0">'+_lnTableHtml+'</td></tr>';
    }

    // --- R2: 先天指數 | 運氣指數 | 後天指數 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="'+(visiblePre*2+3)+'" style="background:'+C_PRE+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:400">先天指數</td>';
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      t+='<td colspan="'+(visibleLuck*2+3)+'" style="background:'+C_LUCK+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:400">運氣指數</td>';
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      t+='<td colspan="'+(visiblePost*2+3)+'" style="background:'+C_POST+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px;font-weight:400">後天指數</td>';
    }
    t+='<td colspan="4" style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R3: 維度名（形勢經緯...）+ 動靜分析 + 總動靜分析 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=0;i<visiblePre;i++){
      t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-weight:400">'+DIMS[i].da+'</td>';
      t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-weight:400">'+DIMS[i].db+'</td>';
    }
    t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=6;i<6+visibleLuck;i++){
        t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-weight:400">'+DIMS[i].da+'</td>';
        t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-weight:400">'+DIMS[i].db+'</td>';
      }
      t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=9;i<9+visiblePost;i++){
        t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-weight:400">'+DIMS[i].da+'</td>';
        t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-weight:400">'+DIMS[i].db+'</td>';
      }
      t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
    }
    t+='<td rowspan="2" colspan="3" style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff;font-size:13px;font-weight:400">總動靜分析</td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R4: 維度描述（格局/核心價值...）---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=0;i<visiblePre;i++){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
    }
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=6;i<6+visibleLuck;i++){
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
      }
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=9;i<9+visiblePost;i++){
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
      }
    }
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R5: 靜/動 標頭行（不合併，每格獨立）---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    function r5Cell(di,isLeft){
      var isS;
      if(isLeft){isS=colLIsS[di];}else{isS=!colLIsS[di];}
      var label=isS?'靜':'動';
      var fc=isS?'#000':'#980000';
      return '<td style="background:'+dimBg[di]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc+'">'+label+'</td>';
    }
    for(var i=0;i<visiblePre;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=6;i<6+visibleLuck;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=9;i<9+visiblePost;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
    }
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">動</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">靜</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">比例</td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // 動靜比例（方法 B：min/max）
    function ratioB(d,s){
      var total=d+s;
      if(!total)return '';
      var mx=Math.max(d,s);
      if(!mx)return '0.0';
      return (Math.min(d,s)/mx).toFixed(1);
    }

    // --- R6~R14: 部位資料行（頭/上停/中停/下停/耳/眉/眼/鼻/口）---
    function renderPartRow(pi, idx){
      var label=partLabels[idx];
      t+='<tr>';
      // 左部位欄
      t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';

      // 先天 visiblePre 維度
      var preS=0,preD=0;
      for(var i=0;i<visiblePre;i++){
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
          if(isS)preS++;else preD++;
        }else{
          t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
        }
      }
      // 先天動靜分析
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preD+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preS+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(preD,preS)+'</td>';

      var luckS=0,luckD=0;
      if(showLuck){
        // 中部位欄
        t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';
        for(var i=6;i<6+visibleLuck;i++){
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
            if(isS)luckS++;else luckD++;
          }else{
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          }
        }
        // 運氣動靜分析
        t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckD+'</td>';
        t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckS+'</td>';
        t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(luckD,luckS)+'</td>';
      }

      var postS=0,postD=0;
      if(showPost){
        // 右部位欄
        t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';
        for(var i=9;i<9+visiblePost;i++){
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
            if(isS)postS++;else postD++;
          }else{
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
            t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+'"></td>';
          }
        }
        // 後天動靜分析
        t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postD+'</td>';
        t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postS+'</td>';
        t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(postD,postS)+'</td>';
      }

      // 總動靜分析
      var allS=preS+luckS+postS, allD=preD+luckD+postD;
      t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+allD+'</td>';
      t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+allS+'</td>';
      t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+ratioB(allD,allS)+'</td>';

      // 最右部位欄
      t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';
      t+='</tr>';
    }

    partOrder.forEach(function(pi,idx){
      if(idx===4){
        t+='<tr><td colspan="'+totalCols+'" style="height:2px;background:#b8b0a0;padding:0"></td></tr>';
      }
      renderPartRow(pi,idx);
    });

    // --- R15: 統計行 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=0;i<visiblePre;i++){
      var sn=dimSCounts[i],dn=dimDCounts[i];
      var lv=colLIsS[i]?sn:dn;
      var rv=colLIsS[i]?dn:sn;
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
    }
    var preST=sdPre.s,preDT=sdPre.d;
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preDT+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preST+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(preDT,preST)+'</td>';
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=6;i<6+visibleLuck;i++){
        var sn=dimSCounts[i],dn=dimDCounts[i];
        var lv=colLIsS[i]?sn:dn;
        var rv=colLIsS[i]?dn:sn;
        t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
        t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
      }
      var luckST=sdLuck.s,luckDT=sdLuck.d;
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckDT+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckST+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(luckDT,luckST)+'</td>';
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=9;i<9+visiblePost;i++){
        var sn=dimSCounts[i],dn=dimDCounts[i];
        var lv=colLIsS[i]?sn:dn;
        var rv=colLIsS[i]?dn:sn;
        t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
        t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
      }
      var postST=sdPost.s,postDT=sdPost.d;
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postDT+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postST+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(postDT,postST)+'</td>';
    }
    // 總
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+sdAll.d+'</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+sdAll.s+'</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+ratioB(sdAll.d,sdAll.s)+'</td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R16: 屬性行（動/靜 標記）---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=0;i<visiblePre;i++){
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+';font-weight:400">'+alabel+'</td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=6;i<6+visibleLuck;i++){
        var attr=dimAttr[i];
        var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
        var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+';font-weight:400">'+alabel+'</td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=9;i<9+visiblePost;i++){
        var attr=dimAttr[i];
        var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
        var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+';font-weight:400">'+alabel+'</td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R17: 係數行 ---
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    for(var i=0;i<visiblePre;i++){
      var rcf=dimCoeffs[i];
      var cv=dimComplete[i]?(rcf?rcf.coeff.toFixed(2):''):INC;
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px;font-weight:400">'+cv+'</td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=6;i<6+visibleLuck;i++){
        var rcf=dimCoeffs[i];
        var cv=dimComplete[i]?(rcf?rcf.coeff.toFixed(2):''):INC;
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px;font-weight:400">'+cv+'</td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      for(var i=9;i<9+visiblePost;i++){
        var rcf=dimCoeffs[i];
        var cv=dimComplete[i]?(rcf?rcf.coeff.toFixed(2):''):INC;
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px;font-weight:400">'+cv+'</td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td style="padding:2px 4px"></td>';
    t+='</tr>';

    // --- R18: 老闆係數 + 主管係數（先天區內）---
    if(visiblePre>=3){
      t+='<tr>';
      t+='<td style="padding:2px 4px"></td>';
      t+='<td colspan="6" style="background:'+C_BOSS+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">老闆係數 '+(isGroupOk([0,1,2])?vLead:INC)+'</td>';
      if(visiblePre>=6){
        t+='<td colspan="6" style="background:'+C_MGR+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">主管係數 '+(isGroupOk([3,4,5])?vSub:INC)+'</td>';
      }else if(visiblePre*2-6>0){
        t+='<td colspan="'+(visiblePre*2-6)+'" style="padding:2px 4px"></td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
      if(showLuck){
        t+='<td style="padding:2px 4px"></td>';
        t+='<td colspan="'+visibleLuck*2+'" style="padding:2px 4px"></td>';
        t+='<td colspan="3" style="padding:2px 4px"></td>';
      }
      if(showPost){
        t+='<td style="padding:2px 4px"></td>';
        t+='<td colspan="'+visiblePost*2+'" style="padding:2px 4px"></td>';
        t+='<td colspan="3" style="padding:2px 4px"></td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
      t+='<td style="padding:2px 4px"></td>';
      t+='</tr>';
    }

    // --- R19: 先天係數 | 運氣係數 | 後天係數 ---
    if(visiblePre>=6||visibleLuck>=3||visiblePost>=4){
      t+='<tr>';
      t+='<td style="padding:2px 4px"></td>';
      if(visiblePre>=6){
        t+='<td colspan="'+visiblePre*2+'" style="background:'+C_PRE_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">先天係數 '+(isGroupOk([0,1,2,3,4,5])?vPre:INC)+'</td>';
      }else{
        t+='<td colspan="'+visiblePre*2+'" style="padding:2px 4px"></td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
      if(showLuck){
        t+='<td style="padding:2px 4px"></td>';
        if(visibleLuck>=3){
          t+='<td colspan="'+visibleLuck*2+'" style="background:'+C_LUCK_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">運氣係數 '+(isGroupOk([6,7,8])?vLuck:INC)+'</td>';
        }else{
          t+='<td colspan="'+visibleLuck*2+'" style="padding:2px 4px"></td>';
        }
        t+='<td colspan="3" style="padding:2px 4px"></td>';
      }
      if(showPost){
        t+='<td style="padding:2px 4px"></td>';
        if(visiblePost>=4){
          t+='<td colspan="'+visiblePost*2+'" style="background:'+C_POST_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">後天係數 '+(isGroupOk([9,10,11,12])?vPost:INC)+'</td>';
        }else{
          t+='<td colspan="'+visiblePost*2+'" style="padding:2px 4px"></td>';
        }
        t+='<td colspan="3" style="padding:2px 4px"></td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
      t+='<td style="padding:2px 4px"></td>';
      t+='</tr>';
    }

    // --- R20: 總係數 ---
    if(BETA_VISIBLE_DIMS>=13){
      // bar 寬度：先天數據 + 先天動靜分析 + (部位 + 運氣數據 + 運氣動靜分析) + (部位 + 後天數據)
      var dataColSpan = visiblePre*2
                      + 3
                      + (showLuck ? 1 + visibleLuck*2 + 3 : 0)
                      + (showPost ? 1 + visiblePost*2 : 0);
      t+='<tr>';
      t+='<td style="padding:2px 4px"></td>';
      t+='<td colspan="'+dataColSpan+'" style="background:'+C_TOTAL+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">總係數 '+(isGroupOk(visibleDimIds)?vTotal:INC)+'</td>';
      // bar 右緣到後天係數右緣後，剩下：後天動靜分析(3) + 總動靜分析(3) + 最右部位欄(1)
      if(showPost) t+='<td colspan="3" style="padding:2px 4px"></td>';
      t+='<td colspan="3" style="padding:2px 4px"></td>';
      t+='<td style="padding:2px 4px"></td>';
      t+='</tr>';
    }

    t+='</table>';
    ftEl.innerHTML=t;
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
    var canvas=drawReportCanvas(undefined,{checkComplete:true});
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
export function drawReportCanvas(srcData, opts){
  if(!srcData) srcData=data;
  if(!opts) opts={};
  var SC=opts.scale||2;
  var SBG='#7A9E7E', DBG='#C17A5A';

  // === 可見維度計算 ===
  var visiblePre = Math.min(6, BETA_VISIBLE_DIMS);
  var visibleLuck = Math.max(0, Math.min(3, BETA_VISIBLE_DIMS - 6));
  var visiblePost = Math.max(0, Math.min(4, BETA_VISIBLE_DIMS - 9));
  var showLuck = visibleLuck > 0;
  var showPost = visiblePost > 0;
  var visibleDimIds = [];
  for(var vi=0;vi<BETA_VISIBLE_DIMS;vi++) visibleDimIds.push(vi);

  // === 和風色彩系統（與 showReport 完全一致）===
  var dimBg=['#D6E4CC','#C8DCD8','#E2DDD5','#F0DECA','#E8D2D8','#EDE4C8',
             '#CEDDE8','#DDD4E4','#D2DDD6','#D4E2CF','#DED5DF','#CADDD8','#CDDAE6'];
  var dimDeep=['#6B8C5A','#4A7A6E','#8A8078','#A07850','#9A6878','#9A8A50',
               '#4A7A9A','#7A6890','#5A8A6A','#5A8A5A','#7A6088','#4A8078','#4A6E8A'];
  var dimText=['#4A6B3A','#3A5E54','#6A6458','#7A5A38','#7A4858','#7A6A38',
               '#3A5A7A','#5A4870','#3A6A4A','#3A6B3A','#5A4068','#3A6058','#3A5870'];
  // 結構色
  var C_PRE='#8E4B50',C_LUCK='#4C6E78',C_POST='#7B7082';
  var C_BOSS='#8E4B50',C_MGR='#8C6B4A';
  var C_PRE_C='#8E4B50',C_LUCK_C='#4C6E78',C_POST_C='#7B7082';
  var C_TOTAL_SD='#3C3C40',C_TOTAL='#4A4540';
  var C_PART_BG='#E8E4DF',C_PART_FC='#4A4540';
  var C_AN_BG='#E8E4DF',C_AN_FC='#4A4540';
  var C_LN_A='#E8E4DF',C_LN_B='#F0EDE8',C_LN_FC='#4A4540';
  var C_MARK='#8E4B50';

  var dimDesc=['格局','核心價值','成就','責任','能耐','成敗',
               '天運天機','地運資源','人運人和','戰略','戰術','算略KPI','智略'];

  var partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];

  // 動態取靜/動標籤
  var colL=DIMS.map(function(d){return d.da;});
  var colR=DIMS.map(function(d){return d.db;});
  var colLIsS=DIMS.map(function(d){var dt=(d.da===d.a)?d.aT:d.bT;return dt==='靜';});

  // === 佈局參數 ===
  var PAD=16, G=2;
  var PART_W=28;
  var DIM_CW=20;
  var AN_CW=22;
  var ROW_H=22;
  var HDR_H=22;
  var DIM_HDR_H=20;
  var DESC_H=16;
  var SD_HDR_H=18;
  var STAT_H=20;
  var ATTR_H=18;
  var COEFF_H=20;
  var BOSS_H=20;
  var SUB_COEFF_H=20;
  var TOTAL_H=22;
  var TITLE_H=32;
  var LN_H=22;
  var SEP_H=3;

  // === 計算各區塊寬度 ===
  var DIM_FULL_W = DIM_CW*2+G;
  var preDataW = visiblePre * (DIM_FULL_W+G) - G;
  var preAnW = 3 * (AN_CW+G) - G;
  var luckDataW = showLuck ? visibleLuck * (DIM_FULL_W+G) - G : 0;
  var luckAnW = showLuck ? 3 * (AN_CW+G) - G : 0;
  var postDataW = showPost ? visiblePost * (DIM_FULL_W+G) - G : 0;
  var postAnW = showPost ? 3 * (AN_CW+G) - G : 0;
  var totalAnW = 3 * (AN_CW+G) - G;

  var contentW = PART_W + G + preDataW + G + preAnW
               + (showLuck ? G + PART_W + G + luckDataW + G + luckAnW : 0)
               + (showPost ? G + PART_W + G + postDataW + G + postAnW : 0)
               + G + totalAnW + G + PART_W;
  var totalW = PAD*2 + contentW;

  // 各區塊起始 X
  var xPart1 = PAD;
  var xPreData = xPart1 + PART_W + G;
  var xPreAn = xPreData + preDataW + G;
  var xPart2=0, xLuckData=0, xLuckAn=0;
  var xPart3=0, xPostData=0, xPostAn=0;
  var nextX = xPreAn + preAnW;
  if(showLuck){
    xPart2 = nextX + G;
    xLuckData = xPart2 + PART_W + G;
    xLuckAn = xLuckData + luckDataW + G;
    nextX = xLuckAn + luckAnW;
  }
  if(showPost){
    xPart3 = nextX + G;
    xPostData = xPart3 + PART_W + G;
    xPostAn = xPostData + postDataW + G;
    nextX = xPostAn + postAnW;
  }
  var xTotalAn = nextX + G;
  var xPart4 = xTotalAn + totalAnW + G;

  function dimX(i){
    if(i<6) return xPreData + i*(DIM_FULL_W+G);
    if(i<9) return xLuckData + (i-6)*(DIM_FULL_W+G);
    return xPostData + (i-9)*(DIM_FULL_W+G);
  }

  // 流年資訊
  var lnInfo=_getLiunianInfo();
  var hasLn=!!lnInfo;

  // === 垂直佈局 ===
  var curY=PAD;
  var yTitle=curY; curY+=TITLE_H+G;
  var yLn=0;
  if(hasLn){ yLn=curY; curY+=LN_H+G*2; }
  var yR2=curY; curY+=HDR_H+G;
  var yR3=curY; curY+=DIM_HDR_H+G;
  var yR4=curY; curY+=DESC_H+G;
  var yR5=curY; curY+=SD_HDR_H+G;
  var yDataStart=curY;
  curY+=4*(ROW_H+G);
  var ySep=curY; curY+=SEP_H+G;
  var yData2Start=curY;
  curY+=5*(ROW_H+G);
  var yR15=curY; curY+=STAT_H+G;
  var yR16=curY; curY+=ATTR_H+G;
  var yR17=curY; curY+=COEFF_H+G;
  var showR18=visiblePre>=3;
  var showR19=visiblePre>=6||visibleLuck>=3||visiblePost>=4;
  var showR20=BETA_VISIBLE_DIMS>=13;
  var yR18=0,yR19=0,yR20=0;
  if(showR18){ yR18=curY; curY+=BOSS_H+G; }
  if(showR19){ yR19=curY; curY+=SUB_COEFF_H+G; }
  if(showR20){ yR20=curY; curY+=TOTAL_H; } else { curY-=G; }
  var totalH=curY+PAD;

  // === 建立 Canvas ===
  var canvas=document.createElement('canvas');
  canvas.width=totalW*SC;
  canvas.height=totalH*SC;
  var ctx=canvas.getContext('2d');
  ctx.scale(SC,SC);
  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,totalW,totalH);

  // === 輔助函式 ===
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
    ctx.font=(bold?'bold ':'')+size+'px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(text,x+w/2,y+h/2);
  }
  function txtL(text,x,y,h,color,size,bold){
    ctx.fillStyle=color;
    ctx.font=(bold?'bold ':'')+size+'px sans-serif';
    ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText(text,x,y+h/2);
  }
  function txtR(text,x,y,h,color,size,bold){
    ctx.fillStyle=color;
    ctx.font=(bold?'bold ':'')+size+'px sans-serif';
    ctx.textAlign='right';ctx.textBaseline='middle';
    ctx.fillText(text,x,y+h/2);
  }
  function ratioB(d,s){
    var total=d+s;
    if(!total)return '';
    var mx=Math.max(d,s);
    if(!mx)return '0.0';
    return (Math.min(d,s)/mx).toFixed(1);
  }
  function drawCheck(x,y,w,h,di){
    var sz=Math.min(w-6,h-6,14);
    var cx=x+(w-sz)/2, cy=y+(h-sz)/2;
    rRect(cx,cy,sz,sz,2,dimDeep[di]);
    ctx.fillStyle='#ffffff';
    ctx.font=(sz-2)+'px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('\u2713',cx+sz/2,cy+sz/2+1);
  }

  // === 計算數據 ===
  var vTotal=(BETA_VISIBLE_DIMS>=13)?avgCoeff(srcData,visibleDimIds):null;
  var vPre=(visiblePre>=6)?avgCoeff(srcData,[0,1,2,3,4,5]):null;
  var vLuck=(visibleLuck>=3)?avgCoeff(srcData,[6,7,8]):null;
  var vPost=(visiblePost>=4)?avgCoeff(srcData,[9,10,11,12]):null;
  var vLead=(visiblePre>=3)?avgCoeff(srcData,[0,1,2]):null;
  var vSub=(visiblePre>=6)?avgCoeff(srcData,[3,4,5]):null;

  function countSD(ids){
    var s=0,d=0;
    ids.forEach(function(di){
      srcData[di].forEach(function(v){
        if(!v)return;
        var tp=v==='A'?DIMS[di].aT:DIMS[di].bT;
        tp==='靜'?s++:d++;
      });
    });
    return{s:s,d:d};
  }
  var visiblePreIds=[];for(var vpi=0;vpi<visiblePre;vpi++) visiblePreIds.push(vpi);
  var visibleLuckIds=[];for(var vli=6;vli<6+visibleLuck;vli++) visibleLuckIds.push(vli);
  var visiblePostIds=[];for(var vpoi=9;vpoi<9+visiblePost;vpoi++) visiblePostIds.push(vpoi);
  var sdAll=countSD(visibleDimIds);
  var sdPre=countSD(visiblePreIds);
  var sdLuck=countSD(visibleLuckIds);
  var sdPost=countSD(visiblePostIds);

  var dimSCounts=[],dimDCounts=[];
  for(var di2=0;di2<13;di2++){
    var sc=0,dc=0;
    srcData[di2].forEach(function(v){
      if(!v)return;
      var tp=v==='A'?DIMS[di2].aT:DIMS[di2].bT;
      if(tp==='靜')sc++;else dc++;
    });
    dimSCounts.push(sc);dimDCounts.push(dc);
  }
  var dimCoeffs=[];
  for(var dc2=0;dc2<13;dc2++){ dimCoeffs.push(calcDim(srcData,dc2)); }
  var dimAttr=[];
  for(var da2=0;da2<13;da2++){ var r=dimCoeffs[da2]; dimAttr.push(r?r.type:null); }

  // 未填完判斷（手動報告用）
  var dimComplete=[];
  if(opts.checkComplete){
    for(var di3=0;di3<13;di3++){
      var complete=true;
      for(var pi3=0;pi3<9;pi3++){ if(srcData[di3][pi3]===null||srcData[di3][pi3]===undefined){ complete=false; break; } }
      dimComplete.push(complete);
    }
  }
  function isDimOk(i){ return !opts.checkComplete || dimComplete[i]; }
  function isGroupOk(ids){ return !opts.checkComplete || ids.every(function(i){ return dimComplete[i]; }); }
  var INC='未填完';

  // ========== 繪製 ==========

  // --- 1. 標題列 ---
  var displayName=_currentCaseName||userName||'未命名';
  txtL(displayName,PAD,yTitle,TITLE_H,'#3a3228',16,false);
  ctx.font='bold 16px sans-serif';
  var nx=PAD+ctx.measureText(displayName).width;

  if(lnInfo){
    var ageText='虛歲 '+lnInfo.xusui;
    txtL(ageText,nx+8,yTitle,TITLE_H,'#3a3228',13,false);
    ctx.font='bold 13px sans-serif';
    nx+=8+ctx.measureText(ageText).width;
    if(lnInfo.mark){
      nx+=5;
      rRect(nx,yTitle+(TITLE_H-16)/2,26,16,3,C_MARK);
      ctx.fillStyle='#ffffff';
      ctx.font='bold 10px sans-serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(lnInfo.mark,nx+13,yTitle+TITLE_H/2);
      nx+=32;
    }
  }
  txtL('人相兵法係數報告',nx+20,yTitle,TITLE_H,'#888',12,false);

  // --- 2. 流年（flex 色塊）---
  if(hasLn){
    var ln=lnInfo.ln;
    var items=[
      {label:'七十五', value:(ln.name75||'')+(ln.area75?'／'+ln.area75:'')},
      {label:'九執', value:ln.jiuzhi||''},
      {label:'業務', value:ln.yewu||''},
      {label:'親族', value:ln.qinzu||''},
      {label:'子女', value:ln.zinv||''},
      {label:'耳鼻', value:ln.erbei||''},
      {label:'五官', value:ln.wuguan||''},
      {label:'三停', value:ln.santing||''}
    ];
    var lnTotalW=contentW;
    var lnItemW=Math.floor(lnTotalW/items.length);
    var lnX=PAD;
    for(var li=0;li<items.length;li++){
      var bg=(li%2===0)?C_LN_A:C_LN_B;
      var iw=(li===items.length-1)?(lnTotalW-lnItemW*(items.length-1)):lnItemW;
      rRect(lnX,yLn,iw-G,LN_H,3,bg);
      var lnText=items[li].label+' | '+items[li].value;
      txtC(lnText,lnX,yLn,iw-G,LN_H,C_LN_FC,9,false);
      lnX+=iw;
    }
  }

  // --- R2: 指數標題 ---
  var preBlockW=preDataW+G+preAnW;
  rRect(xPreData,yR2,preBlockW,HDR_H,3,C_PRE);
  txtC('先天指數',xPreData,yR2,preBlockW,HDR_H,'#fff',11,false);
  if(showLuck){
    var luckBlockW=luckDataW+G+luckAnW;
    rRect(xLuckData,yR2,luckBlockW,HDR_H,3,C_LUCK);
    txtC('運氣指數',xLuckData,yR2,luckBlockW,HDR_H,'#fff',11,false);
  }
  if(showPost){
    var postBlockW=postDataW+G+postAnW;
    rRect(xPostData,yR2,postBlockW,HDR_H,3,C_POST);
    txtC('後天指數',xPostData,yR2,postBlockW,HDR_H,'#fff',11,false);
  }

  // --- R3: 維度名（深色底白字）---
  for(var i=0;i<BETA_VISIBLE_DIMS;i++){
    var dx=dimX(i);
    rRect(dx,yR3,DIM_CW,DIM_HDR_H,2,dimDeep[i]);
    txtC(DIMS[i].da,dx,yR3,DIM_CW,DIM_HDR_H,'#fff',9,false);
    rRect(dx+DIM_CW+G,yR3,DIM_CW,DIM_HDR_H,2,dimDeep[i]);
    txtC(DIMS[i].db,dx+DIM_CW+G,yR3,DIM_CW,DIM_HDR_H,'#fff',9,false);
  }
  // 動靜分析標題（R3-R4 合併效果）
  var anH=DIM_HDR_H+G+DESC_H;
  rRect(xPreAn,yR3,preAnW,anH,2,C_AN_BG);
  txtC('動靜分析',xPreAn,yR3,preAnW,anH,C_AN_FC,9,false);
  if(showLuck){
    rRect(xLuckAn,yR3,luckAnW,anH,2,C_AN_BG);
    txtC('動靜分析',xLuckAn,yR3,luckAnW,anH,C_AN_FC,9,false);
  }
  if(showPost){
    rRect(xPostAn,yR3,postAnW,anH,2,C_AN_BG);
    txtC('動靜分析',xPostAn,yR3,postAnW,anH,C_AN_FC,9,false);
  }
  rRect(xTotalAn,yR3,totalAnW,anH,2,C_TOTAL_SD);
  txtC('總動靜',xTotalAn,yR3,totalAnW,anH,'#fff',9,false);

  // --- R4: 維度描述 ---
  for(var i=0;i<BETA_VISIBLE_DIMS;i++){
    var dx=dimX(i);
    rRect(dx,yR4,DIM_FULL_W,DESC_H,2,dimBg[i]);
    txtC(dimDesc[i],dx,yR4,DIM_FULL_W,DESC_H,C_AN_FC,7,false);
  }

  // --- R5: 靜/動 標頭 ---
  for(var i=0;i<BETA_VISIBLE_DIMS;i++){
    var dx=dimX(i);
    var leftIsS=colLIsS[i];
    rRect(dx,yR5,DIM_CW,SD_HDR_H,2,dimBg[i]);
    txtC(leftIsS?'靜':'動',dx,yR5,DIM_CW,SD_HDR_H,leftIsS?'#000':'#980000',8,false);
    rRect(dx+DIM_CW+G,yR5,DIM_CW,SD_HDR_H,2,dimBg[i]);
    txtC(leftIsS?'動':'靜',dx+DIM_CW+G,yR5,DIM_CW,SD_HDR_H,leftIsS?'#980000':'#000',8,false);
  }
  function drawAnHeader(ax,y){
    var cw=AN_CW;
    rRect(ax,y,cw,SD_HDR_H,2,C_AN_BG);
    txtC('動',ax,y,cw,SD_HDR_H,'#980000',8,false);
    rRect(ax+cw+G,y,cw,SD_HDR_H,2,C_AN_BG);
    txtC('靜',ax+cw+G,y,cw,SD_HDR_H,'#000',8,false);
    rRect(ax+(cw+G)*2,y,cw,SD_HDR_H,2,C_AN_BG);
    txtC('比例',ax+(cw+G)*2,y,cw,SD_HDR_H,C_AN_FC,8,false);
  }
  drawAnHeader(xPreAn,yR5);
  if(showLuck) drawAnHeader(xLuckAn,yR5);
  if(showPost) drawAnHeader(xPostAn,yR5);
  var cw=AN_CW;
  rRect(xTotalAn,yR5,cw,SD_HDR_H,2,C_TOTAL_SD);
  txtC('動',xTotalAn,yR5,cw,SD_HDR_H,'#fff',8,false);
  rRect(xTotalAn+cw+G,yR5,cw,SD_HDR_H,2,C_TOTAL_SD);
  txtC('靜',xTotalAn+cw+G,yR5,cw,SD_HDR_H,'#fff',8,false);
  rRect(xTotalAn+(cw+G)*2,yR5,cw,SD_HDR_H,2,C_TOTAL_SD);
  txtC('比例',xTotalAn+(cw+G)*2,yR5,cw,SD_HDR_H,'#fff',8,false);

  // --- R6~R14: 部位資料行 ---
  function drawPartRow(pi,idx,yy){
    var label=partLabels[idx];
    rRect(xPart1,yy,PART_W,ROW_H,2,C_PART_BG);
    txtC(label,xPart1,yy,PART_W,ROW_H,C_PART_FC,9,false);
    if(showLuck){
      rRect(xPart2,yy,PART_W,ROW_H,2,C_PART_BG);
      txtC(label,xPart2,yy,PART_W,ROW_H,C_PART_FC,9,false);
    }
    if(showPost){
      rRect(xPart3,yy,PART_W,ROW_H,2,C_PART_BG);
      txtC(label,xPart3,yy,PART_W,ROW_H,C_PART_FC,9,false);
    }
    rRect(xPart4,yy,PART_W,ROW_H,2,C_PART_BG);
    txtC(label,xPart4,yy,PART_W,ROW_H,C_PART_FC,9,false);

    var preS=0,preD=0,luckS=0,luckD=0,postS=0,postD=0;
    for(var i=0;i<BETA_VISIBLE_DIMS;i++){
      var dx=dimX(i);
      var v=srcData[i][pi];
      if(v){
        var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
        var isS=tp==='靜';
        var goLeft=(isS&&colLIsS[i])||(!isS&&!colLIsS[i]);
        rRect(dx,yy,DIM_CW,ROW_H,2,dimBg[i]);
        rRect(dx+DIM_CW+G,yy,DIM_CW,ROW_H,2,dimBg[i]);
        if(goLeft){
          drawCheck(dx,yy,DIM_CW,ROW_H,i);
        }else{
          drawCheck(dx+DIM_CW+G,yy,DIM_CW,ROW_H,i);
        }
        if(isS){
          if(i<6)preS++;else if(i<9)luckS++;else postS++;
        }else{
          if(i<6)preD++;else if(i<9)luckD++;else postD++;
        }
      }else{
        rRect(dx,yy,DIM_CW,ROW_H,2,dimBg[i]);
        rRect(dx+DIM_CW+G,yy,DIM_CW,ROW_H,2,dimBg[i]);
      }
    }

    function drawAnCells(ax,yy,d,s,bgColor,fc){
      rRect(ax,yy,AN_CW,ROW_H,2,bgColor);
      txtC(''+d,ax,yy,AN_CW,ROW_H,fc,9,false);
      rRect(ax+AN_CW+G,yy,AN_CW,ROW_H,2,bgColor);
      txtC(''+s,ax+AN_CW+G,yy,AN_CW,ROW_H,fc,9,false);
      rRect(ax+(AN_CW+G)*2,yy,AN_CW,ROW_H,2,bgColor);
      txtC(ratioB(d,s),ax+(AN_CW+G)*2,yy,AN_CW,ROW_H,fc,9,false);
    }
    drawAnCells(xPreAn,yy,preD,preS,C_AN_BG,C_AN_FC);
    if(showLuck) drawAnCells(xLuckAn,yy,luckD,luckS,C_AN_BG,C_AN_FC);
    if(showPost) drawAnCells(xPostAn,yy,postD,postS,C_AN_BG,C_AN_FC);
    var allD=preD+luckD+postD, allS=preS+luckS+postS;
    drawAnCells(xTotalAn,yy,allD,allS,C_TOTAL_SD,'#fff');
  }

  for(var r=0;r<4;r++){
    drawPartRow(r,r,yDataStart+r*(ROW_H+G));
  }
  ctx.fillStyle='#b8b0a0';
  ctx.fillRect(PAD,ySep,contentW,2);
  for(var r=0;r<5;r++){
    drawPartRow(r+4,r+4,yData2Start+r*(ROW_H+G));
  }

  // --- R15: 統計行 ---
  for(var i=0;i<BETA_VISIBLE_DIMS;i++){
    var dx=dimX(i);
    var sn=dimSCounts[i],dn=dimDCounts[i];
    var lv=colLIsS[i]?sn:dn;
    var rv=colLIsS[i]?dn:sn;
    rRect(dx,yR15,DIM_CW,STAT_H,2,dimBg[i]);
    txtC(''+lv,dx,yR15,DIM_CW,STAT_H,'#000',9,false);
    rRect(dx+DIM_CW+G,yR15,DIM_CW,STAT_H,2,dimBg[i]);
    txtC(''+rv,dx+DIM_CW+G,yR15,DIM_CW,STAT_H,'#000',9,false);
  }
  function drawAnStat(ax,yy,sd,bgColor,fc){
    rRect(ax,yy,AN_CW,STAT_H,2,bgColor);
    txtC(''+sd.d,ax,yy,AN_CW,STAT_H,fc,9,false);
    rRect(ax+AN_CW+G,yy,AN_CW,STAT_H,2,bgColor);
    txtC(''+sd.s,ax+AN_CW+G,yy,AN_CW,STAT_H,fc,9,false);
    rRect(ax+(AN_CW+G)*2,yy,AN_CW,STAT_H,2,bgColor);
    txtC(ratioB(sd.d,sd.s),ax+(AN_CW+G)*2,yy,AN_CW,STAT_H,fc,9,false);
  }
  drawAnStat(xPreAn,yR15,sdPre,C_AN_BG,C_AN_FC);
  if(showLuck) drawAnStat(xLuckAn,yR15,sdLuck,C_AN_BG,C_AN_FC);
  if(showPost) drawAnStat(xPostAn,yR15,sdPost,C_AN_BG,C_AN_FC);
  drawAnStat(xTotalAn,yR15,sdAll,C_TOTAL_SD,'#fff');

  // --- R16: 屬性行 ---
  for(var i=0;i<BETA_VISIBLE_DIMS;i++){
    var dx=dimX(i);
    rRect(dx,yR16,DIM_FULL_W,ATTR_H,2,dimBg[i]);
    if(!isDimOk(i)){
      txtC(INC,dx,yR16,DIM_FULL_W,ATTR_H,'#bbb',7,false);
    }else{
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      txtC(alabel,dx,yR16,DIM_FULL_W,ATTR_H,fc2,9,false);
    }
  }

  // --- R17: 係數行 ---
  for(var i=0;i<BETA_VISIBLE_DIMS;i++){
    var dx=dimX(i);
    rRect(dx,yR17,DIM_FULL_W,COEFF_H,2,dimBg[i]);
    if(!isDimOk(i)){
      txtC(INC,dx,yR17,DIM_FULL_W,COEFF_H,'#bbb',7,false);
    }else{
      var rcf=dimCoeffs[i];
      var cv=rcf?rcf.coeff.toFixed(2):'';
      txtC(cv,dx,yR17,DIM_FULL_W,COEFF_H,C_AN_FC,10,false);
    }
  }

  // --- R18: 老闆係數 + 主管係數 ---
  if(showR18){
    var bossW=3*(DIM_FULL_W+G)-G;
    rRect(xPreData,yR18,bossW,BOSS_H,3,C_BOSS);
    txtC('老闆係數 '+(isGroupOk([0,1,2])?vLead:INC),xPreData,yR18,bossW,BOSS_H,'#fff',10,false);
    if(visiblePre>=6){
      var mgrX=xPreData+bossW+G;
      rRect(mgrX,yR18,bossW,BOSS_H,3,C_MGR);
      txtC('主管係數 '+(isGroupOk([3,4,5])?vSub:INC),mgrX,yR18,bossW,BOSS_H,'#fff',10,false);
    }
  }

  // --- R19: 先天係數 | 運氣係數 | 後天係數 ---
  if(showR19){
    if(visiblePre>=6){
      rRect(xPreData,yR19,preDataW,SUB_COEFF_H,3,C_PRE_C);
      txtC('先天係數 '+(isGroupOk([0,1,2,3,4,5])?vPre:INC),xPreData,yR19,preDataW,SUB_COEFF_H,'#fff',10,false);
    }
    if(visibleLuck>=3){
      rRect(xLuckData,yR19,luckDataW,SUB_COEFF_H,3,C_LUCK_C);
      txtC('運氣係數 '+(isGroupOk([6,7,8])?vLuck:INC),xLuckData,yR19,luckDataW,SUB_COEFF_H,'#fff',10,false);
    }
    if(visiblePost>=4){
      rRect(xPostData,yR19,postDataW,SUB_COEFF_H,3,C_POST_C);
      txtC('後天係數 '+(isGroupOk([9,10,11,12])?vPost:INC),xPostData,yR19,postDataW,SUB_COEFF_H,'#fff',10,false);
    }
  }

  // --- R20: 總係數 ---
  if(showR20){
    // bar 寬度：先天數據 + 先天動靜分析 + (gap + 部位 + gap + 運氣數據 + gap + 運氣動靜分析) + (gap + 部位 + gap + 後天數據)
    var totalCoeffW = preDataW + G + preAnW
                    + (showLuck ? G + PART_W + G + luckDataW + G + luckAnW : 0)
                    + (showPost ? G + PART_W + G + postDataW : 0);
    rRect(xPreData,yR20,totalCoeffW,TOTAL_H,3,C_TOTAL);
    txtC('總係數 '+(isGroupOk(visibleDimIds)?vTotal:INC),xPreData,yR20,totalCoeffW,TOTAL_H,'#fff',11,false);
  }

  return canvas;
}
