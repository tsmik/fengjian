/* case_mgmt.js — 案例管理模組 */
import { userName, setUserName, _isTA, _currentCaseId, setCurrentCaseId, _currentCaseName, setCurrentCaseName,
         _userGender, setUserGender, _userBirthday, setUserBirthday,
         _caseGender, setCaseGender, _caseBirthday, setCaseBirthday, _caseDate, setCaseDate,
         data, setData, obsData, setObsData, obsOverride, setObsOverride, condResults,
         emptyData, setNavActive, showPage, _showToast, _escHtml, _getUserDocRef, save } from './core.js';
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
  renderCaseList();
}

export function renderCaseList(){
  var listEl=document.getElementById('case-list');
  if(!listEl)return;
  listEl.innerHTML='<div style="color:#aaa;padding:20px;text-align:center">載入中...</div>';

  db.collection('users').doc(userName).get().then(function(selfDoc){
    var selfUpdated=selfDoc.exists&&selfDoc.data().updatedAt?selfDoc.data().updatedAt:'';
    var html='';

    html+='<div class="case-card is-self" onclick="loadCase(null)">';
    html+='<div class="case-card-name">'+userName+' <span style="font-size:12px;color:var(--static);font-weight:500">（本人）</span></div>';
    if(selfUpdated) html+='<div class="case-card-date">更新：'+selfUpdated.substring(0,10)+'</div>';
    html+='</div>';

    db.collection('users').doc(userName).collection('cases').orderBy('createdAt','desc').get().then(function(snap){
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
    db.collection('users').doc(userName).get().then(function(doc){
      if(doc.exists&&doc.data().dataJson)setData(JSON.parse(doc.data().dataJson));else setData(emptyData());
      if(doc.exists&&doc.data().obsJson)setObsData(JSON.parse(doc.data().obsJson));else setObsData({});
      if(doc.exists&&doc.data().overrideJson)setObsOverride(JSON.parse(doc.data().overrideJson));else setObsOverride({});
      if(doc.exists){setCaseGender(doc.data().gender||'');setCaseBirthday(doc.data().birthday||'');setCaseDate('');}
      recalcFromObs();
      window.showModePage();
    }).catch(function(e){console.log('載入失敗',e);setData(emptyData());setObsData({});setObsOverride({});recalcFromObs();window.showModePage();});
  }else{
    setCurrentCaseId(caseId);
    db.collection('users').doc(userName).collection('cases').doc(caseId).get().then(function(doc){
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
  db.collection('users').doc(userName).collection('cases').doc(caseId).get().then(function(doc){
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
    promise=db.collection('users').doc(userName).collection('cases').doc(_editingCaseId).set(fields,{merge:true});
  }else{
    fields.dataJson=JSON.stringify(emptyData());
    fields.obsJson='{}';
    fields.overrideJson='{}';
    fields.createdAt=new Date().toISOString();
    promise=db.collection('users').doc(userName).collection('cases').add(fields);
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
  db.collection('users').doc(userName).collection('cases').doc(caseId).delete().then(function(){
    renderCaseList();
  }).catch(function(e){
    console.log('刪除失敗',e);
    alert('刪除失敗，請重試');
  });
}

export function doLogout(){
  if(!confirm('確定要登出嗎？'))return;
  document.getElementById('top-nav').style.display='none';
  ['app-body','report-overlay','knowledge-overlay','cond-page','sens-page','manual-page','manual-sens-page','case-page','mode-page'].forEach(function(id){
    var e=document.getElementById(id);if(e)e.style.display='none';
  });
  document.getElementById('entry-page').style.display='flex';
  document.getElementById('entry-name').value='';
  document.getElementById('entry-name').focus();
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
    localStorage.setItem('rxbf_username',userName);
    document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  }
  setUserGender(document.getElementById('profile-gender').value);
  setUserBirthday(document.getElementById('profile-birthday').value);
  db.collection('users').doc(userName).set({
    gender:_userGender,
    birthday:_userBirthday,
    updatedAt:new Date().toISOString()
  },{merge:true}).catch(function(e){console.log('個人資料儲存失敗',e);});
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
