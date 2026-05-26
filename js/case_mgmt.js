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
import { _getLiunianInfo, getLiunianInfoFor, buildLiunianTitleHtml, buildLiunianTableHtml, calcXuSui } from './report.js';

/* module-local state */
let _editingCaseId = null;
let _editingSelf = false;  // 視窗是否在編輯「本人」
let _cfOpenSnapshot = '';  // 視窗開啟時的欄位快照（判斷是否有未儲存變更）
let _groupDescs = {};      // 分組說明 {分組名: 說明}
let _cfColor = '';         // 視窗目前選的卡片顏色
let _gmRows = [];          // 管理分組視窗的工作列 [{orig,name,desc}]

// 卡片色卡（預設米色 + 人相兵法報告 13 維度顏色）
const CARD_DEFAULT_COLOR = '#D9CBA8';
const CARD_COLORS = ['#D9CBA8','#5E8080','#6E9292','#7EA4A4','#527070','#608282','#6E9494','#9E8A5A','#B29E6E','#C6B282','#7A5A50','#8E6C62','#A27E74','#B69088'];
// 把色卡顏色淡化成卡片底色（保持深字可讀）
function _cardTint(hex){
  hex=hex||CARD_DEFAULT_COLOR;
  if(hex.charAt(0)!=='#'||hex.length<7)return '#ffffff';
  var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  if(isNaN(r)||isNaN(g)||isNaN(b))return '#ffffff';
  var f=0.40;
  r=Math.round(r*f+255*(1-f));g=Math.round(g*f+255*(1-f));b=Math.round(b*f+255*(1-f));
  return 'rgb('+r+','+g+','+b+')';
}
let _groupOrder = []; // 從 Firestore 讀取的組別排序
let _selfCache = null;   // 本人資料快取 {name,gender,birthday}
let _casesCache = [];    // 個案快取 [{id,data}]
let _caseSearchTerm = ''; // 名片搜尋字串

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
    var sd=selfDoc.exists?selfDoc.data():{};
    _selfCache={
      name:(sd.displayName||userName||'我自己'),
      gender:(sd.gender||_userGender||''),
      birthday:(sd.birthday||_userBirthday||''),
      color:(sd.cardColor||'')
    };
    if(Array.isArray(sd.groupOrder)){_groupOrder=sd.groupOrder;}else{_groupOrder=[];}
    _groupDescs=(sd.groupDescs&&typeof sd.groupDescs==='object')?sd.groupDescs:{};

    db.collection('users').doc(currentUser.uid).collection('cases').orderBy('createdAt','desc').get().then(function(snap){
      _casesCache=[];
      snap.forEach(function(doc){_casesCache.push({id:doc.id, data:doc.data()});});

      // 更新組別 datalist
      var dl=document.getElementById('cf-group-list');
      if(dl){
        dl.innerHTML='';
        var seen={};
        _groupOrder.forEach(function(g){if(g&&!seen[g]){seen[g]=1;var o=document.createElement('option');o.value=g;dl.appendChild(o);}});
        _casesCache.forEach(function(it){var g=it.data.group||'';if(g&&!seen[g]){seen[g]=1;var o=document.createElement('option');o.value=g;dl.appendChild(o);}});
      }

      _paintCasePage();
    }).catch(function(e){
      console.log('載入案例失敗',e);
      listEl.innerHTML='<div style="color:#c03830;padding:12px">載入個案清單失敗</div>';
    });
  });
}

// 依目前快取 + 搜尋字 繪製：左本人卡 + 右名片格
function _paintCasePage(){
  var listEl=document.getElementById('case-list');
  if(!listEl)return;
  var term=(_caseSearchTerm||'').trim().toLowerCase();

  var grouped={};
  var allGroups=new Set();
  _casesCache.forEach(function(it){
    if(term && (it.data.name||'').toLowerCase().indexOf(term)<0) return;
    var g=it.data.group||'';
    if(!grouped[g])grouped[g]=[];
    grouped[g].push(it);
    if(g)allGroups.add(g);
  });

  var orderedGroups=[];
  _groupOrder.forEach(function(g){if(grouped[g])orderedGroups.push(g);});
  allGroups.forEach(function(g){if(_groupOrder.indexOf(g)<0 && grouped[g])orderedGroups.push(g);});
  var allSections=orderedGroups.slice();
  if(grouped['']&&grouped[''].length>0)allSections.push('');
  var namedLen=orderedGroups.length;

  var gridHtml='';
  if(allSections.length===0){
    gridHtml='<div style="color:var(--text-3);padding:30px 6px;font-size:14px">'+
      (term?('找不到符合「'+_escHtml(_caseSearchTerm)+'」的個案'):'還沒有個案，點右上「＋ 新增個案」建立第一張名片。')+'</div>';
  }
  for(var si=0;si<allSections.length;si++){
    var gName=allSections[si];
    var cases=grouped[gName];
    var isUngrouped=(gName==='');
    var namedIdx=isUngrouped?-1:orderedGroups.indexOf(gName);
    gridHtml+='<div class="cm-section"><div class="case-group-header">';
    if(isUngrouped){
      gridHtml+='<div class="case-group-title ungrouped">未分組<span class="case-group-count">（'+cases.length+'）</span></div>';
    }else{
      var gEsc=_escHtml(gName).replace(/'/g,"\\'");
      var gDesc=_groupDescs[gName]||'';
      gridHtml+='<div class="case-group-title">'+_escHtml(gName)+'<span class="case-group-count">（'+cases.length+'）</span>'+(gDesc?'<span class="case-group-desc">'+_escHtml(gDesc)+'</span>':'')+'</div>';
      gridHtml+='<button class="case-group-move" onclick="event.stopPropagation();moveGroup(\''+gEsc+'\',\'up\')" title="上移"'+(namedIdx===0?' disabled':'')+'>▲</button>';
      gridHtml+='<button class="case-group-move" onclick="event.stopPropagation();moveGroup(\''+gEsc+'\',\'down\')" title="下移"'+(namedIdx===namedLen-1?' disabled':'')+'>▼</button>';
    }
    gridHtml+='</div><div class="case-grid">';
    cases.forEach(function(item){gridHtml+=_buildNamecardHtml(item.id, item.data);});
    gridHtml+='</div></div>';
  }

  listEl.innerHTML='<div class="case-layout">'+
    '<div class="case-self-col">'+_buildSelfPanelHtml()+'</div>'+
    '<div class="case-cards-col">'+gridHtml+'</div></div>';
}

function _calcAgeText(birthday){
  if(!birthday)return '';
  var b=new Date(birthday);
  if(isNaN(b.getTime()))return '';
  var now=new Date();
  var a=now.getFullYear()-b.getFullYear();
  var m=now.getMonth()-b.getMonth();
  if(m<0||(m===0&&now.getDate()<b.getDate()))a--;
  if(a<0||a>150)return '';
  return a+' 歲';
}

function _buildSelfPanelHtml(){
  var s=_selfCache||{};
  var active=!_currentCaseId;
  var info=getLiunianInfoFor(s.gender, s.birthday, null);
  var ageText=info?('虛歲 '+info.xusui):_calcAgeText(s.birthday);
  var bg=_cardTint(s.color||CARD_DEFAULT_COLOR);
  var h='<div class="case-self-card'+(active?' is-active':'')+'" style="background:'+bg+'" onclick="editSelf()">';
  h+='<div class="case-self-top"><div class="case-self-label">我的名片 · 本人</div>'+
     (active?'<span class="case-active-badge">● 分析中</span>':'<span class="case-switch-hint">點開資料 ▸</span>')+'</div>';
  h+='<div class="case-self-name">'+_escHtml(s.name||'我自己')+'</div>';
  h+='<div class="case-self-meta">';
  if(s.gender)h+='<span>'+s.gender+'</span>';
  if(s.birthday)h+='<span>'+s.birthday+'</span>';
  if(ageText)h+='<span>'+ageText+'</span>';
  if(!s.gender&&!s.birthday)h+='<span class="case-self-dim">尚未填寫性別/生日</span>';
  h+='</div>';
  if(info){
    h+='<div class="case-self-liunian"><div style="font-size:13px;color:var(--text-3);margin-bottom:8px">流年參考'+buildLiunianTitleHtml(info)+'</div>'+buildLiunianTableHtml(info)+'</div>';
  }else{
    h+='<div class="case-self-liunian case-self-dim" style="font-size:13px">填好性別與生日後，這裡會顯示流年。</div>';
  }
  h+='</div>';
  return h;
}

function _buildNamecardHtml(docId, c){
  var active=(_currentCaseId===docId);
  var info=getLiunianInfoFor(c.gender, c.birthday, c.date||null);
  var ageText=info?('虛歲 '+info.xusui):_calcAgeText(c.birthday);
  var note=(c.note||'').trim();
  var h='<div class="case-card'+(active?' is-active':'')+'" style="background:'+_cardTint(c.color||CARD_DEFAULT_COLOR)+'" onclick="editCase(\''+docId+'\')">';
  if(active)h+='<span class="case-active-dot" title="分析中"></span>';
  h+='<div class="case-card-name">'+_escHtml(c.name||'未命名')+'</div>';
  h+='<div class="case-card-age">'+(ageText||'—')+'</div>';
  h+='<div class="case-card-note">'+(note?_escHtml(note):'<span class="case-note-empty">（無備註）</span>')+'</div>';
  h+='</div>';
  return h;
}

// 名片搜尋（oninput）
export function caseSearch(v){ _caseSearchTerm=v||''; _paintCasePage(); }

if(typeof window!=='undefined'){
  window.caseSearch=caseSearch;
  window.editSelf=editSelf;
  window.cfOpen=cfOpen;
  window.cfDelete=cfDelete;
  window.cfRenderLiunian=cfRenderLiunian;
  window.cfTryClose=cfTryClose;
  window.cfPickColor=cfPickColor;
  window.showGroupMgr=showGroupMgr;
  window.closeGroupMgr=closeGroupMgr;
  window.gmAdd=gmAdd;
  window.gmMove=gmMove;
  window.gmDel=gmDel;
  window.gmSave=gmSave;
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
    // v1.7 階段 A：強制 server 拿，避免 cache stale
    db.collection('users').doc(currentUser.uid).get({source:'server'}).then(function(doc){
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

// 依模式調整視窗：標題/儲存字/欄位顯示/刪除打開鈕
function _cfApplyMode(mode){ // 'new' | 'case' | 'self'
  var sv=document.querySelector('.case-form-save'); if(sv)sv.innerText = (mode==='new')?'建立':'儲存';
  var isSelf=(mode==='self');
  ['cf-row-date','cf-row-group','cf-row-note'].forEach(function(id){var el=document.getElementById(id);if(el)el.style.display=isSelf?'none':'';});
  var del=document.getElementById('cf-delete-btn'); if(del)del.style.display=(mode==='case')?'':'none';
  var op=document.getElementById('cf-open-btn'); if(op)op.style.display=(mode==='new')?'none':'';
}

// 視窗內即時流年（改性別/生日/觀察日 時重算）
export function cfRenderLiunian(){
  var box=document.getElementById('cf-liunian'); if(!box)return;
  var gender=document.getElementById('cf-gender').value;
  var birthday=document.getElementById('cf-birthday').value;
  var dateEl=document.getElementById('cf-date');
  var refDate=(_editingSelf||!dateEl)?null:(dateEl.value||null);
  var info=getLiunianInfoFor(gender,birthday,refDate);
  if(!info){box.style.display='none';box.innerHTML='';return;}
  box.style.display='';
  box.innerHTML='<div style="font-size:13px;color:var(--text-3);margin-bottom:8px">流年參考'+buildLiunianTitleHtml(info)+'</div>'+buildLiunianTableHtml(info);
}

// 色卡：渲染色票 + 選色（本人/個案視窗共用）
function _cfRenderColors(){
  var box=document.getElementById('cf-colors'); if(!box)return;
  box.innerHTML=CARD_COLORS.map(function(hex){
    var sel=(hex.toLowerCase()===(_cfColor||'').toLowerCase())?' selected':'';
    return '<button type="button" class="cf-swatch'+sel+'" style="background:'+hex+'" onclick="cfPickColor(\''+hex+'\')"></button>';
  }).join('');
}
export function cfPickColor(hex){ _cfColor=hex; _cfRenderColors(); }

export function showCaseForm(){
  _editingCaseId=null;_editingSelf=false;
  document.getElementById('cf-name').value='';
  document.getElementById('cf-gender').value='';
  document.getElementById('cf-birthday').value='';
  document.getElementById('cf-date').value=new Date().toISOString().substring(0,10);
  document.getElementById('cf-note').value='';
  document.getElementById('cf-group').value='';
  _cfColor=CARD_DEFAULT_COLOR;
  _cfApplyMode('new');
  _cfRenderColors();
  cfRenderLiunian();
  _cfOpenSnapshot=_cfSnapshot();
  document.getElementById('case-form-overlay').style.display='flex';
  setTimeout(function(){document.getElementById('cf-name').focus();},100);
}

export function editCase(caseId){
  _editingCaseId=caseId;_editingSelf=false;
  db.collection('users').doc(currentUser.uid).collection('cases').doc(caseId).get().then(function(doc){
    if(!doc.exists){alert('個案不存在');return;}
    var c=doc.data();
    document.getElementById('cf-name').value=c.name||'';
    document.getElementById('cf-gender').value=c.gender||'';
    document.getElementById('cf-birthday').value=c.birthday||'';
    document.getElementById('cf-date').value=c.date||'';
    document.getElementById('cf-note').value=c.note||'';
    document.getElementById('cf-group').value=c.group||'';
    _cfColor=c.color||CARD_DEFAULT_COLOR;
    _cfApplyMode('case');
    _cfRenderColors();
    cfRenderLiunian();
    _cfOpenSnapshot=_cfSnapshot();
    document.getElementById('case-form-overlay').style.display='flex';
  }).catch(function(e){
    console.log('載入個案失敗',e);
    alert('載入失敗');
  });
}

// 編輯本人資料（精簡：姓名/性別/生日/流年）
export function editSelf(){
  _editingCaseId=null;_editingSelf=true;
  var s=_selfCache||{name:userName,gender:_userGender,birthday:_userBirthday};
  document.getElementById('cf-name').value=s.name||'';
  document.getElementById('cf-gender').value=s.gender||'';
  document.getElementById('cf-birthday').value=s.birthday||'';
  _cfColor=s.color||CARD_DEFAULT_COLOR;
  _cfApplyMode('self');
  _cfRenderColors();
  cfRenderLiunian();
  _cfOpenSnapshot=_cfSnapshot();
  document.getElementById('case-form-overlay').style.display='flex';
}

export function closeCaseForm(){
  document.getElementById('case-form-overlay').style.display='none';
}

// 目前欄位快照（6 欄）
function _cfSnapshot(){
  function v(id){var el=document.getElementById(id);return el?el.value:'';}
  return [v('cf-name'),v('cf-gender'),v('cf-birthday'),v('cf-date'),v('cf-group'),v('cf-note'),(_cfColor||'')].join('');
}
// 點視窗外/取消：有未儲存變更才確認，否則直接關閉
export function cfTryClose(){
  if(_cfOpenSnapshot!==_cfSnapshot()){
    if(!confirm('有尚未儲存的變更，確定離開不儲存嗎？'))return;
  }
  closeCaseForm();
}

// 收集欄位並送出儲存；回傳 {promise,id,group,isNew} 或 null(驗證失敗)
function _collectAndSave(){
  var name=document.getElementById('cf-name').value.trim();
  if(!name){document.getElementById('cf-name').focus();return null;}
  if(_editingSelf){
    setUserName(name);
    setUserGender(document.getElementById('cf-gender').value);
    setUserBirthday(document.getElementById('cf-birthday').value);
    _selfCache={name:name,gender:_userGender,birthday:_userBirthday,color:_cfColor};
    var p=db.collection('users').doc(currentUser.uid).set({displayName:name,gender:_userGender,birthday:_userBirthday,cardColor:_cfColor,updatedAt:new Date().toISOString()},{merge:true});
    return {promise:p,id:null,group:'',isNew:false};
  }
  var fields={
    name:name,
    gender:document.getElementById('cf-gender').value,
    birthday:document.getElementById('cf-birthday').value,
    date:document.getElementById('cf-date').value,
    note:document.getElementById('cf-note').value.trim(),
    group:document.getElementById('cf-group').value.trim(),
    color:_cfColor,
    updatedAt:new Date().toISOString()
  };
  if(_editingCaseId){
    return {promise:db.collection('users').doc(currentUser.uid).collection('cases').doc(_editingCaseId).set(fields,{merge:true}),id:_editingCaseId,group:fields.group,isNew:false};
  }
  fields.dataJson=JSON.stringify(emptyData());
  fields.obsJson='{}';
  fields.overrideJson='{}';
  fields.createdAt=new Date().toISOString();
  return {promise:db.collection('users').doc(currentUser.uid).collection('cases').add(fields),id:null,group:fields.group,isNew:true};
}

function _afterGroupUpdate(group){
  if(group && _groupOrder.indexOf(group)<0){
    _groupOrder.push(group);
    db.collection('users').doc(currentUser.uid).set({groupOrder:_groupOrder},{merge:true}).catch(function(e){console.log('groupOrder更新失敗',e);});
  }
}

export function saveCaseForm(){
  var saveBtn=document.querySelector('.case-form-save');
  var origText=saveBtn.innerText;
  var r=_collectAndSave();
  if(!r)return;
  saveBtn.innerText='儲存中...';saveBtn.disabled=true;
  r.promise.then(function(){
    closeCaseForm();
    saveBtn.innerText=origText;saveBtn.disabled=false;
    _afterGroupUpdate(r.group);
    renderCaseList();
  }).catch(function(e){
    console.log('儲存失敗',e);
    alert('儲存失敗，請重試');
    saveBtn.innerText=origText;saveBtn.disabled=false;
  });
}

// 「打開」：先儲存，再切換成分析此人並進首頁
export function cfOpen(){
  var r=_collectAndSave();
  if(!r)return;
  var openBtn=document.getElementById('cf-open-btn');
  if(openBtn){openBtn.innerText='開啟中...';openBtn.disabled=true;}
  var wasSelf=_editingSelf;
  r.promise.then(function(res){
    _afterGroupUpdate(r.group);
    var id = wasSelf ? null : (r.id || (res && res.id) || null);
    closeCaseForm();
    if(openBtn){openBtn.innerText='打開';openBtn.disabled=false;}
    loadCase(id);
  }).catch(function(e){
    console.log('開啟失敗',e);
    alert('儲存失敗，請重試');
    if(openBtn){openBtn.innerText='打開';openBtn.disabled=false;}
  });
}

// 「刪除」：確認後刪除個案並關閉視窗（本人不會有此鈕）
export function cfDelete(){
  if(!_editingCaseId)return;
  var name=document.getElementById('cf-name').value.trim()||'此個案';
  if(!confirm('確定要刪除「'+name+'」的所有紀錄嗎？此操作無法復原。'))return;
  db.collection('users').doc(currentUser.uid).collection('cases').doc(_editingCaseId).delete().then(function(){
    closeCaseForm();
    renderCaseList();
  }).catch(function(e){console.log('刪除失敗',e);alert('刪除失敗，請重試');});
}

/* ===== 管理分組 ===== */
function _gmSyncFromDom(){
  var rows=document.querySelectorAll('#gm-list .gm-row');
  var arr=[];
  rows.forEach(function(el){
    arr.push({
      orig:el.getAttribute('data-orig')||null,
      name:el.querySelector('.gm-name').value,
      desc:el.querySelector('.gm-desc').value
    });
  });
  _gmRows=arr;
}
function _gmRender(){
  var box=document.getElementById('gm-list'); if(!box)return;
  if(_gmRows.length===0){
    box.innerHTML='<div style="color:var(--text-3);font-size:13px;padding:12px 2px">尚無分組，點下方「＋ 新增分組」建立。</div>';
    return;
  }
  box.innerHTML=_gmRows.map(function(r,i){
    return '<div class="gm-row" data-orig="'+_escHtml(r.orig||'')+'">'+
      '<div class="gm-move">'+
        '<button type="button" onclick="gmMove('+i+',-1)"'+(i===0?' disabled':'')+'>▲</button>'+
        '<button type="button" onclick="gmMove('+i+',1)"'+(i===_gmRows.length-1?' disabled':'')+'>▼</button>'+
      '</div>'+
      '<div class="gm-fields">'+
        '<input class="gm-name" value="'+_escHtml(r.name||'')+'" placeholder="分組名稱" maxlength="30">'+
        '<input class="gm-desc" value="'+_escHtml(r.desc||'')+'" placeholder="說明（選填）" maxlength="60">'+
      '</div>'+
      '<button type="button" class="gm-del" onclick="gmDel('+i+')" title="刪除分組">✕</button>'+
    '</div>';
  }).join('');
}
export function showGroupMgr(){
  var names=_groupOrder.slice();
  _casesCache.forEach(function(it){var g=it.data.group||'';if(g&&names.indexOf(g)<0)names.push(g);});
  _gmRows=names.map(function(n){return {orig:n,name:n,desc:(_groupDescs[n]||'')};});
  _gmRender();
  document.getElementById('group-mgr-overlay').style.display='flex';
}
export function closeGroupMgr(){ document.getElementById('group-mgr-overlay').style.display='none'; }
export function gmAdd(){ _gmSyncFromDom(); _gmRows.push({orig:null,name:'',desc:''}); _gmRender(); }
export function gmMove(i,dir){ _gmSyncFromDom(); var j=i+dir; if(j<0||j>=_gmRows.length)return; var t=_gmRows[i];_gmRows[i]=_gmRows[j];_gmRows[j]=t; _gmRender(); }
export function gmDel(i){
  _gmSyncFromDom();
  var r=_gmRows[i];
  if(r&&(r.name||r.orig)){
    if(!confirm('確定刪除分組「'+(r.name||r.orig)+'」？該分組底下的個案會變成「未分組」（個案本身不會被刪）。'))return;
  }
  _gmRows.splice(i,1);
  _gmRender();
}
export function gmSave(){
  _gmSyncFromDom();
  var seen={},order=[],descs={};
  for(var i=0;i<_gmRows.length;i++){
    var nm=(_gmRows[i].name||'').trim();
    if(!nm){alert('分組名稱不能空白');return;}
    if(seen[nm]){alert('分組名稱重複：'+nm);return;}
    seen[nm]=1;order.push(nm);descs[nm]=(_gmRows[i].desc||'').trim();
  }
  // 重新命名 / 刪除 → 傳播到個案的 group 欄位
  var renameMap={},keptOrig={};
  _gmRows.forEach(function(r){var nm=(r.name||'').trim();if(r.orig){keptOrig[r.orig]=1;if(r.orig!==nm)renameMap[r.orig]=nm;}});
  var allOrig=_groupOrder.slice();
  _casesCache.forEach(function(it){var g=it.data.group||'';if(g&&allOrig.indexOf(g)<0)allOrig.push(g);});
  var deleted={};
  allOrig.forEach(function(n){if(!keptOrig[n])deleted[n]=1;});
  var batch=db.batch(),touched=false;
  _casesCache.forEach(function(it){
    var g=it.data.group||'';
    var ref=db.collection('users').doc(currentUser.uid).collection('cases').doc(it.id);
    if(g&&renameMap[g]){batch.update(ref,{group:renameMap[g]});touched=true;}
    else if(g&&deleted[g]){batch.update(ref,{group:''});touched=true;}
  });
  var saveBtn=document.getElementById('gm-save');
  if(saveBtn){saveBtn.disabled=true;saveBtn.innerText='儲存中...';}
  var userRef=db.collection('users').doc(currentUser.uid);
  function finish(){
    userRef.set({groupOrder:order,groupDescs:descs},{merge:true}).then(function(){
      if(saveBtn){saveBtn.disabled=false;saveBtn.innerText='儲存';}
      closeGroupMgr();
      renderCaseList();
    }).catch(function(e){console.log('分組儲存失敗',e);alert('儲存失敗，請重試');if(saveBtn){saveBtn.disabled=false;saveBtn.innerText='儲存';}});
  }
  if(touched){
    batch.commit().then(finish).catch(function(e){console.log('個案分組更新失敗',e);alert('更新失敗，請重試');if(saveBtn){saveBtn.disabled=false;saveBtn.innerText='儲存';}});
  }else{ finish(); }
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
  if(_currentCaseId){
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
    document.getElementById('nav-name').innerText=(_currentCaseId?_currentCaseName:userName)||'';
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

// ===== 使用者資料頁（取代彈窗）：性別/生日輸入 + 流年資訊 =====
export function showProfilePage(){
  // admin 正在看某案例時，維持原本案例編輯行為
  if(_currentCaseId){editCase(_currentCaseId);return;}
  showPage('profile-page');
  setNavActive('nav-profile');
  document.getElementById('nav-name').innerText=(_currentCaseId?_currentCaseName:userName)||'';
  renderProfilePage();
  if(!window._suppressPushState)history.pushState({page:'profile'},'');
}

export function renderProfilePage(){
  var nameEl=document.getElementById('pf-name');if(nameEl)nameEl.value=userName||'';
  var gEl=document.getElementById('pf-gender');if(gEl)gEl.value=_userGender||'';
  var bEl=document.getElementById('pf-birthday');if(bEl)bEl.value=_userBirthday||'';
  _renderProfileLiunian();
}

function _renderProfileLiunian(){
  var box=document.getElementById('pf-liunian');if(!box)return;
  var info=_getLiunianInfo();
  if(!info){box.innerHTML='<div style="color:var(--text-3);font-size:14px;padding:4px 2px">填好性別與生日後，這裡會顯示流年資訊。</div>';return;}
  box.innerHTML='<div style="font-size:16px;font-weight:400;margin-bottom:10px;color:var(--text)">流年參考'+buildLiunianTitleHtml(info)+'</div>'+buildLiunianTableHtml(info);
}

export function saveProfile(){
  var n=document.getElementById('pf-name').value.trim();
  if(n){setUserName(n);document.getElementById('nav-name').innerText=(_currentCaseId?_currentCaseName:userName)||'';}
  setUserGender(document.getElementById('pf-gender').value);
  setUserBirthday(document.getElementById('pf-birthday').value);
  if(currentUser){
    db.collection('users').doc(currentUser.uid).set({
      displayName:userName,
      gender:_userGender,
      birthday:_userBirthday,
      updatedAt:new Date().toISOString()
    },{merge:true}).then(function(){_showToast('已儲存 ✓');}).catch(function(e){console.log('個人資料儲存失敗',e);});
  }
  _renderProfileLiunian();
}

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
