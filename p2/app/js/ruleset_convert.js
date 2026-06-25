// p2/js/ruleset_convert.js — 純轉換函式（無 firebase 依賴，node 可單測）
// 把 P2 Firestore 的 ruleSets/{id} 資料（observations 扁平文件 + obsmeta/layout + dims）
// 轉成學員前台吃的記憶體結構（OBS_PARTS_DATA / dimDef[] / isPaired）。
// 來源形狀：
//   observation 文件（obs_editor.js toDoc）：{obsId, part, section, label, paired, options:[v], note, optionHints?:{v:hint}, sourceQid}
//   layout（obsmeta/layout.layout）：{ part -> [{label, qIds:[...]}] }
//   dims（ruleSets/{id}/dims/{di}）：admin2 serialize 形狀，engine.js 原生可吃（combos 為 {leaves:[]}）
// 目標形狀（js/core.js OBS_PARTS_DATA_DEFAULT）：
//   { 部位: { total, sections:[{label, qs:[{id, text, paired?, opts:[{v,hint}]}]}] } }

// 學員前台部位順序（與 core.js OBS_PART_NAMES_DEFAULT 一致）；未列到的部位接在後面
export const CANONICAL_PARTS = ['頭', '額', '耳', '眉', '眼', '鼻', '顴', '口', '人中', '地閣', '頤'];

// 單題：obs 文件 → 前台 q（忠實比照 default：paired 為 false 時省略、無 q.note）
function toQ(o) {
  const hints = o.optionHints || {};
  const q = {
    id: o.obsId,
    text: o.label || '',
    opts: (o.options || []).map(v => ({ v, hint: hints[v] || '' })),
  };
  if (o.paired) q.paired = true;
  return q;
}

// observations[] + layout → OBS_PARTS_DATA
// section/題序比照 admin2.js:714-726：先依 layout，剩餘（不在 layout 的新題）依 .section 補在後面。
export function convertObservations(obsDocs, layout) {
  layout = layout || {};
  const byPart = {};
  (obsDocs || []).forEach(o => { if (!o || !o.part) return; (byPart[o.part] = byPart[o.part] || []).push(o); });

  function buildPart(items) {
    const byId = {}; items.forEach(o => { byId[o.obsId] = o; });
    const lay = layout[items[0].part] || [];
    const used = new Set();
    const sections = [];
    lay.forEach(s => {
      const qs = [];
      (s.qIds || []).forEach(id => { if (byId[id] && !used.has(id)) { qs.push(toQ(byId[id])); used.add(id); } });
      if (qs.length) sections.push({ label: s.label, qs });
    });
    items.forEach(o => {
      if (used.has(o.obsId)) return;
      used.add(o.obsId);
      const secLabel = o.section || '（未分類）';
      let g = sections.find(x => x.label === secLabel);
      if (!g) { g = { label: secLabel, qs: [] }; sections.push(g); }
      g.qs.push(toQ(o));
    });
    const total = sections.reduce((n, s) => n + s.qs.length, 0);
    return { total, sections };
  }

  // 依 CANONICAL_PARTS 排部位順序，未列到的接後面
  const out = {};
  const seen = new Set();
  CANONICAL_PARTS.forEach(p => { if (byPart[p]) { out[p] = buildPart(byPart[p]); seen.add(p); } });
  Object.keys(byPart).forEach(p => { if (!seen.has(p)) out[p] = buildPart(byPart[p]); });
  return out;
}

// dims 文件集合 → dimDef[]（依 dimIndex / 文件id 放索引；缺的維度留 undefined）
// entries：[{id, data}]，id＝文件 id（'0'..'12'），data＝admin2 serialize 形狀
export function collectDims(entries) {
  const arr = [];
  (entries || []).forEach(e => {
    if (!e || !e.data) return;
    const idx = (typeof e.data.dimIndex === 'number') ? e.data.dimIndex : parseInt(e.id, 10);
    if (!Number.isNaN(idx)) arr[idx] = e.data;
  });
  return arr;
}

// 由 OBS_PARTS_DATA 建 isPaired（引擎逐側計分要用）
export function buildIsPaired(obsParts) {
  const paired = new Set();
  for (const part in obsParts) {
    for (const s of (obsParts[part].sections || [])) {
      for (const q of (s.qs || [])) if (q.paired) paired.add(q.id);
    }
  }
  return id => paired.has(id);
}
