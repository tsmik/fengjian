// js/cond_page.js — 維度條件評分頁模組
import { DIMS, data, condResults, obsData, OBS_PART_NAMES, OBS_PARTS_DATA, BETA_VISIBLE_DIMS,
         cur, setCur, userName, _isTA, _currentCaseId, _currentCaseName,
         setNavActive, showPage, save, PART_LABELS, PART_ORDER, calcDim } from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { evaluate } from './rule_engine.js';

// 從 qid 反查 partName
function _qidToPart(qid) {
  return OBS_PART_NAMES.find(function(n) {
    var pd = OBS_PARTS_DATA[n];
    if (!pd || !pd.sections) return false;
    return pd.sections.some(function(s) {
      return s.qs.some(function(q) { return q.id === qid; });
    });
  });
}

/* ===== 維度條件評分頁 ===== */
let cpCur=0,cpPartCur=0,_cpLrExpanded={},_cpGroupExpanded={},_cpPartCollapsed={};
var CP_PART_ORDER=[0,1,4,5,6,7,8,2,9,3,10,11,12];
var CP_PART_LABELS=['頭','上停','耳','眉','眼','鼻','口','中停','顴','下停','人中','地閣','頤'];

export function showCondPage(){
  showPage('cond-page');
  document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-cond');
  recalcFromObs();
  cpRender();
  if(!window._suppressPushState) history.pushState({page:'cond',dim:cpCur},'');
}

export function cpHide(){
  document.getElementById('cond-page').style.display='none';
}

export function cpGoto(i){cpCur=i;setCur(i);cpRender();if(typeof window.renderDimIndex==='function')window.renderDimIndex();if(window._markDimSeen&&DIMS[i])window._markDimSeen(DIMS[i].dn);}

export function cpRender(){
  try{cpRenderRight();}catch(e){console.error('cpRenderRight:',e);}
  try{cpRenderMain();}catch(e){console.error('cpRenderMain:',e);document.getElementById('cp-main').innerHTML='<div style="color:red;padding:20px">'+e.message+'</div>';}
  if(window._refreshBadges)window._refreshBadges();
}

export function renderDimPanel(el,dimIndex){
  if(!el)return;
  var useDim=(dimIndex!==undefined)?dimIndex:cpCur;
  var d=DIMS[useDim];
  var res=calcDim(data,useDim);
  var resBg=res?(res.type==='靜'?'#7A9E7E':'#C17A5A'):'#ccc';
  var SBG='#7A9E7E',DBG='#C17A5A';

  var html='';

  // === 上半部：維度方框分組 ===
  var groups=[
    {label:'先天係數',rows:[[0,1,2],[3,4,5]]},
    {label:'運氣係數',rows:[[6,7,8]]},
    {label:'後天係數',rows:[[9,10,11,12]]}
  ];
  var cellStyle='display:flex;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;border:1.5px solid #ddd6c8;background:transparent;padding:6px 8px;font-size:14px;font-weight:400;line-height:1.2;text-align:center;transition:all 0.15s';
  var activeStyle='background:#e8eff2;border-color:#7A9E7E;border-width:2px;color:#7A9E7E';
  groups.forEach(function(g){
    // 檢查這個 group 裡是否有超出 BETA 範圍的維度
    var groupHidden=g.rows.every(function(row){return row.every(function(di){return di>=BETA_VISIBLE_DIMS;});});
    if(groupHidden){
      html+='<div style="font-size:14px;font-weight:400;letter-spacing:2px;color:#ccc;padding:8px 0 4px 10px">'+g.label+'</div>';
      html+='<div style="padding:8px 10px;font-size:13px;color:#ccc">建置中</div>';
      return;
    }
    html+='<div style="font-size:14px;font-weight:400;letter-spacing:2px;color:var(--text-3);padding:8px 0 4px 10px">'+g.label+'</div>';
    g.rows.forEach(function(row){
      var cols=row.length;
      html+='<div style="display:grid;grid-template-columns:repeat('+cols+',1fr);gap:4px;margin-bottom:4px">';
      row.forEach(function(di){
        var dm=DIMS[di];
        if(di>=BETA_VISIBLE_DIMS){
          html+='<div style="'+cellStyle+';color:#ccc;pointer-events:none;opacity:0.5">'+
            '<div>'+dm.dn+'</div></div>';
          return;
        }
        var isActive=di===useDim;
        var dimRes=calcDim(data,di);
        var chipColor=dimRes?(dimRes.type==='靜'?SBG:DBG):'#ccc';
        html+='<div onclick="cpGoto('+di+')" style="'+cellStyle+';position:relative;'+(isActive?activeStyle:'color:var(--text-2)')+'">'+
          '<span class="update-badge" id="badge-dim-'+dm.dn+'" style="top:-4px;right:-4px;width:10px;height:10px"></span>'+
          '<div>'+dm.dn+
          '<div style="height:3px;margin-top:4px;border-radius:1.5px;background:'+chipColor+'"></div>'+
          '</div></div>';
      });
      html+='</div>';
    });
  });

  // BETA 模式下，選中維度超出範圍時不顯示部位明細
  if(useDim>=BETA_VISIBLE_DIMS){
    el.innerHTML=html;
    return;
  }

  // === 下半部：各部位結果表（兵法報告格式）===
  var partOrder=[0,1,2,3,4,5,6,7,8];
  var partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  var colL=d.da;
  var colR=d.db;
  var colLType=(d.da===d.a)?d.aT:d.bT;
  var colRType=(d.da===d.a)?d.bT:d.aT;
  var colLBg=colLType==='靜'?SBG:DBG;
  var colRBg=colRType==='靜'?SBG:DBG;
  var dimColors=['#5E8080','#6E9292','#7EA4A4','#527070','#608282','#6E9494','#9E8A5A','#B29E6E','#C6B282','#7A5A50','#8E6C62','#A27E74','#B69088'];
  var dimC=dimColors[useDim];
  var r2=parseInt(dimC.slice(1,3),16),g2=parseInt(dimC.slice(3,5),16),b2=parseInt(dimC.slice(5,7),16);
  var dimAlpha='rgba('+r2+','+g2+','+b2+',0.15)';
  var rc2='border-radius:3px';

  html+='<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">';
  html+='<table style="width:100%;border-collapse:separate;border-spacing:2px;font-size:14px">';
  html+='<thead><tr>'+
    '<th style="text-align:left;padding:5px 4px 5px 10px;color:var(--text-3);font-weight:400"></th>'+
    '<th style="text-align:center;padding:5px 4px;color:'+colLBg+';font-weight:400">'+colL+'</th>'+
    '<th style="text-align:center;padding:5px 4px;color:'+colRBg+';font-weight:400">'+colR+'</th>'+
  '</tr></thead><tbody>';
  partOrder.forEach(function(pi,i){
    var v=data[useDim][pi];
    var label=partLabels[i];
    var isStatic=false,isDynamic=false;
    if(v){var tp=v==='A'?d.aT:d.bT;isStatic=tp==='靜';isDynamic=tp==='動';}

    html+='<tr>';
    html+='<td style="padding:4px 6px;font-weight:400;color:var(--text-2)">'+label+'</td>';

    if(isStatic||isDynamic){
      var cellBg=isStatic?SBG:DBG;
      var cellLabel=isStatic?(d.aT==='靜'?d.a:d.b):(d.aT==='靜'?d.b:d.a);
      var goLeft=(isStatic&&colLType==='靜')||(isDynamic&&colLType==='動');
      if(goLeft){
        html+='<td style="text-align:center;padding:4px 8px;background:'+cellBg+';color:white;font-weight:400;'+rc2+'">'+cellLabel+'</td>';
        html+='<td style="text-align:center;padding:4px 8px;background:'+dimAlpha+';'+rc2+'"></td>';
      }else{
        html+='<td style="text-align:center;padding:4px 8px;background:'+dimAlpha+';'+rc2+'"></td>';
        html+='<td style="text-align:center;padding:4px 8px;background:'+cellBg+';color:white;font-weight:400;'+rc2+'">'+cellLabel+'</td>';
      }
    }else{
      html+='<td style="text-align:center;padding:4px 8px;'+rc2+'"></td>';
      html+='<td style="text-align:center;padding:4px 8px;'+rc2+'"></td>';
    }

    html+='</tr>';
  });
  html+='</tbody></table>';
  // 整體結果
  if(res){
    html+='<div style="margin-top:8px;padding:8px 12px;background:'+resBg+';color:white;border-radius:4px;display:flex;justify-content:space-between;align-items:center;font-weight:400;font-size:14px">'+
      '<span>'+res.type+'</span>'+
      '<span>係數 '+res.coeff.toFixed(1)+'</span>'+
    '</div>';
  }else{
    html+='<div style="margin-top:8px;padding:8px 12px;background:#ccc;color:white;border-radius:4px;text-align:center;font-weight:400;font-size:14px">—</div>';
  }
  html+='</div>';

  el.innerHTML=html;
}

export function cpRenderRight(){
  renderDimPanel(document.getElementById('cp-left'));
}

export function cpRenderMain(){
  var el=document.getElementById('cp-main');if(!el){console.error('cp-main not found');return;}
  if(cpCur>=BETA_VISIBLE_DIMS){
    el.innerHTML='<div style="padding:40px;text-align:center;color:#bbb;font-size:16px">此維度建置中</div>';
    return;
  }
  var d=DIMS[cpCur];
  var res=calcDim(data,cpCur);
  var resBg=res?(res.type==='靜'?'var(--static)':'var(--active)'):'#ccc';

  var html='<div style="padding-bottom:16px;border-bottom:2px solid var(--border);margin-bottom:4px">'+
    '<div style="font-size:var(--cp-dim-title);font-weight:400;color:var(--text)">'+d.dn+' - '+d.view+'</div>'+
    '<div style="font-size:var(--cp-dim-sub);color:var(--text-3);margin-top:4px">'+d.da+'（'+(d.da===d.a?d.aT:d.bT)+'）vs '+d.db+'（'+(d.db===d.a?d.aT:d.bT)+'）</div>'+
  '</div>';

  var cr=condResults[cpCur];
  if(!cr){
    el.innerHTML=html+'<div style="padding:20px;color:var(--text-3);font-size:var(--cp-dim-sub);text-align:center">請先至「各部位觀察」填寫觀察題</div>';
    return;
  }

  // 預建題目 lookup map
  var qMap={};
  OBS_PART_NAMES.forEach(function(n){
    var pd=OBS_PARTS_DATA[n];if(!pd)return;
    pd.sections.forEach(function(s){s.qs.forEach(function(qq){qMap[qq.id]=qq;});});
  });

  // 取得選項的 hint 文字
  function getHint(q,val){
    if(!q||!q.opts)return '';
    for(var i=0;i<q.opts.length;i++){
      var o=q.opts[i];
      var v=typeof o==='string'?o:o.v;
      var h=typeof o==='string'?'':o.hint||'';
      if(v===val&&h)return h;
    }
    return '';
  }

  // 渲染勾選框選項
  function renderOpts(q,qid,side,curVal){
    var out='<div style="display:flex;gap:10px;flex-wrap:wrap;flex:1">';
    var qidSafe=qid.replace(/'/g,"\\'");
    var sideSafe=(side||'').replace(/'/g,"\\'");
    q.opts.forEach(function(opt){
      var v=typeof opt==='string'?opt:opt.v;
      var hint=typeof opt==='string'?'':opt.hint||'';
      var isSel=v===curVal;
      var color=isSel?'var(--static)':'var(--text-2)';
      var borderColor=isSel?'var(--static)':'var(--text-3)';
      var vSafe=v.replace(/"/g,'&quot;');
      var hintHtml=hint?'<span style="font-size:var(--cp-option-desc);color:var(--text-3);margin-left:2px">'+hint+'</span>':'';
      var box='<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1.5px solid '+borderColor+';border-radius:2px;margin-right:6px;flex-shrink:0;font-size:14px;color:var(--static);vertical-align:middle">'+(isSel?'✓':'')+'</span>';
      out+='<button data-qid="'+qidSafe+'" data-side="'+sideSafe+'" data-val="'+vSafe+'" onclick="cpQuickChange(this)"'+
        ' style="display:inline-flex;align-items:baseline;padding:4px 6px;border:none;background:transparent;color:'+color+';font-size:var(--cp-option);cursor:pointer;font-weight:'+(isSel?'700':'400')+';white-space:normal;text-align:left;line-height:1.5">'+
        box+v+hintHtml+
      '</button>';
    });
    out+='</div>';
    return out;
  }

  function statusRow(ok,label){
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 8px;border-bottom:1px solid var(--border)">'+
      '<div style="width:24px;height:24px;border-radius:50%;background:'+(ok?'var(--static)':'#e8e8e8')+';color:'+(ok?'white':'#aaa')+';display:flex;align-items:center;justify-content:center;font-size:var(--cp-option-desc);font-weight:400;flex-shrink:0">'+(ok?'\u2713':'\u2717')+'</div>'+
      '<div style="font-size:var(--cp-question);color:'+(ok?'var(--text)':'var(--text-3)')+';flex:1">'+label+'</div>'+
    '</div>';
  }

  var partOrder=[0,13,14,15,1,4,5,6,7,8,2,9,3,10,11,12];
  var partLabels=['頭','頂骨','枕骨','華陽骨','上停','耳','眉','眼','鼻','口','中停','顴','下停','人中','地閣','頤'];

  html+='<div style="display:flex;justify-content:flex-end;padding:4px 0"><button onclick="cpToggleAllGroups('+cpCur+')" style="border:1px solid var(--border);background:transparent;padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;color:var(--text-3)">全部展開／收合</button></div>';

  partOrder.forEach(function(pi,idx){
    var p=cr[pi];if(!p)return;
    var label=partLabels[idx];
    var v=pi<=8?data[cpCur][pi]:null;
    var passBg,passLabel;
    if(pi>=9&&p){
      var tp9=p.pass?d.aT:d.bT;
      passBg=tp9==='靜'?'var(--static)':'var(--active)';
      passLabel=p.pass?d.a:d.b;
    }else if(v){
      var tp=v==='A'?d.aT:d.bT;
      passBg=tp==='靜'?'var(--static)':'var(--active)';
      passLabel=v==='A'?d.a:d.b;
    }else{
      passBg='#ccc';
      passLabel='—';
    }

    var _isInternalCP=(pi>=9);
    // --- section label（比照觀察頁樣式）---
    // 判斷此部位是否有 group
    var hasGroups=p.items.some(function(item){return !!item.groupLabel;});
    var partAllExpanded=false;
    if(hasGroups){
      var _pgIds=[];var _pgLabel=null;
      p.items.forEach(function(item){
        if(item.groupLabel && item.groupLabel!==_pgLabel){
          _pgLabel=item.groupLabel;
          _pgIds.push('grp_'+cpCur+'_'+pi+'_'+_pgLabel.replace(/\s/g,''));
        }
      });
      partAllExpanded=_pgIds.length>0&&_pgIds.every(function(id){return !!_cpGroupExpanded[id];});
    }
    var partCollapseKey='cp_part_'+cpCur+'_'+pi;
    var isPartCollapsed=!!_cpPartCollapsed[partCollapseKey];
    var partArrow=isPartCollapsed?'▶':'▼';
    html+='<div id="cp-part-'+label+'" class="obs-section-label" style="margin-top:12px;display:flex;align-items:center;font-size:var(--cp-part-title);cursor:pointer'+(_isInternalCP?';margin-left:24px':'')+'" onclick="cpTogglePart(\''+partCollapseKey+'\')">'+
      '<span style="min-width:5em">'+label+' <span style="font-size:12px;color:var(--text-3);margin-left:4px">'+partArrow+'</span></span>'+
      '<span style="font-size:var(--cp-part-meta);color:var(--text-3);font-weight:400;margin-left:1em">'+p.score+'/'+p.max+'　'+p.threshold+'</span>'+
      '<span style="font-size:var(--cp-part-meta);padding:2px 10px;border-radius:10px;background:'+passBg+';color:white;font-weight:400;margin-left:auto">'+passLabel+'</span>'+
    '</div>';

    if(isPartCollapsed)return;

    // --- 合併左右配對項 ---
    function buildMerged(itemList){
      var merged=[];
      var usedIdx={};
      for(var i=0;i<itemList.length;i++){
        if(usedIdx[i])continue;
        var item=itemList[i];
        var qid=item.ids&&item.ids.length?item.ids[0]:'';
        var q=qid?qMap[qid]:null;
        if(item.side&&q&&q.paired){
          var pairIdx=-1;
          var otherSide=item.side==='L'?'R':'L';
          for(var j=i+1;j<itemList.length;j++){
            if(usedIdx[j])continue;
            var jItem=itemList[j];
            if(jItem.ids&&jItem.ids.length&&jItem.ids[0]===qid&&jItem.side===otherSide){
              pairIdx=j;break;
            }
          }
          if(pairIdx>=0){
            usedIdx[i]=true;usedIdx[pairIdx]=true;
            var lItem=item.side==='L'?item:itemList[pairIdx];
            var rItem=item.side==='R'?item:itemList[pairIdx];
            merged.push({type:'paired',qid:qid,q:q,lItem:lItem,rItem:rItem});
            continue;
          }
        }
        usedIdx[i]=true;
        merged.push({type:'single',item:item,qid:qid,q:q});
      }
      return merged;
    }

    // 渲染單題一列（含 side tag）
    function renderQRow(qid,q,side){
      var curVal=side?(obsData[qid+'_'+side]||obsData[qid]||''):obsData[qid]||'';
      var sideTag=side?'<span style="font-size:var(--cp-option-desc);padding:1px 6px;border-radius:6px;background:var(--sidebar);color:var(--text-3);margin-left:4px">'+(side==='L'?'左':'右')+'</span>':'';
      var qPart=_qidToPart(qid);
      var badgeHtml=qPart?'<span class="update-badge q-badge" data-part="'+qPart+'" data-qid="'+qid+'" style="top:-2px;left:-10px;width:8px;height:8px"></span>':'';
      return '<div style="display:flex;align-items:center;gap:10px;padding:4px 8px;flex-wrap:wrap;position:relative">'+
        '<div style="font-size:var(--cp-question);color:var(--text-2);min-width:80px;flex-shrink:0;display:flex;align-items:center;position:relative">'+badgeHtml+q.text+sideTag+'</div>'+
        renderOpts(q,qid,side||'',curVal)+
      '</div>';
    }

    // 渲染合併列選項（配對題不展開時）
    function renderMergedOpts(qid,q,mergedVal,diffMark,vL,vR){
      var out='<div style="display:flex;gap:10px;flex-wrap:wrap;padding:0 8px">';
      var qidSafe=qid.replace(/'/g,"\\'");
      q.opts.forEach(function(opt){
        var v=typeof opt==='string'?opt:opt.v;
        var hint=typeof opt==='string'?'':opt.hint||'';
        var isSel=v===mergedVal;
        var isHalf=!isSel&&diffMark&&(v===vL||v===vR);
        var color=isSel?'var(--static)':(isHalf?'var(--static)':'var(--text-2)');
        var borderColor=isSel?'var(--static)':(isHalf?'var(--static)':'var(--text-3)');
        var fontWeight=isSel?'700':(isHalf?'500':'400');
        var vSafe=v.replace(/"/g,'&quot;');
        var hintHtml=hint?'<span style="font-size:var(--cp-option-desc);color:var(--text-3);margin-left:2px">'+hint+'</span>':'';
        var halfTag=isHalf?'<span style="font-size:14px;color:var(--active);margin-left:3px">'+(v===vL?'左':'右')+'</span>':'';
        var boxFill=isSel?'✓':(isHalf?'−':'');
        var box='<span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1.5px solid '+borderColor+';border-radius:2px;margin-right:6px;flex-shrink:0;font-size:14px;color:var(--static);vertical-align:middle">'+boxFill+'</span>';
        out+='<button data-qid="'+qidSafe+'" data-side="" data-val="'+vSafe+'" onclick="cpQuickChange(this)"'+
          ' style="display:inline-flex;align-items:baseline;padding:4px 6px;border:none;background:transparent;color:'+color+';font-size:var(--cp-option);cursor:pointer;font-weight:'+fontWeight+';white-space:normal;text-align:left;line-height:1.5">'+
          box+v+halfTag+hintHtml+
        '</button>';
      });
      out+='</div>';
      return out;
    }

    // 連接符號
    function connLabel(type){
      if(type==='OR')return '<div style="padding:0 8px"><span style="font-size:var(--cp-option-desc);padding:1px 6px;border-radius:6px;background:var(--sidebar);color:var(--text-3)">或</span></div>';
      return '';
    }

    // 渲染一組 merged items 為 HTML
    function renderMergedList(merged){
      var out='';
      merged.forEach(function(m){
        if(m.type==='single'){
          var item=m.item;
          var allIds=item.ids||[];
          if(allIds.length===0||!qMap[allIds[0]]){
            out+=statusRow(item.ok,item.label);
            return;
          }
          out+='<div style="border-bottom:1px solid var(--border)">';
          allIds.forEach(function(qid,qi){
            var q=qMap[qid];
            if(!q)return;
            if(qi>0)out+=connLabel(item.connType||'AND');
            out+=renderQRow(qid,q,item.side||'');
          });
          out+='</div>';
          return;
        }

        // --- 配對題：合併顯示（支援多 id）---
        var allIds=m.lItem.ids||[m.qid];
        var anyDiff=false,anyExpanded=false;
        allIds.forEach(function(qid){
          var q=qMap[qid];
          if(!q)return;
          var vL=obsData[qid+'_L']||obsData[qid]||'';
          var vR=obsData[qid+'_R']||obsData[qid]||'';
          if(vL!==vR&&(vL||vR))anyDiff=true;
          var lrKey=cpCur+'_'+qid;
          if(_cpLrExpanded[lrKey])anyExpanded=true;
        });
        var gKey=cpCur+'_'+allIds[0];
        var isExp=!!_cpLrExpanded[gKey]||(anyDiff&&!anyExpanded);

        out+='<div style="border-bottom:1px solid var(--border);padding:8px 0">';

        allIds.forEach(function(qid,qi){
          var q=qMap[qid];
          if(!q)return;
          var isPaired=!!q.paired;
          if(qi>0)out+=connLabel(m.lItem.connType||'AND');

          if(isPaired){
            var vL=obsData[qid+'_L']||obsData[qid]||'';
            var vR=obsData[qid+'_R']||obsData[qid]||'';
            var bothSame=vL===vR;
            var mergedVal=bothSame?vL:'';
            var diffMark=(!bothSame&&(vL||vR));

            out+='<div style="display:flex;align-items:center;gap:10px;padding:4px 8px;margin-bottom:2px">'+
              '<div style="font-size:var(--cp-question);color:var(--text-2);min-width:80px;flex-shrink:0">'+q.text+'</div>';
            if(qi===0||allIds.length===1){
              out+='<button onclick="cpToggleLR(\''+gKey+'\')" style="font-size:var(--cp-option-desc);color:var(--static);font-weight:400;border:1px solid var(--static);border-radius:4px;padding:2px 8px;cursor:pointer;background:'+(isExp?'var(--static)':'transparent')+';color:'+(isExp?'white':'var(--static)')+';letter-spacing:1px;white-space:nowrap">'+(isExp?'▲ 收合':'▶ 左右不同')+'</button>';
              if(anyDiff&&!isExp)out+='<span style="font-size:var(--cp-option-desc);color:var(--active);font-weight:400">L≠R</span>';
            }
            out+='</div>';

            if(!isExp){
              out+=renderMergedOpts(qid,q,mergedVal,diffMark,vL,vR);
            }else{
              ['L','R'].forEach(function(side){
                var sideLabel=side==='L'?'左':'右';
                var cv=obsData[qid+'_'+side]||obsData[qid]||'';
                out+='<div style="display:flex;align-items:center;gap:10px;padding:4px 0;margin-left:16px">'+
                  '<span style="font-size:var(--cp-part-meta);padding:2px 8px;border-radius:6px;background:var(--sidebar);color:var(--text-3);flex-shrink:0">'+sideLabel+'</span>'+
                  renderOpts(q,qid,side,cv)+
                '</div>';
              });
            }
          }else{
            out+=renderQRow(qid,q,'');
          }
        });

        out+='</div>';
      });
      return out;
    }

    // --- 按 groupLabel 分組 ---
    var groups=[];
    var currentGroup=null;
    p.items.forEach(function(item){
      if(item.groupLabel){
        if(!currentGroup||currentGroup.label!==item.groupLabel){
          currentGroup={label:item.groupLabel,items:[item]};
          groups.push(currentGroup);
        }else{
          currentGroup.items.push(item);
        }
      }else{
        groups.push({label:null,items:[item]});
        currentGroup=null;
      }
    });

    html+='<div style="display:flex;flex-direction:column'+(_isInternalCP?';margin-left:24px':'')+'">';
    groups.forEach(function(g){
      if(g.label){
        // group 摺疊顯示（讀 wt 權重，例：h4 weight:2 → 計 2 分）
        var groupOk=g.items.reduce(function(s,i){return s+(i.ok?(i.wt||1):0);},0);
        var groupTotal=g.items.reduce(function(s,i){return s+(i.wt||1);},0);
        var allOk=groupOk===groupTotal;
        var groupId='grp_'+cpCur+'_'+pi+'_'+g.label.replace(/\s/g,'');
        var isGrpExp=!!_cpGroupExpanded[groupId];
        var headerColor=allOk?'var(--static)':'var(--text-3)';
        var arrow=isGrpExp?'▼':'▶';
        var scoreBadge='<span style="font-size:var(--cp-option-desc);color:'+headerColor+'">'+groupOk+'/'+groupTotal+'</span>';

        html+='<div onclick="cpToggleGroup(\''+groupId+'\')" style="display:flex;align-items:center;gap:8px;padding:8px 8px;cursor:pointer;border-bottom:1px solid var(--border)">'+
          '<span style="font-size:12px;color:'+headerColor+'">'+arrow+'</span>'+
          '<span style="font-size:var(--cp-question);color:'+(allOk?'var(--text)':'var(--text-3)')+';font-weight:400;flex:1">'+g.label+'</span>'+
          scoreBadge+
        '</div>';

        if(isGrpExp){
          html+='<div style="padding-left:20px;border-left:2px solid var(--border);margin-left:12px">';
          var gMerged=buildMerged(g.items);
          html+=renderMergedList(gMerged);
          html+='</div>';
        }
      }else{
        // 無 group：直接渲染
        var gMerged=buildMerged(g.items);
        html+=renderMergedList(gMerged);
      }
    });
    html+='</div>';
  });

  el.innerHTML=html;
}

export function cpToggleLR(lrKey){
  _cpLrExpanded[lrKey]=!_cpLrExpanded[lrKey];
  // 展開時預填：若 _L/_R 未設定，從主值帶入
  if(_cpLrExpanded[lrKey]){
    var sep=lrKey.indexOf('_');
    var qid=lrKey.substring(sep+1);
    var mainVal=obsData[qid]||'';
    if(mainVal){
      if(obsData[qid+'_L']===undefined)obsData[qid+'_L']=mainVal;
      if(obsData[qid+'_R']===undefined)obsData[qid+'_R']=mainVal;
      localStorage.setItem('obs_data_v1',JSON.stringify(obsData));
    }
  }
  cpRenderMain();
}

export function cpToggleGroup(groupId){
  _cpGroupExpanded[groupId]=!_cpGroupExpanded[groupId];
  cpRenderMain();
}

export function cpTogglePart(key){
  _cpPartCollapsed[key]=!_cpPartCollapsed[key];
  cpRenderMain();
}

export function cpTogglePartGroups(partToggleId,dimIdx,partIdx){
  var cr=condResults[dimIdx];if(!cr)return;
  var p=cr[partIdx];if(!p||!p.items)return;
  var groupIds=[];
  var currentLabel=null;
  p.items.forEach(function(item){
    if(item.groupLabel && item.groupLabel!==currentLabel){
      currentLabel=item.groupLabel;
      groupIds.push('grp_'+dimIdx+'_'+partIdx+'_'+currentLabel.replace(/\s/g,''));
    }
  });
  if(groupIds.length===0)return;
  var allExpanded=groupIds.every(function(id){return !!_cpGroupExpanded[id];});
  groupIds.forEach(function(id){_cpGroupExpanded[id]=!allExpanded;});
  cpRenderMain();
}

export function cpToggleAllGroups(dimIdx){
  // 切換所有 section（部位）的收合狀態。若全部已收合 → 全部展開；否則 → 全部收合
  var cr=condResults[dimIdx];if(!cr)return;
  var sectionKeys=Object.keys(cr).map(function(pi){return 'cp_part_'+dimIdx+'_'+pi;});
  if(sectionKeys.length===0)return;
  var allCollapsed=sectionKeys.every(function(k){return !!_cpPartCollapsed[k];});
  sectionKeys.forEach(function(k){
    if(allCollapsed)delete _cpPartCollapsed[k];
    else _cpPartCollapsed[k]=true;
  });
  cpRenderMain();
}

export function cpQuickChange(btn){
  var qid=btn.dataset.qid;
  var side=btn.dataset.side||'';
  var val=btn.dataset.val;
  if(side){
    obsData[qid+'_'+side]=val;
  }else{
    // 合併模式：同時寫入 _L 和 _R
    obsData[qid]=val;
    obsData[qid+'_L']=val;
    obsData[qid+'_R']=val;
  }
  localStorage.setItem('obs_data_v1',JSON.stringify(obsData));
  recalcFromObs();save();
  var qPart=_qidToPart(qid);
  if(qPart && window._markQuestionSeen)window._markQuestionSeen(qPart, qid);
  cpRender();
}

export function cpApplyChange(qid,side,val){
  cpQuickChange({dataset:{qid:qid,side:side||'',val:val}});
}

export const CAT_STYLE={"先天指數":"background:#3a3530;color:#f7f4ef","運氣指數":"background:#3a4a50;color:#f7f4ef","後天指數":"background:#3a4a3a;color:#f7f4ef"};

// ===== 新版維度條件評分頁 =====
export function dimGoto(i){setCur(i);cpCur=i;renderDimCondPage();if(window._markDimSeen&&DIMS[i])window._markDimSeen(DIMS[i].dn);}

export function renderDimSidebar(){
  const el=document.getElementById('dim-sidebar-new');if(!el)return;
  let html='',lastCat='';
  DIMS.forEach((d,i)=>{
    if(d.cat!==lastCat){html+='<div class="dim-sidebar-cat">'+d.cat+'</div>';lastCat=d.cat;}
    const res=calcDim(data,i);
    const chipColor=res?(res.type==='靜'?'var(--static)':'var(--active)'):'#ccc';
    html+='<div class="dim-sidebar-new-item'+(i===cur?' active':'')+'" onclick="dimGoto('+i+')" style="position:relative">'+
      '<span class="update-badge" id="badge-dim-'+d.dn+'" style="top:4px;left:4px;width:10px;height:10px"></span>'+
      '<span>'+d.dn+' - '+d.view+'</span>'+
      '<span class="dim-sidebar-chip" style="background:'+chipColor+'">'+(res?res.type:'未填')+'</span>'+
    '</div>';
  });
  el.innerHTML=html;
}

export function renderDimCondMain(){
  const el=document.getElementById('dim-cond-main');if(!el){console.error('dim-cond-main not found');return;}
  try{
  const d=DIMS[cur];
  const res=calcDim(data,cur);
  const kdEntry=null; // KD 在知識頁 scope，此處不可用，essence 暫略

  let html='<div class="dim-cond-header">'+
    '<div class="dim-cond-title">'+d.dn+' - '+d.view+'</div>'+
    '<div class="dim-cond-essence"><b>'+d.da+'（'+(d.da===d.a?d.aT:d.bT)+'）</b> vs <b>'+d.db+'（'+(d.db===d.a?d.aT:d.bT)+'）</b></div>'+
  '</div>';

  const cr=condResults[cur];
  if(!cr||Object.keys(cr).length===0){
    el.innerHTML=html+'<div style="padding:20px;color:var(--text-3);font-size:13px;">請先至「各部位觀察」填寫觀察題，系統會自動計算各條件結果。</div>';
    return;
  }

  PART_ORDER.forEach(pi=>{
    const p=cr[pi];
    if(!p)return;
    const pLabel=PART_LABELS[pi];
    var v=pi<=8?data[cur][pi]:null;
    var passColor,passLabel;
    if(pi>=9&&p){
      var tp9=p.pass?d.aT:d.bT;
      passColor=tp9==='靜'?'var(--static)':'var(--active)';
      passLabel=p.pass?d.a:d.b;
    }else if(v){
      var tp=v==='A'?d.aT:d.bT;
      passColor=tp==='靜'?'var(--static)':'var(--active)';
      passLabel=v==='A'?d.a:d.b;
    }else{
      passColor='#ccc';
      passLabel='—';
    }

    var _isInternalC=(pi>=9);
    html+='<div class="dim-part-block" style="'+(_isInternalC?'margin-left:24px':'')+'">'+
      '<div class="dim-part-header">'+
        '<span class="dim-part-name">'+pLabel+'</span>'+
        '<span style="display:flex;align-items:center;gap:8px">'+
          '<span class="dim-part-score">'+p.score+'/'+p.max+'　'+p.threshold+'</span>'+
          '<span class="dim-part-badge" style="background:'+passColor+'">'+passLabel+'</span>'+
        '</span>'+
      '</div>'+
      '<div class="dim-part-body" style="display:flex;flex-direction:column;gap:6px;padding:10px 14px">';

    // 按 groupLabel 分組
    var dGroups=[];
    var dCurGrp=null;
    p.items.forEach(function(item){
      if(item.groupLabel){
        if(!dCurGrp||dCurGrp.label!==item.groupLabel){
          dCurGrp={label:item.groupLabel,items:[item]};
          dGroups.push(dCurGrp);
        }else{
          dCurGrp.items.push(item);
        }
      }else{
        dGroups.push({label:null,items:[item]});
        dCurGrp=null;
      }
    });

    function renderCondItem(item){
      var sideLabel=item.side?'<span class="dim-cond-side">'+(item.side==='L'?'左':'右')+'</span>':'';
      var okClass=item.ok?'ok':'ng';
      var mark=item.ok?'\u2713':'\u2717';
      var lbl=item.label||'(空)';
      return '<div class="dim-cond-item">'+
        '<div class="dim-cond-mark '+okClass+'">'+mark+'</div>'+
        '<div class="dim-cond-label '+okClass+'">'+lbl+'</div>'+
        sideLabel+
      '</div>';
    }

    dGroups.forEach(function(g){
      if(g.label){
        // 讀 wt 權重（例：h4 weight:2 → 計 2 分）
        var gOk=g.items.reduce(function(s,i){return s+(i.ok?(i.wt||1):0);},0);
        var gTot=g.items.reduce(function(s,i){return s+(i.wt||1);},0);
        var allOk=gOk===gTot;
        var gColor=allOk?'var(--static)':'var(--text-3)';
        html+='<div style="font-size:13px;font-weight:400;color:'+gColor+';padding:4px 0 2px;margin-top:4px;border-bottom:1px solid var(--border)">'+
          g.label+' <span style="font-weight:400;font-size:12px">'+gOk+'/'+gTot+'</span></div>';
        g.items.forEach(function(item){html+=renderCondItem(item);});
      }else{
        g.items.forEach(function(item){html+=renderCondItem(item);});
      }
    });

    html+='</div></div>';
  });

  el.innerHTML=html;
  }catch(err){console.error('renderDimCondMain error:',err);el.innerHTML='<div style="padding:20px;color:red;font-size:12px;">渲染錯誤: '+err.message+'</div>';}
}

export function renderDimCondPage(){
  renderDimSidebar();
  renderDimCondMain();
  if(window._refreshBadges)window._refreshBadges();
  // 右欄：當前維度各部位結果
  const rc=document.getElementById('dim-right-col');
  if(rc){
    const d=DIMS[cur];
    const partOrder2=[0,1,4,5,6,7,8,2,9,3,10,11,12];
    const partLabels2=['頭','上停','耳','眉','眼','鼻','口','中停','顴','下停','人中','地閣','頤'];
    let rhtml='<div style="padding:12px 10px;overflow-y:auto;height:100%;box-sizing:border-box">';
    rhtml+='<div style="font-size:13px;font-weight:400;letter-spacing:2px;color:var(--text-3);padding:0 4px 10px">'+d.dn+'\u3000各部位</div>';
    partOrder2.forEach(function(pi,i){
      var v=pi<=8?data[cur][pi]:null;
      var label=partLabels2[i];
      var bg='#ccc',txt='—';
      if(v){var t=v==='A'?d.aT:d.bT;bg=t==='靜'?'var(--static)':'var(--active)';txt=v==='A'?d.a:d.b;}
      else if(pi>=9){var _cr9=condResults[cur];if(_cr9&&_cr9[pi]){var _tp9=_cr9[pi].pass?d.aT:d.bT;bg=_tp9==='靜'?'var(--static)':'var(--active)';txt=_cr9[pi].pass?d.a:d.b;}}
      rhtml+='<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 4px;border-bottom:1px solid var(--border)">'+
        '<span style="font-size:15px;color:var(--text-2)">'+label+'</span>'+
        '<span style="font-size:13px;padding:3px 10px;border-radius:8px;background:'+bg+';color:white;font-weight:400">'+txt+'</span>'+
      '</div>';
    });
    var res=calcDim(data,cur);
    var resBg=res?(res.type==='靜'?'var(--static)':'var(--active)'):'#ccc';
    rhtml+='<div style="margin-top:12px;padding:10px;background:var(--sidebar);border-radius:8px;text-align:center">'+
      '<div style="font-size:11px;color:var(--text-3);margin-bottom:6px">整體</div>'+
      '<div style="font-size:16px;font-weight:400;padding:4px 20px;background:'+resBg+';color:white;border-radius:8px;display:inline-block">'+(res?res.type:'—')+'</div>'+
      '<div style="font-size:12px;color:var(--text-3);margin-top:6px">係數 '+(res?res.coeff.toFixed(1):'—')+'</div>'+
    '</div>';
    rhtml+='</div>';
    rc.innerHTML=rhtml;
  }
}

let _popup=null;
export function showCondPopup(e,dimIdx,partIdx,itemIdx){
  closeCondPopup();
  e.stopPropagation();
  const item=condResults[dimIdx]?.[partIdx]?.items?.[itemIdx];
  if(!item||!item.ids||item.ids.length===0)return;
  const qid=item.ids[0];
  const side=item.side;
  const partName=OBS_PART_NAMES.find(n=>{
    const pd=OBS_PARTS_DATA[n];
    if(!pd)return false;
    return pd.sections.some(s=>s.qs.some(q=>q.id===qid));
  });
  if(!partName)return;
  const pd=OBS_PARTS_DATA[partName];
  let q=null;
  pd.sections.forEach(s=>s.qs.forEach(qq=>{if(qq.id===qid)q=qq;}));
  if(!q)return;
  const curVal=side?(obsData[qid+'_'+side]||obsData[qid]||''):obsData[qid]||'';
  let html='<div class="cond-popup-title"><b>'+q.text+'</b>'+(side?'（'+(side==='L'?'左':'右')+'）':'')+'<br><span style="font-size:10px;color:var(--text-3)">修改此題將同步影響所有相關維度</span></div><div class="cond-popup-opts">';
  q.opts.forEach(opt=>{
    const v=typeof opt==='string'?opt:opt.v;
    html+='<button class="cond-popup-opt'+(v===curVal?' cur':'')+'" onclick="applyCondChange(\''+qid+'\',\''+(side||'')+'\',\''+v.replace(/'/g,"\\'")+'\')">'+''+v+'</button>';
  });
  html+='</div><button class="cond-popup-cancel" onclick="closeCondPopup()">取消</button>';
  const popup=document.createElement('div');
  popup.className='cond-popup';
  popup.innerHTML=html;
  const rect=e.currentTarget.getBoundingClientRect();
  popup.style.left=Math.min(rect.left,window.innerWidth-300)+'px';
  popup.style.top=(rect.bottom+6)+'px';
  document.body.appendChild(popup);
  _popup=popup;
  setTimeout(()=>document.addEventListener('click',closeCondPopup,{once:true}),0);
}

export function closeCondPopup(){if(_popup){_popup.remove();_popup=null;}}

export function applyCondChange(qid,side,val){
  closeCondPopup();
  if(side){
    obsData[qid+'_'+side]=val;
  }else{
    obsData[qid]=val;
    if(obsData[qid+'_L']!==undefined)obsData[qid+'_L']=val;
    if(obsData[qid+'_R']!==undefined)obsData[qid+'_R']=val;
  }
  localStorage.setItem('obs_data_v1',JSON.stringify(obsData));
  recalcFromObs();save();
  renderDimCondPage();
}
