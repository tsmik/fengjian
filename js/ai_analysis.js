// js/ai_analysis.js — AI 評析模組
import { DIMS, data, userName, calcDim, avgCoeff } from './core.js';
import { collectDetailForPrompt } from './obs_ui.js';

export async function generateAI(){
  const apiKey=localStorage.getItem('anthropic_api_key');if(!apiKey){alert('請先在登入頁輸入 Anthropic API Key');return;}
  const btn=document.getElementById('btn-ai'),area=document.getElementById('ai-analysis-area');btn.disabled=true;btn.innerText='分析中...';
  area.innerHTML='<div class="ai-section"><div class="ai-loading">風鑑師正在解讀面相<span class="dots"></span></div></div>';
  const dimSummary=DIMS.map((d,i)=>{const res=calcDim(data,i);if(!res)return d.dn+'（'+d.view+'）：尚未評分';return d.dn+'（'+d.view+'，'+d.cat+'）：'+d.a+'='+res.a+', '+d.b+'='+res.b+', 係數='+res.coeff.toFixed(2)+', 屬性='+res.type;}).join('\n');
  const totalCoeff=avgCoeff(data,[0,1,2,3,4,5,6,7,8,9,10,11,12]),preCoeff=avgCoeff(data,[0,1,2,3,4,5]),luckCoeff=avgCoeff(data,[6,7,8]),postCoeff=avgCoeff(data,[9,10,11,12]);
  let sT=0,dT=0;DIMS.forEach((d,i)=>{data[i].forEach(v=>{if(!v)return;const t=v==='A'?d.aT:d.bT;t==='靜'?sT++:dT++;});});
  const detail=collectDetailForPrompt(),detailText=detail.checked.length?'\n\n【觀察條件紀錄】\n符合的觀察條件：'+detail.checked.join('、')+'\n（共 '+detail.checked.length+'/'+(detail.checked.length+detail.unchecked.length)+' 項符合）':'';
  const userPrompt='以下是「'+userName+'」的人相兵法評分結果：\n\n各維度評分：\n'+dimSummary+'\n\n綜合統計：\n- 總合係數：'+totalCoeff+'\n- 先天指數：'+preCoeff+'\n- 運氣指數：'+luckCoeff+'\n- 後天指數：'+postCoeff+'\n- 動態票數：'+dT+'，靜態票數：'+sT+detailText+'\n\n請根據以上數據進行評析。';
  try{const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-dangerous-direct-browser-access':'true','anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:2000,system:'你是一位精通人相兵法的風鑑師，擅長從面相的動靜、形勢、經緯等維度分析一個人的命格與運勢。你的分析風格穩重而深刻，引經據典但不晦澀，用繁體中文回覆。\n\n請根據提供的人相兵法各維度係數數據，分五段進行評析，每段約150字：\n1. 【性格分析】從先天指數的形勢、經緯、方圓等維度分析其性格特質\n2. 【事業運勢】從後天指數的攻守、奇正、虛實、進退分析事業格局\n3. 【人際關係】從動靜比例與分合、真假等維度分析人際互動模式\n4. 【健康提示】從整體係數平衡與各部位評分提出養生建議\n5. 【流年運程】從運氣指數的順逆、分合、真假綜合判斷當前運勢走向\n\n係數越接近1.0表示該維度越平衡和諧，越接近0表示越偏向單一極端。動與靜的比例反映其人整體的行動傾向。',messages:[{role:'user',content:userPrompt}]})});
    if(!resp.ok)throw new Error('API 錯誤 '+resp.status+': '+await resp.text());
    const result=await resp.json(),text=result.content[0].text;
    const sections=text.split(/【(性格分析|事業運勢|人際關係|健康提示|流年運程)】/).filter(s=>s.trim());
    let html='<div class="ai-section"><h3>風鑑師 AI 評析</h3>';for(let i=0;i<sections.length;i+=2){html+='<div class="ai-block"><h4>【'+sections[i]+'】</h4><p>'+(sections[i+1]||'').trim()+'</p></div>';}html+='</div>';area.innerHTML=html;
  }catch(e){area.innerHTML='<div class="ai-section"><p style="color:#c0392b;font-weight:700;">評析失敗：'+e.message+'</p></div>';}
  btn.disabled=false;btn.innerText='生成 AI 評析';
}
