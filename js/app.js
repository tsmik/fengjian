// js/app.js — 入口模組
import { DIMS, data, obsData, obsOverride, setData, setObsData, setObsOverride,
         userName, setUserName, _isTA, setIsTA, _currentCaseId, setCurrentCaseId,
         _currentCaseName, setCurrentCaseName, _userGender, setUserGender,
         _userBirthday, setUserBirthday, _caseGender, setCaseGender,
         DIM_RULES, setDimRules, _rulesSource, setRulesSource,
         OBS_PARTS_DATA, setObsPartsData, OBS_PART_NAMES, setObsPartNames,
         _questionsSource, setQuestionsSource, setLiunianTable,
         emptyData, setNavActive, showPage, save, _showToast,
         BETA_VISIBLE_DIMS, calcDim, initBetaUI, condResults, setManualData } from './core.js';

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

async function startApp(){
  const name=document.getElementById('entry-name').value.trim();if(!name){document.getElementById('entry-name').focus();return;}
  setUserName(name);localStorage.setItem('rxbf_username',userName);

  const btn=document.querySelector('.entry-btn');btn.innerText='載入中...';btn.disabled=true;

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
  try{const doc=await db.collection('users').doc(userName).get();
    if(doc.exists&&doc.data().dataJson)setData(JSON.parse(doc.data().dataJson));else if(doc.exists&&doc.data().data)setData(doc.data().data);else setData(emptyData());
    if(doc.exists&&doc.data().obsJson)setObsData(JSON.parse(doc.data().obsJson));else setObsData({});
    if(doc.exists&&doc.data().overrideJson)setObsOverride(JSON.parse(doc.data().overrideJson));else setObsOverride({});
    if(doc.exists){setUserGender(doc.data().gender||'');setUserBirthday(doc.data().birthday||'');}
  }catch(e){console.log('載入失敗',e);setData(emptyData());setObsData({});setObsOverride({});}
  recalcFromObs();
  document.getElementById('entry-page').style.display='none';btn.innerText='開始';btn.disabled=false;

  // 助教模式判斷
  setIsTA(userName === '曾麥可');
  if(_isTA){
    document.getElementById('nav-cases').style.display='';
    setCurrentCaseId(null);
    setCurrentCaseName(userName);
    showCasePage();
  }else{
    document.getElementById('nav-cases').style.display='none';
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
window.startApp = startApp;
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

window.onload = () => {
  const savedName = localStorage.getItem('rxbf_username');
  if (savedName) document.getElementById('entry-name').value = savedName;
  const savedKey = localStorage.getItem('anthropic_api_key');
  if (savedKey) document.getElementById('entry-api-key').value = savedKey;
  document.getElementById('entry-api-key').addEventListener('change', e => {
    const val = e.target.value.trim();
    if (val) localStorage.setItem('anthropic_api_key', val);
    else localStorage.removeItem('anthropic_api_key');
  });
  document.getElementById('entry-name').addEventListener('keydown', e => { if (e.key === 'Enter') startApp(); });
  document.getElementById('name-edit-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmEditName(); });
  // Init knowledge page
  kRender();
  initBetaUI();
};
