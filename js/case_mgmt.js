/* case_mgmt.js — 案例管理模組 */
import { userName, setUserName, _isTA, _currentCaseId, setCurrentCaseId, _currentCaseName, setCurrentCaseName,
         _userGender, setUserGender, _userBirthday, setUserBirthday,
         _caseGender, setCaseGender, _caseBirthday, setCaseBirthday, _caseDate, setCaseDate,
         data, setData, obsData, setObsData, obsOverride, setObsOverride, condResults,
         emptyData, setNavActive, showPage, _showToast, _escHtml, _getUserDocRef, save,
         currentUser, setCurrentUser, userRole, setUserRole,
         DIMS } from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { renderFaceMap, renderObsCenter, renderDimIndex } from './obs_ui.js';
import { cpRender } from './cond_page.js';

/* module-local state */
let _editingCaseId = null;

/* ===== 助教模式：案例管理 ===== */
export function showCasePage(){
  showPage('case-page');
  document.getElementById('nav-name').innerText=userName||'';
  setNavActive('nav-cases');
  if(!window._suppressPushState) history.pushState({page:'case'},'');
  renderCaseList();
}

export function renderCaseList(){
  var listEl=document.getElementById('case-list');
  if(!listEl)return;
  listEl.innerHTML='<div style="color:#aaa;padding:20px;text-align:center">載入中...</div>';

  db.collection('users').doc(currentUser.uid).get().then(function(selfDoc){
    var selfUpdated=selfDoc.exists&&selfDoc.data().updatedAt?selfDoc.data().updatedAt:'';
    var html='';

    html+='<div class="case-card is-self" onclick="loadCase(null)">';
    html+='<div class="case-card-name">'+userName+' <span style="font-size:12px;color:var(--static);font-weight:500">（本人）</span></div>';
    if(selfUpdated) html+='<div class="case-card-date">更新：'+selfUpdated.substring(0,10)+'</div>';
    html+='</div>';

    db.collection('users').doc(currentUser.uid).collection('cases').orderBy('createdAt','desc').get().then(function(snap){
      snap.forEach(function(doc){
        var c=doc.data();
        html+='<div class="case-card" onclick="loadCase(\''+doc.id+'\')">';
        html+='<button class="case-card-edit" onclick="event.stopPropagation();editCase(\''+doc.id+'\')" title="編輯">✎</button>';
        html+='<button class="case-card-del" onclick="event.stopPropagation();deleteCase(\''+doc.id+'\',\''+_escHtml(c.name||'')+'\')" title="刪除">✕</button>';
        html+='<div class="case-card-name">'+(c.name||'未命名')+'</div>';
        html+='<div class="case-card-meta">';
        if(c.gender) html+='<span>'+c.gender+'</span>';
        if(c.birthday) html+='<span>生日：'+c.birthday+'</span>';
        if(c.date) html+='<span>日期：'+c.date+'</span>';
        html+='</div>';
        if(c.note) html+='<div class="case-card-meta" style="margin-top:4px;color:#999">'+_escHtml(c.note)+'</div>';
        if(c.updatedAt) html+='<div class="case-card-date">更新：'+c.updatedAt.substring(0,10)+'</div>';
        html+='</div>';
      });
      listEl.innerHTML=html;
    }).catch(function(e){
      console.log('載入案例失敗',e);
      listEl.innerHTML=html+'<div style="color:#c03830;padding:12px">載入個案清單失敗</div>';
    });
  });
}

export function loadCase(caseId){
  if(caseId===null){
    setCurrentCaseId(null);
    setCurrentCaseName(userName);
    db.collection('users').doc(currentUser.uid).get().then(function(doc){
      if(doc.exists&&doc.data().dataJson)setData(JSON.parse(doc.data().dataJson));else setData(emptyData());
      if(doc.exists&&doc.data().obsJson)setObsData(JSON.parse(doc.data().obsJson));else setObsData({});
      if(doc.exists&&doc.data().overrideJson)setObsOverride(JSON.parse(doc.data().overrideJson));else setObsOverride({});
      if(doc.exists){setCaseGender(doc.data().gender||'');setCaseBirthday(doc.data().birthday||'');setCaseDate('');}
      recalcFromObs();
      window.showModePage();
    }).catch(function(e){console.log('載入失敗',e);setData(emptyData());setObsData({});setObsOverride({});recalcFromObs();window.showModePage();});
  }else{
    setCurrentCaseId(caseId);
    db.collection('users').doc(currentUser.uid).collection('cases').doc(caseId).get().then(function(doc){
      if(!doc.exists){alert('個案不存在');return;}
      var c=doc.data();
      setCurrentCaseName(c.name||'未命名');
      setCaseGender(c.gender||'');
      setCaseBirthday(c.birthday||'');
      setCaseDate(c.date||'');
      if(c.dataJson)setData(JSON.parse(c.dataJson));else setData(emptyData());
      if(c.obsJson)setObsData(JSON.parse(c.obsJson));else setObsData({});
      if(c.overrideJson)setObsOverride(JSON.parse(c.overrideJson));else setObsOverride({});
      recalcFromObs();
      window.showModePage();
    }).catch(function(e){console.log('載入個案失敗',e);alert('載入失敗');});
  }
}

export function showCaseForm(){
  _editingCaseId=null;
  document.getElementById('case-form-title').innerText='新增個案';
  document.querySelector('.case-form-save').innerText='建立';
  document.getElementById('cf-name').value='';
  document.getElementById('cf-gender').value='';
  document.getElementById('cf-birthday').value='';
  document.getElementById('cf-date').value=new Date().toISOString().substring(0,10);
  document.getElementById('cf-note').value='';
  document.getElementById('case-form-overlay').style.display='flex';
  setTimeout(function(){document.getElementById('cf-name').focus();},100);
}

export function editCase(caseId){
  _editingCaseId=caseId;
  document.getElementById('case-form-title').innerText='編輯個案';
  document.querySelector('.case-form-save').innerText='儲存';
  db.collection('users').doc(currentUser.uid).collection('cases').doc(caseId).get().then(function(doc){
    if(!doc.exists){alert('個案不存在');return;}
    var c=doc.data();
    document.getElementById('cf-name').value=c.name||'';
    document.getElementById('cf-gender').value=c.gender||'';
    document.getElementById('cf-birthday').value=c.birthday||'';
    document.getElementById('cf-date').value=c.date||'';
    document.getElementById('cf-note').value=c.note||'';
    document.getElementById('case-form-overlay').style.display='flex';
    setTimeout(function(){document.getElementById('cf-name').focus();},100);
  }).catch(function(e){
    console.log('載入個案失敗',e);
    alert('載入失敗');
  });
}

export function closeCaseForm(){
  document.getElementById('case-form-overlay').style.display='none';
}

export function saveCaseForm(){
  var name=document.getElementById('cf-name').value.trim();
  if(!name){document.getElementById('cf-name').focus();return;}
  var fields={
    name:name,
    gender:document.getElementById('cf-gender').value,
    birthday:document.getElementById('cf-birthday').value,
    date:document.getElementById('cf-date').value,
    note:document.getElementById('cf-note').value.trim(),
    updatedAt:new Date().toISOString()
  };
  var saveBtn=document.querySelector('.case-form-save');
  var origText=saveBtn.innerText;
  saveBtn.innerText=(_editingCaseId?'儲存':'建立')+'中...';saveBtn.disabled=true;

  var promise;
  if(_editingCaseId){
    promise=db.collection('users').doc(currentUser.uid).collection('cases').doc(_editingCaseId).set(fields,{merge:true});
  }else{
    fields.dataJson=JSON.stringify(emptyData());
    fields.obsJson='{}';
    fields.overrideJson='{}';
    fields.createdAt=new Date().toISOString();
    promise=db.collection('users').doc(currentUser.uid).collection('cases').add(fields);
  }

  promise.then(function(){
    closeCaseForm();
    saveBtn.innerText=origText;saveBtn.disabled=false;
    _editingCaseId=null;
    renderCaseList();
  }).catch(function(e){
    console.log('儲存失敗',e);
    alert('儲存失敗，請重試');
    saveBtn.innerText=origText;saveBtn.disabled=false;
  });
}

export function deleteCase(caseId,caseName){
  if(!confirm('確定要刪除「'+caseName+'」的所有紀錄嗎？此操作無法復原。'))return;
  db.collection('users').doc(currentUser.uid).collection('cases').doc(caseId).delete().then(function(){
    renderCaseList();
  }).catch(function(e){
    console.log('刪除失敗',e);
    alert('刪除失敗，請重試');
  });
}

export function doLogout(){
  if(!confirm('確定要登出嗎？'))return;
  auth.signOut().then(function(){
    setCurrentUser(null);
    setUserName('');
    setUserRole('student');
    document.getElementById('top-nav').style.display='none';
    ['app-body','report-overlay','knowledge-overlay','cond-page','sens-page','manual-page','manual-sens-page','case-page','mode-page'].forEach(function(id){
      var e=document.getElementById(id);if(e)e.style.display='none';
    });
    document.getElementById('entry-page').style.display='flex';
    var loginBtn=document.getElementById('google-login-btn');
    if(loginBtn){loginBtn.disabled=false;loginBtn.innerHTML='<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> 使用 Google 帳號登入';}
  }).catch(function(e){console.log('登出失敗',e);});
}

export function editName(){
  if(_isTA&&_currentCaseId){
    editCase(_currentCaseId);
    return;
  }
  document.getElementById('name-edit-input').value=userName;
  document.getElementById('profile-gender').value=_userGender||'';
  document.getElementById('profile-birthday').value=_userBirthday||'';
  document.getElementById('name-edit-overlay').style.display='flex';
  setTimeout(function(){document.getElementById('name-edit-input').focus();},100);
}

export function confirmEditName(){
  var n=document.getElementById('name-edit-input').value.trim();
  if(n){
    setUserName(n);
    document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  }
  setUserGender(document.getElementById('profile-gender').value);
  setUserBirthday(document.getElementById('profile-birthday').value);
  if(currentUser){
    db.collection('users').doc(currentUser.uid).set({
      displayName:userName,
      gender:_userGender,
      birthday:_userBirthday,
      updatedAt:new Date().toISOString()
    },{merge:true}).catch(function(e){console.log('個人資料儲存失敗',e);});
  }
  closeEditName();
  // 自動重新渲染當前頁面（讓流年等資料立即更新）
  var _activeItem=document.querySelector('.nav-dropdown-item.active');
  var _activeTab=_activeItem?_activeItem.id:'';
  if(_activeTab==='nav-report') window.showReport();
  else if(_activeTab==='nav-obs'){renderFaceMap();renderObsCenter();renderDimIndex();}
  else if(_activeTab==='nav-cond') window.cpRender();
  else if(_activeTab==='nav-know') window.showKnowledgePage();
  else if(_activeTab==='nav-sens') window.renderSensPage();
  else if(_activeTab==='nav-manual') window.renderManualPage();
}

export function closeEditName(){document.getElementById('name-edit-overlay').style.display='none';}

export function clearObsData(){
  if(!confirm('確定要清除所有觀察評分資料嗎？此操作無法復原。'))return;
  setData(emptyData());
  setObsData({});
  setObsOverride({});
  recalcFromObs();
  save();
  // re-render using window-bound functions
  var active=document.querySelector('.nav-tab.active');
  var tab=active?active.id:'';
  if(tab==='nav-obs'){renderFaceMap();renderObsCenter();renderDimIndex();}
  else if(tab==='nav-cond'){cpRender();}
  _showToast('觀察評分資料已清除');
}

export async function exportAllCases(){
  if(!currentUser){alert('請先登入');return;}
  var PARTS_LABELS=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  var DIM_NAMES=['形勢','經緯','方圓','曲直','收放','緩急','順逆','分合','真假','攻守','奇正','虛實','進退'];

  function buildExportFromData(name, gender, birthday, date, d){
    if(!d||!Array.isArray(d)||d.length!==13)return null;
    // 檢查是否有任何資料
    var hasAny=false;
    for(var ci=0;ci<13&&!hasAny;ci++){for(var cj=0;cj<9&&!hasAny;cj++){if(d[ci][cj])hasAny=true;}}
    if(!hasAny)return null;

    function cDim(i){
      var r=d[i],a=r.filter(function(v){return v==='A';}).length,b=r.filter(function(v){return v==='B';}).length;
      if(a+b===0)return null;
      return{a:a,b:b,coeff:Math.min(a,b)/Math.max(a,b),type:a>b?DIMS[i].aT:DIMS[i].bT};
    }
    function aCoeff(ids){
      var sumMin=0,sumMax=0;
      ids.forEach(function(i){var r=cDim(i);if(r){sumMin+=Math.min(r.a,r.b);sumMax+=Math.max(r.a,r.b);}});
      return sumMax>0?(sumMin/sumMax).toFixed(2):'0.00';
    }

    var matrix={};
    for(var di=0;di<13;di++){
      var dimResult=cDim(di);
      var parts={};
      for(var pi=0;pi<9;pi++){
        var v=d[di][pi];
        if(v){
          var tp=v==='A'?DIMS[di].aT:DIMS[di].bT;
          var ch=v==='A'?DIMS[di].a:DIMS[di].b;
          parts[PARTS_LABELS[pi]]=ch+'('+tp+')';
        }else{
          parts[PARTS_LABELS[pi]]=null;
        }
      }
      matrix[DIM_NAMES[di]]={
        parts:parts,
        coeff:dimResult?dimResult.coeff.toFixed(2):null,
        type:dimResult?dimResult.type:null,
        staticCount:dimResult?Math.min(dimResult.a,dimResult.b):0,
        dynamicCount:dimResult?Math.max(dimResult.a,dimResult.b):0
      };
    }

    return {
      name:name||'未命名',
      gender:gender||'',
      birthday:birthday||'',
      date:date||'',
      coefficients:{
        total:aCoeff([0,1,2,3,4,5,6,7,8,9,10,11,12]),
        innate:aCoeff([0,1,2,3,4,5]),
        luck:aCoeff([6,7,8]),
        acquired:aCoeff([9,10,11,12]),
        boss:aCoeff([0,1,2]),
        manager:aCoeff([3,4,5])
      },
      matrix:matrix,
      rawData:d
    };
  }

  function parseDataJson(jsonStr){
    if(!jsonStr)return null;
    try{
      var d=JSON.parse(jsonStr);
      if(d&&Array.isArray(d)&&d.length===13)return d;
    }catch(e){}
    return null;
  }

  function calcDataFromObs(obsJson, overrideJson){
    if(!obsJson)return null;
    var obs;
    try{obs=JSON.parse(obsJson);}catch(e){return null;}
    if(!obs||typeof obs!=='object'||Object.keys(obs).length===0)return null;

    var savedData=JSON.parse(JSON.stringify(data));
    var savedObs=JSON.parse(JSON.stringify(obsData));
    var savedOverride=JSON.parse(JSON.stringify(obsOverride));

    setObsData(obs);
    var ovr={};
    if(overrideJson){try{ovr=JSON.parse(overrideJson);}catch(e){}}
    setObsOverride(ovr);
    setData(emptyData());
    recalcFromObs();

    var result=JSON.parse(JSON.stringify(data));

    setData(savedData);
    setObsData(savedObs);
    setObsOverride(savedOverride);
    recalcFromObs();

    return result;
  }

  // 對一個案例 doc，收集所有可匯出的資料（可能 0~2 筆）
  function collectExports(docData, name, gender, birthday, date, caseId, isSelf){
    var exports=[];

    // 手動資料
    var manualD=parseDataJson(docData.manualDataJson);
    if(manualD){
      var ex=buildExportFromData(name,gender,birthday,date,manualD);
      if(ex){
        ex._dataSource='manual';
        if(isSelf){ex._source='self';}
        if(caseId){ex._caseId=caseId;}
        exports.push(ex);
      }
    }

    // 觀察資料：優先 dataJson，沒有再用 obsJson+recalc
    var obsD=parseDataJson(docData.dataJson);
    if(!obsD){
      obsD=calcDataFromObs(docData.obsJson, docData.overrideJson);
    }
    if(obsD){
      var ex2=buildExportFromData(name,gender,birthday,date,obsD);
      if(ex2){
        ex2._dataSource='obs';
        if(isSelf){ex2._source='self';}
        if(caseId){ex2._caseId=caseId;}
        exports.push(ex2);
      }
    }

    return exports;
  }

  try{
    var results=[];

    // 本人資料
    var selfDoc=await db.collection('users').doc(currentUser.uid).get();
    if(selfDoc.exists){
      var sd=selfDoc.data();
      var selfExports=collectExports(sd,userName,sd.gender,sd.birthday,'',null,true);
      selfExports.forEach(function(e){results.push(e);});
    }

    // 所有個案
    var snap=await db.collection('users').doc(currentUser.uid).collection('cases').orderBy('createdAt','desc').get();
    var docs=[];
    snap.forEach(function(doc){docs.push(doc);});
    for(var idx=0;idx<docs.length;idx++){
      var doc=docs[idx];
      var c=doc.data();
      var caseExports=collectExports(c,c.name,c.gender,c.birthday,c.date,doc.id,false);
      caseExports.forEach(function(e){results.push(e);});
    }

    if(results.length===0){alert('沒有可匯出的案例');return;}

    // 組裝總表
    var caseMap={};
    results.forEach(function(r){
      var key=r._caseId||'_self_';
      if(!caseMap[key])caseMap[key]={name:r.name,manual:null,obs:null};
      var dimCount=0;
      for(var dn in r.matrix){if(r.matrix[dn].type!==null)dimCount++;}
      var status=dimCount===13?'✅ 完整':'⚠️ '+dimCount+'/13 維度';
      if(r._dataSource==='manual')caseMap[key].manual=status;
      else caseMap[key].obs=status;
    });
    var summaryLines=['| 案例 | 手動 | 觀察 |','|------|------|------|'];
    for(var sk in caseMap){
      var s=caseMap[sk];
      summaryLines.push('| '+s.name+' | '+(s.manual||'—')+' | '+(s.obs||'—')+' |');
    }

    var exportData={
      exportedAt:new Date().toISOString(),
      exportedBy:userName,
      totalCases:results.length,
      summary:summaryLines.join('\n'),
      instruction:'收到此檔案時，請先顯示上方 summary 的案例總表，等使用者指定要分析哪個案例、用手動還是觀察資料，再開始分析。',
      note:'同一案例可能有兩筆（manual=手動輸入, obs=觀察題），以 _dataSource 區分',
      cases:results
    };

    var blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;
    a.download='人相兵法_案例匯出_'+new Date().toISOString().substring(0,10)+'.json';
    a.click();
    URL.revokeObjectURL(url);

    // 統計
    var manualCount=results.filter(function(r){return r._dataSource==='manual';}).length;
    var obsCount=results.filter(function(r){return r._dataSource==='obs';}).length;
    alert('已匯出 '+results.length+' 筆資料（手動 '+manualCount+' 筆，觀察 '+obsCount+' 筆）');
  }catch(e){
    console.error('匯出失敗',e);
    alert('匯出失敗：'+e.message);
  }
}
