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
let _groupOrder = []; // 從 Firestore 讀取的組別排序

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
    if(selfDoc.exists&&Array.isArray(selfDoc.data().groupOrder)){
      _groupOrder=selfDoc.data().groupOrder;
    }else{
      _groupOrder=[];
    }

    // 更新 datalist
    var dl=document.getElementById('cf-group-list');

    db.collection('users').doc(currentUser.uid).collection('cases').orderBy('createdAt','desc').get().then(function(snap){
      var grouped={};
      var allGroups=new Set();
      snap.forEach(function(doc){
        var c=doc.data();
        var g=c.group||'';
        if(!grouped[g])grouped[g]=[];
        grouped[g].push({id:doc.id, data:c});
        if(g)allGroups.add(g);
      });

      if(dl){
        dl.innerHTML='';
        _groupOrder.forEach(function(g){
          if(g){var opt=document.createElement('option');opt.value=g;dl.appendChild(opt);}
        });
        allGroups.forEach(function(g){
          if(_groupOrder.indexOf(g)<0){
            var opt=document.createElement('option');opt.value=g;dl.appendChild(opt);
          }
        });
      }

      // 組別順序
      var orderedGroups=[];
      _groupOrder.forEach(function(g){
        if(grouped[g])orderedGroups.push(g);
      });
      allGroups.forEach(function(g){
        if(_groupOrder.indexOf(g)<0 && grouped[g])orderedGroups.push(g);
      });
      // 未分組放最後
      var allSections=orderedGroups.slice();
      if(grouped['']&&grouped[''].length>0) allSections.push('');

      // 建立各組 HTML
      var sectionHtmls=[];
      for(var si=0;si<allSections.length;si++){
        var gName=allSections[si];
        var cases=grouped[gName];
        var isUngrouped=(gName==='');
        // 計算在有名組中的索引位置（用於上移下移）
        var namedIdx=isUngrouped?-1:orderedGroups.indexOf(gName);
        var namedLen=orderedGroups.length;

        var s='<div class="case-group-section">';
        s+='<div class="case-group-header">';
        if(isUngrouped){
          s+='<div class="case-group-title ungrouped">未分組<span class="case-group-count">（'+cases.length+'）</span></div>';
        }else{
          s+='<div class="case-group-title">'+_escHtml(gName)+'<span class="case-group-count">（'+cases.length+'）</span></div>';
          s+='<button class="case-group-move" onclick="event.stopPropagation();moveGroup(\''+_escHtml(gName).replace(/'/g,"\\'")+'\',\'up\')" title="上移"'+(namedIdx===0?' disabled':'')+'>▲</button>';
          s+='<button class="case-group-move" onclick="event.stopPropagation();moveGroup(\''+_escHtml(gName).replace(/'/g,"\\'")+'\',\'down\')" title="下移"'+(namedIdx===namedLen-1?' disabled':'')+'>▼</button>';
        }
        s+='</div><div class="case-group-body">';
        cases.forEach(function(item){
          s+=_buildCaseRowHtml(item.id, item.data);
        });
        s+='</div></div>';
        sectionHtmls.push({html:s, count:cases.length});
      }

      // Waterfall 分配到 4 欄（找最短欄放入）
      var NUM_COLS=4;
      var cols=[];
      var colHeights=[];
      for(var ci=0;ci<NUM_COLS;ci++){cols.push([]);colHeights.push(0);}
      for(var si2=0;si2<sectionHtmls.length;si2++){
        // 找最短的欄
        var minH=colHeights[0], minIdx=0;
        for(var ci2=1;ci2<NUM_COLS;ci2++){
          if(colHeights[ci2]<minH){minH=colHeights[ci2];minIdx=ci2;}
        }
        cols[minIdx].push(sectionHtmls[si2].html);
        // 用案例數量當高度估算（標題+每行）
        colHeights[minIdx]+=sectionHtmls[si2].count+2;
      }

      // 組裝 HTML
      var html='';
      // 本人行
      html+='<div class="case-self-bar" onclick="loadCase(null)">'+userName+' <span style="font-size:12px;color:var(--static)">（本人）</span></div>';
      // 四欄 waterfall
      html+='<div class="case-waterfall">';
      for(var ci3=0;ci3<NUM_COLS;ci3++){
        html+='<div class="case-waterfall-col">'+cols[ci3].join('')+'</div>';
      }
      html+='</div>';

      listEl.innerHTML=html;
    }).catch(function(e){
      console.log('載入案例失敗',e);
      listEl.innerHTML='<div style="color:#c03830;padding:12px">載入個案清單失敗</div>';
    });
  });
}

function _buildCaseRowHtml(docId, c){
  var html='<div class="case-row" onclick="loadCase(\''+docId+'\')">';
  html+='<div class="case-row-name">'+(c.name||'未命名')+'</div>';
  html+='<div class="case-row-gender">'+(c.gender||'')+'</div>';
  html+='<div class="case-row-actions">';
  html+='<button onclick="event.stopPropagation();exportSingleCase(\''+docId+'\')" title="匯出">⬇</button>';
  html+='<button onclick="event.stopPropagation();editCase(\''+docId+'\')" title="編輯">✎</button>';
  html+='<button class="case-btn-del" onclick="event.stopPropagation();deleteCase(\''+docId+'\',\''+_escHtml(c.name||'')+'\')" title="刪除">✕</button>';
  html+='</div></div>';
  return html;
}

export function moveGroup(groupName, direction){
  var idx=_groupOrder.indexOf(groupName);
  if(idx<0){
    _groupOrder.push(groupName);
    idx=_groupOrder.length-1;
  }
  var newIdx=direction==='up'?idx-1:idx+1;
  if(newIdx<0||newIdx>=_groupOrder.length)return;
  var tmp=_groupOrder[newIdx];
  _groupOrder[newIdx]=_groupOrder[idx];
  _groupOrder[idx]=tmp;
  db.collection('users').doc(currentUser.uid).set({groupOrder:_groupOrder},{merge:true}).then(function(){
    renderCaseList();
  }).catch(function(e){
    console.log('排序儲存失敗',e);
    renderCaseList();
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
  document.getElementById('cf-group').value='';
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
    document.getElementById('cf-group').value=c.group||'';
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
    group:document.getElementById('cf-group').value.trim(),
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
    var newGroup=fields.group;
    if(newGroup && _groupOrder.indexOf(newGroup)<0){
      _groupOrder.push(newGroup);
      db.collection('users').doc(currentUser.uid).set({groupOrder:_groupOrder},{merge:true}).catch(function(e){console.log('groupOrder更新失敗',e);});
    }
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
  // 老師模式：清除 localStorage 的密碼驗證紀錄
  if(window.isTeacherMode){
    localStorage.removeItem('teacher_verified_pwd');
    location.reload();
    return;
  }
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

var _PARTS_LABELS=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
var _DIM_NAMES_EX=['形勢','經緯','方圓','曲直','收放','緩急','順逆','分合','真假','攻守','奇正','虛實','進退'];

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
        parts[_PARTS_LABELS[pi]]=ch+'('+tp+')';
      }else{
        parts[_PARTS_LABELS[pi]]=null;
      }
    }
    matrix[_DIM_NAMES_EX[di]]={
      parts:parts,
      coeff:dimResult?dimResult.coeff.toFixed(2):null,
      type:dimResult?dimResult.type:null,
      staticCount:dimResult?(DIMS[di].aT==='靜'?dimResult.a:dimResult.b):0,
      dynamicCount:dimResult?(DIMS[di].aT==='靜'?dimResult.b:dimResult.a):0
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
// v3.11：obs 那筆帶 _obsJson 和 _overrideJson 原始字串，給匯入時完整還原
function collectExports(docData, name, gender, birthday, date, caseId, isSelf){
  var exports=[];

  // 手動資料
  var manualD=parseDataJson(docData.manualDataJson);
  if(manualD){
    var ex=buildExportFromData(name,gender,birthday,date,manualD);
    if(ex){
      ex._dataSource='manual';
      ex._manualDataJson=docData.manualDataJson||null;
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
      ex2._dataJson=docData.dataJson||null;
      ex2._obsJson=docData.obsJson||null;
      ex2._overrideJson=docData.overrideJson||null;
      if(isSelf){ex2._source='self';}
      if(caseId){ex2._caseId=caseId;}
      exports.push(ex2);
    }
  }

  return exports;
}

export async function exportAllCases(){
  if(!currentUser){alert('請先登入');return;}

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
      formatVersion:'v3.11',
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

export async function exportSingleCase(caseId){
  if(!currentUser){alert('請先登入');return;}

  try{
    var doc=await db.collection('users').doc(currentUser.uid).collection('cases').doc(caseId).get();
    if(!doc.exists){alert('個案不存在');return;}
    var c=doc.data();
    var results=collectExports(c, c.name, c.gender, c.birthday, c.date, caseId, false);

    if(results.length===0){alert('此案例無可匯出的資料');return;}

    var exportData={
      exportedAt:new Date().toISOString(),
      exportedBy:userName,
      totalCases:results.length,
      instruction:'此檔案包含單一案例的評分資料，請直接開始分析。同一案例可能有兩筆（manual=手動輸入, obs=觀察題），以 _dataSource 區分。',
      formatVersion:'v3.11',
      cases:results
    };

    var blob=new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;
    a.download=(c.name||'案例')+'_匯出_'+new Date().toISOString().substring(0,10)+'.json';
    a.click();
    URL.revokeObjectURL(url);

    var manualCount=results.filter(function(r){return r._dataSource==='manual';}).length;
    var obsCount=results.filter(function(r){return r._dataSource==='obs';}).length;
    _showToast('已匯出 '+(c.name||'案例')+' （手動 '+manualCount+' 筆，觀察 '+obsCount+' 筆）');
  }catch(e){
    console.error('匯出失敗',e);
    alert('匯出失敗：'+e.message);
  }
}

/* ===== 匯入功能（v3.11） ===== */

// 同名衝突解決方式（每次匯入時清空，由使用者決定）
let _conflictMode = null; // 'skip' | 'overwrite' | 'new' | 'ask'
let _conflictApplyAll = false;

// 由 case-page 上的「匯入」按鈕觸發
export function triggerCaseImport(){
  if(!currentUser){alert('請先登入');return;}
  var input=document.createElement('input');
  input.type='file';
  input.accept='application/json,.json';
  input.onchange=function(e){
    var file=e.target.files[0];
    if(!file)return;
    var reader=new FileReader();
    reader.onload=async function(ev){
      try{
        var json=JSON.parse(ev.target.result);
        await _doImport(json);
      }catch(err){
        console.error('匯入失敗',err);
        alert('匯入失敗：'+err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

async function _doImport(json){
  // 1. 格式版本檢查（v3.11：只吃新格式）
  if(!json || !json.formatVersion || json.formatVersion!=='v3.11'){
    alert('檔案格式不符。\n\n本系統 v3.11 起只支援新版匯出格式，請至 production 重新匯出最新格式的 JSON 後再匯入。\n\n（舊格式不再支援）');
    return;
  }
  if(!Array.isArray(json.cases) || json.cases.length===0){
    alert('檔案中沒有案例資料');
    return;
  }

  // 2. 偵測本人資料
  var hasSelf = json.cases.some(function(r){return r._source==='self';});
  if(hasSelf){
    var ok = confirm('即將覆蓋你在此環境的本人資料。\n\n覆蓋後原本的兵法填寫狀態會消失，無法復原。\n\n確定要繼續嗎？');
    if(!ok){
      // 從 cases 裡濾掉本人資料，只匯案例
      json.cases = json.cases.filter(function(r){return r._source!=='self';});
      if(json.cases.length===0){alert('已取消匯入');return;}
    }
  }

  // 3. 讀取既有案例的 name 集合，準備衝突偵測
  var existingNames={};
  var snap=await db.collection('users').doc(currentUser.uid).collection('cases').get();
  snap.forEach(function(doc){
    var c=doc.data();
    if(c.name){
      if(!existingNames[c.name])existingNames[c.name]=[];
      existingNames[c.name].push({id:doc.id,data:c});
    }
  });

  // 4. 重置衝突解決狀態
  _conflictMode=null;
  _conflictApplyAll=false;

  // 5. 案例分組：以 _caseId 把 manual + obs 兩筆合併成一個 case 寫入計畫
  var plans={}; // key=_caseId or '_self_', value={name,gender,birthday,date,manualDataJson,dataJson,obsJson,overrideJson,isSelf}
  json.cases.forEach(function(r){
    var key=r._source==='self' ? '_self_' : (r._caseId||('_anon_'+Math.random()));
    if(!plans[key]){
      plans[key]={
        name:r.name||'未命名',
        gender:r.gender||'',
        birthday:r.birthday||'',
        date:r.date||'',
        manualDataJson:null,
        dataJson:null,
        obsJson:null,
        overrideJson:null,
        isSelf:r._source==='self'
      };
    }
    var p=plans[key];
    if(r._dataSource==='manual'){
      p.manualDataJson = r._manualDataJson || JSON.stringify(r.rawData);
    }else if(r._dataSource==='obs'){
      if(r._dataJson) p.dataJson = r._dataJson;
      else if(r.rawData) p.dataJson = JSON.stringify(r.rawData);
      if(r._obsJson) p.obsJson = r._obsJson;
      if(r._overrideJson) p.overrideJson = r._overrideJson;
    }
  });

  // 6. 逐一處理寫入
  var stats={imported:0, skipped:0, overwritten:0, newCreated:0, selfOverwritten:0};
  var planKeys=Object.keys(plans);
  for(var i=0;i<planKeys.length;i++){
    var k=planKeys[i];
    var plan=plans[k];

    if(plan.isSelf){
      // 本人資料：直接覆蓋 users/{uid}
      try{
        var selfPayload={updatedAt:new Date().toISOString()};
        if(plan.gender) selfPayload.gender=plan.gender;
        if(plan.birthday) selfPayload.birthday=plan.birthday;
        if(plan.manualDataJson) selfPayload.manualDataJson=plan.manualDataJson;
        if(plan.dataJson) selfPayload.dataJson=plan.dataJson;
        if(plan.obsJson) selfPayload.obsJson=plan.obsJson;
        if(plan.overrideJson) selfPayload.overrideJson=plan.overrideJson;
        await db.collection('users').doc(currentUser.uid).set(selfPayload,{merge:true});
        stats.selfOverwritten++;
      }catch(e){
        console.error('本人資料覆蓋失敗',e);
      }
      continue;
    }

    // 案例：檢查同名衝突
    var conflicts = existingNames[plan.name]||[];
    var resolution = 'new'; // 預設新建

    if(conflicts.length>0){
      if(_conflictApplyAll && _conflictMode){
        resolution = _conflictMode;
      }else{
        var choice = await _askConflict(plan.name);
        if(choice==='cancel'){
          stats.skipped += (planKeys.length - i);
          break;
        }
        resolution = choice.mode;
        if(choice.applyAll){
          _conflictApplyAll = true;
          _conflictMode = choice.mode;
        }
      }
    }

    if(resolution==='skip'){
      stats.skipped++;
      continue;
    }

    var docPayload={
      name:plan.name,
      gender:plan.gender,
      birthday:plan.birthday,
      date:plan.date,
      updatedAt:new Date().toISOString()
    };
    if(plan.manualDataJson) docPayload.manualDataJson=plan.manualDataJson;
    if(plan.dataJson) docPayload.dataJson=plan.dataJson;
    if(plan.obsJson) docPayload.obsJson=plan.obsJson;
    if(plan.overrideJson) docPayload.overrideJson=plan.overrideJson;

    try{
      if(resolution==='overwrite' && conflicts.length>0){
        // 覆蓋第一筆同名 doc
        var targetId = conflicts[0].id;
        await db.collection('users').doc(currentUser.uid).collection('cases').doc(targetId).set(docPayload,{merge:true});
        stats.overwritten++;
      }else{
        // 新建
        docPayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection('users').doc(currentUser.uid).collection('cases').add(docPayload);
        stats.newCreated++;
      }
      stats.imported++;
    }catch(e){
      console.error('寫入失敗',e);
    }
  }

  // 7. 顯示結果
  var msg='匯入完成：\n';
  msg+='・新建案例：'+stats.newCreated+' 筆\n';
  msg+='・覆蓋既有：'+stats.overwritten+' 筆\n';
  msg+='・跳過：'+stats.skipped+' 筆\n';
  if(stats.selfOverwritten>0) msg+='・本人資料：已覆蓋\n';
  alert(msg);

  // 8. 重新整理列表
  renderCaseList();
}

// 同名衝突確認 dialog（returns Promise<{mode, applyAll} | 'cancel'>）
function _askConflict(name){
  return new Promise(function(resolve){
    var html='';
    html+='<div id="case-import-conflict-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center">';
    html+='<div style="background:white;border-radius:10px;padding:24px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2)">';
    html+='<h3 style="margin:0 0 12px;font-size:17px">案例「'+_escHtml(name)+'」已存在</h3>';
    html+='<p style="margin:0 0 16px;font-size:14px;color:#555">請選擇處理方式：</p>';
    html+='<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">';
    html+='<button data-mode="skip" style="padding:10px 16px;border:1px solid #ddd;background:#f9f9f9;border-radius:6px;text-align:left;cursor:pointer;font-size:14px"><b>跳過</b><br><span style="font-size:12px;color:#888">保留既有，不匯入這筆</span></button>';
    html+='<button data-mode="overwrite" style="padding:10px 16px;border:1px solid #ddd;background:#f9f9f9;border-radius:6px;text-align:left;cursor:pointer;font-size:14px"><b>覆蓋</b><br><span style="font-size:12px;color:#888">用匯入版蓋掉既有版（不可復原）</span></button>';
    html+='<button data-mode="new" style="padding:10px 16px;border:1px solid #ddd;background:#f9f9f9;border-radius:6px;text-align:left;cursor:pointer;font-size:14px"><b>新建</b><br><span style="font-size:12px;color:#888">產生第二筆同名案例</span></button>';
    html+='</div>';
    html+='<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:#666;margin-bottom:16px"><input type="checkbox" id="case-import-apply-all"> 對之後同名衝突套用相同決定</label>';
    html+='<div style="text-align:right"><button data-mode="cancel" style="padding:8px 16px;background:#fff;border:1px solid #ddd;border-radius:6px;cursor:pointer;color:#666">取消整批匯入</button></div>';
    html+='</div></div>';

    var div=document.createElement('div');
    div.innerHTML=html;
    document.body.appendChild(div.firstChild);
    var modal=document.getElementById('case-import-conflict-modal');

    modal.querySelectorAll('button[data-mode]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var mode=btn.getAttribute('data-mode');
        var applyAll=document.getElementById('case-import-apply-all').checked;
        document.body.removeChild(modal);
        if(mode==='cancel') resolve('cancel');
        else resolve({mode:mode, applyAll:applyAll});
      });
    });
  });
}
