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

import { auth, db, debugLog, getEffectiveUid } from "./m_main.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { OBS_PARTS_DATA } from "./core.js";

// 觀察答題進度：obsData 的答題數 / OBS_PARTS_DATA 題目總數
function calcObsProgress(){
  const ud=window.__userData||{};
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

// 手動輸入維度進度：manualDataJson 13×9 array 中已填滿 9 cell 的維度數
function calcManualDimProgress(){
  const ud=window.__userData||{};
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

// 從 window.__userData + OBS_PARTS_DATA 重算兩大按鈕進度（給 m_input.js / m_manual.js 儲存後呼叫）
export function updateHomeProgress(){
  const obs=calcObsProgress();
  const elObsFill=document.getElementById('m-home-obs-fill');
  const elObsQ=document.getElementById('m-home-obs-q');
  const elObsQTotal=document.getElementById('m-home-obs-q-total');
  if(elObsQ) elObsQ.textContent=obs.answered;
  if(elObsQTotal) elObsQTotal.textContent=obs.total;
  if(elObsFill) elObsFill.style.width=(obs.total>0 ? obs.answered/obs.total*100 : 0)+'%';

  const manualDim=calcManualDimProgress();
  const elManualFill=document.getElementById('m-home-manual-fill');
  const elManualDim=document.getElementById('m-home-manual-dim');
  if(elManualDim) elManualDim.textContent=manualDim;
  if(elManualFill) elManualFill.style.width=(manualDim/13*100)+'%';
}

export function initHome(displayName){
  // 1. Hi 列
  document.getElementById('m-home-name').textContent=displayName||'—';

  // 2. 兩大按鈕進度
  updateHomeProgress();

  // 3. 兩大按鈕點擊：跳對應 tab + 設好預設 view
  document.querySelectorAll('[data-go]').forEach(function(btn){
    btn.onclick=function(){
      const target=btn.dataset.go;
      if(target==='obs'){
        // 部位觀察 tab → 答題 view
        try{ localStorage.setItem('m_input_view','quiz'); }catch(e){}
        const tabBtn=document.querySelector('.m-tab[data-tab="input"]');
        if(tabBtn) tabBtn.click();
      }else if(target==='manual'){
        // 手動輸入 tab → 輸入 view
        try{ localStorage.setItem('m_manual_view','input'); }catch(e){}
        const tabBtn=document.querySelector('.m-tab[data-tab="manual"]');
        if(tabBtn) tabBtn.click();
      }
    };
  });

  // 4. 基本資料（沿用 row 排版 + debounce 儲存）
  const ud=window.__userData||{};
  const elName=document.getElementById('m-home-profile-name');
  const elBday=document.getElementById('m-home-profile-birthday');
  const elGender=document.getElementById('m-home-profile-gender');
  const elStatus=document.getElementById('m-home-profile-status');
  const elNavUser=document.getElementById('m-nav-user');

  elName.value=ud.displayName||'';
  elBday.value=ud.birthday||'';
  // gender 既有資料 'M'/'F' 自動 migrate 到中文
  let _initGender=ud.gender||'';
  let _genderMigrated=false;
  if(_initGender==='M'){_initGender='男';_genderMigrated=true;}
  else if(_initGender==='F'){_initGender='女';_genderMigrated=true;}
  elGender.value=_initGender;

  let saveTimer=null;
  function scheduleSave(){
    elStatus.textContent='儲存中…';
    elStatus.className='m-home-profile-status is-saving';
    clearTimeout(saveTimer);
    saveTimer=setTimeout(saveProfile,800);
  }
  async function saveProfile(){
    try{
      const uid=getEffectiveUid();
      if(!uid) return;
      const data={
        displayName:elName.value.trim(),
        birthday:elBday.value||'',
        gender:elGender.value||'',
        profileUpdatedAt:new Date().toISOString()
      };
      const userRef=doc(db,'users',uid);
      await setDoc(userRef,data,{merge:true});
      window.__userData=Object.assign(window.__userData||{},data);
      if(data.displayName){
        document.getElementById('m-home-name').textContent=data.displayName;
        // v1.7 階段 13：頂部右上固定顯示「登出」，不再同步 displayName
      }
      elStatus.textContent='已儲存';
      elStatus.className='m-home-profile-status is-saved';
      setTimeout(function(){if(elStatus.textContent==='已儲存') elStatus.textContent='';},1500);
    }catch(e){
      debugLog('[Profile]','儲存失敗',e&&e.message?e.message:e);
      elStatus.textContent='儲存失敗';
      elStatus.className='m-home-profile-status is-error';
    }
  }
  elName.addEventListener('input',scheduleSave);
  elBday.addEventListener('change',scheduleSave);
  elGender.addEventListener('change',scheduleSave);
  if(_genderMigrated) scheduleSave();
}
