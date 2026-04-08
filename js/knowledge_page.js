// js/knowledge_page.js — 兵法評分摘要頁模組
import { DIMS, BETA_VISIBLE_DIMS, data, condResults, calcDim,
         userName, _isTA, _currentCaseId, _currentCaseName,
         setNavActive, showPage } from './core.js';

const PART_ORDER_K=[0,1,4,5,6,7,8,2,9,3,10,11,12];
const PART_LABELS_K=['頭','上停','耳','眉','眼','鼻','口','中停','顴','下停','人中','地閣','頤'];
const INTERNAL_PARTS_K={9:true,10:true,11:true,12:true};
const CAT_COLOR={'先天指數':'background:#5a3e35;color:#f7d9c4','運氣指數':'background:#2d4a5a;color:#c4dff7','後天指數':'background:#3a4a35;color:#c4f7d4'};
let curK=-1;

export function kRender(){
  const sb=document.getElementById('k-sidebar');
  if(!sb)return;
  let lastCat='',html='';
  DIMS.forEach(function(d,i){
    if(d.cat!==lastCat){
      html+='<div class="k-sidebar-section">'+d.cat+'</div>';
      lastCat=d.cat;
    }
    if(i>=BETA_VISIBLE_DIMS){
      html+='<div class="k-sidebar-item" style="opacity:0.4;pointer-events:none">'+
        '<div>'+
          '<div class="k-sidebar-title" style="color:#bbb">'+d.dn+'</div>'+
          '<div class="k-sidebar-view" style="color:#ccc">建置中</div>'+
        '</div>'+
      '</div>';
    }else{
      html+='<div class="k-sidebar-item" id="ksi-'+i+'" onclick="kSelect('+i+')">'+
        '<div>'+
          '<div class="k-sidebar-title">'+d.dn+'</div>'+
          '<div class="k-sidebar-view">'+d.view+'</div>'+
        '</div>'+
      '</div>';
    }
  });
  sb.innerHTML=html;
}

export function kSelect(i){
  if(curK>=0){var old=document.getElementById('ksi-'+curK);if(old)old.classList.remove('active');}
  curK=i;
  var el=document.getElementById('ksi-'+i);if(el)el.classList.add('active');
  var d=DIMS[i];
  document.getElementById('k-main-title').textContent=d.dn;
  document.getElementById('k-main-sub').textContent=d.cat+' ・ '+d.view;

  var SBG='#7A9E7E',DBG='#C17A5A';

  var cr=condResults[i];
  if(!cr||Object.keys(cr).length===0){
    document.getElementById('k-content').innerHTML=
      '<div style="color:var(--text-3);font-size:14px;margin-top:40px;text-align:center">請先至「各部位觀察」填寫觀察題</div>';
    return;
  }

  var html='';

  PART_ORDER_K.forEach(function(pi,idx){
    var p=cr[pi];
    if(!p)return;
    var pLabel=PART_LABELS_K[idx];
    var v=pi<=8?data[i][pi]:null;
    var passColor,passLabel;
    if(pi>=9&&p){
      var tp9=p.pass?d.aT:d.bT;
      passColor=tp9==='靜'?SBG:DBG;
      passLabel=p.pass?d.a:d.b;
    }else if(v){
      var tp=v==='A'?d.aT:d.bT;
      passColor=tp==='靜'?SBG:DBG;
      passLabel=v==='A'?d.a:d.b;
    }else{
      passColor='#ccc';
      passLabel='—';
    }

    var _isInternalK=INTERNAL_PARTS_K[pi]||false;
    html+='<div style="margin-bottom:14px;border:1px solid var(--border);border-radius:8px;overflow:hidden'+(_isInternalK?';margin-left:24px':'')+'">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--sidebar)">'+
        '<span style="font-size:15px;font-weight:700;color:var(--text)">'+pLabel+'</span>'+
        '<span style="display:flex;align-items:center;gap:8px">'+
          '<span style="font-size:12px;color:var(--text-3)">'+p.score+'/'+p.max+'　'+p.threshold+'</span>'+
          '<span style="font-size:13px;padding:3px 10px;border-radius:8px;background:'+passColor+';color:white;font-weight:700">'+passLabel+'</span>'+
        '</span>'+
      '</div>';

    // 按 groupLabel 分組
    var groups=[];
    var curGrp=null;
    p.items.forEach(function(item){
      if(item.groupLabel){
        if(!curGrp||curGrp.label!==item.groupLabel){
          curGrp={label:item.groupLabel,items:[item]};
          groups.push(curGrp);
        }else{
          curGrp.items.push(item);
        }
      }else{
        groups.push({label:null,items:[item]});
        curGrp=null;
      }
    });

    // 合併左右 group：相鄰兩個 group 名稱只差「左/右」開頭的，合併成一行
    var merged=[];
    for(var gi=0;gi<groups.length;gi++){
      var g=groups[gi];
      var next=groups[gi+1];
      if(g.label&&next&&next.label){
        var gBase=g.label.replace(/^[左右]/,'');
        var nBase=next.label.replace(/^[左右]/,'');
        if(gBase===nBase&&((g.label.charAt(0)==='左'&&next.label.charAt(0)==='右')||(g.label.charAt(0)==='右'&&next.label.charAt(0)==='左'))){
          merged.push({label:gBase,items:g.items.concat(next.items),isLRMerged:true});
          gi++;
          continue;
        }
      }
      merged.push({label:g.label,items:g.items,isLRMerged:false});
    }

    // 分離 partResult 項目和 group 項目
    var partResultItems=[];
    var groupItems=[];
    merged.forEach(function(g){
      if(!g.label&&g.items.length===1&&g.items[0].label&&g.items[0].label.indexOf('達標')>=0){
        partResultItems.push(g.items[0]);
      }else{
        groupItems.push(g);
      }
    });

    // 渲染 partResult 橫向標籤列
    if(partResultItems.length>0){
      html+='<div style="padding:8px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+
        '<span style="font-size:12px;color:var(--text-3);margin-right:4px">子部位</span>';
      partResultItems.forEach(function(item){
        var bg=item.ok?SBG:'#f0f0f0';
        var clr=item.ok?'white':'#bbb';
        var mark=item.ok?'✓':'✗';
        html+='<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:'+bg+';color:'+clr+'">'+item.label.replace('達標','')+' '+mark+'</span>';
      });
      html+='</div>';
    }

    // 渲染 group 表格
    if(groupItems.length>0){
      html+='<table style="width:100%;border-collapse:collapse;font-size:13px">';
      groupItems.forEach(function(g,gIdx){
        var isLast=gIdx===groupItems.length-1;
        var borderStyle=isLast?'':'border-bottom:1px solid var(--border)';

        if(g.label){
          // 判斷 group 整體是否通過
          var gOk=g.items.filter(function(it){return it.ok;}).length;
          var gTot=g.items.length;
          var allOk=gOk===gTot;
          var gColor=allOk?SBG:'#ccc';

          // 收集左右狀態
          var badges=[];
          if(g.isLRMerged){
            var leftItems=g.items.filter(function(it){return it.side==='L';});
            var rightItems=g.items.filter(function(it){return it.side==='R';});
            var leftOk=leftItems.length>0&&leftItems.every(function(it){return it.ok;});
            var rightOk=rightItems.length>0&&rightItems.every(function(it){return it.ok;});
            badges.push({label:'左',ok:leftOk});
            badges.push({label:'右',ok:rightOk});
          }else{
            var hasL=g.items.some(function(it){return it.side==='L';});
            var hasR=g.items.some(function(it){return it.side==='R';});
            if(hasL||hasR){
              if(hasL){
                var lOk=g.items.filter(function(it){return it.side==='L';}).every(function(it){return it.ok;});
                badges.push({label:'左',ok:lOk});
              }
              if(hasR){
                var rOk=g.items.filter(function(it){return it.side==='R';}).every(function(it){return it.ok;});
                badges.push({label:'右',ok:rOk});
              }
            }else{
              badges.push({label:'',ok:allOk});
            }
          }

          // 條件描述：去除左右前綴，合併時只顯示一份
          function stripLR(s){return s.replace(/([以且或有]\s*)[左右]/g,'$1').replace(/^[左右]/,'');}
          var descLabel='';
          if(g.isLRMerged){
            var leftItems=g.items.filter(function(it){return it.side==='L';});
            var labels=leftItems.map(function(it){return stripLR(it.label);});
            var unique=[];
            labels.forEach(function(l){if(unique.indexOf(l)<0)unique.push(l);});
            descLabel=unique.join('　且　');
          }else{
            var labels2=g.items.map(function(it){return stripLR(it.label);});
            var unique2=[];
            labels2.forEach(function(l){if(unique2.indexOf(l)<0)unique2.push(l);});
            descLabel=unique2.join('　且　');
          }

          // 渲染行
          var badgesHtml='<span style="display:inline-flex;gap:4px;margin-left:auto;flex-shrink:0">';
          badges.forEach(function(b){
            var bg=b.ok?SBG:'#f0f0f0';
            var clr=b.ok?'white':'#bbb';
            var mark=b.ok?'✓':'✗';
            var txt=b.label?(b.label+' '+mark):mark;
            badgesHtml+='<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:'+bg+';color:'+clr+'">'+txt+'</span>';
          });
          badgesHtml+='</span>';

          var descColor=allOk?'var(--text)':'var(--text-3)';

          html+='<tr style="'+borderStyle+'">'+
            '<td style="padding:10px 16px;width:180px;vertical-align:top;font-weight:700;font-size:13px;color:'+gColor+'">'+g.label+'</td>'+
            '<td style="padding:10px 12px;color:'+descColor+'">'+
              '<div style="display:flex;align-items:center;gap:6px">'+
                '<span style="flex:1">'+descLabel+'</span>'+
                badgesHtml+
              '</div>'+
            '</td>'+
          '</tr>';
        }else{
          // 無 group label 的項目
          g.items.forEach(function(item){
            var bg=item.ok?SBG:'#f0f0f0';
            var clr=item.ok?'white':'#bbb';
            var mark=item.ok?'✓':'✗';
            html+='<tr style="'+borderStyle+'">'+
              '<td style="padding:10px 16px;width:180px;vertical-align:top;font-size:13px;color:var(--text-3)">—</td>'+
              '<td style="padding:10px 12px;color:'+(item.ok?'var(--text)':'var(--text-3)')+'">'+
                '<div style="display:flex;align-items:center;gap:6px">'+
                  '<span style="flex:1">'+item.label+'</span>'+
                  '<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:'+bg+';color:'+clr+'">'+mark+'</span>'+
                '</div>'+
              '</td>'+
            '</tr>';
          });
        }
      });
      html+='</table>';
    }

    html+='</div>';
  });

  // 係數
  var res=calcDim(data, i);
  if(res){
    var resBg=res.type==='靜'?SBG:DBG;
    html+='<div class="k-coeff">'+
      '整體結果：<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:'+resBg+';color:white;font-weight:700">'+
      res.type+'</span>'+
      '　'+d.a+' '+res.a+' : '+res.b+' '+d.b+
      '　係數 '+res.coeff.toFixed(2)+
    '</div>';
  }

  document.getElementById('k-content').innerHTML=html;
}

export function showKnowledgePage(){
  showPage('knowledge-overlay');
  document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-know');
}
