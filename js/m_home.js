// ============================================================
// 手機版首頁 tab 邏輯
// 負責：Hi 列、進度條（13 維度+117 題）、上次做到、4 個快速入口、基本資料表單（debounce 儲存）
// 依賴：m_main.js 的 auth, db, debugLog
// 被用：m_main.js 的 showApp() 會呼叫 initHome()
// retest 範圍：Hi 列名字、進度顯示、快速入口切 tab、基本資料填寫＋儲存＋reload 還在
// ============================================================

import { auth, db, debugLog } from "./m_main.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { OBS_PARTS_DATA } from "./core.js";

// 13 維度名稱（順序對應 obs / 9×13 矩陣 index 0-12）
const DIM_NAMES_M=['形勢','經緯','方圓','曲直','收放','緩急','順逆','分合','真假','攻守','奇正','虛實','進退'];

// 計算進度：dim 看 9×13 矩陣（哪些維度全 9 cell 填滿）；q 看 obsData + OBS_PARTS_DATA 實際答題數
function calcProgress(){
  const ud=window.__userData||{};
  let obs={};
  if(ud.obsJson){
    try{obs=JSON.parse(ud.obsJson)||{};}catch(e){obs={};}
  }
  let matrix=null;
  if(ud.dataJson){
    try{matrix=JSON.parse(ud.dataJson);}catch(e){debugLog('[Home]','dataJson parse 失敗',e&&e.message);}
  }else if(ud.matrix){
    matrix=ud.matrix;
  }
  // 維度數：matrix 中全 9 cell 填的維度
  let dimCount=0;
  if(matrix&&Array.isArray(matrix)){
    for(let i=0;i<13;i++){
      if(!matrix[i]) continue;
      let filled=0;
      for(let j=0;j<9;j++){
        if(matrix[i][j]==='A'||matrix[i][j]==='B') filled++;
      }
      if(filled===9) dimCount++;
    }
  }
  // 答題數 / 總題數：從 OBS_PARTS_DATA 跟 obsData 算
  // paired 題：兩側都答完才算 1（Mike's Q B）；非 paired：obs[q.id] 有值就算 1
  let answered=0,total=0;
  for(const partKey of Object.keys(OBS_PARTS_DATA)){
    const part=OBS_PARTS_DATA[partKey];
    if(!part||!Array.isArray(part.sections)) continue;
    for(const section of part.sections){
      for(const q of (section.qs||[])){
        total++;
        if(q.paired){
          if(obs[q.id+'_L']!==undefined&&obs[q.id+'_R']!==undefined) answered++;
        }else{
          if(obs[q.id]!==undefined) answered++;
        }
      }
    }
  }
  return {dim:dimCount, answered, total};
}

// 從 window.__userData + OBS_PARTS_DATA 重算進度條 DOM（給 m_input.js 儲存後呼叫）
export function updateHomeProgress(){
  const prog=calcProgress();
  const elDim=document.getElementById('m-home-prog-dim');
  const elQ=document.getElementById('m-home-prog-q');
  const elQTotal=document.getElementById('m-home-prog-q-total');
  const elFill=document.getElementById('m-home-prog-fill');
  if(elDim) elDim.textContent=prog.dim;
  if(elQ) elQ.textContent=prog.answered;
  if(elQTotal) elQTotal.textContent=prog.total;
  if(elFill) elFill.style.width=(prog.dim/13*100)+'%';
}

export function initHome(displayName){
  // 1. Hi 列
  document.getElementById('m-home-name').textContent=displayName||'—';

  // 2. 進度
  updateHomeProgress();

  const ud=window.__userData||{};

  // 3. 上次做到
  const resume=document.getElementById('m-home-resume');
  if(ud.lastUpdatedDim!=null&&ud.lastUpdatedDim>=0&&ud.lastUpdatedDim<13){
    document.getElementById('m-home-resume-name').textContent=DIM_NAMES_M[ud.lastUpdatedDim]+' 維度';
    resume.style.display='block';
    document.getElementById('m-home-resume-btn').onclick=function(){
      document.querySelector('.m-tab[data-tab="input"]').click();
    };
  }else{
    resume.style.display='none';
  }

  // 4. 快速入口
  document.querySelectorAll('.m-home-qbtn').forEach(function(btn){
    btn.onclick=function(){
      const k=btn.dataset.quick;
      if(k==='report'){
        document.querySelector('.m-tab[data-tab="report"]').click();
      }else{
        // part / dim / manual：先跳到輸入 tab，Step 4-6 實作後再做深層導向
        document.querySelector('.m-tab[data-tab="input"]').click();
      }
    };
  });

  // 5. 基本資料
  const elName=document.getElementById('m-home-profile-name');
  const elBday=document.getElementById('m-home-profile-birthday');
  const elGender=document.getElementById('m-home-profile-gender');
  const elStatus=document.getElementById('m-home-profile-status');
  const elNavUser=document.getElementById('m-nav-user');

  elName.value=ud.displayName||'';
  elBday.value=ud.birthday||'';
  elGender.value=ud.gender||'';

  // debounce 儲存
  let saveTimer=null;
  function scheduleSave(){
    elStatus.textContent='儲存中…';
    elStatus.className='m-home-profile-status is-saving';
    clearTimeout(saveTimer);
    saveTimer=setTimeout(saveProfile,800);
  }
  async function saveProfile(){
    try{
      const uid=auth.currentUser&&auth.currentUser.uid;
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
        if(elNavUser) elNavUser.textContent=data.displayName;
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
}
