// js/ai_analysis.js — AI 評析模組（透過 Cloud Function）
import { DIMS, data, userName, calcDim, avgCoeff,
         _userGender, _userBirthday, _caseGender, _caseBirthday,
         _isTA, _currentCaseId, _currentCaseName,
         BETA_VISIBLE_DIMS } from './core.js';
import { calcXuSui } from './report.js';

const CF_URL = 'https://us-central1-renxiangbingfa.cloudfunctions.net/claudeAnalysis';

// 組裝 dimData：每個維度的 _result, _coef, 加上 9 個部位的 A/B
function buildDimData() {
  const PART_NAMES = ['頭','上停','中停','下停','耳','眉','眼','鼻','口'];
  const dimData = {};
  DIMS.forEach(function(d, i) {
    const dn = d.dn; // e.g. "形勢"
    const res = calcDim(data, i);
    const entry = {};
    entry['_result'] = res ? res.type : null;
    entry['_coef'] = res ? parseFloat(res.coeff.toFixed(2)) : null;
    PART_NAMES.forEach(function(pn, pi) {
      entry[pn] = data[i][pi] || null;
    });
    dimData[dn] = entry;
  });
  return dimData;
}

// 組裝 coefficients
function buildCoefficients() {
  const total = avgCoeff(data, [0,1,2,3,4,5,6,7,8,9,10,11,12]);
  const innate = avgCoeff(data, [0,1,2,3,4,5]);
  const luck = avgCoeff(data, [6,7,8]);
  const acquired = avgCoeff(data, [9,10,11,12]);
  // 老闆係數 = 形勢+經緯+方圓 (index 0,1,2)
  const boss = avgCoeff(data, [0,1,2]);
  // 主管係數 = 曲直+收放+緩急 (index 3,4,5)
  const manager = avgCoeff(data, [3,4,5]);
  return { total, innate, boss, manager, luck, acquired };
}

export async function generateAI() {
  const btn = document.getElementById('btn-ai');
  const area = document.getElementById('ai-analysis-area');
  if (!btn || !area) return;

  btn.disabled = true;
  btn.innerText = '評析中…';
  if (!document.getElementById('ai-spin-style')) {
    var style = document.createElement('style');
    style.id = 'ai-spin-style';
    style.textContent = '@keyframes aiSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }
  area.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:20px">' +
    '<div style="width:24px;height:24px;border:3px solid var(--border);border-top:3px solid var(--active);border-radius:50%;animation:aiSpin 0.8s linear infinite"></div>' +
    '<span style="font-size:14px;color:var(--text-3)">AI 分析中...</span></div>';

  // 判斷性別、生日、姓名（個案 or 使用者自己）
  const gender = (_isTA && _currentCaseId) ? _caseGender : _userGender;
  const birthday = (_isTA && _currentCaseId) ? _caseBirthday : _userBirthday;
  const name = (_isTA && _currentCaseId) ? _currentCaseName : userName;
  const age = birthday ? calcXuSui(birthday) : null;

  const dimData = buildDimData();
  const coefficients = buildCoefficients();

  try {
    const resp = await fetch(CF_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, gender, age, dimData, coefficients })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error('Cloud Function 錯誤 ' + resp.status + ': ' + errText);
    }

    const result = await resp.json();
    const text = result.analysis || '（無回應）';

    area.innerHTML = '<div style="padding:16px;font-size:14px;line-height:1.8;color:var(--text);white-space:pre-wrap">' +
      text + '</div>';

  } catch (e) {
    area.innerHTML = '<div style="padding:16px;color:#c03830;font-weight:400">評析失敗：' + e.message + '</div>';
  }

  btn.disabled = false;
  btn.innerText = '生成 AI 評析';
}
