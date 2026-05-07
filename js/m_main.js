// ============================================================
// 手機版主邏輯
// 負責：Firebase 初始化、auth 流程、白名單、tab 切換、登出
// 依賴：firebase modular SDK v10.12.0、js/core.js（之後 import）、
//       js/m_home.js（initHome）
// 被用：m.html 直接 import
// retest 範圍：登入、登出、白名單拒絕、tab 切換、staging banner
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  setPersistence, browserLocalPersistence, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { initHome } from "./m_home.js";
import { mountInput, unmountInput, getSaveStatus, discardDraft, ensureQuestionsLoaded } from "./m_input.js";
import { mountReport, unmountReport, discardReportDraft } from "./m_report.js";

// ===== Firebase config =====
const PROD_FIREBASE_CONFIG={apiKey:"AIzaSyCZUzTOaCtbzXuX_mz5VoFvZ2Sva1Obza8",authDomain:"renxiangbingfa.firebaseapp.com",projectId:"renxiangbingfa",storageBucket:"renxiangbingfa.firebasestorage.app",messagingSenderId:"912262878667",appId:"1:912262878667:web:cd7a74f1378221dbe3524e"};
const STAGING_FIREBASE_CONFIG={apiKey:"AIzaSyDSEQuEZ_5JhzcJ9olK6bk-t2UdsYU09dU",authDomain:"renxiangbingfa-staging.firebaseapp.com",projectId:"renxiangbingfa-staging",storageBucket:"renxiangbingfa-staging.firebasestorage.app",messagingSenderId:"8463681855",appId:"1:8463681855:web:069ca7428c4015eaa0eb8a"};

function getFirebaseConfig(){
  const host=window.location.hostname;
  if(host==='staging.fengjian.pages.dev'||/^[a-z0-9-]+\.fengjian\.pages\.dev$/.test(host)){
    debugLog('[Firebase]','Using STAGING config');
    return STAGING_FIREBASE_CONFIG;
  }
  debugLog('[Firebase]','Using PRODUCTION config');
  return PROD_FIREBASE_CONFIG;
}

// ===== debug log =====
function debugLog(...args){
  console.log(...args);
  const panel=document.getElementById('m-debug-panel');
  if(panel){
    const time=new Date().toTimeString().slice(0,8);
    const line=document.createElement('div');
    line.textContent=time+' '+args.join(' ');
    panel.appendChild(line);
    panel.scrollTop=panel.scrollHeight;
  }
}

// ===== 初始化 Firebase =====
const app=initializeApp(getFirebaseConfig());
const auth=getAuth(app);
const db=getFirestore(app);

// 暴露給其他 module 用
export { auth, db, debugLog };

// ===== STAGING 識別：banner 取消，改用 nav title 橘色 =====
(function(){
  const host=window.location.hostname;
  if(host==='staging.fengjian.pages.dev'||/^[a-z0-9-]+\.fengjian\.pages\.dev$/.test(host)){
    document.body.classList.add('m-staging-mode');
  }
})();

// ===== DOM 引用 =====
const elLogin=document.getElementById('m-login');
const elDenied=document.getElementById('m-denied');
const elLoading=document.getElementById('m-loading');
const elMain=document.querySelector('.m-main');
const elNav=document.querySelector('.m-nav');
const elNavUser=document.getElementById('m-nav-user');
const elTabbar=document.getElementById('m-tabbar');

function showLoading(){elLoading.style.display='flex';elLogin.style.display='none';elDenied.style.display='none';elMain.style.display='none';elNav.style.display='none';elTabbar.style.display='none';}
function showLogin(){elLoading.style.display='none';elLogin.style.display='flex';elDenied.style.display='none';elMain.style.display='none';elNav.style.display='none';elTabbar.style.display='none';}
function showDenied(){elLoading.style.display='none';elLogin.style.display='none';elDenied.style.display='flex';elMain.style.display='none';elNav.style.display='none';elTabbar.style.display='none';}
function showApp(displayName){
  elLoading.style.display='none';elLogin.style.display='none';elDenied.style.display='none';
  elMain.style.display='block';elNav.style.display='flex';elTabbar.style.display='flex';
  elNavUser.textContent=displayName||'—';
  elNavUser.classList.remove('is-guest');
  initHome(displayName);
  // 恢復上次 tab（重整後留在原頁，而非預設首頁）
  try {
    const lastTab = localStorage.getItem('m_active_tab');
    if (lastTab && lastTab !== 'home') {
      const restoreBtn = document.querySelector('.m-tab[data-tab="' + lastTab + '"]');
      if (restoreBtn) restoreBtn.click();
    }
  } catch (e) {}
}

// 初始顯示 loading（防 race）
showLoading();

// ===== 白名單檢查 =====
async function checkWhitelist(user){
  const ADMIN_UID_PROD='XT1Err9cmnNokgMQKUrGUj3ishG2';
  const ADMIN_UID_STAGING='ARGLfFp3HqbWMtN7CAoAxR4rHhm1';
  if(user.uid===ADMIN_UID_PROD||user.uid===ADMIN_UID_STAGING) return true;
  try{
    const email=(user.email||'').toLowerCase();
    if(!email) return false;
    const allowedRef=doc(db,'allowedUsers',email);
    const allowedSnap=await getDoc(allowedRef);
    return allowedSnap.exists();
  }catch(e){
    debugLog('[Auth] 白名單查詢失敗',e&&e.message?e.message:e);
    return false;
  }
}

// ===== 登入按鈕 =====
document.getElementById('m-login-btn').addEventListener('click',async function(){
  elLogin.classList.add('is-loading');
  try{
    const provider=new GoogleAuthProvider();
    debugLog('[Auth]','開始 signInWithPopup');
    const result=await signInWithPopup(auth,provider);
    debugLog('[Auth]','signInWithPopup 成功，user =',result.user.email||result.user.uid);
  }catch(e){
    debugLog('[Auth]','signInWithPopup 失敗',e&&e.code,e&&e.message?e.message:e);
    elLogin.classList.remove('is-loading');
    alert('登入失敗：'+(e.message||e));
  }
});

// ===== auth 流程 =====
async function initAuth(){
  debugLog('[Auth]','initAuth 開始');
  try{
    await setPersistence(auth,browserLocalPersistence);
    debugLog('[Auth]','setPersistence(LOCAL) 完成');
  }catch(e){
    debugLog('[Auth]','setPersistence 失敗',e&&e.message?e.message:e);
  }

  debugLog('[Auth]','啟動 onAuthStateChanged');
  onAuthStateChanged(auth,async function(user){
    debugLog('[Auth]','onAuthStateChanged 觸發，user =',user?(user.email||user.uid):'null');
    if(user){
      showLoading();
      try{
        const allowed=await checkWhitelist(user);
        debugLog('[Auth]','白名單檢查結果：',allowed);
        if(!allowed){
          await signOut(auth);
          showDenied();
          return;
        }
        let displayName=user.displayName||(user.email||'').split('@')[0];
        try{
          const userRef=doc(db,'users',user.uid);
          const userSnap=await getDoc(userRef);
          if(userSnap.exists()){
            const ud=userSnap.data();
            displayName=ud.displayName||displayName;
            window.__userData=ud;
            debugLog('[Auth]','讀到既有 user document，displayName =',displayName);
          }else{
            await setDoc(userRef,{
              displayName:user.displayName||'',
              email:user.email||'',
              role:'student',
              createdAt:new Date().toISOString()
            });
            window.__userData={displayName:user.displayName||'',email:user.email||'',role:'student'};
            debugLog('[Auth]','user document 建立完成');
          }
        }catch(e){
          debugLog('[Auth]','讀取/建立 user document 失敗',e&&e.message?e.message:e);
        }
        // 先載 questions（讓首頁進度條可以用實際題目總數）
        try { await ensureQuestionsLoaded(); }
        catch(e){ debugLog('[Auth]','ensureQuestionsLoaded 失敗',e&&e.message?e.message:e); }
        debugLog('[Auth]','呼叫 showApp，displayName =',displayName);
        showApp(displayName);
      }catch(e){
        debugLog('[Auth]','登入後處理失敗',e&&e.message?e.message:e);
        showDenied();
      }
    }else{
      showLogin();
      const btn=document.getElementById('m-login-btn');
      if(btn) btn.disabled=false;
    }
  });
}
initAuth();

// ===== Tab 切換 =====
(function(){
  const tabs=document.querySelectorAll('.m-tab');
  const pages={
    home:document.getElementById('m-page-home'),
    input:document.getElementById('m-page-input'),
    report:document.getElementById('m-page-report')
  };
  tabs.forEach(function(btn){
    btn.addEventListener('click',function(){
      const key=btn.dataset.tab;
      // 攔截：input ↔ report 視為「同一工作區」不 confirm；切到 home 才 confirm
      const inputTabBtn = document.querySelector('.m-tab[data-tab="input"]');
      const reportTabBtn = document.querySelector('.m-tab[data-tab="report"]');
      const isOnInput = inputTabBtn && inputTabBtn.classList.contains('active');
      const isOnReport = reportTabBtn && reportTabBtn.classList.contains('active');
      const isCurrentWork = isOnInput || isOnReport;
      const isTargetWork = key === 'input' || key === 'report';
      if (isCurrentWork && !isTargetWork && getSaveStatus() === 'dirty') {
        if (!confirm('你還有未儲存的答題，確定要離開嗎？')) return;
        if (isOnInput) discardDraft();
        else if (isOnReport) discardReportDraft();
      }
      tabs.forEach(function(b){b.classList.toggle('active',b===btn)});
      Object.keys(pages).forEach(function(k){
        pages[k].classList.toggle('active',k===key);
      });
      elMain.scrollTop=0;
      // 切換時顯示/隱藏儲存區（input + report 顯示，home 隱藏）
      const saveZone = document.getElementById('m-save-zone');
      if(saveZone){
        saveZone.classList.toggle('is-hidden', key === 'home');
      }
      // 記住目前 tab，重整時恢復
      try { localStorage.setItem('m_active_tab', key); } catch (e) {}
      if(key==='input'){
        mountInput(pages.input);
        unmountReport();
      } else if(key==='report'){
        unmountInput();
        mountReport(pages.report);
      } else {
        unmountInput();
        unmountReport();
      }
    });
  });
})();

// ===== 頂部姓名點擊登出 =====
elNavUser.addEventListener('click',async function(){
  if(elNavUser.classList.contains('is-guest')) return;
  const isDirty = getSaveStatus() === 'dirty';
  const msg = isDirty ? '你還有未儲存的答題，仍要登出嗎？' : '要登出嗎？';
  if(confirm(msg)){
    // 確定登出 → 兩邊草稿都捨棄（內部各自判斷有無 LS）
    if (isDirty) {
      try { discardDraft(); } catch (e) {}
      try { discardReportDraft(); } catch (e) {}
    }
    await signOut(auth);
    location.reload();
  }
});

// ===== Debug 面板：toggle / clear 按鈕 =====
const _debugToggle = document.getElementById('m-debug-toggle');
const _debugPanel = document.getElementById('m-debug-panel');
const _debugClear = document.getElementById('m-debug-clear');
if (_debugToggle && _debugPanel) {
  _debugToggle.addEventListener('click', function(){
    _debugPanel.classList.toggle('active');
    document.body.classList.toggle('m-debug-on');
  });
}
if (_debugClear && _debugPanel) {
  _debugClear.addEventListener('click', function(){
    _debugPanel.innerHTML = '';
  });
}

// ===== Debug 面板：開機初始 log =====
debugLog('[Debug]','面板就緒');
debugLog('[Debug]','hostname =',window.location.hostname);
debugLog('[Debug]','href =',window.location.href);
