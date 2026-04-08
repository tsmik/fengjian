// js/app.js — 入口模組
import { DIMS, data, obsData, obsOverride, setData, setObsData, setObsOverride,
         userName, setUserName, _isTA, setIsTA, _currentCaseId, setCurrentCaseId,
         _currentCaseName, setCurrentCaseName, _userGender, setUserGender,
         _userBirthday, setUserBirthday, _caseGender, setCaseGender,
         DIM_RULES, setDimRules, _rulesSource, setRulesSource,
         OBS_PARTS_DATA, setObsPartsData, OBS_PART_NAMES, setObsPartNames,
         _questionsSource, setQuestionsSource, setLiunianTable,
         emptyData, setNavActive, showPage, save, _showToast,
         BETA_VISIBLE_DIMS, calcDim, initBetaUI, condResults, setManualData,
         currentUser, setCurrentUser, userRole, setUserRole } from './core.js';

import { recalcFromObs } from './obs_recalc.js';
import { renderFaceMap, renderObsCenter, renderDimIndex, selectOpt, selectLROpt,
         toggleLRRow, gotoObsPart, toggleDetailGroup, collectDetailForPrompt,
         showObsPage } from './obs_ui.js';
import { showCondPage, cpGoto, cpQuickChange, cpToggleAllGroups, cpToggleGroup,
         cpToggleLR, cpTogglePartGroups, cpRender, renderDimPanel,
         dimGoto, showCondPopup, closeCondPopup, applyCondChange, CAT_STYLE } from './cond_page.js';
import { showReport, closeReport, reportSave, exportPNG } from './report.js';
import { showSensPage, renderSensPage, showManualSensPage, renderManualSensPage } from './sens_analysis.js';
import { showManualPage, manualCellClick, manualClear, manualImportObs, manualSave,
         renderManualPage, initManualData } from './manual.js';
import { showCasePage, renderCaseList, loadCase, showCaseForm, editCase,
         closeCaseForm, saveCaseForm, deleteCase, doLogout, editName,
         confirmEditName, closeEditName, clearObsData } from './case_mgmt.js';
import { kRender, kSelect, showKnowledgePage } from './knowledge_page.js';
import { generateAI } from './ai_analysis.js';

export function showModePage() {
  showPage('mode-page');
  document.getElementById('nav-name').innerText = (_isTA && _currentCaseId ? _currentCaseName : userName) || '';
  var mcs = document.getElementById('mode-case-section');
  if (mcs) { mcs.style.display = _isTA ? '' : 'none'; }
  setNavActive(null);
}

async function quickLogin(email) {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ login_hint: email });
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    console.log('快速登入失敗', e);
  }
}

function _renderLoginHistory() {
  let loginHistory = [];
  try { loginHistory = JSON.parse(localStorage.getItem('login_history') || '[]'); } catch(e) {}
  const listEl = document.getElementById('login-history-list');
  const btn = document.getElementById('google-login-btn');
  if (listEl && loginHistory.length > 0) {
    let html = '';
    loginHistory.slice().reverse().forEach(h => {
      const photo = h.photoURL
        ? '<img src="'+h.photoURL+'" style="width:36px;height:36px;border-radius:50%;object-fit:cover">'
        : '<div style="width:36px;height:36px;border-radius:50%;background:#ccc;display:flex;align-items:center;justify-content:center;font-weight:700;color:white">'+((h.displayName||h.email||'?').charAt(0))+'</div>';
      const emailSafe = (h.email||'').replace(/'/g,"\\'");
      html += '<div onclick="quickLogin(\''+emailSafe+'\')" style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;border-radius:8px;transition:background 0.2s;border:1px solid var(--border);margin-bottom:8px;background:white" onmouseover="this.style.background=\'#f0ebe5\'" onmouseout="this.style.background=\'white\'">';
      html += photo;
      html += '<div><div style="font-weight:700;font-size:15px;color:var(--text)">'+(h.displayName||'未命名')+'</div>';
      html += '<div style="font-size:13px;color:var(--text-3)">'+(h.email||'')+'</div></div>';
      html += '</div>';
    });
    listEl.innerHTML = html;
    listEl.style.display = 'block';
    if (btn) btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> 使用其他 Google 帳號登入';
  } else if (listEl) {
    listEl.style.display = 'none';
    if (btn) btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> 使用 Google 帳號登入';
  }
}

async function googleLogin() {
  const btn = document.getElementById('google-login-btn');
  const status = document.getElementById('login-status');
  btn.disabled = true;
  btn.innerText = '登入中...';
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await auth.signInWithPopup(provider);
    // onAuthStateChanged 會處理後續
  } catch (e) {
    console.log('Google 登入失敗', e);
    if (status) status.textContent = '登入失敗，請重試';
    btn.disabled = false;
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> 使用 Google 帳號登入';
  }
}

async function initAfterLogin() {
  /* ===== Step 1: 從 Firebase 載入規則 ===== */
  var _rulesLoaded = false;
  try{
    const rulesDoc=await db.collection('settings').doc('rules').get();
    if(rulesDoc.exists&&rulesDoc.data().rulesJson){
      try{
        const parsed=JSON.parse(rulesDoc.data().rulesJson);
        if(Array.isArray(parsed)&&parsed.length===13&&parsed[0]&&parsed[0].parts){
          setDimRules(parsed);setRulesSource('Firebase');_rulesLoaded=true;
          try{localStorage.setItem('rxbf_rules_cache',rulesDoc.data().rulesJson);}catch(se){}
          console.log('[規則引擎] 從 Firebase 載入規則 ✓');
        }else{console.log('[規則引擎] Firebase 規則格式異常');}
      }catch(e){console.log('[規則引擎] Firebase 規則解析失敗',e);}
    }else{console.log('[規則引擎] Firebase 無規則資料');}
  }catch(e){console.log('[規則引擎] Firebase 規則讀取失敗',e);}
  if(!_rulesLoaded){
    try{
      var _cachedRules=localStorage.getItem('rxbf_rules_cache');
      if(_cachedRules){
        var _cp=JSON.parse(_cachedRules);
        if(Array.isArray(_cp)&&_cp.length===13&&_cp[0]&&_cp[0].parts){
          setDimRules(_cp);setRulesSource('離線快取');_rulesLoaded=true;
          console.log('[規則引擎] 使用離線快取規則');
          _showToast('⚠ 無法連線更新規則，使用離線快取版本');
        }
      }
    }catch(ce){console.log('[規則引擎] 離線快取讀取失敗',ce);}
  }
  if(!_rulesLoaded){
    _showToast('⚠ 無法載入評分規則，請檢查網路連線');
    console.log('[規則引擎] 無法載入規則（Firebase 失敗且無離線快取）');
  }

  /* ===== Step 1.5: 從 Firebase 載入觀察問題 ===== */
  var _questionsLoaded = false;
  try{
    const qDoc=await db.collection('settings').doc('questions').get();
    if(qDoc.exists&&qDoc.data().questionsJson){
      try{
        const parsed=JSON.parse(qDoc.data().questionsJson);
        if(parsed&&typeof parsed==='object'&&Object.keys(parsed).length>=11){
          setObsPartsData(parsed);
          setObsPartNames(Object.keys(parsed));
          setQuestionsSource('Firebase');_questionsLoaded=true;
          try{localStorage.setItem('rxbf_questions_cache',qDoc.data().questionsJson);}catch(se){}
          console.log('[觀察問題] 從 Firebase 載入觀察問題 ✓（'+OBS_PART_NAMES.length+'個部位）');
        }else{console.log('[觀察問題] Firebase 問題格式異常');}
      }catch(e){console.log('[觀察問題] Firebase 問題解析失敗',e);}
    }else{console.log('[觀察問題] Firebase 無問題資料');}
  }catch(e){console.log('[觀察問題] Firebase 問題讀取失敗',e);}
  if(!_questionsLoaded){
    try{
      var _cachedQ=localStorage.getItem('rxbf_questions_cache');
      if(_cachedQ){
        var _cqp=JSON.parse(_cachedQ);
        if(_cqp&&typeof _cqp==='object'&&Object.keys(_cqp).length>=11){
          setObsPartsData(_cqp);
          setObsPartNames(Object.keys(_cqp));
          setQuestionsSource('離線快取');_questionsLoaded=true;
          console.log('[觀察問題] 使用離線快取觀察問題');
        }
      }
    }catch(ce){console.log('[觀察問題] 離線快取讀取失敗',ce);}
  }
  if(!_questionsLoaded){
    console.log('[觀察問題] 無法載入觀察問題（Firebase 失敗且無離線快取），使用內建問題');
  }

  /* ===== Step 1.8: 載入流年表 ===== */
  try{
    var lnDoc=await db.collection('settings').doc('liunian').get();
    if(lnDoc.exists&&lnDoc.data().liunianJson){
      var lnp=JSON.parse(lnDoc.data().liunianJson);
      if(lnp&&lnp['男']&&lnp['女']){setLiunianTable(lnp);console.log('[流年表] 從 Firebase 載入 ✓');}
    }
  }catch(e){console.log('[流年表] 載入失敗',e);}

  /* ===== Step 2: 載入使用者資料 ===== */
  const uid = currentUser.uid;
  try{const doc=await db.collection('users').doc(uid).get();
    if(doc.exists&&doc.data().dataJson)setData(JSON.parse(doc.data().dataJson));else if(doc.exists&&doc.data().data)setData(doc.data().data);else setData(emptyData());
    if(doc.exists&&doc.data().obsJson)setObsData(JSON.parse(doc.data().obsJson));else setObsData({});
    if(doc.exists&&doc.data().overrideJson)setObsOverride(JSON.parse(doc.data().overrideJson));else setObsOverride({});
    if(doc.exists){setUserGender(doc.data().gender||'');setUserBirthday(doc.data().birthday||'');}
  }catch(e){console.log('載入失敗',e);setData(emptyData());setObsData({});setObsOverride({});}
  recalcFromObs();
  document.getElementById('entry-page').style.display='none';

  // 助教模式判斷（admin-link 與 nav-cases 都只有 admin 才顯示）
  var _isAdmin=(userRole==='admin');
  setIsTA(_isAdmin);
  var _adminLink=document.getElementById('admin-link');
  if(_adminLink) _adminLink.style.display=_isAdmin?'':'none';
  var _navCases=document.getElementById('nav-cases');
  if(_navCases) _navCases.style.display=_isAdmin?'':'none';
  if(_isAdmin){
    setCurrentCaseId(null);
    setCurrentCaseName(userName);
    showCasePage();
  }else{
    showModePage();
  }

  // 監聽規則和問題變更（onSnapshot）
  var _snapshotFirst={rules:true,questions:true};
  db.collection('settings').doc('rules').onSnapshot(function(doc){
    if(_snapshotFirst.rules){_snapshotFirst.rules=false;return;}
    if(doc.exists&&doc.data().rulesJson){
      try{
        var nr=JSON.parse(doc.data().rulesJson);
        if(Array.isArray(nr)&&nr.length===13){
          setDimRules(nr);setRulesSource('Firebase');
          try{localStorage.setItem('rxbf_rules_cache',doc.data().rulesJson);}catch(se){}
          recalcFromObs();_renderCurrentTab();_showToast('規則已更新');
        }
      }catch(e){console.log('規則更新解析失敗',e);}
    }
  });
  db.collection('settings').doc('questions').onSnapshot(function(doc){
    if(_snapshotFirst.questions){_snapshotFirst.questions=false;return;}
    if(doc.exists&&doc.data().questionsJson){
      try{
        var nq=JSON.parse(doc.data().questionsJson);
        if(nq&&typeof nq==='object'&&Object.keys(nq).length>=11){
          setObsPartsData(nq);setObsPartNames(Object.keys(nq));setQuestionsSource('Firebase');
          try{localStorage.setItem('rxbf_questions_cache',doc.data().questionsJson);}catch(se){}
          recalcFromObs();_renderCurrentTab();_showToast('觀察問題已更新');
        }
      }catch(e){console.log('問題更新解析失敗',e);}
    }
  });
}

function _renderCurrentTab() {
  var active = document.querySelector('.nav-tab.active');
  var tab = active ? active.id : '';
  try {
    if (tab === 'nav-obs') { renderFaceMap(); renderObsCenter(); renderDimIndex(); }
    else if (tab === 'nav-cond') { cpRender(); }
    else if (tab === 'nav-report') { showReport(); }
    else if (tab === 'nav-sens') { renderSensPage(); }
    else if (tab === 'nav-know') { renderDimIndex(); }
  } catch(e) { console.log('重渲染失敗', e); }
}

// Attach to window for HTML onclick handlers
window.applyCondChange = applyCondChange;
window.clearObsData = clearObsData;
window.closeCaseForm = closeCaseForm;
window.closeCondPopup = closeCondPopup;
window.closeEditName = closeEditName;
window.confirmEditName = confirmEditName;
window.cpGoto = cpGoto;
window.cpQuickChange = cpQuickChange;
window.cpToggleAllGroups = cpToggleAllGroups;
window.cpToggleGroup = cpToggleGroup;
window.cpToggleLR = cpToggleLR;
window.cpTogglePartGroups = cpTogglePartGroups;
window.deleteCase = deleteCase;
window.dimGoto = dimGoto;
window.doLogout = doLogout;
window.editCase = editCase;
window.editName = editName;
window.exportPNG = exportPNG;
window.generateAI = generateAI;
window.gotoObsPart = gotoObsPart;
window.loadCase = loadCase;
window.manualCellClick = manualCellClick;
window.manualClear = manualClear;
window.manualImportObs = manualImportObs;
window.manualSave = manualSave;
window.reportSave = reportSave;
window.saveCaseForm = saveCaseForm;
window.selectLROpt = selectLROpt;
window.selectOpt = selectOpt;
window.showCaseForm = showCaseForm;
window.showCasePage = showCasePage;
window.showCondPage = showCondPage;
window.showKnowledgePage = showKnowledgePage;
window.showManualPage = showManualPage;
window.showManualSensPage = showManualSensPage;
window.showModePage = showModePage;
window.showObsPage = showObsPage;
window.showReport = showReport;
window.showSensPage = showSensPage;
window.googleLogin = googleLogin;
window.quickLogin = quickLogin;
window.toggleDetailGroup = toggleDetailGroup;
window.toggleLRRow = toggleLRRow;
window.kSelect = kSelect;
window.cpRender = cpRender;
window.renderSensPage = renderSensPage;
window.renderManualPage = renderManualPage;
window.renderFaceMap = renderFaceMap;
window.renderObsCenter = renderObsCenter;
window.renderDimIndex = renderDimIndex;
window.showCondPopup = showCondPopup;

window.injectData = function(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 13 || !matrix.every(r => Array.isArray(r) && r.length === 9)) {
    console.error('injectData: 需要 13×9 陣列，每格為 "A"、"B" 或 null');
    return;
  }
  initManualData();
  setManualData(matrix.map(r => r.slice()));
  manualSave();
  renderManualPage();
  console.log('injectData: 已注入 13×9 矩陣並儲存');
};

// Firebase Auth 狀態監聽
auth.onAuthStateChanged(async (user) => {
  if (user) {
    setCurrentUser(user);
    if (user.email) localStorage.setItem('last_login_email', user.email);

    // 儲存登入紀錄
    let loginHistory = [];
    try { loginHistory = JSON.parse(localStorage.getItem('login_history') || '[]'); } catch(e) {}
    const _existing = loginHistory.findIndex(h => h.uid === user.uid);
    const _entry = {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      lastLogin: new Date().toISOString()
    };
    if (_existing >= 0) loginHistory[_existing] = _entry;
    else loginHistory.push(_entry);
    if (loginHistory.length > 10) loginHistory = loginHistory.slice(-10);
    try { localStorage.setItem('login_history', JSON.stringify(loginHistory)); } catch(e) {}

    // 讀取 Firestore 使用者資料（displayName、role）
    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        // 優先用 Firestore 存的 displayName（使用者自訂名字）
        const fsName = userDoc.data().displayName;
        setUserName(fsName || user.displayName || user.email.split('@')[0]);
        setUserRole(userDoc.data().role === 'admin' ? 'admin' : 'student');
      } else {
        // 首次登入，用 Google displayName，建立 user document
        setUserName(user.displayName || user.email.split('@')[0]);
        setUserRole('student');
        await db.collection('users').doc(user.uid).set({
          displayName: user.displayName || '',
          email: user.email || '',
          role: 'student',
          createdAt: new Date().toISOString()
        });
      }
    } catch(e) {
      console.log('讀取角色失敗', e);
      setUserName(user.displayName || user.email.split('@')[0]);
      setUserRole('student');
    }

    await initAfterLogin();
  } else {
    setCurrentUser(null);
    document.getElementById('top-nav').style.display = 'none';
    document.getElementById('entry-page').style.display = 'flex';
    _renderLoginHistory();
  }
});

window.onload = () => {
  const savedKey = localStorage.getItem('anthropic_api_key');
  const apiKeyInput = document.getElementById('entry-api-key');
  if (savedKey && apiKeyInput) apiKeyInput.value = savedKey;
  if (apiKeyInput) {
    apiKeyInput.addEventListener('change', e => {
      const val = e.target.value.trim();
      if (val) localStorage.setItem('anthropic_api_key', val);
      else localStorage.removeItem('anthropic_api_key');
    });
  }
  const nameEditInput = document.getElementById('name-edit-input');
  if (nameEditInput) {
    let _isComposing = false;
    nameEditInput.addEventListener('compositionstart', () => { _isComposing = true; });
    nameEditInput.addEventListener('compositionend', () => { _isComposing = false; });
    nameEditInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !_isComposing && !e.isComposing && e.keyCode !== 229) confirmEditName();
    });
  }
  // Init knowledge page
  kRender();
  initBetaUI();
};
