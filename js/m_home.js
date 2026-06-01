// ============================================================
// 手機版首頁 tab 邏輯（v1.7 階段 5：兩大按鈕 + 個人資料）
// 負責：Hi 列、兩大按鈕（部位觀察評分 / 手動輸入報告）的進度條 + 點擊跳對應 tab、基本資料表單
// 依賴：m_main.js 的 auth, db, debugLog
// 被用：m_main.js 的 showApp() 會呼叫 initHome()
// retest 範圍：
//   - Hi 列名字
//   - 兩大按鈕進度數字（觀察 N/M 題、手動 N/13 維度）+ 進度條 fill
//   - 點兩大按鈕跳對應 tab
//   - 基本資料填寫＋儲存＋reload 還在
// ============================================================

import { auth, db, debugLog, getEffectiveUid, getActiveCaseId, getCurrentDocRef, setActiveCase, refreshUserData, setSelfName } from "./m_main.js";
import { setDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { OBS_PARTS_DATA, setUserName, setUserGender, setUserBirthday } from "./core.js";

// 共用：寫入基本資料到雲端 + 更新記憶體狀態（首頁與「我的」分頁共用）
export async function persistProfile(d){
  const uid=getEffectiveUid();
  if(!uid) throw new Error('未登入');
  const name=(d.displayName||'').trim();
  const birthday=d.birthday||'';
  const gender=d.gender||'';
  const caseId=getActiveCaseId();
  const ref=getCurrentDocRef();
  if(caseId){
    // 個案 doc 用 name 欄位（對齊桌機 case_mgmt），不寫 displayName
    await setDoc(ref,{ name, birthday, gender, updatedAt:new Date().toISOString() },{merge:true});
  }else{
    await setDoc(ref,{ displayName:name, birthday, gender, profileUpdatedAt:new Date().toISOString() },{merge:true});
  }
  // window.__userData 一律存正規化後的 displayName，讓既有讀 displayName 的碼通用
  window.__userData=Object.assign(window.__userData||{},{ displayName:name, birthday, gender });
  if(!caseId){ try{ setSelfName(name); }catch(e){} } // 本人姓名快取（橫幅「回到本人」用）
  try{ setUserName(name); setUserGender(gender); setUserBirthday(birthday); }catch(e){}
  const nm=document.getElementById('m-home-name');
  if(nm&&name) nm.textContent=name;
  return window.__userData;
}

// 觀察答題進度：obsData 的答題數 / OBS_PARTS_DATA 題目總數（可傳 ud，預設 window.__userData）
export function calcObsProgress(ud){
  ud=ud||window.__userData||{};
  let obs={};
  if(ud.obsJson){
    try{obs=JSON.parse(ud.obsJson)||{};}catch(e){obs={};}
  }
  let answered=0,total=0;
  for(const partKey of Object.keys(OBS_PARTS_DATA)){
    const part=OBS_PARTS_DATA[partKey];
    if(!part||!Array.isArray(part.sections)) continue;
    for(const section of part.sections){
      for(const q of (section.qs||[])){
        total++;
        if(q.paired){
          // 兼容桌機（主值）+ 手機（_L/_R）兩種儲存格式
          if(obs[q.id]!==undefined || (obs[q.id+'_L']!==undefined&&obs[q.id+'_R']!==undefined)) answered++;
        }else{
          if(obs[q.id]!==undefined) answered++;
        }
      }
    }
  }
  return {answered, total};
}

// 手動輸入維度進度：manualDataJson 13×9 array 中已填滿 9 cell 的維度數（可傳 ud）
export function calcManualDimProgress(ud){
  ud=ud||window.__userData||{};
  if(!ud.manualDataJson) return 0;
  let arr;
  try{arr=JSON.parse(ud.manualDataJson);}catch(e){return 0;}
  if(!Array.isArray(arr)||arr.length!==13) return 0;
  let count=0;
  for(let i=0;i<13;i++){
    if(!Array.isArray(arr[i])||arr[i].length!==9) continue;
    let filled=0;
    for(let j=0;j<9;j++){
      if(arr[i][j]==='A'||arr[i][j]==='B') filled++;
    }
    if(filled===9) count++;
  }
  return count;
}

// 重算兩大按鈕進度（可傳 ud，預設 window.__userData；給儲存後呼叫）
export function updateHomeProgress(ud){
  const obs=calcObsProgress(ud);
  const elObsFill=document.getElementById('m-home-obs-fill');
  const elObsQ=document.getElementById('m-home-obs-q');
  const elObsQTotal=document.getElementById('m-home-obs-q-total');
  if(elObsQ) elObsQ.textContent=obs.answered;
  if(elObsQTotal) elObsQTotal.textContent=obs.total;
  if(elObsFill) elObsFill.style.width=(obs.total>0 ? obs.answered/obs.total*100 : 0)+'%';

  const manualDim=calcManualDimProgress(ud);
  const elManualFill=document.getElementById('m-home-manual-fill');
  const elManualDim=document.getElementById('m-home-manual-dim');
  if(elManualDim) elManualDim.textContent=manualDim;
  if(elManualFill) elManualFill.style.width=(manualDim/13*100)+'%';
}

// 首頁固定顯示「本人」：從 users/{uid} 讀本人資料更新進度＋姓名＋基本資料（不動 active 個案）
export async function refreshHomeSelf(){
  const uid=getEffectiveUid();
  if(!uid) return;
  let sd={};
  try{ const s=await getDoc(doc(db,'users',uid)); if(s.exists()) sd=s.data(); }
  catch(e){ debugLog('[Home]','讀本人失敗',e&&e.message); return; }
  updateHomeProgress(sd);
  const nm=document.getElementById('m-home-name'); if(nm) nm.textContent=sd.displayName||'—';
  const elName=document.getElementById('m-home-profile-name'); if(elName) elName.value=sd.displayName||'';
  const elBday=document.getElementById('m-home-profile-birthday'); if(elBday) elBday.value=sd.birthday||'';
  const elGender=document.getElementById('m-home-profile-gender');
  if(elGender){ let g=sd.gender||''; if(g==='M')g='男'; else if(g==='F')g='女'; elGender.value=g; }
  try{ setSelfName(sd.displayName||''); }catch(e){}
}

export function initHome(displayName){
  // 1. Hi 列
  document.getElementById('m-home-name').textContent=displayName||'—';

  // 2. 兩大按鈕進度
  updateHomeProgress();

  // 3. 四大方塊點擊：先把 active 設回本人 → 跳對應 tab（上課/部位觀察/我的/個案管理）
  const TAB_FOR={obs:'input',manual:'manual',my:'report',cases:'cases'};
  document.querySelectorAll('[data-go]').forEach(function(btn){
    btn.onclick=async function(){
      const target=btn.dataset.go;
      try{ setActiveCase(null); await refreshUserData(); }catch(e){}
      try{ updateHomeProgress(); }catch(e){}
      if(target==='obs'){ try{ localStorage.setItem('m_input_view','quiz'); }catch(e){} }
      else if(target==='manual'){ try{ localStorage.setItem('m_manual_view','input'); }catch(e){} }
      const tabBtn=document.querySelector('.m-tab[data-tab="'+(TAB_FOR[target]||'home')+'"]');
      if(tabBtn) tabBtn.click();
    };
  });

  // 4. 基本資料（沿用 row 排版 + debounce 儲存）
  const ud=window.__userData||{};
  const elName=document.getElementById('m-home-profile-name');
  const elBday=document.getElementById('m-home-profile-birthday');
  const elGender=document.getElementById('m-home-profile-gender');
  const elStatus=document.getElementById('m-home-profile-status');
  const elNavUser=document.getElementById('m-nav-user');

  // 首頁改四方塊後，基本資料表單已搬到「我的」分頁；首頁無此表單時略過
  if(!elName) return;
  elName.value=ud.displayName||'';
  elBday.value=ud.birthday||'';
  // gender 既有資料 'M'/'F' 自動 migrate 到中文
  let _initGender=ud.gender||'';
  let _genderMigrated=false;
  if(_initGender==='M'){_initGender='男';_genderMigrated=true;}
  else if(_initGender==='F'){_initGender='女';_genderMigrated=true;}
  elGender.value=_initGender;

  // 只在按「存檔」時才寫入（不再自動存）
  const elSave=document.getElementById('m-home-profile-save');
  async function doSave(){
    elStatus.textContent='儲存中…';
    elStatus.className='m-home-profile-status is-saving';
    try{
      await persistProfile({displayName:elName.value, birthday:elBday.value, gender:elGender.value});
      elStatus.textContent='已儲存';
      elStatus.className='m-home-profile-status is-saved';
      setTimeout(function(){if(elStatus.textContent==='已儲存') elStatus.textContent='';},1500);
    }catch(e){
      debugLog('[Profile]','儲存失敗',e&&e.message?e.message:e);
      elStatus.textContent='儲存失敗';
      elStatus.className='m-home-profile-status is-error';
    }
  }
  if(elSave) elSave.addEventListener('click',doSave);
}
