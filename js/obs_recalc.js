// js/obs_recalc.js — 觀察→評分轉換 + condResults 建構
import { data, obsData, condResults, setCondResults, OBS_PART_NAMES, OBS_PARTS_DATA, DIM_RULES } from './core.js';
import { evaluate, evaluateAll, evaluatePart, getAnswer } from './rule_engine.js';

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

  // ===== 規則引擎計算（取代舊邏輯的 data[][] 賦值）=====
  evaluateAll(obsData);

  // ===== condResults 由規則引擎產生 =====
  var qMap = {};
  OBS_PART_NAMES.forEach(function(n){
    var pd=OBS_PARTS_DATA[n];if(!pd)return;
    pd.sections.forEach(function(s){s.qs.forEach(function(q){qMap[q.id]=q;});});
  });
  for(let k in condResults) delete condResults[k];
  var PART_NAME_TO_IDX={'頭':0,'上停':1,'中停':2,'下停':3,'耳':4,'眉':5,'眼':6,'鼻':7,'口':8,'顴':9,'人中':10,'地閣':11,'頤':12};
  var PART_IDX_TO_NAME=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  for(var _di=0;_di<13;_di++){
    condResults[_di]={};
    var _dim=DIM_RULES[_di];if(!_dim)continue;
    var _pos=_dim.positive||'A';
    var _partOrder=['頭','上停','耳','眉','眼','鼻','口','顴','人中','地閣','頤','中停','下停'];
    // Store per-part evaluate results for partResult references
    var _partEvalResults={};
    _partOrder.forEach(function(pn){
      var pd=_dim.parts[pn];
      var pi=PART_NAME_TO_IDX[pn];
      if(!pd){
        condResults[_di][pi]={items:[],score:0,max:0,pass:false,threshold:'無規則'};
        _partEvalResults[pn]={result:'negative'};
        return;
      }
      var ruleNode=pd.rule||pd;
      var result=_buildPartCond(ruleNode,pd,pn,_di,pi,_pos,qMap,_partEvalResults);
      condResults[_di][pi]=result;
      // 內部部位的 pass 需要從 evaluatePart 重新判斷（因為不在 data[][] 中）
      if(pi>=9){
        var _intEval=evaluatePart(pd,obsData,_partEvalResults);
        result.pass=(_intEval.result==='positive');
      }
      // Store for partResult lookups (evaluate-compatible format)
      var _prEntry={result:result.pass?'positive':'negative',pass:result.pass};
      var _rn=pd.rule||pd;
      if(_rn.op==='LR'){
        _prEntry.L=evaluate(_rn.each,obsData,'L',_partEvalResults);
        _prEntry.R=evaluate(_rn.each,obsData,'R',_partEvalResults);
      }else{
        // COUNT→group→LR 等結構：往下找 LR 節點
        var _lrNode=null;
        if(_rn.op==='COUNT'&&_rn.items){
          for(var _li=0;_li<_rn.items.length;_li++){
            var _ci=_rn.items[_li];
            if(_ci.op==='LR'){_lrNode=_ci;break;}
            if(_ci.group&&_ci.items){
              for(var _gi=0;_gi<_ci.items.length;_gi++){
                if(_ci.items[_gi].op==='LR'){_lrNode=_ci.items[_gi];break;}
              }
              if(_lrNode)break;
            }
          }
        }
        if(_lrNode){
          _prEntry.L=evaluate(_lrNode.each,obsData,'L',_partEvalResults);
          _prEntry.R=evaluate(_lrNode.each,obsData,'R',_partEvalResults);
        }
      }
      _partEvalResults[pn]=_prEntry;
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
    return {label:label,ok:ok,ids:[],side:dotIdx>=0?pr.substring(dotIdx+1):null,val:null,wt:1};
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

  return {items:items,score:score,max:max,pass:pass,threshold:threshold};
}
