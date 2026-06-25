// p2/js/student/answer.js — 部位觀察答題頁（B1，自 student_min.html 移植整理）
// 純渲染 + 回呼：渲染部位/段落/題目（左右題分 L/R），點選即更新 obs 並回呼 onChange。
// obs 物件由外層持有（app.js 的 STATE.obs）；本模組只讀寫其鍵。

// 單題鍵：左右題 → id_L / id_R；非左右題 → id
function keyOf(qId, side) { return side ? qId + '_' + side : qId; }

function optRow(q, side, label, obs, onChange) {
  const row = document.createElement('div'); row.className = 'aw-row';
  if (label) { const t = document.createElement('span'); t.className = 'aw-lr'; t.textContent = label; row.appendChild(t); }
  const box = document.createElement('span'); box.className = 'aw-opts';
  const key = keyOf(q.id, side);
  q.opts.forEach(o => {
    const b = document.createElement('span'); b.className = 'aw-opt'; b.textContent = o.v;
    if (o.hint) b.title = o.hint;
    if (obs[key] === o.v) b.classList.add('sel');
    b.onclick = () => {
      // 再點一次同選項 = 取消
      if (obs[key] === o.v) { delete obs[key]; } else { obs[key] = o.v; }
      box.querySelectorAll('.aw-opt').forEach(x => x.classList.remove('sel'));
      if (obs[key] === o.v) b.classList.add('sel');
      onChange();
    };
    box.appendChild(b);
  });
  row.appendChild(box);
  return row;
}

function qEl(q, obs, onChange) {
  const el = document.createElement('div'); el.className = 'aw-q';
  const qt = document.createElement('div'); qt.className = 'aw-qt';
  qt.textContent = q.text + (q.paired ? '（左右）' : '');
  el.appendChild(qt);
  if (q.paired) {
    el.appendChild(optRow(q, 'L', '左', obs, onChange));
    el.appendChild(optRow(q, 'R', '右', obs, onChange));
  } else {
    el.appendChild(optRow(q, null, '', obs, onChange));
  }
  return el;
}

// 渲染整份題庫到 container。onChange：任一答案變動時呼叫（外層重算報告 + 標記未存）
export function renderAnswer(container, rs, obs, onChange) {
  container.innerHTML = '';
  rs.partNames.forEach(pn => {
    const part = rs.obsParts[pn];
    const pEl = document.createElement('div'); pEl.className = 'aw-part';
    const h = document.createElement('h3'); h.className = 'aw-part-h'; h.textContent = pn;
    pEl.appendChild(h);
    part.sections.forEach(sec => {
      const sEl = document.createElement('div'); sEl.className = 'aw-sec';
      const sh = document.createElement('h4'); sh.className = 'aw-sec-h'; sh.textContent = sec.label;
      sEl.appendChild(sh);
      sec.qs.forEach(q => sEl.appendChild(qEl(q, obs, onChange)));
      pEl.appendChild(sEl);
    });
    container.appendChild(pEl);
  });
}

// 題庫完整性自查（斷鏈護欄，自 student_min.html 移植）：
// 維度條件引用到本套裝題庫沒有的觀察題 → 該部位永遠算不出 → 動靜不準。
export function checkRefIntegrity(rs) {
  const qIds = new Set();
  rs.partNames.forEach(pn => rs.obsParts[pn].sections.forEach(s => s.qs.forEach(q => qIds.add(q.id))));
  const refDims = {};
  rs.dims.forEach(dd => {
    if (!dd) return;
    Object.values(dd.parts || {}).forEach(p => {
      if (p.kind === 'aggregate' || !Array.isArray(p.cards)) return;
      p.cards.forEach(c => (c.combos || []).forEach(cb => {
        const leaves = Array.isArray(cb) ? cb : (cb && cb.leaves) || [];
        leaves.forEach(l => { if (l && l.ref && !qIds.has(l.ref)) { (refDims[l.ref] = refDims[l.ref] || new Set()).add(dd.dimName || ''); } });
      }));
    });
  });
  const missing = Object.keys(refDims);
  return { ok: missing.length === 0, missing, refDims };
}
