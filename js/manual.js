// js/manual.js — 手動輸入模組
import { DIMS, data, manualData, setManualData, userName, _isTA, _currentCaseId, _currentCaseName, BETA_VISIBLE_DIMS,
         setNavActive, showPage, _showToast, _getUserDocRef, calcDim, avgCoeff,
         _liunianTable, currentUser } from './core.js';
import { buildLiunianTableHtml, buildLiunianTitleHtml, _getLiunianInfo } from './report.js';

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
  // 流年資訊
  var _manualLnInfo=_getLiunianInfo();
  var _manualLnHtml=buildLiunianTableHtml(_manualLnInfo);
  // 標題列（使用者名稱 + 虛歲 + 關隘 + 報告名）
  var _displayName=(_isTA&&_currentCaseId?_currentCaseName:userName)||'未命名';
  var _manualTitleHtml='<div style="margin-bottom:8px"><span style="font-size:20px;font-weight:900;font-family:\'Noto Serif TC\',serif">'+_displayName+'</span>'+buildLiunianTitleHtml(_manualLnInfo)+'<span style="font-size:15px;color:#888;font-family:\'Noto Serif TC\',serif;margin-left:12px">人相兵法係數報告</span></div>';
  var partOrder=[0,1,2,3,4,5,6,7,8];
  var partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  var dimColors=['#5E8080','#6E9292','#7EA4A4','#527070','#608282','#6E9494','#9E8A5A','#B29E6E','#C6B282','#7A5A50','#8E6C62','#A27E74','#B69088'];
  var dimAlpha=['rgba(94,128,128,0.4)','rgba(110,146,146,0.4)','rgba(126,164,164,0.4)','rgba(82,112,112,0.4)','rgba(96,130,130,0.4)','rgba(110,148,148,0.4)','rgba(158,138,90,0.4)','rgba(178,158,110,0.4)','rgba(198,178,130,0.4)','rgba(122,90,80,0.4)','rgba(142,108,98,0.4)','rgba(162,126,116,0.4)','rgba(182,144,136,0.4)'];
  var SBG='#7A9E7E',DBG='#C17A5A';
  var sChar=DIMS.map(function(d){return d.aT==='靜'?d.a:d.b;});
  var dChar=DIMS.map(function(d){return d.aT==='靜'?d.b:d.a;});
  var colL=DIMS.map(function(d){return d.da;});
  var colR=DIMS.map(function(d){return d.db;});
  var colLIsS=DIMS.map(function(d){var dt=(d.da===d.a)?d.aT:d.bT;return dt==='靜';});
  var rc='border-radius:4px';
  var pw='width:38px;min-width:38px';
  var nb='background:transparent;border:none;padding:4px';
  var csBlock='border-radius:4px;padding:6px 10px;font-weight:700;text-align:center';

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
  var sdLead=mCountSD([0,1,2]),sdSub=mCountSD([3,4,5]);
  function sdTag(sd){
    return '<span style="font-weight:700;white-space:nowrap"><span style="color:'+DBG+'">動'+sd.d+'</span>'+
      '<span style="color:#999">/</span><span style="color:'+SBG+'">靜'+sd.s+'</span></span>';
  }
  function cellFlex(label,val,sd,bg,color){
    return '<td style="'+rc+';background:'+bg+';color:'+color+';padding:6px 10px">'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
      '<span style="flex:1;text-align:center;font-weight:700">'+label+'　'+val+'</span>'+
      '<span style="font-weight:700;white-space:nowrap">'+sdTag(sd)+'</span></div></td>';
  }

  // 維度動靜數
  var dimSCounts=[],dimDCounts=[];
  for(var di2=0;di2<13;di2++){
    var sc=0,dc=0;
    manualData[di2].forEach(function(v){if(!v)return;var tp=v==='A'?DIMS[di2].aT:DIMS[di2].bT;if(tp==='靜')sc++;else dc++;});
    dimSCounts.push(sc);dimDCounts.push(dc);
  }

  var t='<table style="border-collapse:separate;border-spacing:2px;font-size:14px;font-family:\'Noto Serif TC\',serif;white-space:nowrap;width:100%">';

  // 頂部摘要
  t+='<tr><td style="'+nb+';'+pw+'"></td>'+
    '<td colspan="26" style="'+rc+';background:#c8bfb0;color:#3a3228;padding:8px 14px;font-size:18px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center">'+
    '<span style="flex:1;text-align:center;font-weight:700">總係數　'+vTotal+'</span>'+
    '<span style="font-weight:700;white-space:nowrap">'+sdTag(sdAll)+'</span></div></td>'+
    '<td style="'+nb+';'+pw+'"></td></tr>';
  t+='<tr><td rowspan="2" style="'+nb+';'+pw+'"></td>';
  t+=cellFlex('先天係數',vPre,sdPre,'#bdd4d4','#2e4a4a').replace('<td','<td colspan="12"');
  t+=cellFlex('運氣係數',vLuck,sdLuck,'#e8dcc8','#5a4a2a').replace('<td','<td colspan="6"');
  t+=cellFlex('後天係數',vPost,sdPost,'#e0cdc6','#5a3a30').replace('<td','<td colspan="8"');
  t+='<td rowspan="2" style="'+nb+';'+pw+'"></td></tr>';
  t+='<tr>';
  t+=cellFlex('老闆係數',vLead,sdLead,'#cce0e0','#2e4a4a').replace('<td','<td colspan="6"');
  t+=cellFlex('主管係數',vSub,sdSub,'#d8eaea','#2e4a4a').replace('<td','<td colspan="6"');
  t+='<td colspan="6" style="'+nb+'"></td><td colspan="8" style="'+nb+'"></td></tr>';

  // 維度名稱行
  t+='<tr><td rowspan="3" style="padding:4px 6px;background:#e8e3da;font-weight:700;position:sticky;left:0;z-index:2;'+rc+';'+pw+';text-align:center"></td>';
  DIMS.forEach(function(d,i){
    t+='<th colspan="2" style="padding:10px 8px;background:'+dimColors[i]+';color:white;font-weight:700;text-align:center;letter-spacing:2px;'+rc+'">'+d.dn+'</th>';
  });
  t+='<td rowspan="3" style="padding:4px 6px;background:#e8e3da;font-weight:700;'+rc+';'+pw+';text-align:center"></td></tr>';
  // 子欄行
  t+='<tr>';
  DIMS.forEach(function(d,i){
    var lBg=colLIsS[i]?SBG:DBG;
    var rBg=colLIsS[i]?DBG:SBG;
    var lCnt=colLIsS[i]?dimSCounts[i]:dimDCounts[i];
    var rCnt=colLIsS[i]?dimDCounts[i]:dimSCounts[i];
    t+='<th style="padding:4px 6px;background:transparent;color:#7a6a50;font-weight:700;text-align:center;border-bottom:2.5px solid '+lBg+'">'+colL[i]+lCnt+'</th>';
    t+='<th style="padding:4px 6px;background:transparent;color:#7a6a50;font-weight:700;text-align:center;border-bottom:2.5px solid '+rBg+'">'+colR[i]+rCnt+'</th>';
  });
  t+='</tr>';
  // 係數格
  t+='<tr>';
  DIMS.forEach(function(d,i){
    var res=calcDim(manualData,i);
    var coeff=res?res.coeff.toFixed(2):'—';
    var sc=dimSCounts[i],dc=dimDCounts[i];
    var coeffBg=res?(res.type==='靜'?SBG:DBG):'var(--bg)';
    var coeffColor=res?'white':'var(--text-3)';
    var coeffBlock='<div style="background:'+coeffBg+';color:'+coeffColor+';font-weight:700;border-radius:4px;padding:3px 6px;text-align:center;margin-bottom:8px;width:100%">'+coeff+'</div>';
    var lCount=colLIsS[i]?sc:dc;
    var rCount=colLIsS[i]?dc:sc;
    var lColor=colLIsS[i]?SBG:DBG;
    var rColor=colLIsS[i]?DBG:SBG;
    var bars='<div style="display:flex;gap:2px;height:52px;align-items:flex-end;padding-bottom:2px;width:100%">';
    bars+='<div style="flex:1;display:flex;flex-direction:column;gap:2px;align-items:stretch;justify-content:flex-end">';
    for(var b=0;b<lCount;b++)bars+='<div style="height:3px;background:'+lColor+';border-radius:1px"></div>';
    bars+='</div>';
    bars+='<div style="flex:1;display:flex;flex-direction:column;gap:2px;align-items:stretch;justify-content:flex-end">';
    for(var b=0;b<rCount;b++)bars+='<div style="height:3px;background:'+rColor+';border-radius:1px"></div>';
    bars+='</div></div>';
    t+='<td colspan="2" style="padding:4px 6px;vertical-align:top">'+coeffBlock+bars+'</td>';
  });
  t+='</tr>';

  // 資料行（可點選）
  var partCellStyle='padding:4px 6px;font-weight:700;background:#e8e3da;'+rc+';'+pw+';text-align:center';
  partOrder.forEach(function(pi,idx){
    if(idx===4)t+='<tr><td colspan="28" style="height:2px;background:#b8b0a0;padding:0"></td></tr>';
    t+='<tr>';
    t+='<td style="'+partCellStyle+';position:sticky;left:0;z-index:1">'+partLabels[idx]+'</td>';
    DIMS.forEach(function(d,di){
      var v=manualData[di][pi];
      var isStatic=false,isDynamic=false;
      if(v){var tp=v==='A'?d.aT:d.bT;isStatic=tp==='靜';isDynamic=tp==='動';}
      if(isStatic||isDynamic){
        var cellBg=isStatic?SBG:DBG;
        var cellLabel=isStatic?sChar[di]:dChar[di];
        var goLeft=(isStatic&&colLIsS[di])||(isDynamic&&!colLIsS[di]);
        if(goLeft){
          t+='<td onclick="manualCellClick('+di+','+pi+')" style="padding:4px 8px;text-align:center;background:'+cellBg+';color:white;font-weight:700;'+rc+';cursor:pointer">'+cellLabel+'</td>';
          t+='<td onclick="manualCellClick('+di+','+pi+')" style="padding:4px 8px;text-align:center;background:'+dimAlpha[di]+';'+rc+';cursor:pointer"></td>';
        }else{
          t+='<td onclick="manualCellClick('+di+','+pi+')" style="padding:4px 8px;text-align:center;background:'+dimAlpha[di]+';'+rc+';cursor:pointer"></td>';
          t+='<td onclick="manualCellClick('+di+','+pi+')" style="padding:4px 8px;text-align:center;background:'+cellBg+';color:white;font-weight:700;'+rc+';cursor:pointer">'+cellLabel+'</td>';
        }
      }else{
        t+='<td onclick="manualCellClick('+di+','+pi+')" style="padding:4px 8px;text-align:center;'+rc+';cursor:pointer;background:rgba(0,0,0,0.03)"></td>';
        t+='<td onclick="manualCellClick('+di+','+pi+')" style="padding:4px 8px;text-align:center;'+rc+';cursor:pointer;background:rgba(0,0,0,0.03)"></td>';
      }
    });
    t+='<td style="'+partCellStyle+'">'+partLabels[idx]+'</td>';
    t+='</tr>';
  });
  t+='</table>';
  el.innerHTML=_manualTitleHtml+_manualLnHtml+t;
}
