import { OBS_PART_NAMES, OBS_PARTS_DATA, obsData, obsOverride, curObsPart, setCurObsPart,
         FACE_MAP_PARTS, data, cur, DIMS, BETA_VISIBLE_DIMS,
         setNavActive, showPage, save, userName, _isTA, _currentCaseId, _currentCaseName } from './core.js';
import { calcDim } from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { renderDimPanel } from './cond_page.js';

export function getPartCounts(obsIdx){
  const pn=OBS_PART_NAMES[obsIdx];if(!pn)return{ck:0,tot:0};
  const pd=OBS_PARTS_DATA[pn];if(!pd)return{ck:0,tot:0};
  let answered=0;
  pd.sections.forEach(sec=>{sec.qs.forEach(q=>{if(obsData[q.id]!==undefined)answered++;});});
  return{ck:answered,tot:pd.total};
}

export function updateObsProgress(){
  let answered=0;
  OBS_PART_NAMES.forEach(pn=>{const pd=OBS_PARTS_DATA[pn];if(!pd)return;pd.sections.forEach(sec=>{sec.qs.forEach(q=>{if(obsData[q.id]!==undefined)answered++;});});});
  const total=124;
  const pct=Math.min(100,Math.round(answered/total*100));
  const bar=document.getElementById('obs-prog-bar');
  const pctEl=document.getElementById('obs-prog-pct');
  const numEl=document.getElementById('obs-prog-num');
  if(bar)bar.style.width=pct+'%';
  if(pctEl)pctEl.textContent=pct+'%';
  if(numEl)numEl.textContent=answered+' / '+total+' 題';
}

export function renderFaceMap(){
  const el=document.getElementById('face-map-col');
  let html='<div style="padding:10px 8px 4px;font-size:12px;font-weight:400;letter-spacing:1px;color:var(--text-3);text-align:center">部位地圖</div>';
  html+='<div class="face-map">';
  FACE_MAP_PARTS.forEach(fp=>{
    const c=getPartCounts(fp.obsIdx);
    let cls='face-cell';
    const isActive=(fp.obsIdx===curObsPart);
    const isComplete=(c.ck>=c.tot&&c.tot>0);
    if(isActive) cls+=' active-part';
    else if(isComplete) cls+=' complete';
    else if(c.ck>0) cls+=' partial';
    let extraStyle='';
    if(!isActive && !isComplete) extraStyle=';background:#FFF3CD;border-color:#E6C66B';
    html+='<div class="'+cls+'" style="grid-column:'+fp.col+';grid-row:'+fp.row+extraStyle+'" onclick="gotoObsPart('+fp.obsIdx+')">';
    const displayName=fp.name.replace('耳2','耳').replace('頤2','頤');
    html+='<span class="update-badge" id="badge-part-'+displayName+'"></span>';
    html+='<span class="fc-name">'+displayName+'</span>';
    html+='<span class="fc-count">'+c.ck+'/'+c.tot+'</span>';
    html+='</div>';
  });
  html+='</div>';
  html+='<div style="padding:12px 14px;border-top:1px solid var(--border);margin-top:auto;flex-shrink:0;">';
  html+='<div style="font-size:11px;color:var(--text-3);letter-spacing:2px;margin-bottom:8px;">填寫進度</div>';
  html+='<div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:10px;"><div id="obs-prog-bar" style="height:100%;background:var(--static);border-radius:2px;width:0%;transition:width 0.3s;"></div></div>';
  html+='<div style="display:flex;justify-content:space-between;align-items:baseline;"><div id="obs-prog-pct" style="font-size:30px;color:var(--text);font-weight:400;font-family:monospace;">0%</div><div id="obs-prog-num" style="font-size:12px;color:var(--text-3);letter-spacing:1px;">0 / 124 題</div></div>';
  html+='</div>';
  el.innerHTML=html;
  updateObsProgress();
  if(window._refreshBadges)window._refreshBadges();
}

export function renderObsCenter(){
  const el=document.getElementById('obs-center');if(!el)return;
  const partName=OBS_PART_NAMES[curObsPart];
  const partData=OBS_PARTS_DATA[partName];
  if(!partData){el.innerHTML='';return;}
  let answered=0;
  partData.sections.forEach(sec=>{sec.qs.forEach(q=>{if(obsData[q.id]!==undefined)answered++;});});
  let html='<div class="obs-header"><h2>'+partName+'</h2><span class="obs-count">'+answered+' / '+partData.total+' 已填</span></div>';
  let qNum=1;
  partData.sections.forEach(sec=>{
    html+='<div class="obs-section-label">'+sec.label+'</div>';
    html+='<div class="obs-two-col">';
    sec.qs.forEach(q=>{
      const isPaired=!!q.paired;
      const val=obsData[q.id];
      const valL=obsData[q.id+'_L'];
      const valR=obsData[q.id+'_R'];
      const isUnanswered=(val===undefined);
      html+='<div class="obs-q-card'+(isUnanswered?' unanswered':'')+'"><div class="obs-q-top"><span class="obs-q-num2" style="position:relative;display:inline-block"><span class="update-badge q-badge" data-part="'+partName+'" data-qid="'+q.id+'" style="top:-4px;right:-4px;width:8px;height:8px"></span>'+qNum+'</span><span class="obs-q-text2">'+q.text+'</span>'+(isPaired?'<button class="obs-paired-btn'+((valL||valR)?' active':'')+'" id="btn-lr-'+q.id+'" onclick="toggleLRRow(\''+q.id+'\',this)">可分左右 '+((valL||valR)?'▲':'▼')+'</button>':'')+'</div><div class="obs-opts-grid">';
      q.opts.forEach(opt=>{
        const ov=typeof opt==='string'?opt:opt.v;
        const hint=(typeof opt==='object'&&opt.hint)?opt.hint:'';
        const isSel=val===ov;
        html+='<div class="obs-opt-col" onclick="selectOpt(\''+q.id+'\','+isPaired+',\''+ov.replace(/'/g,"\\'")+'\',this)"><div class="obs-opt-left"><div class="obs-radio'+(isSel?' sel':'')+'"></div><div class="obs-opt-label'+(isSel?' sel':'')+'">'+ov+'</div></div>'+(hint?'<div class="obs-opt-hint">'+hint+'</div>':'<div></div>')+'</div>';
      });
      html+='</div>';
      if(isPaired){
        const hasLR=valL!==undefined||valR!==undefined;
        html+='<div class="obs-lr-row" id="lr-'+q.id+'" style="'+(hasLR?'display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;':'display:none;')+'">';
        html+='<span style="font-size:12px;color:var(--text-3);margin-right:4px;">左：</span>';
        q.opts.forEach(opt=>{const ov=typeof opt==='string'?opt:opt.v;const sel=valL===ov?' selected':'';html+='<span class="obs-pill-lr'+sel+'" onclick="selectLROpt(\''+q.id+'\',\'L\',\''+ov.replace(/'/g,"\\'")+'\',this)">'+ov+'</span>';});
        html+='<span style="font-size:12px;color:var(--text-3);margin:0 4px 0 12px;">右：</span>';
        q.opts.forEach(opt=>{const ov=typeof opt==='string'?opt:opt.v;const sel=valR===ov?' selected':'';html+='<span class="obs-pill-lr'+sel+'" onclick="selectLROpt(\''+q.id+'\',\'R\',\''+ov.replace(/'/g,"\\'")+'\',this)">'+ov+'</span>';});
        html+='</div>';
      }
      html+='</div>';
      qNum++;
    });
    html+='</div>';
  });
  el.innerHTML=html;
  el.scrollTop=0;
  // 對已有 L/R 資料的題目，同步上層 radio 狀態
  if(partData)partData.sections.forEach(s=>s.qs.forEach(q=>{
    if(q.paired&&(obsData[q.id+'_L']!==undefined||obsData[q.id+'_R']!==undefined))syncUpperRadio(q.id);
  }));
  if(window._refreshBadges)window._refreshBadges();
}

export function selectOpt(id,isPaired,val,el){
  obsData[id]=val;
  if(isPaired){delete obsData[id+'_L'];delete obsData[id+'_R'];}
  localStorage.setItem('obs_data_v1',JSON.stringify(obsData));
  recalcFromObs();save();updateObsProgress();_refreshObsUI();
  const qCard=el.closest('.obs-q-card');
  if(qCard){
    qCard.querySelectorAll('.obs-radio').forEach(r=>r.classList.remove('sel'));
    qCard.querySelectorAll('.obs-opt-label').forEach(l=>l.classList.remove('sel'));
    const clicked=el.classList.contains('obs-opt-col')?el:el.closest('.obs-opt-col');
    if(clicked){clicked.querySelector('.obs-radio')?.classList.add('sel');clicked.querySelector('.obs-opt-label')?.classList.add('sel');}
  }
  const partName=OBS_PART_NAMES[curObsPart],pd=OBS_PARTS_DATA[partName];
  let ans=0;if(pd)pd.sections.forEach(s=>s.qs.forEach(q=>{if(obsData[q.id]!==undefined)ans++;}));
  const ce=document.querySelector('.obs-count');if(ce&&pd)ce.textContent=ans+' / '+pd.total+' 已填';
  if(window._markQuestionSeen)window._markQuestionSeen(partName, id);
}

export function selectLROpt(id,side,val,el){
  obsData[id+'_'+side]=val;
  // 同步主值：原本沒主值，且左右兩邊都有值時才寫主值
  // 用於修正「直接從可分左右作答」造成主值 undefined、被算成未答的 bug
  if(obsData[id]===undefined){
    const _vL=obsData[id+'_L'],_vR=obsData[id+'_R'];
    if(_vL!==undefined&&_vR!==undefined){
      obsData[id]=(_vL===_vR)?_vL:_vL;  // 左右不同時以左為代表
    }
  }
  localStorage.setItem('obs_data_v1',JSON.stringify(obsData));
  const row=el.closest('.obs-lr-row');
  const partName=OBS_PART_NAMES[curObsPart],pd=OBS_PARTS_DATA[partName];
  let optCount=2;
  if(pd)pd.sections.forEach(s=>s.qs.forEach(q=>{if(q.id===id)optCount=q.opts.length;}));
  const spans=[...row.querySelectorAll('.obs-pill-lr')];
  const target=side==='L'?spans.slice(0,optCount):spans.slice(optCount);
  target.forEach(s=>{if(s.textContent.trim()===val)s.classList.add('selected');else s.classList.remove('selected');});
  syncUpperRadio(id);
  recalcFromObs();save();updateObsProgress();_refreshObsUI();
  requestAnimationFrame(()=>{
    if(pd){pd.sections.forEach(sec=>{sec.qs.forEach(q=>{
      if(!q.paired)return;
      const vL=obsData[q.id+'_L'],vR=obsData[q.id+'_R'];
      if(vL!==undefined||vR!==undefined){
        const lrRow=document.getElementById('lr-'+q.id);
        const btn=document.getElementById('btn-lr-'+q.id);
        if(lrRow){lrRow.style.display='flex';lrRow.style.flexWrap='wrap';lrRow.style.alignItems='center';lrRow.style.gap='6px';lrRow.style.marginTop='8px';}
        if(btn){btn.innerHTML='可分左右 ▲';btn.classList.add('active');}
        if(lrRow){
          const allPills=[...lrRow.querySelectorAll('.obs-pill-lr')];
          let oCount=2;
          pd.sections.forEach(s=>s.qs.forEach(qq=>{if(qq.id===q.id)oCount=qq.opts.length;}));
          const leftPills=allPills.slice(0,oCount),rightPills=allPills.slice(oCount);
          leftPills.forEach(p=>{if(p.textContent.trim()===vL)p.classList.add('selected');else p.classList.remove('selected');});
          rightPills.forEach(p=>{if(p.textContent.trim()===vR)p.classList.add('selected');else p.classList.remove('selected');});
        }
      }
    });});
    }
  });
  if(window._markQuestionSeen)window._markQuestionSeen(partName, id);
}

export function syncUpperRadio(id){
  // 根據 _L/_R 狀態，更新上層 radio 的顯示
  const vL=obsData[id+'_L'], vR=obsData[id+'_R'];
  const v=obsData[id];
  const qCard=document.getElementById('lr-'+id)?.closest('.obs-q-card');
  if(!qCard)return;
  qCard.querySelectorAll('.obs-opt-col').forEach(col=>{
    const label=col.querySelector('.obs-opt-label');
    const radio=col.querySelector('.obs-radio');
    if(!label||!radio)return;
    const ov=label.textContent.trim();
    radio.classList.remove('sel','half');
    label.classList.remove('sel');
    if(vL!==undefined&&vR!==undefined){
      if(vL===ov&&vR===ov){radio.classList.add('sel');label.classList.add('sel');}
      else if(vL===ov||vR===ov){radio.classList.add('half');}
    } else if(v===ov){radio.classList.add('sel');label.classList.add('sel');}
  });
}

export function toggleLRRow(id,btn){
  const row=document.getElementById('lr-'+id);if(!row)return;
  const isOpen=row.style.display!=='none';
  if(isOpen){
    row.style.display='none';btn.innerHTML='可分左右 ▼';btn.classList.remove('active');
    // 收合時清除 L/R，恢復上層顯示
    // 不清除資料，讓左右不同狀態保留，只是收起 UI
    syncUpperRadio(id);
  }else{
    // 展開時，若 L/R 尚未設定，從上層預填
    const parent=obsData[id];
    if(obsData[id+'_L']===undefined&&obsData[id+'_R']===undefined&&parent!==undefined){
      obsData[id+'_L']=parent;
      obsData[id+'_R']=parent;
      localStorage.setItem('obs_data_v1',JSON.stringify(obsData));
    }
    row.style.display='flex';row.style.flexWrap='wrap';row.style.alignItems='center';row.style.gap='6px';row.style.marginTop='8px';
    btn.innerHTML='可分左右 ▲';btn.classList.add('active');
    const vL=obsData[id+'_L'],vR=obsData[id+'_R'];
    const partName=OBS_PART_NAMES[curObsPart],pd=OBS_PARTS_DATA[partName];
    let oCount=2;
    if(pd)pd.sections.forEach(s=>s.qs.forEach(q=>{if(q.id===id)oCount=q.opts.length;}));
    const allPills=[...row.querySelectorAll('.obs-pill-lr')];
    const leftPills=allPills.slice(0,oCount),rightPills=allPills.slice(oCount);
    leftPills.forEach(p=>{if(vL!==undefined&&p.textContent.trim()===vL)p.classList.add('selected');else p.classList.remove('selected');});
    rightPills.forEach(p=>{if(vR!==undefined&&p.textContent.trim()===vR)p.classList.add('selected');else p.classList.remove('selected');});
    syncUpperRadio(id);
  }
}

export function onObsDefaultChange(id,el,isPaired){
  if(isPaired&&el.indeterminate){
    el.indeterminate=false;el.checked=true;
    obsData[id]=true;
    delete obsOverride['L_'+id];delete obsOverride['R_'+id];
  }else{
    if(el.checked)obsData[id]=true;else delete obsData[id];
    if(isPaired){delete obsOverride['L_'+id];delete obsOverride['R_'+id];}
  }
  localStorage.setItem('obs_data_v1',JSON.stringify(obsData));
  localStorage.setItem('obs_override_v1',JSON.stringify(obsOverride));
  recalcFromObs();save();
  _refreshObsUI();
}

export function onOverrideChange(baseId,side,checked){
  const key=side+'_'+baseId;
  const defaultVal=!!obsData[baseId];
  if(checked===defaultVal){delete obsOverride[key];}else{obsOverride[key]=checked;}
  localStorage.setItem('obs_override_v1',JSON.stringify(obsOverride));
  recalcFromObs();save();
  _refreshObsUI();
}

export function _refreshObsUI(){
  const center=document.getElementById('obs-center');
  const st=center?center.scrollTop:0;
  const openLRs=new Set();
  if(center){center.querySelectorAll('.obs-lr-row').forEach(r=>{if(r.style.display!=='none')openLRs.add(r.id);});}
  renderObsCenter();
  openLRs.forEach(rid=>{const r=document.getElementById(rid);if(r){r.style.display='flex';const btn=r.previousElementSibling?.querySelector('.obs-expand-btn');if(btn)btn.innerHTML='&#9660;';}});
  if(center)center.scrollTop=st;
  renderFaceMap();
  renderDimIndex();
}

export function renderDimIndex(){
  renderDimPanel(document.getElementById('dim-index-col'),cur);
}

export function gotoObsPart(i){setCurObsPart(i);renderFaceMap();renderObsCenter();renderDimIndex();if(window._markPartSeen){const pn=OBS_PART_NAMES[i];if(pn)window._markPartSeen(pn);}}

export function toggleDetailGroup(header){header.classList.toggle('collapsed');header.nextElementSibling.classList.toggle('hidden');}

export function collectDetailForPrompt(){
  const checked=[],unchecked=[];
  OBS_PART_NAMES.forEach(pn=>{
    const pd=OBS_PARTS_DATA[pn];if(!pd)return;
    pd.sections.forEach(sec=>{sec.qs.forEach(q=>{
      const val=obsData[q.id];
      if(val!==undefined)checked.push(pn+'·'+q.text+'：'+val);
      else unchecked.push(pn+'·'+q.text);
    });});
  });
  return{checked,unchecked};
}

export function renderDetailConditions(){
  const area=document.getElementById('detail-conditions-area');if(!area)return;
  let html='<div class="detail-section"><h3>觀察條件紀錄</h3>';
  OBS_PART_NAMES.forEach(pn=>{
    const pd=OBS_PARTS_DATA[pn];if(!pd)return;
    let ck=0,tt=0;
    pd.sections.forEach(sec=>sec.qs.forEach(q=>{tt++;if(obsData[q.id]!==undefined)ck++;}));
    html+='<div class="detail-group"><div class="detail-group-header collapsed" onclick="toggleDetailGroup(this)"><span>'+pn+'（'+ck+'/'+tt+'）</span><span class="toggle-arrow">&#9660;</span></div><div class="detail-group-body hidden">';
    pd.sections.forEach(sec=>{
      html+='<div style="font-size:11px;color:var(--text-3);padding:6px 0 2px;letter-spacing:2px;">'+sec.label+'</div>';
      sec.qs.forEach(q=>{
        const val=obsData[q.id];
        html+='<div class="detail-check"><span style="color:'+(val?'var(--static)':'#ccc')+';margin-right:6px;">'+(val?'●':'○')+'</span><span style="font-size:13px;color:var(--text-2);">'+q.text+(val?'：<strong>'+val+'</strong>':'')+'</span></div>';
      });
    });
    html+='</div></div>';
  });
  html+='</div>';area.innerHTML=html;
}

export function showObsPage(){
  showPage('app-body');
  document.getElementById('obs-page').style.display='grid';
  document.getElementById('dim-page').style.display='none';
  document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-obs');
  renderFaceMap();renderObsCenter();renderDimIndex();
  if(!window._suppressPushState) history.pushState({page:'obs'},'');
}
