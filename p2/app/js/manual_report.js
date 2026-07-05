/* manual_report.js — 純函式版「人相兵法係數報告」（表格 + 三圖）
 * 由 js/manual.js 的 renderManualPage() 移植而成，改為 PURE function：
 *   - 不讀寫 DOM、不使用全域變數（除 import 之外）
 *   - 以參數 matrix（13×9 'A'/'B'/null 陣列，等同舊 manualData）為資料來源
 *   - 回傳完整 HTML 字串（標題 + 表格 + 三張 SVG 圖）
 *
 * 用法：
 *   buildManualReportHtml(matrix, meta)
 *   meta = {
 *     name?: string,             // 姓名
 *     age?: string|number,       // 年齡（虛歲）
 *     liunianTitleHtml?: string, // 標題列流年片段（選填，內聯 HTML）
 *     liunianHtml?: string       // 表格第一列流年區塊（選填，內聯 HTML）
 *   }
 */
import { DIMS, calcDim, avgCoeff } from './core.js';
import { buildRadar2SVG, buildCoefSVG, buildRadar3SVG, buildSDPairSVG } from './report_chart.js';

function _buildParts(matrix, meta) {
  meta = meta || {};
  var manualData = matrix; // 唯一資料來源（取代舊全域 manualData）
  var BETA_VISIBLE_DIMS = 13; // 報告顯示全部維度

  // === 標題：姓名＝大標(繼承 WenKai)；下方「人相兵法係數報告」＝副標；年齡數字維持 sans ===
  var _displayName = (meta.name != null && String(meta.name) !== '') ? String(meta.name) : '未命名';
  var _ageHtml = '';
  if (meta.age != null && String(meta.age) !== '') {
    _ageHtml = '<span style="font-size:14px;color:#9a8f7e;font-family:sans-serif;margin-left:10px">' + String(meta.age) + '</span>';
  }
  var _liunianTitleHtml = meta.liunianTitleHtml ? meta.liunianTitleHtml : '';
  // 姓名＝課程板書維度名字級(20px #3a3228 ls2)；「人相兵法係數報告」接在後面＝自我評分「符合條件為形」字級(15px #7a6e64)
  var _manualTitleHtml = '<div class="m-rep-title" style="margin-bottom:12px">'
    + '<span style="font-size:20px;color:#3a3228;letter-spacing:2px">' + _displayName + '</span>'
    + _ageHtml + _liunianTitleHtml
    + '<span style="font-size:15px;color:#7a6e64;margin-left:12px">人相兵法係數報告</span>'
    + '</div>';

  // R1 流年（由外部 meta.liunianHtml 提供）
  var _manualLnHtml = meta.liunianHtml ? meta.liunianHtml : '';

  // === 可見維度計算 ===
  var visiblePre = Math.min(6, BETA_VISIBLE_DIMS);
  var visibleLuck = Math.max(0, Math.min(3, BETA_VISIBLE_DIMS - 6));
  var visiblePost = Math.max(0, Math.min(4, BETA_VISIBLE_DIMS - 9));
  var showLuck = visibleLuck > 0;
  var showPost = visiblePost > 0;
  var totalCols = 1 + visiblePre*2 + 3 + (showLuck ? 1 + visibleLuck*2 + 3 : 0) + (showPost ? 1 + visiblePost*2 + 3 : 0) + 3;
  var visibleDimIds = [];
  for(var vi=0;vi<BETA_VISIBLE_DIMS;vi++) visibleDimIds.push(vi);

  var partOrder=[0,1,2,3,4,5,6,7,8];
  var partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  var SBG='#7A9E7E',DBG='#C17A5A';
  var colL=DIMS.map(function(d){return d.da;});
  var colR=DIMS.map(function(d){return d.db;});
  var colLIsS=DIMS.map(function(d){var dt=(d.da===d.a)?d.aT:d.bT;return dt==='靜';});

  // === 和風色彩系統 ===
  var dimBg=['#D6E4CC','#C8DCD8','#E2DDD5','#F0DECA','#E8D2D8','#EDE4C8',
             '#CEDDE8','#DDD4E4','#D2DDD6','#D4E2CF','#DED5DF','#CADDD8','#CDDAE6'];
  var dimDeep=['#6B8C5A','#4A7A6E','#8A8078','#A07850','#9A6878','#9A8A50',
               '#4A7A9A','#7A6890','#5A8A6A','#5A8A5A','#7A6088','#4A8078','#4A6E8A'];
  var C_PRE='#8E4B50',C_LUCK='#4C6E78',C_POST='#7B7082';
  var C_BOSS='#8E4B50',C_MGR='#8C6B4A';
  var C_PRE_C='#8E4B50',C_LUCK_C='#4C6E78',C_POST_C='#7B7082';
  var C_TOTAL_SD='#3C3C40',C_TOTAL='#4A4540';
  var C_PART_BG='#E8E4DF',C_PART_FC='#4A4540';
  var C_AN_BG='#E8E4DF',C_AN_FC='#4A4540';

  var dimDesc=['格局','核心價值','成就','責任','能耐','成敗',
               '天運天機','地運資源','人運人和','戰略','戰術','算略KPI','智略'];

  var rc='border-radius:3px';

  // 統計
  var vTotal=(BETA_VISIBLE_DIMS>=13)?avgCoeff(manualData,visibleDimIds):null;
  var vPre=(visiblePre>=6)?avgCoeff(manualData,[0,1,2,3,4,5]):null;
  var vLuck=(visibleLuck>=3)?avgCoeff(manualData,[6,7,8]):null;
  var vPost=(visiblePost>=4)?avgCoeff(manualData,[9,10,11,12]):null;
  var vLead=(visiblePre>=3)?avgCoeff(manualData,[0,1,2]):null;
  var vSub=(visiblePre>=6)?avgCoeff(manualData,[3,4,5]):null;

  function mCountSD(dimIds){
    var s=0,d=0;
    dimIds.forEach(function(di){
      manualData[di].forEach(function(v){
        if(!v)return;
        var tp=v==='A'?DIMS[di].aT:DIMS[di].bT;
        if(tp==='靜')s++;else d++;
      });
    });
    return{s:s,d:d};
  }
  var visiblePreIds=[];for(var vpi=0;vpi<visiblePre;vpi++) visiblePreIds.push(vpi);
  var visibleLuckIds=[];for(var vli=6;vli<6+visibleLuck;vli++) visibleLuckIds.push(vli);
  var visiblePostIds=[];for(var vpoi=9;vpoi<9+visiblePost;vpoi++) visiblePostIds.push(vpoi);
  var sdAll=mCountSD(visibleDimIds);
  var sdPre=mCountSD(visiblePreIds);
  var sdLuck=mCountSD(visibleLuckIds);
  var sdPost=mCountSD(visiblePostIds);

  var dimSCounts=[],dimDCounts=[];
  for(var di2=0;di2<13;di2++){
    var sc=0,dc=0;
    manualData[di2].forEach(function(v){if(!v)return;var tp=v==='A'?DIMS[di2].aT:DIMS[di2].bT;if(tp==='靜')sc++;else dc++;});
    dimSCounts.push(sc);dimDCounts.push(dc);
  }
  var dimCoeffs=[];
  for(var dc2=0;dc2<13;dc2++){ dimCoeffs.push(calcDim(manualData,dc2)); }
  var dimAttr=[];
  for(var da2=0;da2<13;da2++){ var r=dimCoeffs[da2]; dimAttr.push(r?r.type:null); }

  // 判斷每個維度是否 9 個部位全部填完
  var dimComplete=[];
  for(var di3=0;di3<13;di3++){
    var complete=true;
    for(var pi3=0;pi3<9;pi3++){ if(manualData[di3][pi3]===null||manualData[di3][pi3]===undefined){ complete=false; break; } }
    dimComplete.push(complete);
  }
  function groupComplete(ids){ return ids.every(function(i){ return dimComplete[i]; }); }
  var INC='未填完';
  var INC_STYLE='color:#bbb;font-size:10px';

  function ratioB(d,s){
    var total=d+s;
    if(!total)return '';
    var mx=Math.max(d,s);
    if(!mx)return '0.0';
    return (Math.min(d,s)/mx).toFixed(1);
  }

  function checkMark(di){
    return '<span style="display:inline-block;width:14px;height:14px;background:'+dimDeep[di]+';border-radius:2px;line-height:14px;text-align:center;color:#fff;font-size:10px">✓</span>';
  }

  // === 表格 ===
  var t='<table style="border-collapse:separate;border-spacing:2px;white-space:nowrap;font-size:11px;font-family:sans-serif;width:100%">';

  // --- R1: 流年（由外部 _manualLnHtml 處理）---
  if(_manualLnHtml){
    t+='<tr><td colspan="'+totalCols+'" style="padding:0 0 8px 0">'+_manualLnHtml+'</td></tr>';
  }

  // --- R2: 先天指數 | 運氣指數 | 後天指數 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  t+='<td colspan="'+(visiblePre*2+3)+'" style="background:'+C_PRE+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">先天指數</td>';
  if(showLuck){
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="'+(visibleLuck*2+3)+'" style="background:'+C_LUCK+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">運氣指數</td>';
  }
  if(showPost){
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="'+(visiblePost*2+3)+'" style="background:'+C_POST+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">後天指數</td>';
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R3: 維度名 + 動靜分析 + 總動靜分析 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<visiblePre;i++){
    t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].da+'</td>';
    t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].db+'</td>';
  }
  t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
  if(showLuck){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<6+visibleLuck;i++){
      t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].da+'</td>';
      t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].db+'</td>';
    }
    t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
  }
  if(showPost){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<9+visiblePost;i++){
      t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].da+'</td>';
      t+='<td style="background:'+dimDeep[i]+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+DIMS[i].db+'</td>';
    }
    t+='<td rowspan="2" colspan="3" style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">動靜分析</td>';
  }
  t+='<td rowspan="2" colspan="3" style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">總動靜分析</td>';
  t+='</tr>';

  // --- R4: 維度描述 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<visiblePre;i++){
    t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
  }
  if(showLuck){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<6+visibleLuck;i++){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
    }
  }
  if(showPost){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<9+visiblePost;i++){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:2px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:9px">'+dimDesc[i]+'</td>';
    }
  }
  t+='</tr>';

  // --- R5: 靜/動標頭 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  function r5Cell(di,isLeft){
    var isS;
    if(isLeft){isS=colLIsS[di];}else{isS=!colLIsS[di];}
    var label=isS?'靜':'動';
    var fc=isS?'#000':'#980000';
    return '<td style="background:'+dimBg[di]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc+'">'+label+'</td>';
  }
  for(var i=0;i<visiblePre;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
  if(showLuck){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<6+visibleLuck;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
  }
  if(showPost){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<9+visiblePost;i++){t+=r5Cell(i,true)+r5Cell(i,false);}
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#980000">動</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:#000">靜</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">比例</td>';
  }
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">動</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">靜</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">比例</td>';
  t+='</tr>';

  // --- R6~R14: 部位資料行（可點擊編輯：點維度格 → 循環 形/靜→勢/動→未填）---
  function renderPartRow(pi, idx){
    var label=partLabels[idx];
    t+='<tr>';
    t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';

    var preS=0,preD=0,luckS=0,luckD=0,postS=0,postD=0;

    // 一個維度的兩格（左/右），帶 data-mrc 供 RWD 綁定點擊；唯讀時 cursor 由外層決定
    function dimCellPair(i){
      var v=manualData[i][pi];
      var base='background:'+dimBg[i]+';padding:3px 4px;'+rc+';cursor:pointer';
      var a=' data-mrcell="'+i+'_'+pi+'"';
      if(v){
        var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
        var goLeft=(tp==='靜'&&colLIsS[i])||(tp!=='靜'&&!colLIsS[i]);
        var cm=checkMark(i);
        return goLeft
          ? '<td'+a+' style="'+base+';text-align:center">'+cm+'</td><td'+a+' style="'+base+'"></td>'
          : '<td'+a+' style="'+base+'"></td><td'+a+' style="'+base+';text-align:center">'+cm+'</td>';
      }
      // 自動報告(meta.grayIncomplete):未填部位 → 兩格合併灰底＋未填完;手動報告維持兩空格(待點擊作答)
      if(meta&&meta.grayIncomplete){
        return '<td'+a+' colspan="2" style="background:#eceae6;padding:3px 2px;'+rc+';text-align:center"><span style="font-size:8px;color:#a89e92">未填完</span></td>';
      }
      return '<td'+a+' style="'+base+'"></td><td'+a+' style="'+base+'"></td>';
    }
    function tally(i,bucket){
      var v=manualData[i][pi];
      if(!v)return;
      var tp=v==='A'?DIMS[i].aT:DIMS[i].bT;
      if(tp==='靜')bucket.s++;else bucket.d++;
    }

    // 先天 visiblePre 維度
    var bPre={s:0,d:0};
    for(var i=0;i<visiblePre;i++){ tally(i,bPre); t+=dimCellPair(i); }
    preS=bPre.s;preD=bPre.d;
    // 先天動靜分析
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preD+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+preS+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(preD,preS)+'</td>';

    if(showLuck){
      // 中部位欄
      t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';
      var bLuck={s:0,d:0};
      for(var i=6;i<6+visibleLuck;i++){ tally(i,bLuck); t+=dimCellPair(i); }
      luckS=bLuck.s;luckD=bLuck.d;
      // 運氣動靜分析
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckD+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+luckS+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(luckD,luckS)+'</td>';
    }

    if(showPost){
      // 右部位欄
      t+='<td style="background:'+C_PART_BG+';padding:3px 6px;'+rc+';text-align:center;color:'+C_PART_FC+'">'+label+'</td>';
      var bPost={s:0,d:0};
      for(var i=9;i<9+visiblePost;i++){ tally(i,bPost); t+=dimCellPair(i); }
      postS=bPost.s;postD=bPost.d;
      // 後天動靜分析
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postD+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+postS+'</td>';
      t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(postD,postS)+'</td>';
    }

    // 總動靜分析
    var allS=preS+luckS+postS, allD=preD+luckD+postD;
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+allD+'</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+allS+'</td>';
    t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+ratioB(allD,allS)+'</td>';

    t+='</tr>';
  }

  partOrder.forEach(function(pi,idx){
    if(idx===4){
      t+='<tr><td colspan="'+totalCols+'" style="height:2px;background:#b8b0a0;padding:0"></td></tr>';
    }
    renderPartRow(pi,idx);
  });

  // --- R15: 統計行 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<visiblePre;i++){
    var sn=dimSCounts[i],dn=dimDCounts[i];
    var lv=colLIsS[i]?sn:dn;
    var rv=colLIsS[i]?dn:sn;
    t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
    t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
  }
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdPre.d+'</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdPre.s+'</td>';
  t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(sdPre.d,sdPre.s)+'</td>';
  if(showLuck){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<6+visibleLuck;i++){
      var sn=dimSCounts[i],dn=dimDCounts[i];
      var lv=colLIsS[i]?sn:dn;
      var rv=colLIsS[i]?dn:sn;
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
    }
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdLuck.d+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdLuck.s+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(sdLuck.d,sdLuck.s)+'</td>';
  }
  if(showPost){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<9+visiblePost;i++){
      var sn=dimSCounts[i],dn=dimDCounts[i];
      var lv=colLIsS[i]?sn:dn;
      var rv=colLIsS[i]?dn:sn;
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+lv+'</td>';
      t+='<td style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:#000">'+rv+'</td>';
    }
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdPost.d+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+sdPost.s+'</td>';
    t+='<td style="background:'+C_AN_BG+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+'">'+ratioB(sdPost.d,sdPost.s)+'</td>';
  }
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+sdAll.d+'</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+sdAll.s+'</td>';
  t+='<td style="background:'+C_TOTAL_SD+';padding:3px 4px;'+rc+';text-align:center;color:#fff">'+ratioB(sdAll.d,sdAll.s)+'</td>';
  t+='</tr>';

  // --- R16: 屬性行 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<visiblePre;i++){
    if(!dimComplete[i]){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
    }else{
      var attr=dimAttr[i];
      var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
      var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+'">'+alabel+'</td>';
    }
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  if(showLuck){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<6+visibleLuck;i++){
      if(!dimComplete[i]){
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
      }else{
        var attr=dimAttr[i];
        var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
        var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+'">'+alabel+'</td>';
      }
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
  }
  if(showPost){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<9+visiblePost;i++){
      if(!dimComplete[i]){
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
      }else{
        var attr=dimAttr[i];
        var alabel=attr==='動'?'動':attr==='靜'?'靜':'';
        var fc2=attr==='動'?'#a61c00':attr==='靜'?'#0b5394':'#000';
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+fc2+'">'+alabel+'</td>';
      }
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R17: 係數行 ---
  t+='<tr>';
  t+='<td style="padding:2px 4px"></td>';
  for(var i=0;i<visiblePre;i++){
    if(!dimComplete[i]){
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
    }else{
      var rcf=dimCoeffs[i];
      var cv=rcf?rcf.coeff.toFixed(2):'';
      t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px">'+cv+'</td>';
    }
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  if(showLuck){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=6;i<6+visibleLuck;i++){
      if(!dimComplete[i]){
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
      }else{
        var rcf=dimCoeffs[i];
        var cv=rcf?rcf.coeff.toFixed(2):'';
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px">'+cv+'</td>';
      }
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
  }
  if(showPost){
    t+='<td style="padding:2px 4px"></td>';
    for(var i=9;i<9+visiblePost;i++){
      if(!dimComplete[i]){
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;'+INC_STYLE+'">'+INC+'</td>';
      }else{
        var rcf=dimCoeffs[i];
        var cv=rcf?rcf.coeff.toFixed(2):'';
        t+='<td colspan="2" style="background:'+dimBg[i]+';padding:3px 4px;'+rc+';text-align:center;color:'+C_AN_FC+';font-size:12px">'+cv+'</td>';
      }
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
  }
  t+='<td colspan="3" style="padding:2px 4px"></td>';
  t+='</tr>';

  // --- R18: 老闆係數 + 主管係數 ---
  if(visiblePre>=3){
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    var bossOk=groupComplete([0,1,2]);
    t+='<td colspan="6" style="background:'+C_BOSS+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">老闆係數 '+(bossOk?vLead:INC)+'</td>';
    if(visiblePre>=6){
      var mgrOk=groupComplete([3,4,5]);
      t+='<td colspan="6" style="background:'+C_MGR+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">主管係數 '+(mgrOk?vSub:INC)+'</td>';
    }else if(visiblePre*2-6>0){
      t+='<td colspan="'+(visiblePre*2-6)+'" style="padding:2px 4px"></td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      t+='<td colspan="'+visibleLuck*2+'" style="padding:2px 4px"></td>';
      t+='<td colspan="3" style="padding:2px 4px"></td>';
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      t+='<td colspan="'+visiblePost*2+'" style="padding:2px 4px"></td>';
      t+='<td colspan="3" style="padding:2px 4px"></td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='</tr>';
  }

  // --- R19: 先天係數 | 運氣係數 | 後天係數 ---
  if(visiblePre>=6||visibleLuck>=3||visiblePost>=4){
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    if(visiblePre>=6){
      var preOk=groupComplete([0,1,2,3,4,5]);
      t+='<td colspan="'+visiblePre*2+'" style="background:'+C_PRE_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">先天係數 '+(preOk?vPre:INC)+'</td>';
    }else{
      t+='<td colspan="'+visiblePre*2+'" style="padding:2px 4px"></td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    if(showLuck){
      t+='<td style="padding:2px 4px"></td>';
      if(visibleLuck>=3){
        var luckOk=groupComplete([6,7,8]);
        t+='<td colspan="'+visibleLuck*2+'" style="background:'+C_LUCK_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">運氣係數 '+(luckOk?vLuck:INC)+'</td>';
      }else{
        t+='<td colspan="'+visibleLuck*2+'" style="padding:2px 4px"></td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
    }
    if(showPost){
      t+='<td style="padding:2px 4px"></td>';
      if(visiblePost>=4){
        var postOk=groupComplete([9,10,11,12]);
        t+='<td colspan="'+visiblePost*2+'" style="background:'+C_POST_C+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">後天係數 '+(postOk?vPost:INC)+'</td>';
      }else{
        t+='<td colspan="'+visiblePost*2+'" style="padding:2px 4px"></td>';
      }
      t+='<td colspan="3" style="padding:2px 4px"></td>';
    }
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='</tr>';
  }

  // --- R20: 總係數 ---
  if(BETA_VISIBLE_DIMS>=13){
    var allOk=groupComplete(visibleDimIds);
    // 比照自動報告：bar 右緣對齊後天係數右緣 = 先天數據+先天動靜 + (部位+運氣數據+運氣動靜) + (部位+後天數據)
    var dataColSpan=visiblePre*2+3+(showLuck?1+visibleLuck*2+3:0)+(showPost?1+visiblePost*2:0);
    t+='<tr>';
    t+='<td style="padding:2px 4px"></td>';
    t+='<td colspan="'+dataColSpan+'" style="background:'+C_TOTAL+';color:#fff;padding:4px 8px;'+rc+';text-align:center;font-size:13px">總係數 '+(allOk?vTotal:INC)+'</td>';
    if(showPost) t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='<td colspan="3" style="padding:2px 4px"></td>';
    t+='</tr>';
  }

  t+='</table>';

  // === 報告圖（比照舊 chart-mount 區塊的資料計算）===
  var _dimSFrac=[],_dimCoeffArr=[];
  for(var _ci=0;_ci<13;_ci++){var _sc=dimSCounts[_ci]||0,_dn=dimDCounts[_ci]||0,_tt=_sc+_dn;_dimSFrac.push(_tt>0?_sc/_tt:0.5);_dimCoeffArr.push(dimComplete[_ci]&&dimCoeffs[_ci]&&typeof dimCoeffs[_ci].coeff==='number'?dimCoeffs[_ci].coeff:null);}
  var _gv=function(ids,v){return groupComplete(ids)?(v==null?null:v):null;};
  var _pre=_gv([0,1,2,3,4,5],vPre),_boss=_gv([0,1,2],vLead),_mgr=_gv([3,4,5],vSub),_luck=_gv([6,7,8],vLuck),_post=_gv([9,10,11,12],vPost),_tot=_gv([0,1,2,3,4,5,6,7,8,9,10,11,12],vTotal);

  // 兩張雷達同 viewBox（一樣大）；標題畫在 SVG 內、字級＝維度字（一致）
  // noChartTitle（辣度總覽用）：不畫圖內標題，且裁掉標題留白 → viewBox 上移＝圖更大
  var _noT = meta && meta.noChartTitle;
  var _hideC = meta && meta.hideRadarCenter;   // 辣度總覽:隱藏雷達中央 總係數/老闆/主管/先天/後天/運氣 文字數字
  var _RVB = _noT ? '20 40 360 360' : '20 16 360 384';
  var _radar2Svg=buildRadar2SVG({dimSFrac:_dimSFrac,dimCoeff:_dimCoeffArr,bossV:_boss,mgrV:_mgr,luckV:_luck,postV:_post,preV:_pre,totV:_tot,title:_noT?'':'係數圖',viewBox:_RVB,hideCenter:_hideC});
  // 子彈圖：總係數置頂 → 先天 老闆 主管 運氣 後天；先天/運氣/後天 加粗放大
  // 條高：總/先天/運氣/後天 再 -10%(總14→12.6、其餘12.6→11.34)；老闆/主管 維持 9
  var _COEF_H={'總係數':12.6,'先天':11.34,'運氣':11.34,'後天':11.34,'老闆':9,'主管':9};
  var _coefSvg=buildCoefSVG({preV:_pre,bossV:_boss,mgrV:_mgr,luckV:_luck,postV:_post,totV:_tot,order:['totV','preV','bossV','mgrV','luckV','postV'],big:['總係數','先天','運氣','後天'],small:['老闆','主管'],title:_noT?'':'係數總覽',fs:10.8,vbW:360,x0:57,trackW:258,titleX:10,
    totLabelCol:'#5a4f45',                                  // 總係數三個字＝標題色(不要黑)
    heights:_COEF_H,
    groupLine:{top:'先天',bot:'主管',color:'#8E4B50'}});      // 先天/老闆/主管 左側括線(先天色)
  // 係數總覽米白底下緣 y：cTop(4+FS+8)+PAD(8)+Σ列高+列間距+PAD；供動靜總覽米白底向下對齊
  var _coefHs=[_COEF_H['總係數'],_COEF_H['先天'],_COEF_H['老闆'],_COEF_H['主管'],_COEF_H['運氣'],_COEF_H['後天']];
  var _coefBeigeBot=(4+(10.8+8))+8 + _coefHs.reduce(function(a,b){return a+b;},0) + (_coefHs.length-1)*9.6 + 8;
  // fsNum 10.5：動靜圖外圍係數數字 = 係數圖(radar2)的數字字級一致（維度名兩圖同為 10.8）
  var _sdSvg=buildRadar3SVG({dimStatic:dimSCounts,dimActive:dimDCounts,dimCoeff:_dimCoeffArr,title:_noT?'':'動靜圖',viewBox:_RVB,fsNum:10.5,hideCenter:_hideC});

  // 動靜總覽：逐部位 動|靜 比例 bar，左組 頭/上停/中停/下停、右組 耳/眉/眼/鼻/口
  // x 對齊上方動靜圖：標題動=16；左組右緣=後天天(172.7)；右組文字左=先天先(188.5)、右緣=方圓圓(345.1)
  var _partD=[],_partS=[];
  for(var _pp=0;_pp<9;_pp++){var _sd=0,_ss=0;for(var _dd=0;_dd<13;_dd++){var _pv=manualData[_dd][_pp];if(!_pv)continue;var _ptp=_pv==='A'?DIMS[_dd].aT:DIMS[_dd].bT;if(_ptp==='靜')_ss++;else _sd++;}_partD.push(_sd);_partS.push(_ss);}
  var _mkRows=function(ids){return ids.map(function(pi){return {label:partLabels[pi],d:_partD[pi],s:_partS[pi]};});};
  var _sdPairSvg=buildSDPairSVG({title:'動靜總覽',titleX:16,fs:10.8,barH:12.6,vbW:360,legend:true,beigeBottom:_coefBeigeBot,cols:[
    {labelX:16,   barLeft:43.6,  barRight:172.7, rows:_mkRows([0,1,2,3])},
    {labelX:188.5,barLeft:205.3, barRight:345.1, rows:_mkRows([4,5,6,7,8])}
  ]});

  return {
    titleHtml: _manualTitleHtml,
    tableHtml: t,
    radar2Html: _radar2Svg,
    coefHtml: _coefSvg,
    sdHtml: _sdSvg,
    sdPairHtml: _sdPairSvg
  };
}

/* 回傳各部分（標題/表格/三張圖 SVG），供 RWD 自行排版 */
export function buildManualReportParts(matrix, meta) {
  return _buildParts(matrix, meta);
}

/* 回傳完整字串（標題 + 表格 + 三圖併排），維持舊用法 */
export function buildManualReportHtml(matrix, meta) {
  var p = _buildParts(matrix, meta);
  var charts = '<div class="m-rep-charts">'
    + '<div class="m-rep-chart m-rep-chart-radar2">' + p.radar2Html + '</div>'
    + '<div class="m-rep-chart m-rep-chart-coef">' + p.coefHtml + '</div>'
    + '<div class="m-rep-chart m-rep-chart-sd">' + p.sdHtml + '</div>'
    + '</div>';
  return p.titleHtml + p.tableHtml + charts;
}
