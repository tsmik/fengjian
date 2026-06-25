// js/obs_recalc.js — 觀察→評分轉換 + condResults 建構
import { data, obsData, condResults, setCondResults, OBS_PART_NAMES, OBS_PARTS_DATA, DIM_RULES } from './core.js';
import { evaluate, evaluateAll, evaluatePart, getAnswer } from './rule_engine.js';
// ★ P2 接線：改用逐側引擎 engine.js + 套裝資料層 p2_data.js（取代 P1 rule_engine 的 evaluateAll）
import { evaluateDimension, scoreLeafPart } from './engine.js';
import { getP2, getSpice } from './p2_data.js';

/* ===== recalcFromObs v2 — v2.2 ID格式 + 字串比較 ===== */
export function recalcFromObs(){
  const hasAny=Object.keys(obsData).length>0;
  if(!hasAny){for(let d=0;d<13;d++)data[d]=Array(9).fill(null);}

  // ===== 修復舊資料：paired 題若有 _L/_R 但無主值，補回主值 =====
  // 用於修正「直接從可分左右作答」造成主值 undefined 的歷史資料
  var _repaired=false;
  OBS_PART_NAMES.forEach(function(pn){
    var pd=OBS_PARTS_DATA[pn];if(!pd)return;
    pd.sections.forEach(function(s){
      s.qs.forEach(function(q){
        if(!q.paired)return;
        if(obsData[q.id]!==undefined)return;
        var vL=obsData[q.id+'_L'],vR=obsData[q.id+'_R'];
        if(vL!==undefined&&vR!==undefined){
          obsData[q.id]=(vL===vR)?vL:vL;  // 左右不同時以左為代表
          _repaired=true;
        }
      });
    });
  });
  if(_repaired){
    try{localStorage.setItem('obs_data_v1',JSON.stringify(obsData));}catch(e){}
  }

  // ===== P2 逐側引擎計算（取代 P1 rule_engine 的 evaluateAll）=====
  // 寫回同樣的 data[13][9] A/B 矩陣；部位順序與 P1 partIdxMap 完全一致
  // （頭0 上停1 中停2 下停3 耳4 眉5 眼6 鼻7 口8），engine.js 的 dataVec 直接對位、零重排。
  // 辣度由 p2_data.getSpice() 提供（F3 接選擇器；目前＝套裝 defaultSpice＝大辣）。
  var _rs = getP2();
  var _lvl = getSpice();
  for (var _di = 0; _di < 13; _di++) {
    if (_rs && _rs.dims && _rs.dims[_di]) {
      var _r = evaluateDimension(_rs.dims[_di], obsData, _rs.isPaired, _lvl);
      data[_di] = _r.dataVec;
    } else {
      data[_di] = Array(9).fill(null);
    }
  }

  // ===== condResults（P2 版）：供「維度視角」顯示每部位的條件分組 + 中停/下停關聯部位 =====
  buildCondResultsP2(_rs, _lvl);
}

// 部位名 → condResults 索引（與 P1 一致；9 計分 + 內部子部位）
const _P2_PART_IDX = { '頭':0,'上停':1,'中停':2,'下停':3,'耳':4,'眉':5,'眼':6,'鼻':7,'口':8,'顴':9,'人中':10,'地閣':11,'頤':12,'頂骨':13,'枕骨':14,'華陽骨':15 };
const _AGG_CHILD = { 2: ['眉','眼','鼻','顴'], 3: ['口','人中','地閣','頤'] };   // 中停 / 下停 的關聯子部位

// 一張卡片內所有不重複的觀察題 ref
function _cardRefs(card) {
  const out = [];
  (card.combos || []).forEach(cb => { const lv = Array.isArray(cb) ? cb : (cb && cb.leaves) || []; lv.forEach(l => { if (l && l.ref != null && out.indexOf(l.ref) < 0) out.push(l.ref); }); });
  return out;
}
// 該部位是否成對（任一引用題是左右題）
function _partPaired(part, isPaired) {
  if (typeof isPaired !== 'function') return false;
  return (part.cards || []).some(c => _cardRefs(c).some(r => isPaired(r)));
}
// 葉部位 → condResults 項（items 依卡片分組；threshold＝輔門檻字串）
function _partCond(part, di, pi, level) {
  const cards = part.cards || [];
  let mainMax = 0, auxMax = 0;
  cards.forEach(c => { if (c.role === 'main') mainMax++; else auxMax++; });
  let need = auxMax;
  if (part.spice && part.spice[level] != null) need = Math.max(0, Math.min(part.spice[level], auxMax));
  const items = [];
  cards.forEach(c => { _cardRefs(c).forEach(ref => items.push({ groupLabel: (c.label || c.id || ''), ids: [ref], side: null, ok: true })); });
  const threshold = (auxMax > 0)
    ? `符合 ${need}／${auxMax} 張條件即達標` + (mainMax ? `（另含必備 ${mainMax} 項）` : '')
    : (mainMax ? `必備 ${mainMax} 項全中` : '無規則');
  return { items, threshold, max: cards.length, min: need, pass: (pi <= 8 ? data[di][pi] === 'A' : false) };
}
function buildCondResultsP2(rs, level) {
  for (var k in condResults) delete condResults[k];
  if (!rs || !rs.dims) return;
  const isPaired = rs.isPaired;
  for (let di = 0; di < 13; di++) {
    condResults[di] = {};
    const dd = rs.dims[di]; if (!dd || !dd.parts) continue;
    // 葉部位
    Object.keys(dd.parts).forEach(pn => {
      const part = dd.parts[pn]; const pi = _P2_PART_IDX[pn];
      if (pi == null || !part || part.kind === 'aggregate' || !Array.isArray(part.cards)) return;
      condResults[di][pi] = _partCond(part, di, pi, level);
    });
    // 頭（聚合）：UI 展開 13/14/15 子部位；給最小 entry 讓 nav 不標「無規則」
    if (condResults[di][13] || condResults[di][14] || condResults[di][15]) {
      condResults[di][0] = { items: [], threshold: '頭＝頂骨＋枕骨＋華陽骨', max: 1, pass: data[di][0] === 'A' };
    }
    // 中停(2)/下停(3)：關聯子部位逐側動靜（partResults，ids 為空）
    [2, 3].forEach(api => {
      const items = [];
      (_AGG_CHILD[api] || []).forEach(pn => {
        const part = dd.parts[pn]; if (!part || !Array.isArray(part.cards)) return;
        const r = scoreLeafPart(part, obsData, isPaired, level);
        if (r.result === 'leaf') {
          if (_partPaired(part, isPaired)) { items.push({ partN: pn, side: 'L', ok: r.Lpass, ids: [] }); items.push({ partN: pn, side: 'R', ok: r.Rpass, ids: [] }); }
          else items.push({ partN: pn, side: null, ok: r.standalonePass, ids: [] });
        } else { items.push({ partN: pn, side: null, ok: false, ids: [] }); }
      });
      if (items.length) condResults[di][api] = { items, threshold: '由關聯子部位聚合', max: 1, pass: data[di][api] === 'A' };
    });
  }
}

// ===== buildCondResults helpers =====
function _evalNode(node,side,partResults){
  return evaluate(node,obsData,side||null,partResults||{});
}

function _nodeLabel(node,side,qMap){
  if(!node)return '(空)';
  if(node.ref!==undefined){
    var q=qMap[node.ref];
    var text=q?q.text:node.ref;
    var eSide=('side' in node && node.side !== null)?node.side:side;
    var prefix='';
    if(eSide&&q&&q.paired)prefix=(eSide==='L'?'左':'右');
    var matchStr=Array.isArray(node.match)?node.match.join('或'):String(node.match);
    return prefix+text+'（'+matchStr+'）';
  }
  if(node.partResult!==undefined)return '引用 '+node.partResult+' 結果';
  if(node.op==='AND'){
    return node.items.map(function(it){return _nodeLabel(it,side,qMap);}).join(' 以及 ');
  }
  if(node.op==='OR'){
    return node.items.map(function(it){return _nodeLabel(it,side,qMap);}).join(' 或 ');
  }
  if(node.op==='NOT'){
    return '不可以有 '+_nodeLabel(node.item,side,qMap);
  }
  return JSON.stringify(node).substring(0,40);
}

function _collectRefs(node){
  if(!node)return [];
  if(node.ref!==undefined)return [node.ref];
  if(node.partResult!==undefined)return [];
  if(node.group!==undefined&&node.items){var gr=[];node.items.forEach(function(it){if(!it)return;gr=gr.concat(_collectRefs(it));});return gr;}
  var refs=[];
  if(node.items)node.items.forEach(function(it){if(!it)return;refs=refs.concat(_collectRefs(it));});
  if(node.item)refs=refs.concat(_collectRefs(node.item));
  if(node.each)refs=refs.concat(_collectRefs(node.each));
  if(node.rule)refs=refs.concat(_collectRefs(node.rule));
  return refs;
}

function _flattenLeaf(node,side,qMap){
  var q=qMap[node.ref]||{};
  var eSide=('side' in node && node.side !== null)?node.side:side;
  var prefix='';
  if(eSide&&q.paired)prefix=(eSide==='L'?'左':'右');
  var matchStr=Array.isArray(node.match)?node.match.join('或'):String(node.match||'');
  var label=prefix+(q.text||node.ref)+'（'+matchStr+'）';
  var answer=getAnswer(node.ref,eSide,obsData);
  var ok=Array.isArray(node.match)?node.match.indexOf(answer)>=0:answer===node.match;
  return {label:label,ok:ok,ids:[node.ref],side:eSide||null,val:Array.isArray(node.match)?null:node.match,wt:node.weight||1};
}

function _flattenCompound(node,side,qMap,partResults){
  var label=_nodeLabel(node,side,qMap);
  var ok=_evalNode(node,side,partResults);
  var refs=_collectRefs(node);
  var eSide=null;
  if(node.items&&node.items.length>0){
    var s0=node.items[0].side;
    if(s0)eSide=s0;
  }
  if(('side' in node && node.side !== null))eSide=node.side;
  if(side)eSide=side;
  var connType=node.op||'AND';
  return {label:label,ok:ok,ids:refs,side:eSide,val:null,wt:1,connType:connType};
}

function _flattenItem(node,side,qMap,partResults){
  if(!node)return null;
  if(node.ref!==undefined)return _flattenLeaf(node,side,qMap);
  if(node.partResult!==undefined){
    var pr=node.partResult;
    var ok=false;
    var label='';
    var dotIdx=pr.indexOf('.');
    if(dotIdx>=0){
      var partN=pr.substring(0,dotIdx);
      var subSide=pr.substring(dotIdx+1);
      ok=partResults[partN]?partResults[partN][subSide]===true:false;
      label=(subSide==='L'?'左':'右')+partN+'達標';
    }else{
      ok=partResults[pr]?(partResults[pr].result==='positive'):false;
      label=pr+'達標';
    }
    return {label:label,ok:ok,ids:[],side:dotIdx>=0?pr.substring(dotIdx+1):null,partN:(dotIdx>=0?pr.substring(0,dotIdx):pr),val:null,wt:1};
  }
  if(node.op==='NOT'){
    var inner=_flattenItem(node.item,side,qMap,partResults);
    var notOk=!_evalNode(node.item,side,partResults);
    return {label:'不可以有 '+(inner?inner.label:''),ok:notOk,ids:_collectRefs(node.item),side:inner?inner.side:null,val:null,wt:1};
  }
  // Complex node (AND/OR/VETO) → flatten as one item
  return _flattenCompound(node,side,qMap,partResults);
}

function _flattenToLeaves(node,side,qMap,partResults){
  // 遞迴展開複合節點（AND/OR/COUNT）為 leaf items 陣列
  // 用於 LR 展開時，避免把整個子樹壓成一行
  if(!node)return [];
  if(node.ref!==undefined){var f=_flattenLeaf(node,side,qMap);return f?[f]:[];}
  if(node.partResult!==undefined){var f2=_flattenItem(node,side,qMap,partResults);return f2?[f2]:[];}
  if(node.op==='NOT'){var f3=_flattenItem(node,side,qMap,partResults);return f3?[f3]:[];}
  if(node.op==='AND'||node.op==='OR'||node.op==='COUNT'){
    var leaves=[];
    (node.items||[]).forEach(function(it){
      if(!it)return;
      leaves=leaves.concat(_flattenToLeaves(it,side,qMap,partResults));
    });
    return leaves;
  }
  // 其他未知結構，保底壓成一個 item
  var fc=_flattenCompound(node,side,qMap,partResults);
  return fc?[fc]:[];
}

function _expandItems(node,side,qMap,partResults){
  // Expand a node into an array of condResult items
  if(!node)return [];
  if(node.ref!==undefined){var f=_flattenLeaf(node,side,qMap);return f?[f]:[];}
  if(node.partResult!==undefined){var f2=_flattenItem(node,side,qMap,partResults);return f2?[f2]:[];}
  if(node.op==='NOT'){var f3=_flattenItem(node,side,qMap,partResults);return f3?[f3]:[];}
  if(node.op==='AND'||node.op==='OR'){
    // Each child becomes one item (may be compound); group nodes are expanded
    var items=[];
    node.items.forEach(function(it){
      if(!it)return;
      if(it.group!==undefined&&it.items){
        it.items.forEach(function(gi){
          if(!gi)return;
          if(gi.op==='LR'){
            var lrItems=_expandLR(gi,qMap,partResults);
            lrItems.forEach(function(li){if(li){li.groupLabel=it.group;items.push(li);}});
          }else{
            var flat;
            if(gi.ref!==undefined)flat=_flattenLeaf(gi,side,qMap);
            else flat=_flattenItem(gi,side,qMap,partResults);
            if(flat){flat.groupLabel=it.group;items.push(flat);}
          }
        });
      }else{
        if(it.ref!==undefined)items.push(_flattenLeaf(it,side,qMap));
        else if(it.partResult!==undefined)items.push(_flattenItem(it,side,qMap,partResults));
        else items.push(_flattenItem(it,side,qMap,partResults));
      }
    });
    return items.filter(Boolean);
  }
  if(node.op==='COUNT'){
    var items=[];
    node.items.forEach(function(it){
      if(!it)return;
      if(it.group!==undefined&&it.items){
        it.items.forEach(function(gi){
          if(!gi)return;
          if(gi.op==='LR'){
            var lrItems=_expandLR(gi,qMap,partResults);
            lrItems.forEach(function(li){if(li){li.groupLabel=it.group;items.push(li);}});
          }else{
            var flat;
            if(gi.ref!==undefined)flat=_flattenLeaf(gi,side,qMap);
            else flat=_flattenItem(gi,side,qMap,partResults);
            if(flat){flat.groupLabel=it.group;items.push(flat);}
          }
        });
      }else{
        if(it.ref!==undefined)items.push(_flattenLeaf(it,side,qMap));
        else if(it.partResult!==undefined)items.push(_flattenItem(it,side,qMap,partResults));
        else items.push(_flattenItem(it,side,qMap,partResults));
      }
    });
    return items.filter(Boolean);
  }
  return [_flattenCompound(node,side,qMap,partResults)];
}

function _expandLR(node,qMap,partResults){
  // LR: expand each for L and R
  var eachNode=node.each;
  var items=[];
  if(!eachNode)return items;
  // Determine how to expand each
  if(eachNode.ref!==undefined){
    // Single ref → L and R versions
    items.push(_flattenLeaf(eachNode,'L',qMap));
    items.push(_flattenLeaf(eachNode,'R',qMap));
  }else if(eachNode.op==='COUNT'||eachNode.op==='AND'||eachNode.op==='OR'){
    // Expand each child for L and R
    (eachNode.items||[]).forEach(function(it){
      if(!it)return;
      if(it.group!==undefined&&it.items){
        it.items.forEach(function(gi){
          if(!gi)return;
          if(gi.ref!==undefined){
            var l=_flattenLeaf(gi,'L',qMap);if(l){l.groupLabel=it.group;items.push(l);}
            var r=_flattenLeaf(gi,'R',qMap);if(r){r.groupLabel=it.group;items.push(r);}
          }else{
            // 複合節點展開為獨立條件
            var lLeaves2=_flattenToLeaves(gi,'L',qMap,partResults);
            var rLeaves2=_flattenToLeaves(gi,'R',qMap,partResults);
            lLeaves2.forEach(function(ll){ll.groupLabel=it.group;items.push(ll);});
            rLeaves2.forEach(function(rl){rl.groupLabel=it.group;items.push(rl);});
          }
        });
      }else if(it.ref!==undefined){
        items.push(_flattenLeaf(it,'L',qMap));
        items.push(_flattenLeaf(it,'R',qMap));
      }else{
        // 複合節點（AND/OR等）展開為獨立條件，不壓成一行
        var lLeaves=_flattenToLeaves(it,'L',qMap,partResults);
        var rLeaves=_flattenToLeaves(it,'R',qMap,partResults);
        lLeaves.forEach(function(ll){items.push(ll);});
        rLeaves.forEach(function(rl){items.push(rl);});
      }
    });
  }else{
    // 保底：展開為獨立條件
    var lBot=_flattenToLeaves(eachNode,'L',qMap,partResults);
    var rBot=_flattenToLeaves(eachNode,'R',qMap,partResults);
    lBot.forEach(function(ll){items.push(ll);});
    rBot.forEach(function(rl){items.push(rl);});
  }
  items=items.filter(Boolean);
  // LR 展開時非配對題（q.paired!==true）會被 L/R 雙跑各展一次；此處只保留第一筆並清 side，避免報告誤示「左/右」（純顯示層去重，不影響計分）
  var _seenRefs={};
  items=items.filter(function(it){
    if(!it||!it.ids||it.ids.length!==1)return true;
    var _q=qMap[it.ids[0]];
    if(!_q||_q.paired)return true;
    if(_seenRefs[it.ids[0]])return false;
    _seenRefs[it.ids[0]]=true;
    it.side=null;
    return true;
  });
  return items;
}

function _makeThreshold(ruleNode,pos,items){
  var max=0;items.forEach(function(it){max+=(it.wt||1);});
  if(ruleNode.op==='COUNT'){
    var min=ruleNode.min||0;
    if(min===max)return max+'項全中→'+pos;
    if(min===1)return '任1符合→'+pos;
    return '滿分'+max+'，≥'+min+'→'+pos;
  }
  if(ruleNode.op==='LR'){
    var eachNode=ruleNode.each;
    var merge=ruleNode.merge;
    var halfCount=Math.floor(items.length/2);
    if(merge==='all'){
      if(eachNode&&eachNode.op==='COUNT'){
        var m=eachNode.min||0;
        if(m===halfCount)return '左右各'+halfCount+'全中→'+pos;
        return '左右各≥'+m+'→'+pos;
      }
      return '左右各'+halfCount+'全中→'+pos;
    }else{
      if(eachNode&&eachNode.op==='COUNT'&&eachNode.min===1)return '任一邊1條以上→'+pos;
      return '任一邊符合→'+pos;
    }
  }
  if(ruleNode.op==='AND'){
    return max+'項全中→'+pos;
  }
  if(ruleNode.op==='OR'){
    return '任1符合→'+pos;
  }
  return max+'項→'+pos;
}

export function _buildPartCond(ruleNode,partDef,partName,dimIdx,partIdx,pos,qMap,partResults){
  var items=[];
  var isLR=ruleNode.op==='LR';
  var hasParts=ruleNode.items||isLR;

  // Handle part-level VETO
  var hasVeto=!!partDef.veto;

  if(isLR){
    items=_expandLR(ruleNode,qMap,partResults);
  }else if(ruleNode.op==='COUNT'){
    items=_expandItems(ruleNode,null,qMap,partResults);
  }else if(ruleNode.op==='AND'){
    // AND at root: check if any child is LR
    var lrChild=null,otherItems=[];
    ruleNode.items.forEach(function(it){
      if(it.op==='LR'){lrChild=it;}
      else{otherItems.push(it);}
    });
    if(lrChild){
      items=_expandLR(lrChild,qMap,partResults);
      otherItems.forEach(function(it){
        var expanded=_expandItems(it,null,qMap,partResults);
        items=items.concat(expanded);
      });
    }else{
      items=_expandItems(ruleNode,null,qMap,partResults);
    }
  }else if(ruleNode.op==='OR'){
    items=_expandItems(ruleNode,null,qMap,partResults);
  }else if(ruleNode.ref!==undefined){
    items=[_flattenLeaf(ruleNode,null,qMap)];
  }else{
    items=[_flattenCompound(ruleNode,null,qMap)];
  }

  items=items.filter(Boolean);

  var score=0,max=0;
  items.forEach(function(it){
    max+=(it.wt||1);
    if(it.ok)score+=(it.wt||1);
  });

  var threshold=_makeThreshold(ruleNode,pos,items);
  var pass=(partIdx<=8)?data[dimIdx][partIdx]==='A':false;

  return {items:items,score:score,max:max,pass:pass,threshold:threshold,op:ruleNode.op,min:(ruleNode.op==='COUNT'?(ruleNode.min||0):null)};
}
