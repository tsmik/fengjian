import { DIMS, PARTS, data, obsData, obsOverride, OBS_PART_NAMES, OBS_PARTS_DATA, BETA_VISIBLE_DIMS,
         userName, _isTA, _currentCaseId, _currentCaseName, manualData, setManualData,
         setData, setObsData, setObsOverride,
         setNavActive, showPage, calcDim, avgCoeff } from './core.js';
import { recalcFromObs } from './obs_recalc.js';
import { initManualData, manualLoadData } from './manual.js';

/* ===== 敏感度分析頁 ===== */
export function showSensPage(){
  showPage('sens-page');
  document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-sens');
  if(!window._suppressPushState) history.pushState({page:'sens'},'');
  recalcFromObs();
  renderSensPage();
}

export function renderSensPage(){
  var el=document.getElementById('sens-content');if(!el)return;
  var SBG='#7A9E7E',DBG='#C17A5A';
  var _dimBg=['#D6E4CC','#C8DCD8','#E2DDD5','#F0DECA','#E8D2D8','#EDE4C8',
              '#CEDDE8','#DDD4E4','#D2DDD6','#D4E2CF','#DED5DF','#CADDD8','#CDDAE6'];
  var _dimDeep=['#6B8C5A','#4A7A6E','#8A8078','#A07850','#9A6878','#9A8A50',
                '#4A7A9A','#7A6890','#5A8A6A','#5A8A5A','#7A6088','#4A8078','#4A6E8A'];
  var _colLIsS=DIMS.map(function(d){var dt=(d.da===d.a)?d.aT:d.bT;return dt==='靜';});
  function _checkMark(di){
    return '<span style="display:inline-block;width:16px;height:16px;background:'+_dimDeep[di]+';border-radius:3px;line-height:16px;text-align:center;color:#fff;font-size:11px;font-weight:400">\u2713</span>';
  }
  function _checkMarkFlip(di){
    return '<span style="display:inline-block;width:16px;height:16px;background:'+_dimDeep[di]+';border-radius:3px;line-height:16px;text-align:center;color:#fff;font-size:11px;font-weight:400;outline:3px solid #E8B000;outline-offset:-1px">\u2713</span>';
  }

  el.innerHTML='<div style="font-size:18px;font-weight:400;color:var(--text);margin-bottom:8px;letter-spacing:2px">重要參數分析</div><div style="color:var(--text-3);font-size:13px">計算中...</div>';

  setTimeout(function(){

  // 完整度檢查工具
  function _checkBlockComplete(dataArr, dimIndices){
    var total=dimIndices.length*9;
    var filled=0;
    dimIndices.forEach(function(di){
      for(var pi=0;pi<9;pi++){
        if(dataArr[di][pi]==='A'||dataArr[di][pi]==='B') filled++;
      }
    });
    return {complete:filled===total, filled:filled, total:total};
  }
  function _renderIncompleteMsg(blockLabel, chk){
    return '<div style="margin-bottom:24px;padding:16px;background:white;border-radius:10px;border:1px solid var(--border)">'+
      '<div style="font-size:14px;color:#E8B000;margin-bottom:6px">\u26A0 '+blockLabel+' 尚未填完（已填 '+chk.filled+'/'+chk.total+' 格）</div>'+
      '<div style="font-size:13px;color:var(--text-3)">請先到「觀察題目」填完整所有題目，再回來此頁查看分析。</div>'+
      '</div>';
  }

  var origObs=JSON.parse(JSON.stringify(obsData));
  var origData=JSON.parse(JSON.stringify(data));
  var origOverride=JSON.parse(JSON.stringify(obsOverride));

  // 收集所有題目
  var allQs=[];
  OBS_PART_NAMES.forEach(function(pn){
    var pd=OBS_PARTS_DATA[pn];if(!pd)return;
    pd.sections.forEach(function(sec){sec.qs.forEach(function(q){
      allQs.push({id:q.id,text:q.text,paired:!!q.paired,opts:q.opts,part:pn});
    });});
  });

  // 基準
  var baseCoeffs=[];
  for(var di=0;di<13;di++){var r=calcDim(data, di);baseCoeffs.push(r?r.coeff:0);}
  var baseTotalCoeff=parseFloat(avgCoeff(data, [0,1,2,3,4,5,6,7,8,9,10,11,12]));
  var baseTypes=[];
  for(var di=0;di<13;di++){var r2=calcDim(data, di);baseTypes.push(r2?r2.type:null);}

  // 對每題計算敏感度
  var sensResults=[];
  allQs.forEach(function(q){
    var curVal=origObs[q.id]||'';
    var maxAbsDelta=0;
    var bestUpDelta=0;
    var bestDownDelta=0;
    var affectedDims=new Set();
    var flipDims=new Set();

    q.opts.forEach(function(opt){
      var v=typeof opt==='string'?opt:opt.v;
      if(v===curVal)return;
      setObsData(JSON.parse(JSON.stringify(origObs)));
      obsData[q.id]=v;
      if(q.paired){obsData[q.id+'_L']=v;obsData[q.id+'_R']=v;}
      recalcFromObs();
      var newCoeffs=[],newTypes=[];
      for(var di=0;di<13;di++){
        var r=calcDim(data, di);var nc=r?r.coeff:0;
        newCoeffs.push(nc);newTypes.push(r?r.type:null);
        if(Math.abs(nc-baseCoeffs[di])>0.001)affectedDims.add(di);
        if(baseTypes[di]==='動'&&(r?r.type:null)==='靜')flipDims.add(di);
      }
      var _sMin=0,_sMax=0;for(var _di2=0;_di2<13;_di2++){var _r3=calcDim(data, _di2);if(_r3){_sMin+=Math.min(_r3.a,_r3.b);_sMax+=Math.max(_r3.a,_r3.b);}}var newTotal=_sMax>0?_sMin/_sMax:0;
      var totalDelta=newTotal-baseTotalCoeff;
      var absDelta=Math.abs(totalDelta);
      if(absDelta>maxAbsDelta)maxAbsDelta=absDelta;
      if(totalDelta>bestUpDelta)bestUpDelta=totalDelta;
      if(totalDelta<bestDownDelta)bestDownDelta=totalDelta;
    });

    setObsData(JSON.parse(JSON.stringify(origObs)));
    setData(JSON.parse(JSON.stringify(origData)));

    sensResults.push({
      id:q.id,text:q.text,part:q.part,curVal:curVal||'未填',paired:q.paired,
      sensitivity:maxAbsDelta,bestUp:bestUpDelta,bestDown:bestDownDelta,
      affectedDims:Array.from(affectedDims).sort(function(a,b){return a-b;}),
      flipDims:Array.from(flipDims).sort(function(a,b){return a-b;})
    });
  });

  // 最終還原
  setObsData(JSON.parse(JSON.stringify(origObs)));
  setObsOverride(JSON.parse(JSON.stringify(origOverride)));
  setData(JSON.parse(JSON.stringify(origData)));
  recalcFromObs();

  // 按敏感度降序排列，用相對排名分類
  var sorted=sensResults.slice().sort(function(a,b){return b.sensitivity-a.sensitivity;});
  var LOW_THRESHOLD=0.0005;
  var nonZero=sorted.filter(function(r){return r.sensitivity>=LOW_THRESHOLD;});
  var TOP_N=10;
  var topN=Math.min(TOP_N,nonZero.length);
  var HIGH_THRESHOLD=nonZero.length>0&&topN<=nonZero.length?nonZero[topN-1].sensitivity:0;

  var highSens=sorted.filter(function(r){return r.sensitivity>=HIGH_THRESHOLD&&r.sensitivity>=LOW_THRESHOLD;}).sort(function(a,b){return b.sensitivity-a.sensitivity;});
  var midSens=sorted.filter(function(r){return r.sensitivity>=LOW_THRESHOLD&&r.sensitivity<HIGH_THRESHOLD;}).sort(function(a,b){return b.sensitivity-a.sensitivity;});
  var lowSens=sorted.filter(function(r){return r.sensitivity<LOW_THRESHOLD;});

  // 部位彙整
  var partSens={};
  sensResults.forEach(function(r){
    if(!partSens[r.part])partSens[r.part]={total:0,count:0,highCount:0,dims:new Set()};
    partSens[r.part].total+=r.sensitivity;
    partSens[r.part].count++;
    if(r.sensitivity>=HIGH_THRESHOLD&&r.sensitivity>=LOW_THRESHOLD)partSens[r.part].highCount++;
    r.affectedDims.forEach(function(di){partSens[r.part].dims.add(di);});
  });
  var partRank=Object.keys(partSens).map(function(pn){
    return {part:pn,total:partSens[pn].total,count:partSens[pn].count,
      highCount:partSens[pn].highCount,dims:Array.from(partSens[pn].dims).sort(function(a,b){return a-b;})};
  }).sort(function(a,b){return b.total-a.total;});

  // 輔助
  function dimTag(di){
    return '<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:400;color:white;background:'+_dimDeep[di]+';white-space:nowrap">'+DIMS[di].dn+'</span>';
  }
  function sensBar(val,maxVal){
    var pct=maxVal>0?Math.min(val/maxVal*100,100):0;
    var color=val>HIGH_THRESHOLD?'var(--active)':val>=LOW_THRESHOLD?'#d4b870':'#ccc';
    return '<div style="width:80px;height:6px;background:#eee;border-radius:3px;overflow:hidden;flex-shrink:0">'+
      '<div style="width:'+pct+'%;height:100%;background:'+color+';border-radius:3px"></div></div>';
  }
  var globalMax=highSens.length>0?highSens[0].sensitivity:0.01;

  // ===== 老闆/主管係數分析 =====

  // 老闆目標定義
  var BOSS_TARGETS=[
    {di:1, name:'經緯', target:6/9, weight:3, targetLabel:'靜 ≥ 6:3'},
    {di:0, name:'形勢', target:5/9, weight:2, targetLabel:'靜 ≥ 5:4'},
    {di:2, name:'方圓', target:null, weight:1, targetLabel:'隨之提升'}
  ];

  function _bossStaticScore(di){
    var r=calcDim(data, di);if(!r)return 0;
    var d=DIMS[di];
    // 靜側計數比例：靜count / 9
    var staticCount=d.aT==='靜'?r.a:r.b;
    return staticCount/9;
  }

  var baseBossScores=[];
  var baseBossReached=[];
  BOSS_TARGETS.forEach(function(bt){
    if(bt.target!==null){
      var ss=_bossStaticScore(bt.di);
      baseBossScores.push(ss);
      var r=calcDim(data, bt.di);
      var ss=_bossStaticScore(bt.di);
      baseBossReached.push(ss>=bt.target);
    }else{
      baseBossScores.push(baseCoeffs[bt.di]);
      baseBossReached.push(false);
    }
  });

  // 主管基準
  var MGR_DIMS=[3,4,5];
  var MGR_NAMES=['曲直','收放','緩急'];
  var baseMgrCoeffs=[];
  MGR_DIMS.forEach(function(di){baseMgrCoeffs.push(baseCoeffs[di]);});
  var mgrMinIdx=0;
  baseMgrCoeffs.forEach(function(c,i){if(c<baseMgrCoeffs[mgrMinIdx])mgrMinIdx=i;});

  // 貪婪累積選擇：5 輪 loop，每輪基於上一輪累積結果重新評估
  var innateTop5=[];
  var innateUsedIds={};
  var innateCumObs=JSON.parse(JSON.stringify(origObs));

  for(var _innRound=0;_innRound<5;_innRound++){
    setObsData(JSON.parse(JSON.stringify(innateCumObs)));
    recalcFromObs();
    var roundCoeffs=[];
    for(var _rc=0;_rc<13;_rc++){var _rcr=calcDim(data,_rc);roundCoeffs.push(_rcr?_rcr.coeff:0);}
    // 本輪老闆基準（靜側達標分數 + 是否已達標）
    var roundBossScores=[];
    var roundBossReached=[];
    BOSS_TARGETS.forEach(function(bt){
      if(bt.target!==null){
        var ss=_bossStaticScore(bt.di);
        roundBossScores.push(ss);
        roundBossReached.push(ss>=bt.target);
      }else{
        roundBossScores.push(roundCoeffs[bt.di]);
        roundBossReached.push(false);
      }
    });
    // 本輪主管基準
    var roundMgrCoeffs=[];
    MGR_DIMS.forEach(function(di){roundMgrCoeffs.push(roundCoeffs[di]);});
    var roundMgrMinIdx=0;
    roundMgrCoeffs.forEach(function(c,i){if(c<roundMgrCoeffs[roundMgrMinIdx])roundMgrMinIdx=i;});

    var innateRoundBest=null;
    var innateRoundBestScore=0;

    allQs.forEach(function(q){
      if(innateUsedIds[q.id])return;
      var curVal=innateCumObs[q.id]||'';
      var bestTotal=0,bestBoss=0,bestMgr=0,bestOpt=null;

      q.opts.forEach(function(opt){
        var v=typeof opt==='string'?opt:opt.v;
        if(v===curVal)return;
        setObsData(JSON.parse(JSON.stringify(innateCumObs)));
        obsData[q.id]=v;
        if(q.paired){obsData[q.id+'_L']=v;obsData[q.id+'_R']=v;}
        recalcFromObs();

        // 老闆分數
        var bScore=0;
        BOSS_TARGETS.forEach(function(bt,idx){
          if(roundBossReached[idx])return;
          var improve;
          if(bt.target!==null){
            var newSS=_bossStaticScore(bt.di);
            improve=newSS-roundBossScores[idx];
            if(improve<=0)return;
            if(newSS>bt.target)improve=Math.max(0,bt.target-roundBossScores[idx]);
          }else{
            var nr=calcDim(data, bt.di);var nc=nr?nr.coeff:0;
            improve=nc-roundBossScores[idx];
            if(improve<=0)return;
          }
          bScore+=improve*bt.weight;
        });

        // 主管分數
        var mImprovements=[];
        MGR_DIMS.forEach(function(di,idx){
          var nr=calcDim(data, di);var nc=nr?nr.coeff:0;
          mImprovements.push(Math.max(0,nc-roundMgrCoeffs[idx]));
        });
        var mAvg=mImprovements.reduce(function(s,v){return s+v;},0)/3;
        var mWeak=mImprovements[roundMgrMinIdx];
        var mScore=mAvg+mWeak*2;

        // 跨維度連帶效應（相對於本輪起始狀態）
        var innateCrossBonus=0;
        [6,7,8,9,10,11,12].forEach(function(di){
          var nr=calcDim(data, di);var nc=nr?nr.coeff:0;
          var improve=nc-roundCoeffs[di];
          if(improve>0.001)innateCrossBonus+=improve;
        });
        var totalScore=bScore+mScore+innateCrossBonus*0.1;
        if(totalScore>bestTotal){
          bestTotal=totalScore;
          bestBoss=bScore;
          bestMgr=mScore;
          bestOpt=v;
        }
      });

      if(bestTotal>0 && bestTotal>innateRoundBestScore){
        innateRoundBestScore=bestTotal;
        innateRoundBest={id:q.id,text:q.text,part:q.part,curVal:curVal||'未填',score:bestTotal,bossScore:bestBoss,mgrScore:bestMgr,bestOpt:bestOpt,paired:q.paired};
      }
    });

    setObsData(JSON.parse(JSON.stringify(innateCumObs)));
    recalcFromObs();

    if(!innateRoundBest)break;

    innateCumObs[innateRoundBest.id]=innateRoundBest.bestOpt;
    if(innateRoundBest.paired){
      innateCumObs[innateRoundBest.id+'_L']=innateRoundBest.bestOpt;
      innateCumObs[innateRoundBest.id+'_R']=innateRoundBest.bestOpt;
    }
    innateUsedIds[innateRoundBest.id]=true;
    innateTop5.push(innateRoundBest);
  }

  // 還原全域狀態
  setObsData(JSON.parse(JSON.stringify(origObs)));
  setObsOverride(JSON.parse(JSON.stringify(origOverride)));
  setData(JSON.parse(JSON.stringify(origData)));
  recalcFromObs();

  // ===== 模擬 Top5 全翻轉，並驗收：老闆 AND 主管都不下降 =====
  var simData=null, simCoeffs=[], simBossCoeffVal='', simMgrCoeffVal='', simInnateCoeffVal='';
  var simFlips={};
  var baseBossCoeffNum=parseFloat(avgCoeff(origData, [0,1,2]));
  var baseMgrCoeffNum=parseFloat(avgCoeff(origData, [3,4,5]));
  while(innateTop5.length>0){
    setObsData(JSON.parse(JSON.stringify(origObs)));
    innateTop5.forEach(function(r){
      obsData[r.id]=r.bestOpt;
      if(r.paired){
        obsData[r.id+'_L']=r.bestOpt;
        obsData[r.id+'_R']=r.bestOpt;
      }
    });
    recalcFromObs();
    var tryBossCoeff=parseFloat(avgCoeff(data, [0,1,2]));
    var tryMgrCoeff=parseFloat(avgCoeff(data, [3,4,5]));
    if(tryBossCoeff>=baseBossCoeffNum && tryMgrCoeff>=baseMgrCoeffNum && (tryBossCoeff>baseBossCoeffNum || tryMgrCoeff>baseMgrCoeffNum)){
      // 通過：老闆和主管都不下降，且至少其中一個上升
      simData=[];
      for(var _sd=0;_sd<13;_sd++){simData.push(data[_sd].slice());}
      simCoeffs=[];
      for(var _sc=0;_sc<13;_sc++){var _r=calcDim(data, _sc);simCoeffs.push(_r?_r.coeff:0);}
      simBossCoeffVal=tryBossCoeff.toFixed(2);
      simMgrCoeffVal=tryMgrCoeff.toFixed(2);
      simInnateCoeffVal=avgCoeff(data, [0,1,2,3,4,5]);
      for(var _fd=0;_fd<6;_fd++){
        for(var _fp=0;_fp<9;_fp++){
          if(origData[_fd][_fp]!==simData[_fd][_fp]){
            simFlips[_fd+'_'+_fp]=true;
          }
        }
      }
      break;
    }else{
      innateTop5.pop();
    }
  }
  // 全域還原（無論通過與否）
  setObsData(JSON.parse(JSON.stringify(origObs)));
  setObsOverride(JSON.parse(JSON.stringify(origOverride)));
  setData(JSON.parse(JSON.stringify(origData)));
  recalcFromObs();

  // ===== 運氣係數分析 =====
  var LUCK_DIMS=[6,7,8];
  var LUCK_NAMES=['順逆','分合','真假'];
  var luckCoeffVal=avgCoeff(data, LUCK_DIMS);
  var baseLuckCoeffNum=parseFloat(luckCoeffVal);

  // 貪婪累積選擇：5 輪 loop
  var luckTop5=[];
  var luckUsedIds={};
  var luckCumObs=JSON.parse(JSON.stringify(origObs));

  for(var _luRound=0;_luRound<5;_luRound++){
    setObsData(JSON.parse(JSON.stringify(luckCumObs)));
    recalcFromObs();
    var roundLuckCoeffs=[];
    for(var _lrc=0;_lrc<13;_lrc++){var _lrcr=calcDim(data,_lrc);roundLuckCoeffs.push(_lrcr?_lrcr.coeff:0);}
    var roundBaseLuckCoeff=parseFloat(avgCoeff(data, LUCK_DIMS));

    var luckRoundBest=null;
    var luckRoundBestScore=0;

    allQs.forEach(function(q){
      if(luckUsedIds[q.id])return;
      var curVal=luckCumObs[q.id]||'';
      var bestTotal=0,bestOpt=null;

      q.opts.forEach(function(opt){
        var v=typeof opt==='string'?opt:opt.v;
        if(v===curVal)return;
        setObsData(JSON.parse(JSON.stringify(luckCumObs)));
        obsData[q.id]=v;
        if(q.paired){obsData[q.id+'_L']=v;obsData[q.id+'_R']=v;}
        recalcFromObs();

        var _lSumMin=0,_lSumMax=0;
        LUCK_DIMS.forEach(function(di){
          var nr=calcDim(data, di);if(nr){_lSumMin+=Math.min(nr.a,nr.b);_lSumMax+=Math.max(nr.a,nr.b);}
        });
        var newLuckCoeff=_lSumMax>0?_lSumMin/_lSumMax:0;
        var lMain=newLuckCoeff-roundBaseLuckCoeff;

        // 跨維度連帶效應（相對於本輪起始狀態）
        var crossBonus=0;
        [0,1,2,3,4,5,9,10,11,12].forEach(function(di){
          var nr=calcDim(data, di);var nc=nr?nr.coeff:0;
          var improve=nc-roundLuckCoeffs[di];
          if(improve>0.001)crossBonus+=improve;
        });

        if(lMain<=0)return;
        var lScore=lMain+crossBonus*0.1;
        if(lScore>bestTotal){
          bestTotal=lScore;
          bestOpt=v;
        }
      });

      if(bestTotal>0 && bestTotal>luckRoundBestScore){
        luckRoundBestScore=bestTotal;
        luckRoundBest={id:q.id,text:q.text,part:q.part,curVal:curVal||'未填',score:bestTotal,bestOpt:bestOpt,paired:q.paired};
      }
    });

    setObsData(JSON.parse(JSON.stringify(luckCumObs)));
    recalcFromObs();

    if(!luckRoundBest)break;

    luckCumObs[luckRoundBest.id]=luckRoundBest.bestOpt;
    if(luckRoundBest.paired){
      luckCumObs[luckRoundBest.id+'_L']=luckRoundBest.bestOpt;
      luckCumObs[luckRoundBest.id+'_R']=luckRoundBest.bestOpt;
    }
    luckUsedIds[luckRoundBest.id]=true;
    luckTop5.push(luckRoundBest);
  }

  // 還原全域狀態
  setObsData(JSON.parse(JSON.stringify(origObs)));
  setObsOverride(JSON.parse(JSON.stringify(origOverride)));
  setData(JSON.parse(JSON.stringify(origData)));
  recalcFromObs();

  // 模擬運氣 Top5 全翻轉，並驗收：若反而下降則從尾端回退
  var luckSimData=null, luckSimCoeffVal='';
  var luckSimFlips={};
  while(luckTop5.length>0){
    setObsData(JSON.parse(JSON.stringify(origObs)));
    luckTop5.forEach(function(r){
      obsData[r.id]=r.bestOpt;
      if(r.paired){
        obsData[r.id+'_L']=r.bestOpt;
        obsData[r.id+'_R']=r.bestOpt;
      }
    });
    recalcFromObs();
    var tryLuckCoeff=parseFloat(avgCoeff(data, LUCK_DIMS));
    if(tryLuckCoeff>baseLuckCoeffNum){
      luckSimData=[];
      for(var _ld=0;_ld<13;_ld++){luckSimData.push(data[_ld].slice());}
      luckSimCoeffVal=tryLuckCoeff.toFixed(2);
      for(var _lfd=6;_lfd<9;_lfd++){
        for(var _lfp=0;_lfp<9;_lfp++){
          if(origData[_lfd][_lfp]!==luckSimData[_lfd][_lfp]){
            luckSimFlips[_lfd+'_'+_lfp]=true;
          }
        }
      }
      break;
    }else{
      luckTop5.pop();
    }
  }
  // 全域還原（無論通過與否）
  setObsData(JSON.parse(JSON.stringify(origObs)));
  setObsOverride(JSON.parse(JSON.stringify(origOverride)));
  setData(JSON.parse(JSON.stringify(origData)));
  recalcFromObs();

  // ===== 後天係數分析 =====
  var POST_DIMS=[9,10,11,12];
  var POST_NAMES=['攻守','奇正','虛實','進退'];
  var postCoeffVal=avgCoeff(data, POST_DIMS);
  var basePostCoeffs=[];
  POST_DIMS.forEach(function(di){basePostCoeffs.push(baseCoeffs[di]);});
  // 找短板（離 0.80 最遠的）
  var postMinIdx=0;
  var postMaxGap=Math.abs(0.80-basePostCoeffs[0]);
  basePostCoeffs.forEach(function(c,i){
    var gap=Math.abs(0.80-c);
    if(gap>postMaxGap){postMaxGap=gap;postMinIdx=i;}
  });

  // 貪婪累積選擇：5 輪 loop，每輪基於上一輪累積結果重新評估
  var postTop5=[];
  var postUsedIds={};
  var postCumObs=JSON.parse(JSON.stringify(origObs));

  for(var _round=0;_round<5;_round++){
    setObsData(JSON.parse(JSON.stringify(postCumObs)));
    recalcFromObs();
    var roundBaseCoeffs=[];
    for(var _rd=0;_rd<13;_rd++){var _rr=calcDim(data,_rd);roundBaseCoeffs.push(_rr?_rr.coeff:0);}
    var roundBasePostCoeff=parseFloat(avgCoeff(data, POST_DIMS));
    var roundBasePostCoeffs=[];
    POST_DIMS.forEach(function(di){roundBasePostCoeffs.push(roundBaseCoeffs[di]);});
    // 本輪短板（隨累積變化會更新）
    var roundPostMinIdx=0;
    var roundPostMaxGap=Math.abs(0.80-roundBasePostCoeffs[0]);
    roundBasePostCoeffs.forEach(function(c,i){
      var gap=Math.abs(0.80-c);
      if(gap>roundPostMaxGap){roundPostMaxGap=gap;roundPostMinIdx=i;}
    });

    var roundBest=null;
    var roundBestScore=0;

    allQs.forEach(function(q){
      if(postUsedIds[q.id])return;
      var curVal=postCumObs[q.id]||'';
      var bestTotal=0,bestOpt=null;

      q.opts.forEach(function(opt){
        var v=typeof opt==='string'?opt:opt.v;
        if(v===curVal)return;
        setObsData(JSON.parse(JSON.stringify(postCumObs)));
        obsData[q.id]=v;
        if(q.paired){obsData[q.id+'_L']=v;obsData[q.id+'_R']=v;}
        recalcFromObs();

        var _pSumMin=0,_pSumMax=0;
        POST_DIMS.forEach(function(di){
          var nr=calcDim(data, di);if(nr){_pSumMin+=Math.min(nr.a,nr.b);_pSumMax+=Math.max(nr.a,nr.b);}
        });
        var newPostCoeff=_pSumMax>0?_pSumMin/_pSumMax:0;
        var pMain=newPostCoeff-roundBasePostCoeff;

        // 短板加權（正負雙向）
        var _pWeakNew=0;
        var _pwr=calcDim(data, POST_DIMS[roundPostMinIdx]);
        if(_pwr)_pWeakNew=_pwr.coeff;
        var pWeakDelta=Math.abs(0.80-roundBasePostCoeffs[roundPostMinIdx])-Math.abs(0.80-_pWeakNew);
        pMain+=pWeakDelta*0.5;

        // 跨維度連帶效應（相對於本輪起始狀態）
        var crossBonus=0;
        [0,1,2,3,4,5,6,7,8].forEach(function(di){
          var nr=calcDim(data, di);var nc=nr?nr.coeff:0;
          var improve=nc-roundBaseCoeffs[di];
          if(improve>0.001)crossBonus+=improve;
        });

        if(pMain<=0)return;
        var pScore=pMain+crossBonus*0.1;
        if(pScore>bestTotal){
          bestTotal=pScore;
          bestOpt=v;
        }
      });

      if(bestTotal>0 && bestTotal>roundBestScore){
        roundBestScore=bestTotal;
        roundBest={id:q.id,text:q.text,part:q.part,curVal:curVal||'未填',score:bestTotal,bestOpt:bestOpt,paired:q.paired};
      }
    });

    setObsData(JSON.parse(JSON.stringify(postCumObs)));
    recalcFromObs();

    if(!roundBest)break;

    postCumObs[roundBest.id]=roundBest.bestOpt;
    if(roundBest.paired){
      postCumObs[roundBest.id+'_L']=roundBest.bestOpt;
      postCumObs[roundBest.id+'_R']=roundBest.bestOpt;
    }
    postUsedIds[roundBest.id]=true;
    postTop5.push(roundBest);
  }

  // 還原全域狀態
  setObsData(JSON.parse(JSON.stringify(origObs)));
  setObsOverride(JSON.parse(JSON.stringify(origOverride)));
  setData(JSON.parse(JSON.stringify(origData)));
  recalcFromObs();

  // 模擬後天 Top5 全翻轉，並驗收：若反而下降則從尾端回退
  var postSimData=null, postSimCoeffVal='';
  var postSimFlips={};
  var basePostCoeffNum=parseFloat(postCoeffVal);
  while(postTop5.length>0){
    setObsData(JSON.parse(JSON.stringify(origObs)));
    postTop5.forEach(function(r){
      obsData[r.id]=r.bestOpt;
      if(r.paired){
        obsData[r.id+'_L']=r.bestOpt;
        obsData[r.id+'_R']=r.bestOpt;
      }
    });
    recalcFromObs();
    var trySimCoeff=parseFloat(avgCoeff(data, POST_DIMS));
    if(trySimCoeff>basePostCoeffNum){
      postSimData=[];
      for(var _pd=0;_pd<13;_pd++){postSimData.push(data[_pd].slice());}
      postSimCoeffVal=trySimCoeff.toFixed(2);
      for(var _pfd=9;_pfd<13;_pfd++){
        for(var _pfp=0;_pfp<9;_pfp++){
          if(origData[_pfd][_pfp]!==postSimData[_pfd][_pfp]){
            postSimFlips[_pfd+'_'+_pfp]=true;
          }
        }
      }
      break;
    }else{
      postTop5.pop();
    }
  }
  // 全域還原（無論通過與否）
  setObsData(JSON.parse(JSON.stringify(origObs)));
  setObsOverride(JSON.parse(JSON.stringify(origOverride)));
  setData(JSON.parse(JSON.stringify(origData)));
  recalcFromObs();

  // 渲染輔助：先天建議列表（含老闆/主管標籤）
  function _innateAdviceList(items,maxScore){
    if(items.length===0)return '<div style="padding:8px 12px;font-size:13px;color:var(--text-3)">目前配置下無有效調整建議</div>';
    var h='';
    items.forEach(function(r,idx){
      var pct=maxScore>0?Math.min(r.score/maxScore*100,100):0;
      // 標籤：老闆↑ / 主管↑ / 兩者
      var tags='';
      if(r.bossScore>0.001)tags+='<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:#cce0e0;color:#2e4a4a;font-weight:400;white-space:nowrap">老闆↑</span>';
      if(r.mgrScore>0.001)tags+='<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:#e8dfc8;color:#4a4030;font-weight:400;white-space:nowrap">主管↑</span>';
      h+='<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:white;border-radius:6px;border:1px solid var(--border);margin-bottom:4px">';
      h+='<span style="font-size:13px;font-weight:400;color:var(--active);min-width:20px">'+(idx+1)+'</span>';
      h+='<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:#f0ebe0;color:var(--text-3);white-space:nowrap">'+r.part+'</span>';
      h+='<span style="font-weight:400;color:var(--text);font-size:14px;white-space:nowrap">'+r.curVal+' → '+r.bestOpt+'</span>';
      h+='<span style="font-size:12px;color:var(--text-3);flex:1">（'+r.text+'）</span>';
      h+='<span style="display:flex;gap:3px">'+tags+'</span>';
      h+='<div style="width:60px;height:5px;background:#eee;border-radius:3px;overflow:hidden;flex-shrink:0">';
      h+='<div style="width:'+pct+'%;height:100%;background:var(--active);border-radius:3px"></div></div>';
      h+='<span style="font-size:11px;color:var(--active);font-weight:400;min-width:40px;text-align:right">+'+r.score.toFixed(3)+'</span>';
      h+='</div>';
    });
    return h;
  }

  // 渲染
  var html='<div style="font-size:18px;font-weight:400;color:var(--text);margin-bottom:4px;letter-spacing:2px">重要參數分析</div>';
  html+='<div style="font-size:13px;color:var(--text-3);margin-bottom:16px">分析 '+allQs.length+' 題觀察項目，找出對結果影響最大的關鍵觀察</div>';

  // ===== 先天係數分析區塊（矩陣版）=====
  var innateCoeffVal=avgCoeff(data, [0,1,2,3,4,5]);
  var bossCoeffVal=avgCoeff(data, [0,1,2]);
  var mgrCoeffVal=avgCoeff(data, [3,4,5]);
  var _matrixParts=PARTS;
  var _matrixDims=[0,1,2,3,4,5];

  function _buildMatrix(useData,isSimulation){
    var _bLabel,_mLabel;
    if(isSimulation){
      _bLabel='老闆 '+bossCoeffVal+'→'+simBossCoeffVal;
      _mLabel='主管 '+mgrCoeffVal+'→'+simMgrCoeffVal;
    }else{
      _bLabel='老闆 '+bossCoeffVal;
      _mLabel='主管 '+mgrCoeffVal;
    }
    var rc='border-radius:3px';
    var mt='';
    mt+='<table style="border-collapse:separate;border-spacing:1px;width:100%;font-size:11px">';
    // R1: 老闆/主管 badge
    mt+='<tr><td></td>';
    mt+='<td colspan="6" style="text-align:center;padding:3px 4px;font-size:11px;font-weight:400;color:white;background:#8E4B50;'+rc+'">'+_bLabel+'</td>';
    mt+='<td colspan="6" style="text-align:center;padding:3px 4px;font-size:11px;font-weight:400;color:white;background:#8C6B4A;'+rc+'">'+_mLabel+'</td></tr>';
    // R2: 維度名 da/db
    mt+='<tr><td></td>';
    _matrixDims.forEach(function(di){
      mt+='<td style="background:'+_dimDeep[di]+';padding:2px 3px;'+rc+';text-align:center;color:#fff;font-size:10px">'+DIMS[di].da+'</td>';
      mt+='<td style="background:'+_dimDeep[di]+';padding:2px 3px;'+rc+';text-align:center;color:#fff;font-size:10px">'+DIMS[di].db+'</td>';
    });
    mt+='</tr>';
    // R3: 靜/動 標頭行
    mt+='<tr><td></td>';
    _matrixDims.forEach(function(di){
      var lIsS=_colLIsS[di];
      var lLabel=lIsS?'靜':'動';var rLabel=lIsS?'動':'靜';
      var lColor=lIsS?'#000':'#980000';var rColor=lIsS?'#980000':'#000';
      mt+='<td style="background:'+_dimBg[di]+';padding:2px 3px;'+rc+';text-align:center;color:'+lColor+';font-size:9px">'+lLabel+'</td>';
      mt+='<td style="background:'+_dimBg[di]+';padding:2px 3px;'+rc+';text-align:center;color:'+rColor+';font-size:9px">'+rLabel+'</td>';
    });
    mt+='</tr>';
    // R4~R12: 9 部位行
    _matrixParts.forEach(function(pn,pi){
      if(pi===4){mt+='<tr><td colspan="13" style="height:3px"></td></tr>';}
      mt+='<tr>';
      mt+='<td style="padding:3px 4px;font-size:12px;font-weight:400;color:#4A4540;white-space:nowrap">'+pn+'</td>';
      _matrixDims.forEach(function(di){
        var val=useData[di][pi];
        var isFlip=isSimulation&&simFlips[di+'_'+pi];
        if(val===null){
          mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
          mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
        }else{
          var tp=val==='A'?DIMS[di].aT:DIMS[di].bT;
          var isS=(tp==='靜');
          var goLeft=(isS&&_colLIsS[di])||(!isS&&!_colLIsS[di]);
          var mark=isFlip?_checkMarkFlip(di):_checkMark(di);
          if(goLeft){
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+';text-align:center">'+mark+'</td>';
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
          }else{
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+';text-align:center">'+mark+'</td>';
          }
        }
      });
      mt+='</tr>';
    });
    // 係數行
    mt+='<tr><td style="padding:3px 4px;font-size:11px;font-weight:400;color:#4A4540">係數</td>';
    _matrixDims.forEach(function(di){
      var aCount=useData[di].filter(function(v){return v==='A';}).length;
      var bCount=useData[di].filter(function(v){return v==='B';}).length;
      var c=(aCount+bCount>0)?Math.min(aCount,bCount)/Math.max(aCount,bCount):0;
      mt+='<td colspan="2" style="text-align:center;padding:2px"><div style="font-size:10px;font-weight:400;color:white;background:'+_dimDeep[di]+';'+rc+';padding:1px 3px">'+c.toFixed(2)+'</div></td>';
    });
    mt+='</tr>';
    mt+='</table>';
    return mt;
  }

  // 先天完整度檢查
  var _innateChk=_checkBlockComplete(data, [0,1,2,3,4,5]);
  if(!_innateChk.complete){
    html+=_renderIncompleteMsg('先天', _innateChk);
  } else {
  html+='<div style="margin-bottom:24px;padding:16px;background:#f5f5f0;border-radius:10px;border:1px solid #d4d4c8">';
  html+='<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
  html+='<span style="font-size:18px;font-weight:400;color:#8E4B50">先天係數分析</span>';
  html+='<span style="font-size:16px;font-weight:400;color:white;background:#8E4B50;padding:2px 12px;border-radius:6px">'+innateCoeffVal+'</span>';
  if(simData){
    html+='<span style="font-size:16px;color:var(--text-3)">\u2192</span>';
    html+='<span style="font-size:16px;font-weight:400;color:white;background:#8E4B50;padding:2px 12px;border-radius:6px">'+simInnateCoeffVal+'</span>';
  }
  html+='</div>';

  html+='<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">';

  html+='<div style="flex:1;min-width:280px;padding:16px;background:white;border-radius:8px;border:1px solid var(--border)">';
  html+='<div style="font-size:14px;font-weight:400;color:var(--text);margin-bottom:4px;text-align:center">目前狀態</div>';
  html+='<div style="font-size:13px;font-weight:400;color:var(--text-3);margin-bottom:10px;text-align:center">先天 '+innateCoeffVal+'</div>';
  html+=_buildMatrix(origData,false);
  html+='</div>';

  if(simData){
    html+='<div style="flex:1;min-width:280px;padding:16px;background:#f8faf8;border-radius:8px;border:1px solid #7A9E7E">';
    html+='<div style="font-size:14px;font-weight:400;color:var(--text);margin-bottom:4px;text-align:center">調整後預估</div>';
    html+='<div style="font-size:13px;font-weight:400;color:var(--text-3);margin-bottom:10px;text-align:center">先天 '+innateCoeffVal+' → <span style="color:var(--text);font-weight:400">'+simInnateCoeffVal+'</span></div>';
    html+=_buildMatrix(simData,true);
    html+='</div>';
  }else{
    html+='<div style="flex:1;min-width:280px;padding:16px;background:white;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center">';
    html+='<span style="font-size:13px;color:var(--text-3)">無有效調整建議</span>';
    html+='</div>';
  }

  html+='</div>';

  html+='<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;font-size:12px;color:var(--text-3)">';
  html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#6B8C5A;line-height:14px;text-align:center;color:#fff;font-size:9px">\u2713</span>有值</span>';
  html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#E8E4DF"></span>無資料</span>';
  if(simData){
    html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#6B8C5A;outline:3px solid #E8B000;outline-offset:-1px;line-height:14px;text-align:center;color:#fff;font-size:9px">\u2713</span>調整格</span>';
  }
  html+='</div>';

  // --- 先天整體調整建議 ---
  html+='<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:6px">如果有變化，就會影響先天係數的重要部位</div>';
  html+=_innateAdviceList(innateTop5,innateTop5.length>0?innateTop5[0].score:1);

  html+='</div>'; // 關閉先天係數分析區塊
  } // 關閉先天完整度檢查

  // 運氣區塊遮罩（測試版）
  if(BETA_VISIBLE_DIMS<9){
    html+='<div style="margin-bottom:24px;padding:40px 16px;background:#f0f0ea;border-radius:10px;border:1px solid #d4d4c8;text-align:center;position:relative;overflow:hidden">';
    html+='<div style="font-size:18px;font-weight:400;color:#bbb;letter-spacing:2px;margin-bottom:8px">運氣係數分析</div>';
    html+='<div style="font-size:14px;color:#bbb">建置中</div>';
    html+='</div>';
  }else{

  // 運氣完整度檢查
  var _luckChk=_checkBlockComplete(data, [6,7,8]);
  if(!_luckChk.complete){
    html+=_renderIncompleteMsg('運氣', _luckChk);
  } else {

  // ===== 運氣係數分析區塊（矩陣版）=====
  var _luckMatrixDims=[6,7,8];

  function _buildLuckMatrix(useData,isSimulation){
    var rc='border-radius:3px';
    var mt='';
    mt+='<table style="border-collapse:separate;border-spacing:1px;width:100%;font-size:11px">';
    // 維度名 da/db
    mt+='<tr><td></td>';
    _luckMatrixDims.forEach(function(di){
      mt+='<td style="background:'+_dimDeep[di]+';padding:2px 3px;'+rc+';text-align:center;color:#fff;font-size:10px">'+DIMS[di].da+'</td>';
      mt+='<td style="background:'+_dimDeep[di]+';padding:2px 3px;'+rc+';text-align:center;color:#fff;font-size:10px">'+DIMS[di].db+'</td>';
    });
    mt+='</tr>';
    // 靜/動 標頭
    mt+='<tr><td></td>';
    _luckMatrixDims.forEach(function(di){
      var lIsS=_colLIsS[di];
      var lLabel=lIsS?'靜':'動';var rLabel=lIsS?'動':'靜';
      var lColor=lIsS?'#000':'#980000';var rColor=lIsS?'#980000':'#000';
      mt+='<td style="background:'+_dimBg[di]+';padding:2px 3px;'+rc+';text-align:center;color:'+lColor+';font-size:9px">'+lLabel+'</td>';
      mt+='<td style="background:'+_dimBg[di]+';padding:2px 3px;'+rc+';text-align:center;color:'+rColor+';font-size:9px">'+rLabel+'</td>';
    });
    mt+='</tr>';
    // 9 部位行
    PARTS.forEach(function(pn,pi){
      if(pi===4){mt+='<tr><td colspan="7" style="height:3px"></td></tr>';}
      mt+='<tr>';
      mt+='<td style="padding:3px 4px;font-size:12px;font-weight:400;color:#4A4540;white-space:nowrap">'+pn+'</td>';
      _luckMatrixDims.forEach(function(di){
        var val=useData[di][pi];
        var isFlip=isSimulation&&luckSimFlips[di+'_'+pi];
        if(val===null){
          mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
          mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
        }else{
          var tp=val==='A'?DIMS[di].aT:DIMS[di].bT;
          var isS=(tp==='靜');
          var goLeft=(isS&&_colLIsS[di])||(!isS&&!_colLIsS[di]);
          var mark=isFlip?_checkMarkFlip(di):_checkMark(di);
          if(goLeft){
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+';text-align:center">'+mark+'</td>';
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
          }else{
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+';text-align:center">'+mark+'</td>';
          }
        }
      });
      mt+='</tr>';
    });
    // 係數行
    mt+='<tr><td style="padding:3px 4px;font-size:11px;font-weight:400;color:#4A4540">係數</td>';
    _luckMatrixDims.forEach(function(di){
      var aCount=useData[di].filter(function(v){return v==='A';}).length;
      var bCount=useData[di].filter(function(v){return v==='B';}).length;
      var c=(aCount+bCount>0)?Math.min(aCount,bCount)/Math.max(aCount,bCount):0;
      mt+='<td colspan="2" style="text-align:center;padding:2px"><div style="font-size:10px;font-weight:400;color:white;background:'+_dimDeep[di]+';'+rc+';padding:1px 3px">'+c.toFixed(2)+'</div></td>';
    });
    mt+='</tr>';
    mt+='</table>';
    return mt;
  }

  // 運氣建議列表渲染
  function _luckAdviceList(items,maxScore){
    if(items.length===0)return '<div style="padding:8px 12px;font-size:13px;color:var(--text-3)">目前配置下無有效調整建議</div>';
    var h='';
    items.forEach(function(r,idx){
      var pct=maxScore>0?Math.min(r.score/maxScore*100,100):0;
      h+='<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:white;border-radius:6px;border:1px solid var(--border);margin-bottom:4px">';
      h+='<span style="font-size:13px;font-weight:400;color:var(--active);min-width:20px">'+(idx+1)+'</span>';
      h+='<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:#f0ebe0;color:var(--text-3);white-space:nowrap">'+r.part+'</span>';
      h+='<span style="font-weight:400;color:var(--text);font-size:14px;white-space:nowrap">'+r.curVal+' → '+r.bestOpt+'</span>';
      h+='<span style="font-size:12px;color:var(--text-3);flex:1">（'+r.text+'）</span>';
      h+='<div style="width:60px;height:5px;background:#eee;border-radius:3px;overflow:hidden;flex-shrink:0">';
      h+='<div style="width:'+pct+'%;height:100%;background:var(--active);border-radius:3px"></div></div>';
      h+='<span style="font-size:11px;color:var(--active);font-weight:400;min-width:40px;text-align:right">+'+r.score.toFixed(3)+'</span>';
      h+='</div>';
    });
    return h;
  }

  html+='<div style="margin-bottom:24px;padding:16px;background:#f5f5f0;border-radius:10px;border:1px solid #d4d4c8">';
  html+='<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
  html+='<span style="font-size:18px;font-weight:400;color:#4C6E78">運氣係數分析</span>';
  html+='<span style="font-size:16px;font-weight:400;color:white;background:#4C6E78;padding:2px 12px;border-radius:6px">'+luckCoeffVal+'</span>';
  if(luckSimData){
    html+='<span style="font-size:16px;color:var(--text-3)">\u2192</span>';
    html+='<span style="font-size:16px;font-weight:400;color:white;background:#4C6E78;padding:2px 12px;border-radius:6px">'+luckSimCoeffVal+'</span>';
  }
  html+='</div>';

  html+='<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">';

  // 左：目前狀態
  html+='<div style="flex:1;min-width:180px;padding:16px;background:white;border-radius:8px;border:1px solid var(--border)">';
  html+='<div style="font-size:14px;font-weight:400;color:var(--text);margin-bottom:4px;text-align:center">目前狀態</div>';
  html+='<div style="font-size:13px;font-weight:400;color:var(--text-3);margin-bottom:10px;text-align:center">運氣 '+luckCoeffVal+'</div>';
  html+=_buildLuckMatrix(origData,false);
  html+='</div>';

  // 右：調整後預估
  if(luckSimData){
    html+='<div style="flex:1;min-width:180px;padding:16px;background:#f8faf8;border-radius:8px;border:1px solid #7A9E7E">';
    html+='<div style="font-size:14px;font-weight:400;color:var(--text);margin-bottom:4px;text-align:center">調整後預估</div>';
    html+='<div style="font-size:13px;font-weight:400;color:var(--text-3);margin-bottom:10px;text-align:center">運氣 '+luckCoeffVal+' → <span style="color:var(--text);font-weight:400">'+luckSimCoeffVal+'</span></div>';
    html+=_buildLuckMatrix(luckSimData,true);
    html+='</div>';
  }else{
    html+='<div style="flex:1;min-width:180px;padding:16px;background:white;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center">';
    html+='<span style="font-size:13px;color:var(--text-3)">無有效調整建議</span>';
    html+='</div>';
  }

  html+='</div>'; // 關閉左右並排容器

  // 圖例
  html+='<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;font-size:12px;color:var(--text-3)">';
  html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#6B8C5A;line-height:14px;text-align:center;color:#fff;font-size:9px">\u2713</span>有值</span>';
  html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#E8E4DF"></span>無資料</span>';
  if(luckSimData){
    html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#6B8C5A;outline:3px solid #E8B000;outline-offset:-1px;line-height:14px;text-align:center;color:#fff;font-size:9px">\u2713</span>調整格</span>';
  }
  html+='</div>';

  // 調整說明
  html+='<div style="font-size:12px;color:var(--text-3);margin-bottom:10px">調整目標：提升運氣群組整體係數（動靜更平衡）</div>';

  // 建議列表
  html+='<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:6px">如果有變化，就會影響運氣係數的重要部位</div>';
  html+=_luckAdviceList(luckTop5,luckTop5.length>0?luckTop5[0].score:1);

  html+='</div>'; // 關閉運氣係數分析區塊
  } // 關閉運氣完整度檢查
  } // 關閉運氣 BETA_VISIBLE_DIMS 判斷

  // 後天區塊遮罩（測試版）
  if(BETA_VISIBLE_DIMS<13){
    html+='<div style="margin-bottom:24px;padding:40px 16px;background:#f0f0ea;border-radius:10px;border:1px solid #d4d4c8;text-align:center;position:relative;overflow:hidden">';
    html+='<div style="font-size:18px;font-weight:400;color:#bbb;letter-spacing:2px;margin-bottom:8px">後天係數分析</div>';
    html+='<div style="font-size:14px;color:#bbb">建置中</div>';
    html+='</div>';
  }else{

  // 後天完整度檢查
  var _postChk=_checkBlockComplete(data, [9,10,11,12]);
  if(!_postChk.complete){
    html+=_renderIncompleteMsg('後天', _postChk);
  } else {

  // ===== 後天係數分析區塊（矩陣版）=====
  var _postMatrixDims=[9,10,11,12];

  function _buildPostMatrix(useData,isSimulation){
    var rc='border-radius:3px';
    var mt='';
    mt+='<table style="border-collapse:separate;border-spacing:1px;width:100%;font-size:11px">';
    // 維度名 da/db
    mt+='<tr><td></td>';
    _postMatrixDims.forEach(function(di){
      mt+='<td style="background:'+_dimDeep[di]+';padding:2px 3px;'+rc+';text-align:center;color:#fff;font-size:10px">'+DIMS[di].da+'</td>';
      mt+='<td style="background:'+_dimDeep[di]+';padding:2px 3px;'+rc+';text-align:center;color:#fff;font-size:10px">'+DIMS[di].db+'</td>';
    });
    mt+='</tr>';
    // 靜/動 標頭
    mt+='<tr><td></td>';
    _postMatrixDims.forEach(function(di){
      var lIsS=_colLIsS[di];
      var lLabel=lIsS?'靜':'動';var rLabel=lIsS?'動':'靜';
      var lColor=lIsS?'#000':'#980000';var rColor=lIsS?'#980000':'#000';
      mt+='<td style="background:'+_dimBg[di]+';padding:2px 3px;'+rc+';text-align:center;color:'+lColor+';font-size:9px">'+lLabel+'</td>';
      mt+='<td style="background:'+_dimBg[di]+';padding:2px 3px;'+rc+';text-align:center;color:'+rColor+';font-size:9px">'+rLabel+'</td>';
    });
    mt+='</tr>';
    // 9 部位行
    PARTS.forEach(function(pn,pi){
      if(pi===4){mt+='<tr><td colspan="9" style="height:3px"></td></tr>';}
      mt+='<tr>';
      mt+='<td style="padding:3px 4px;font-size:12px;font-weight:400;color:#4A4540;white-space:nowrap">'+pn+'</td>';
      _postMatrixDims.forEach(function(di){
        var val=useData[di][pi];
        var isFlip=isSimulation&&postSimFlips[di+'_'+pi];
        if(val===null){
          mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
          mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
        }else{
          var tp=val==='A'?DIMS[di].aT:DIMS[di].bT;
          var isS=(tp==='靜');
          var goLeft=(isS&&_colLIsS[di])||(!isS&&!_colLIsS[di]);
          var mark=isFlip?_checkMarkFlip(di):_checkMark(di);
          if(goLeft){
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+';text-align:center">'+mark+'</td>';
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
          }else{
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+'"></td>';
            mt+='<td style="background:'+_dimBg[di]+';padding:2px;'+rc+';text-align:center">'+mark+'</td>';
          }
        }
      });
      mt+='</tr>';
    });
    // 係數行
    mt+='<tr><td style="padding:3px 4px;font-size:11px;font-weight:400;color:#4A4540">係數</td>';
    _postMatrixDims.forEach(function(di){
      var aCount=useData[di].filter(function(v){return v==='A';}).length;
      var bCount=useData[di].filter(function(v){return v==='B';}).length;
      var c=(aCount+bCount>0)?Math.min(aCount,bCount)/Math.max(aCount,bCount):0;
      mt+='<td colspan="2" style="text-align:center;padding:2px"><div style="font-size:10px;font-weight:400;color:white;background:'+_dimDeep[di]+';'+rc+';padding:1px 3px">'+c.toFixed(2)+'</div></td>';
    });
    mt+='</tr>';
    mt+='</table>';
    return mt;
  }

  // 後天建議列表渲染
  function _postAdviceList(items,maxScore){
    if(items.length===0)return '<div style="padding:8px 12px;font-size:13px;color:var(--text-3)">目前配置下無有效調整建議</div>';
    var h='';
    items.forEach(function(r,idx){
      var pct=maxScore>0?Math.min(r.score/maxScore*100,100):0;
      h+='<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:white;border-radius:6px;border:1px solid var(--border);margin-bottom:4px">';
      h+='<span style="font-size:13px;font-weight:400;color:var(--active);min-width:20px">'+(idx+1)+'</span>';
      h+='<span style="font-size:11px;padding:1px 6px;border-radius:3px;background:#f0ebe0;color:var(--text-3);white-space:nowrap">'+r.part+'</span>';
      h+='<span style="font-weight:400;color:var(--text);font-size:14px;white-space:nowrap">'+r.curVal+' → '+r.bestOpt+'</span>';
      h+='<span style="font-size:12px;color:var(--text-3);flex:1">（'+r.text+'）</span>';
      h+='<div style="width:60px;height:5px;background:#eee;border-radius:3px;overflow:hidden;flex-shrink:0">';
      h+='<div style="width:'+pct+'%;height:100%;background:var(--active);border-radius:3px"></div></div>';
      h+='<span style="font-size:11px;color:var(--active);font-weight:400;min-width:40px;text-align:right">+'+r.score.toFixed(3)+'</span>';
      h+='</div>';
    });
    return h;
  }

  html+='<div style="margin-bottom:24px;padding:16px;background:#f5f5f0;border-radius:10px;border:1px solid #d4d4c8">';
  html+='<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
  html+='<span style="font-size:18px;font-weight:400;color:#7B7082">後天係數分析</span>';
  html+='<span style="font-size:16px;font-weight:400;color:white;background:#7B7082;padding:2px 12px;border-radius:6px">'+postCoeffVal+'</span>';
  if(postSimData){
    html+='<span style="font-size:16px;color:var(--text-3)">\u2192</span>';
    html+='<span style="font-size:16px;font-weight:400;color:white;background:#7B7082;padding:2px 12px;border-radius:6px">'+postSimCoeffVal+'</span>';
  }
  html+='</div>';

  html+='<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">';

  // 左：目前狀態
  html+='<div style="flex:1;min-width:220px;padding:16px;background:white;border-radius:8px;border:1px solid var(--border)">';
  html+='<div style="font-size:14px;font-weight:400;color:var(--text);margin-bottom:4px;text-align:center">目前狀態</div>';
  html+='<div style="font-size:13px;font-weight:400;color:var(--text-3);margin-bottom:10px;text-align:center">後天 '+postCoeffVal+'</div>';
  html+=_buildPostMatrix(origData,false);
  html+='</div>';

  // 右：調整後預估
  if(postSimData){
    var postSimDimCoeffVals=[];
    _postMatrixDims.forEach(function(di){
      var aCount=postSimData[di].filter(function(v){return v==='A';}).length;
      var bCount=postSimData[di].filter(function(v){return v==='B';}).length;
      postSimDimCoeffVals.push((aCount+bCount>0)?Math.min(aCount,bCount)/Math.max(aCount,bCount):0);
    });
    html+='<div style="flex:1;min-width:220px;padding:16px;background:#f8faf8;border-radius:8px;border:1px solid #7A9E7E">';
    html+='<div style="font-size:14px;font-weight:400;color:var(--text);margin-bottom:4px;text-align:center">調整後預估</div>';
    html+='<div style="font-size:13px;font-weight:400;color:var(--text-3);margin-bottom:10px;text-align:center">後天 '+postCoeffVal+' → <span style="color:var(--text);font-weight:400">'+postSimCoeffVal+'</span></div>';
    html+=_buildPostMatrix(postSimData,true);
    html+='</div>';
  }else{
    html+='<div style="flex:1;min-width:220px;padding:16px;background:white;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center">';
    html+='<span style="font-size:13px;color:var(--text-3)">無有效調整建議</span>';
    html+='</div>';
  }

  html+='</div>'; // 關閉左右並排容器

  // 圖例
  html+='<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;font-size:12px;color:var(--text-3)">';
  html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#6B8C5A;line-height:14px;text-align:center;color:#fff;font-size:9px">\u2713</span>有值</span>';
  html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#E8E4DF"></span>無資料</span>';
  if(postSimData){
    html+='<span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:#6B8C5A;outline:3px solid #E8B000;outline-offset:-1px;line-height:14px;text-align:center;color:#fff;font-size:9px">\u2713</span>調整格</span>';
  }
  html+='</div>';

  // 短板提示
  html+='<div style="font-size:12px;color:var(--text-3);margin-bottom:10px">調整目標：各維度係數往 0.80（平衡）靠近，短板 <b>'+POST_NAMES[postMinIdx]+'</b>（'+basePostCoeffs[postMinIdx].toFixed(2)+'）優先加權</div>';

  // 建議列表
  html+='<div style="font-size:13px;font-weight:400;color:var(--text);margin-bottom:6px">如果有變化，就會影響後天係數的重要部位</div>';
  html+=_postAdviceList(postTop5,postTop5.length>0?postTop5[0].score:1);

  html+='</div>'; // 關閉後天係數分析區塊
  } // 關閉後天完整度檢查
  } // 關閉後天 BETA_VISIBLE_DIMS 判斷

  // BETA 模式下隱藏基準統計和下方所有敏感度內容
  if(BETA_VISIBLE_DIMS>=13){

  // 13 維度完整度檢查
  var _allChk=_checkBlockComplete(data, [0,1,2,3,4,5,6,7,8,9,10,11,12]);
  if(!_allChk.complete){
    html+=_renderIncompleteMsg('關鍵觀察', _allChk);
  } else {

  // 分隔線
  html+='<div style="border-top:2px solid var(--border);margin:8px 0 20px"></div>';

  // 基準統計
  html+='<div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap">';
  html+='<div style="padding:10px 16px;background:white;border-radius:8px;border:1px solid var(--border);flex:1;min-width:140px">';
  html+='<div style="font-size:12px;color:var(--text-3)">目前總係數</div>';
  html+='<div style="font-size:20px;font-weight:400;color:var(--text)">'+baseTotalCoeff.toFixed(2)+'</div></div>';
  html+='<div style="padding:10px 16px;background:white;border-radius:8px;border:1px solid var(--border);flex:1;min-width:140px">';
  html+='<div style="font-size:12px;color:var(--text-3)">高敏感度題目</div>';
  html+='<div style="font-size:20px;font-weight:400;color:var(--active)">'+highSens.length+' <span style="font-size:13px;font-weight:400">/ '+allQs.length+'</span></div></div>';
  html+='<div style="padding:10px 16px;background:white;border-radius:8px;border:1px solid var(--border);flex:1;min-width:140px">';
  html+='<div style="font-size:12px;color:var(--text-3)">低影響題目</div>';
  html+='<div style="font-size:20px;font-weight:400;color:#ccc">'+lowSens.length+' <span style="font-size:13px;font-weight:400">/ '+allQs.length+'</span></div></div>';
  html+='</div>';

  // --- 部位影響力排名（隱藏 2026-04-23）---
  /*
  html+='<div style="font-size:16px;font-weight:400;color:var(--text);margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid var(--border)">部位影響力排名</div>';
  var partMax=partRank.length>0?partRank[0].total:1;
  partRank.forEach(function(p){
    var pct=Math.min(p.total/partMax*100,100);
    html+='<div style="display:flex;align-items:center;gap:10px;padding:6px 0">';
    html+='<span style="font-weight:400;color:var(--text);min-width:36px">'+p.part+'</span>';
    html+='<div style="flex:1;height:10px;background:#eee;border-radius:5px;overflow:hidden">';
    html+='<div style="width:'+pct+'%;height:100%;background:var(--active);border-radius:5px"></div></div>';
    html+='<span style="font-size:12px;color:var(--text-3);min-width:80px">'+p.highCount+'關鍵 / '+p.count+'題</span>';
    html+='<span style="display:flex;gap:2px;flex-wrap:wrap">';
    p.dims.forEach(function(di){html+=dimTag(di);});
    html+='</span>';
    html+='</div>';
  });
  */

  // --- 關鍵觀察 — 按影響力排名順序展開 ---
  html+='<div style="font-size:16px;font-weight:400;color:var(--text);margin:24px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--border)">關鍵觀察 <span style="font-size:13px;font-weight:400;color:var(--active)">（'+highSens.length+'題）</span></div>';

  html+='<div style="font-size:13px;color:var(--text-3);margin-bottom:12px;line-height:1.7">這裡列出各個面相部位中，每個部位最關鍵的觀察項目，這些項目如果變動，對總係數的提升或降低的影響將會最大。</div>';

  if(highSens.length===0){
    html+='<div style="padding:8px;font-size:14px;color:var(--text-3)">沒有高敏感度的題目</div>';
  }else{
    partRank.forEach(function(p){
      var items=highSens.filter(function(r){return r.part===p.part;});
      if(items.length===0)return;

      var partInfo=partSens[p.part]||{highCount:0,count:0,dims:new Set()};
      html+='<div style="margin-bottom:14px">';
      html+='<div style="display:flex;align-items:center;gap:8px;padding:6px 0">';
      var _displayPart=(p.part==='額')?'上停（額）':p.part;
      html+='<span style="font-size:15px;font-weight:400;color:var(--text)">'+_displayPart+'</span>';
      html+='<span style="font-size:12px;color:var(--text-3)">'+partInfo.highCount+'關鍵 / '+partInfo.count+'題</span>';
      if(partInfo.dims&&partInfo.dims.size>0){
        html+='<span style="display:flex;gap:2px;flex-wrap:wrap">';
        Array.from(partInfo.dims).sort(function(a,b){return a-b;}).forEach(function(di){html+=dimTag(di);});
        html+='</span>';
      }
      html+='</div>';

      items.forEach(function(r){
        var isHigh=r.sensitivity>=HIGH_THRESHOLD&&r.sensitivity>=LOW_THRESHOLD;
        html+='<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:white;border-radius:6px;border:1px solid var(--border);margin-bottom:4px;flex-wrap:wrap">';
        html+='<span style="font-weight:400;color:var(--text-2);flex:1;font-size:14px">'+r.text+'<span style="margin-left:8px">（'+r.curVal+'）</span></span>';
        html+=sensBar(r.sensitivity,globalMax);
        html+='<span style="font-size:12px;color:'+(isHigh?'var(--active)':'var(--text-3)')+';font-weight:400;min-width:44px;text-align:right">±'+r.sensitivity.toFixed(3)+'</span>';
        if(r.affectedDims.length>0){
          html+='<span style="display:flex;gap:2px;flex-wrap:wrap">';
          r.affectedDims.forEach(function(di){html+=dimTag(di);});
          html+='</span>';
        }
        html+='</div>';
      });
      html+='</div>';
    });
  }



  } // 關閉 13 維度完整度檢查
  } // 關閉 BETA_VISIBLE_DIMS>=13 判斷（基準統計和敏感度區段）

  el.innerHTML=html;


  },50); // end setTimeout
}

/* ===== 手動敏感度分析頁 ===== */
export function showManualSensPage(){
  showPage('manual-sens-page');
  document.getElementById('nav-name').innerText=(_isTA&&_currentCaseId?_currentCaseName:userName)||'';
  setNavActive('nav-manual-sens');
  if(!window._suppressPushState) history.pushState({page:'manual-sens'},'');
  initManualData();
  manualLoadData();
  setTimeout(renderManualSensPage, 300);
}

export function renderManualSensPage(){
  var el=document.getElementById('manual-sens-content');if(!el)return;
  if(!manualData){el.innerHTML='<div style="color:#aaa;padding:20px">請先在「手動輸入報告」中填入資料</div>';return;}
  var SBG='#7A9E7E',DBG='#C17A5A';
  var partLabels=['頭','上停','中停','下停','耳','眉','眼','鼻','口'];

  var origManual=JSON.parse(JSON.stringify(manualData));

  var baseCoeffs=[];
  for(var di=0;di<13;di++){var r=calcDim(manualData, di);baseCoeffs.push(r?r.coeff:0);}
  var baseTotalCoeff=parseFloat(avgCoeff(manualData, [0,1,2,3,4,5,6,7,8,9,10,11,12]));

  var baseTypes=[];
  for(var di=0;di<13;di++){var r=calcDim(manualData, di);baseTypes.push(r?r.type:null);}

  var results=[];
  for(var di=0;di<BETA_VISIBLE_DIMS;di++){
    for(var pi=0;pi<9;pi++){
      var curVal=origManual[di][pi];
      var tryVals=['A','B',null];
      var bestDelta=0, bestNewTotal=baseTotalCoeff, bestNewType=null, bestFlipped=false;

      tryVals.forEach(function(tv){
        if(tv===curVal)return;
        setManualData(JSON.parse(JSON.stringify(origManual)));
        manualData[di][pi]=tv;
        var newCoeffs=[];
        for(var d2=0;d2<13;d2++){var r2=calcDim(manualData, d2);newCoeffs.push(r2?r2.coeff:0);}
        var _mMin=0,_mMax=0;for(var _d3=0;_d3<13;_d3++){var _r4=calcDim(manualData, _d3);if(_r4){_mMin+=Math.min(_r4.a,_r4.b);_mMax+=Math.max(_r4.a,_r4.b);}}var newTotal=_mMax>0?_mMin/_mMax:0;
        var delta=newTotal-baseTotalCoeff;
        var newDimRes=calcDim(manualData, di);
        var newType=newDimRes?newDimRes.type:null;
        var flipped=(baseTypes[di]==='動'&&newType==='靜');

        if(delta>bestDelta||(Math.abs(delta-bestDelta)<0.001&&flipped&&!bestFlipped)){
          bestDelta=delta;
          bestNewTotal=newTotal;
          bestNewType=newType;
          bestFlipped=flipped;
        }
      });

      setManualData(JSON.parse(JSON.stringify(origManual)));

      if(bestDelta>0.001||bestFlipped){
        var curTypeStr='';
        if(curVal==='A')curTypeStr=DIMS[di].aT;
        else if(curVal==='B')curTypeStr=DIMS[di].bT;
        else curTypeStr='空';
        results.push({
          di:di, pi:pi,
          part:partLabels[pi],
          dim:DIMS[di].dn,
          curType:curTypeStr,
          delta:bestDelta,
          newTotal:bestNewTotal,
          newType:bestNewType,
          flipped:bestFlipped
        });
      }
    }
  }

  setManualData(JSON.parse(JSON.stringify(origManual)));

  results.sort(function(a,b){
    if(Math.abs(b.delta-a.delta)>0.001)return b.delta-a.delta;
    if(b.flipped&&!a.flipped)return 1;
    if(a.flipped&&!b.flipped)return -1;
    return 0;
  });

  var html='<div style="font-size:18px;font-weight:400;color:var(--text);margin-bottom:8px;letter-spacing:2px">手動重要參數分析</div>';
  html+='<div style="font-size:13px;color:var(--text-3);margin-bottom:16px">基於手動輸入的 9 部位 × '+BETA_VISIBLE_DIMS+' 維度矩陣，模擬每個格子翻轉後對係數的影響</div>';

  html+='<div style="margin-bottom:16px;padding:10px 16px;background:white;border-radius:8px;border:1px solid var(--border)">';
  html+='<span style="font-size:14px;font-weight:400;color:var(--text)">目前總係數：'+baseTotalCoeff.toFixed(2)+'</span>';
  html+='</div>';

  if(results.length===0){
    html+='<div style="padding:12px;font-size:14px;color:var(--text-3)">無可提升的變動（所有格子翻轉後總係數都不會提高）</div>';
  }else{
    html+='<div style="font-size:16px;font-weight:400;color:var(--text);margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid var(--border)">可提升的部位變動（依影響排序）</div>';

    results.forEach(function(r,idx){
      if(idx>=20)return;
      var deltaStr=r.delta>0.001?'+'+r.delta.toFixed(3):'±0';
      var flipStr=r.flipped?' <span style="color:'+SBG+';font-weight:400">動→靜</span>':'';
      html+='<div style="margin-bottom:6px;padding:10px 16px;background:white;border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap">';
      html+='<span style="font-weight:400;color:var(--text);min-width:36px">'+r.part+'</span>';
      html+='<span style="font-weight:400;color:var(--text-2)">'+r.dim+'</span>';
      html+='<span style="font-size:13px;color:var(--text-3)">（目前：'+r.curType+'）</span>';
      html+='<span style="font-size:13px;color:var(--active);font-weight:400">總係數 → '+r.newTotal.toFixed(2)+'</span>';
      html+='<span style="font-size:12px;color:var(--text-3)">'+deltaStr+'</span>';
      html+=flipStr;
      html+='</div>';
    });
  }

  html+='<div style="font-size:16px;font-weight:400;color:var(--text);margin:24px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--border)">各維度現況</div>';
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';

  for(var di=0;di<13;di++){
    var d=DIMS[di];
    if(di>=BETA_VISIBLE_DIMS){
      html+='<div style="padding:8px 12px;background:#f0f0ea;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;gap:8px">';
      html+='<span style="font-weight:400;color:#bbb">'+d.dn+'</span>';
      html+='<span style="font-size:13px;color:#bbb">建置中</span>';
      html+='</div>';
      continue;
    }
    var res=calcDim(manualData, di);
    var dimType=res?res.type:'—';
    var dimCoeff=res?res.coeff:0;
    var bg=dimType==='靜'?SBG:(dimType==='動'?DBG:'#ccc');
    html+='<div style="padding:8px 12px;background:white;border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;gap:8px">';
    html+='<span style="font-weight:400;color:var(--text)">'+d.dn+'</span>';
    html+='<span style="font-size:13px;color:var(--text-3)">'+d.view+'</span>';
    html+='<span style="display:inline-block;padding:1px 8px;border-radius:4px;background:'+bg+';color:white;font-weight:400;font-size:13px;margin-left:auto">'+dimType+' '+(res?dimCoeff.toFixed(2):'—')+'</span>';
    html+='</div>';
  }
  html+='</div>';

  el.innerHTML=html;
}
