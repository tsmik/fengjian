// js/notes_page.js — 「筆記和參考 → 板書和部位條件」頁模組
// 職責：
//   左側列 13 維度（同知識頁互動）；選一維度後右側顯示
//   (1) 板書長文字（P3 由 admin 編輯、前台唯讀）
//   (2) 12 個固定部位方塊（P2 自動帶入判別條件、P4 使用者筆記）
// P1（本階段）：只做殼——導覽 / 路由 / 左側維度 / 右側 12 格框架（內容為佔位文字）。
import { DIMS, BETA_VISIBLE_DIMS, userName, _isTA, _currentCaseId, _currentCaseName,
         setNavActive, showPage, condResults, boardText, DIM_RULES, boardNotes, save, flushSaveNow } from './core.js';
import { recalcFromObs } from './obs_recalc.js';

function _esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// 單一筆記區塊（顯示/編輯切換）。idxKey：部位 partIdx 或板書用的 'board'
function _noteBlockHtml(dn, idxKey, noteVal){
  const v=(noteVal!=null)?String(noteVal):'';
  const hasNote=!!v.trim();
  return '<div class="board-note">'+
    '<div class="board-note-view">'+
      (hasNote?'<div class="board-note-text">'+_esc(v)+'</div>':'')+
      '<button class="board-note-btn" type="button" onclick="boardNoteEdit(this)">編輯我的筆記</button>'+
    '</div>'+
    '<div class="board-note-edit" style="display:none">'+
      '<textarea class="board-note-area" data-dim="'+_esc(dn)+'" data-idx="'+_esc(String(idxKey))+'" oninput="boardNoteInput(this)" placeholder="寫下你的筆記…">'+_esc(v)+'</textarea>'+
      '<div class="board-note-actions"><button class="board-note-save" type="button" onclick="boardNoteSave(this)">儲存</button></div>'+
    '</div>'+
  '</div>';
}

// 固定 12 個部位方塊（label 顯示名 / idx 對應 obs_recalc.js 的 PART_NAME_TO_IDX）
// 頂骨13 枕骨14 華陽骨15 上停1 耳4 眉5 眼6 鼻7 口8 人中10 地閣11 頤12
export const BOARD_PARTS=[
  {label:'頂骨',idx:13},{label:'枕骨',idx:14},{label:'華陽骨',idx:15},
  {label:'上停',idx:1},{label:'耳',idx:4},{label:'眉',idx:5},
  {label:'眼',idx:6},{label:'鼻',idx:7},{label:'口',idx:8},
  {label:'人中',idx:10},{label:'地閣',idx:11},{label:'頤',idx:12}
];

let curBoard=-1;

// 左側維度清單（比照 knowledge_page.kRender）
export function boardRenderSidebar(){
  const sb=document.getElementById('board-sidebar');
  if(!sb)return;
  let lastCat='',html='';
  DIMS.forEach(function(d,i){
    if(d.cat!==lastCat){
      html+='<div class="k-sidebar-section">'+d.cat+'</div>';
      lastCat=d.cat;
    }
    if(i>=BETA_VISIBLE_DIMS){
      html+='<div class="k-sidebar-item" style="opacity:0.4;pointer-events:none">'+
        '<div><div class="k-sidebar-title" style="color:#bbb">'+d.dn+' - 建置中</div></div>'+
      '</div>';
    }else{
      html+='<div class="k-sidebar-item" id="bsi-'+i+'" onclick="boardSelect('+i+')">'+
        '<div><div class="k-sidebar-title">'+d.dn+' - '+d.view+'</div></div>'+
      '</div>';
    }
  });
  sb.innerHTML=html;
  // 重新標記目前選取
  if(curBoard>=0){const a=document.getElementById('bsi-'+curBoard);if(a)a.classList.add('active');}
}

// 右側內容（P1：佔位；P2 起帶入條件、P4 起加筆記）
function boardContentHtml(i){
  const d=DIMS[i];
  let html='';
  const dnNotes=boardNotes[d.dn]||{};
  // 區塊一：板書（左：admin 編輯、前台唯讀；右：學員針對板書的筆記）
  const lecture=boardText[d.dn];
  html+='<div class="board-block-title">板書</div>';
  html+='<div class="board-lecture-wrap">'+
    '<div class="board-lecture" id="board-lecture">'+(lecture?_esc(lecture):'（尚未設定板書文字）')+'</div>'+
    '<div class="board-lecture-note"><div class="board-note-caption">我的板書筆記</div>'+_noteBlockHtml(d.dn,'board',dnNotes['board'])+'</div>'+
  '</div>';
  // 區塊二：部位判別條件（自動帶入該維度該部位的「敘述分組」名稱，一行一個）
  // 標題提示此串條件最終判別成的維度結果（正向字，取自規則 positive）
  const pos=(DIM_RULES[i]&&DIM_RULES[i].positive)?DIM_RULES[i].positive:'';
  const condHeading=pos?('判別為「'+_esc(pos)+'」的條件'):'部位判別條件';
  html+='<div class="board-cond-heading">'+condHeading+'</div>';
  html+='<div class="board-grid">';
  const cr=condResults[i]||{};
  BOARD_PARTS.forEach(function(bp){
    const p=cr[bp.idx];
    const groups=[];
    if(p&&p.items){
      p.items.forEach(function(it){
        if(it.groupLabel&&groups.indexOf(it.groupLabel)<0)groups.push(it.groupLabel);
      });
    }
    let body;
    if(groups.length){
      body=groups.map(function(g){return '<div class="board-cond-line">'+_esc(g)+'</div>';}).join('');
    }else{
      body='<div class="board-empty">（此維度無此部位的敘述分組）</div>';
    }
    const noteUi='<div class="board-box-foot">'+_noteBlockHtml(d.dn,bp.idx,dnNotes[bp.idx])+'</div>';
    html+='<div class="board-box">'+
      '<div class="board-box-head">'+bp.label+'</div>'+
      '<div class="board-box-body">'+body+'</div>'+
      noteUi+
    '</div>';
  });
  html+='</div>';
  return html;
}

export function boardSelect(i){
  if(curBoard>=0){const old=document.getElementById('bsi-'+curBoard);if(old)old.classList.remove('active');}
  curBoard=i;
  const el=document.getElementById('bsi-'+i);if(el)el.classList.add('active');
  const d=DIMS[i];
  const t=document.getElementById('board-main-title');if(t)t.textContent=d.dn;
  const s=document.getElementById('board-main-sub');if(s)s.textContent=d.cat+' ・ '+d.view;
  const c=document.getElementById('board-content');if(c)c.innerHTML=boardContentHtml(i);
}

// 提供給 _renderCurrentTab：重建側欄並重繪目前維度
export function boardRender(){
  boardRenderSidebar();
  if(curBoard>=0)boardSelect(curBoard);
}

// 文字框隨內容自動長高（取代手動拖曳）
function _autoGrow(ta){if(!ta)return;ta.style.height='auto';ta.style.height=(ta.scrollHeight+2)+'px';}

// 按「編輯我的筆記」→ 進入編輯模式
export function boardNoteEdit(btn){
  const root=btn.closest('.board-note');if(!root)return;
  const view=root.querySelector('.board-note-view');if(view)view.style.display='none';
  const edit=root.querySelector('.board-note-edit');if(edit)edit.style.display='block';
  const ta=root.querySelector('textarea');
  if(ta){_autoGrow(ta);ta.focus();const v=ta.value;ta.value='';ta.value=v;/* 游標移末尾 */}
}

// 按「儲存」→ 立即寫入雲端、收起編輯模式、唯讀呈現文字
export function boardNoteSave(btn){
  const root=btn.closest('.board-note');if(!root)return;
  const ta=root.querySelector('textarea');
  const val=ta?ta.value:'';
  if(ta)boardNoteInput(ta);
  try{flushSaveNow();}catch(e){}
  const view=root.querySelector('.board-note-view');
  let txt=view?view.querySelector('.board-note-text'):null;
  if(val.trim()){
    if(!txt){txt=document.createElement('div');txt.className='board-note-text';view.insertBefore(txt,view.firstChild);}
    txt.textContent=val;
  }else if(txt){txt.remove();}
  const edit=root.querySelector('.board-note-edit');if(edit)edit.style.display='none';
  if(view)view.style.display='block';
}

// 筆記輸入 → 寫入 boardNotes、自動長高、走既有 save() debounce 雲端儲存
export function boardNoteInput(ta){
  const dim=ta.getAttribute('data-dim');
  const idx=ta.getAttribute('data-idx');
  if(!dim)return;
  if(!boardNotes[dim])boardNotes[dim]={};
  boardNotes[dim][idx]=ta.value;
  _autoGrow(ta);
  try{save();}catch(e){console.error('board note save:',e);}
}

export function showBoardPage(){
  try{recalcFromObs();}catch(e){console.error('board recalc:',e);}
  showPage('board-page');
  const nm=document.getElementById('nav-name');
  if(nm)nm.innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-board');
  if(curBoard<0)boardSelect(0);
  if(!window._suppressPushState){history.pushState({page:'board',dim:curBoard},'');}
}
