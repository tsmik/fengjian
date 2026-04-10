// js/manual.js — 手動輸入模組
import { DIMS, data, manualData, setManualData, userName, _isTA, _currentCaseId, _currentCaseName, BETA_VISIBLE_DIMS,
         setNavActive, showPage, _showToast, _getUserDocRef, calcDim, avgCoeff,
         _liunianTable, currentUser } from './core.js';
import { buildLiunianTableHtml, buildLiunianTitleHtml, _getLiunianInfo, drawReportCanvas, fallbackDownload } from './report.js';

export function initManualData(){
  if(manualData)return;
  setManualData(Array(13).fill(null).map(function(){return Array(9).fill(null);}));
}
export function manualSaveLocal(){
  if(manualData)localStorage.setItem('manual_data_v1',JSON.stringify(manualData));
}
export function manualLoadData(){
  // 優先 Firebase，備用 localStorage
  if(!currentUser){manualLoadLocal();return;}
  _getUserDocRef().get().then(function(doc){
    if(doc.exists&&doc.data().manualDataJson){
      try{setManualData(JSON.parse(doc.data().manualDataJson));}catch(e){manualLoadLocal();}
    }else{manualLoadLocal();}
    renderManualPage();
  }).catch(function(){manualLoadLocal();renderManualPage();});
}
export function manualLoadLocal(){
  try{var s=localStorage.getItem('manual_data_v1');if(s)setManualData(JSON.parse(s));}catch(e){}
  if(!manualData)initManualData();
}

export function showManualPage(){
  showPage('manual-page');
  document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-manual');
  if(!window._suppressPushState) history.pushState({page:'manual'},'');
  initManualData();
  manualLoadData();
}

export function manualCellClick(di,pi){
  initManualData();
  var cur=manualData[di][pi];
  if(cur===null)manualData[di][pi]='A';
  else if(cur==='A')manualData[di][pi]='B';
  else manualData[di][pi]=null;
  manualSaveLocal();
  renderManualPage();
}

export function manualClear(){
  if(!confirm('確定要清除所有手動輸入資料嗎？'))return;
  setManualData(null);initManualData();
  manualSaveLocal();
  renderManualPage();
  _showToast('手動資料已清除');
}

export function manualImportObs(){
  if(!confirm('確定要將觀察評分資料帶入手動報告嗎？現有的手動資料會被覆蓋。'))return;
  initManualData();
  for(var di=0;di<13;di++){
    for(var pi=0;pi<9;pi++){
      manualData[di][pi]=data[di][pi]||null;
    }
  }
  manualSaveLocal();
  renderManualPage();
  _showToast('已帶入觀察評分資料');
}

export function manualSave(){
  if(!currentUser)return;
  initManualData();
  var coeffs={};
  for(var i=0;i<13;i++){
    var res=calcDim(manualData,i);
    coeffs[DIMS[i].dn]=res?{type:res.type,coeff:res.coeff,a:res.a,b:res.b}:null;
  }
  var btn=document.getElementById('manual-save-btn');
  btn.innerText='儲存中...';btn.disabled=true;
  // 存到 users/{userName} 的 manualDataJson 欄位（持久化）
  var savePromise=_getUserDocRef().set({
    manualDataJson:JSON.stringify(manualData),
    manualCoeffs:JSON.stringify(coeffs),
    manualTotalCoeff:avgCoeff(manualData,[0,1,2,3,4,5,6,7,8,9,10,11,12]),
    manualUpdatedAt:new Date().toISOString()
  },{merge:true});
  // 歷史記錄（非關鍵，失敗不影響主儲存）
  db.collection('analyses').add({
    userName:userName,inputType:'manual',
    manualData:JSON.stringify(manualData),coefficients:JSON.stringify(coeffs),
    totalCoeff:avgCoeff(manualData,[0,1,2,3,4,5,6,7,8,9,10,11,12]),
    createdAt:new Date().toISOString()
  }).catch(function(e){console.log('analyses log失敗（不影響儲存）',e);});
  manualSaveLocal();
  savePromise.then(function(){
    btn.innerText='已儲存 \u2713';btn.style.color='#7A9E7E';btn.style.borderColor='#7A9E7E';
    setTimeout(function(){btn.innerText='儲存評分';btn.style.color='';btn.style.borderColor='';btn.disabled=false;},2000);
  }).catch(function(e){
    btn.innerText='儲存失敗';btn.disabled=false;
    setTimeout(function(){btn.innerText='儲存評分';},2000);
    console.log('手動評分儲存失敗',e);
  });
}

export function renderManualPage(){
  var el=document.getElementById('manual-table');if(!el)return;
  initManualData();
  var _manualLnInfo=_getLiunianInfo();
  var _manualLnHtml=buildLiunianTableHtml(_manualLnInfo);
  var _displayName=(_isTA&&_currentCaseId?_currentCaseName:userName)||'未命名';
  var _manualTitleHtml='<div style="margin-bottom:8px"><span style="font-size:20px;font-weight:900;font-family:sans-serif">'+_displayName+'</span>'+buildLiunianTitleHtml(_manualLnInfo)+'<span style="font-size:15px;color:#888;font-family:sans-serif;margin-left:12px">人相兵法係數報告</span></div>';

  var partOrder=[0,1,2,3,4,5,6,7,8];
  var partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  var SBG='#7A9E7E',DBG='#C17A5A';
  var colL=DIMS.map(function(d){return d.da;});
  var colR=DIMS.map(function(d){return d.db;});
  var colLIsS=DIMS.map(function(d){var dt=(d.da===d.a)?d.aT:d.bT;return dt==='靜';});

  // === 和風色彩系統 ===
  var dimBg=['#D6E4CC','#C8DCD8','#E2DDD5','#F0DECA','#E8D2D8','#EDE4C8',
             '#CEDDE8','#DDD4E4','#D2DDD6','#D4E2CF','#DED5DF','#CADDD8','#CDDAE6'];
  var dimDeep=['#6B8C5A','#4A7A6E','#8A8078','#A07850','#9A6878','#9A8A50',
               '#4A7A9A','#7A6890','#5A8A6A','#5A8A5A','#7A6088','#4A8078','#4A6E8A'];
  var C_PRE='#8E4B50',C_LUCK='#4C6E78',C_POST='#7B7082';
  var C_BOSS='#8E4B50',C_MGR='#8C6B4A';
  var C_PRE_C='#8E4B50',C_LUCK_C='#4C6E78',C_POST_C='#7B7082';
  var C_TOTAL_SD='#3C3C40',C_TOTAL='#4A4540';
  var C_PART_BG='#E8E4DF',C_PART_FC='#4A4540';
  var C_AN_BG='#E8E4DF',C_AN_FC='#4A4540';

  var dimDesc=['格局','核心價值','成就','責任','能耐','成敗',
               '天運天機','地運資源','人運人和','戰略','戰術','算略KPI','智略'];

  var rc='border-radius:3px';

  // 統計
  var vTotal=avgCoeff(manualData,[0,1,2,3,4,5,6,7,8,9,10,11,12]);
  var vPre=avgCoeff(manualData,[0,1,2,3,4,5]),vLuck=avgCoeff(manualData,[6,7,8]),vPost=avgCoeff(manualData,[9,10,11,12]);
  var vLead=avgCoeff(manualData,[0,1,2]),vSub=avgCoeff(manualData,[3,4,5]);

  function mCountSD(dimIds){
    var s=0,d=0;
    dimIds.forEach(function(di){
      manualData[di].forEach(function(v){
        if(!v)return;
        var tp=v==='A'?DIMS[di].aT:DIMS[di].bT;
        if(tp==='靜')s++;else d++;
      });
    });
    return{s:s,d:d};
  }
  var sdAll=mCountSD([0,1,2,3,4,5,6,7,8,9,10,11,12]);
  var sdPre=mCountSD([0,1,2,3,4,5]),sdLuck=mCountSD([6,7,8]),sdPost=mCountSD([9,10,11,12]);

  var dimSCounts=[],dimDCounts=[];
  for(var di2=0;di2<13;di2++){
    var sc=0,dc=0;
    manualData[di2].forEach(function(v){if(!v)return;var tp=v==='A'?DIMS[di2].aT:DIMS[di2].bT;if(tp==='靜')sc++;else dc++;});
    dimSCounts.push(sc);dimDCounts.push(dc);
  }
  var dimCoeffs=[];
  for(var dc2=0;dc2<13;dc2++){ dimCoeffs.push(calcDim(manualData,dc2)); }
  var dimAttr=[];
  for(var da2=0;da2<13;da2++){ var r=dimCoeffs[da2]; dimAttr.push(r?r.type:null); }

  // 判斷每個維度是否 9 個部位全部填完
  var dimComplete=[];
  for(var di3=0;di3<13;di3++){
    var complete=true;
    for(var pi3=0;pi3<9;pi3++){ if(manualData[di3][pi3]===null||manualData[di3][pi3]===undefined){ complete=false; break; } }
    dimComplete.push(complete);
  }
  function groupComplete(ids){ return ids.every(function(i){ return dimComplete[i]; }); }
  var INC='未填完';
  var INC_STYLE='color:#bbb;font-size:10px';

  function ratioB(d,s){
    var total=d+s;
    if(!total)return '';
    var mx=Math.max(d,s);
    if(!mx)return '0.0';
    return (Math.min(d,s)/mx).toFixed(1);
  }

  function checkMark(di){
    return '<span style="display:inline-block;width:14px;height:14px;background:'+dimDeep[di]+';border-radius:2px;line-height:14px;text-align:center;color:#fff;font-size:10px">\u2713</span>';
  }

  // === 表格 ===
  var t='<table style="border-collapse:separate;border-spacing:2px;white-space:nowrap;font-size:11px;font-family:sans-serif;width:100%">';

  // --- R1: 流年（由外部 _manualLnHtml 處理）---
  if(_manualLnHtml){
    t+='<tr><td colspan="43" style="padding:0 0 8px 0">'+_manualLnHtml+'</td></tr>';
  }

  // --- R2: 先天指數 | 運氣指數 | 後天指數 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  t+='<td colspan="15" style="background:'+C_PRE+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">先天指數</td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='<td colspan="9" style="background:'+C_LUCK+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">運氣指數</td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='<td colspan="11" style="background:'+C_POST+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">後天指數</td>';
  t+='<td colspan="4" style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R3: 維度名 + 動靜分析 + 總動靜分析 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<6;i++){
    t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].da+'</td>';
    t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].db+'</td>';
  }
  t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=6;i<9;i++){
    t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].da+'</td>';
    t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].db+'</td>';
  }
  t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=9;i<13;i++){
    t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].da+'</td>';
    t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].db+'</td>';
  }
  t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
  t+='<td rowspan="2" colspan="3" style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">總動靜分析</td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R4: 維度描述 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<6;i++){
    t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
  }
  t+='<td style="padding:2px 4px"></td>';
  for(var i=6;i<9;i++){
    t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
  }
  t+='<td style="padding:2px 4px"></td>';
  for(var i=9;i<13;i++){
    t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
  }
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R5: 靜/動標頭 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  function r5Cell(di,isLeft){
    var isS;
    if(isLeft){isS=colLIsS[di];}else{isS=!colLIsS[di];}
    var label=isS?'靜':'動';
    var fc=isS?'#000':'#980000';
    return '<td style="background:'+dimBg[di]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc+'">'+label+'</td>';
  }
  for(var i=0;i<6;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=6;i<9;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=9;i<13;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">動</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">靜</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">比例</td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R6~R14: 部位資料行（可點擊）---
  function renderPartRow(pi, idx){
    var label=partLabels[idx];
    t+='<tr>';
    t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';

    var preS=0,preD=0,luckS=0,luckD=0,postS=0,postD=0;

    // 先天 6 維度
    for(var i=0;i<6;i++){
      var v=manualData[i][pi];
      if(v){
        var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
        var isS=tp==='靜';
        var goLeft=(isS&&colLIsS[i])||(!isS&&!colLIsS[i]);
        if(goLeft){
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;cursor:pointer">'+checkMark(i)+'</td>';
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
        }else{
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;cursor:pointer">'+checkMark(i)+'</td>';
        }
        if(isS)preS++;else preD++;
      }else{
        t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
        t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
      }
    }
    // 先天動靜分析
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preD+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preS+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(preD,preS)+'</td>';

    // 中部位欄
    t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';

    // 運氣 3 維度
    for(var i=6;i<9;i++){
      var v=manualData[i][pi];
      if(v){
        var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
        var isS=tp==='靜';
        var goLeft=(isS&&colLIsS[i])||(!isS&&!colLIsS[i]);
        if(goLeft){
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;cursor:pointer">'+checkMark(i)+'</td>';
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
        }else{
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;cursor:pointer">'+checkMark(i)+'</td>';
        }
        if(isS)luckS++;else luckD++;
      }else{
        t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
        t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
      }
    }
    // 運氣動靜分析
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckD+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckS+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(luckD,luckS)+'</td>';

    // 右部位欄
    t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';

    // 後天 4 維度
    for(var i=9;i<13;i++){
      var v=manualData[i][pi];
      if(v){
        var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
        var isS=tp==='靜';
        var goLeft=(isS&&colLIsS[i])||(!isS&&!colLIsS[i]);
        if(goLeft){
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;cursor:pointer">'+checkMark(i)+'</td>';
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
        }else{
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
          t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;cursor:pointer">'+checkMark(i)+'</td>';
        }
        if(isS)postS++;else postD++;
      }else{
        t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
        t+='<td onclick="manualCellClick('+i+','+pi+')" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer"></td>';
      }
    }
    // 後天動靜分析
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postD+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postS+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(postD,postS)+'</td>';

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
      t+='<tr><td colspan="43" style="height:2px;background:#b8b0a0;padding:0"></td></tr>';
    }
    renderPartRow(pi,idx);
  });

  // --- R15: 統計行 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<6;i++){
    var sn=dimSCounts[i],dn=dimDCounts[i];
    var lv=colLIsS[i]?sn:dn;
    var rv=colLIsS[i]?dn:sn;
    t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
    t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
  }
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdPre.d+'</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdPre.s+'</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(sdPre.d,sdPre.s)+'</td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=6;i<9;i++){
    var sn=dimSCounts[i],dn=dimDCounts[i];
    var lv=colLIsS[i]?sn:dn;
    var rv=colLIsS[i]?dn:sn;
    t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
    t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
  }
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdLuck.d+'</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdLuck.s+'</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(sdLuck.d,sdLuck.s)+'</td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=9;i<13;i++){
    var sn=dimSCounts[i],dn=dimDCounts[i];
    var lv=colLIsS[i]?sn:dn;
    var rv=colLIsS[i]?dn:sn;
    t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
    t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
  }
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdPost.d+'</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdPost.s+'</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(sdPost.d,sdPost.s)+'</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+sdAll.d+'</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+sdAll.s+'</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+ratioB(sdAll.d,sdAll.s)+'</td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R16: 屬性行 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<6;i++){
    if(!dimComplete[i]){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
    }else{
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+'">'+alabel+'</td>';
    }
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=6;i<9;i++){
    if(!dimComplete[i]){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
    }else{
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+'">'+alabel+'</td>';
    }
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=9;i<13;i++){
    if(!dimComplete[i]){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
    }else{
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+'">'+alabel+'</td>';
    }
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R17: 係數行 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<6;i++){
    if(!dimComplete[i]){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
    }else{
      var rcf=dimCoeffs[i];
      var cv=rcf?rcf.coeff.toFixed(2):'';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px">'+cv+'</td>';
    }
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=6;i<9;i++){
    if(!dimComplete[i]){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
    }else{
      var rcf=dimCoeffs[i];
      var cv=rcf?rcf.coeff.toFixed(2):'';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px">'+cv+'</td>';
    }
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=9;i<13;i++){
    if(!dimComplete[i]){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
    }else{
      var rcf=dimCoeffs[i];
      var cv=rcf?rcf.coeff.toFixed(2):'';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px">'+cv+'</td>';
    }
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R18: 老闆係數 + 主管係數 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  var bossOk=groupComplete([0,1,2]);
  t+='<td colspan="6" style="background:'+C_BOSS+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">老闆係數 '+(bossOk?vLead:INC)+'</td>';
  var mgrOk=groupComplete([3,4,5]);
  t+='<td colspan="6" style="background:'+C_MGR+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">主管係數 '+(mgrOk?vSub:INC)+'</td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='<td colspan="6" style="padding:2px 4px"></td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='<td colspan="8" style="padding:2px 4px"></td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R19: 先天係數 | 運氣係數 | 後天係數 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  var preOk=groupComplete([0,1,2,3,4,5]);
  t+='<td colspan="12" style="background:'+C_PRE_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">先天係數 '+(preOk?vPre:INC)+'</td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  var luckOk=groupComplete([6,7,8]);
  t+='<td colspan="6" style="background:'+C_LUCK_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">運氣係數 '+(luckOk?vLuck:INC)+'</td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  var postOk=groupComplete([9,10,11,12]);
  t+='<td colspan="8" style="background:'+C_POST_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">後天係數 '+(postOk?vPost:INC)+'</td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R20: 總係數 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  var allOk=groupComplete([0,1,2,3,4,5,6,7,8,9,10,11,12]);
  t+='<td colspan="34" style="background:'+C_TOTAL+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">總係數 '+(allOk?vTotal:INC)+'</td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='<td style="padding:2px 4px"></td>';
  t+='</tr>';

  t+='</table>';
  el.innerHTML=_manualTitleHtml+t;
}

export async function exportManualPNG(){
  var btn=document.getElementById('btn-manual-export');
  if(btn){btn.innerText='產生中...';btn.disabled=true;}
  await new Promise(function(r){setTimeout(r,50);});
  try{
    initManualData();
    var canvas=drawReportCanvas(manualData, {checkComplete:true});
    var _expName=(_isTA&&_currentCaseId?_currentCaseName:userName)||'報告';
    var file=new File([await new Promise(function(r){canvas.toBlob(r,'image/png');})],
      '人相兵法_'+_expName+'_手動.png',{type:'image/png'});
    var isMobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if(isMobile&&navigator.canShare&&navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file],title:'人相兵法報告',text:_expName+' 的人相兵法報告（手動）'});}
      catch(e){if(e.name!=='AbortError')fallbackDownload(canvas);}
    }else{fallbackDownload(canvas);}
  }catch(e){console.error(e);alert('產生失敗，請截圖儲存');}
  if(btn){btn.innerText='分享報告';btn.disabled=false;}
}
