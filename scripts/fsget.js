// scripts/fsget.js — 用 ADC 讀任一 Firestore 路徑(doc 或 collection),印 JSON。
// 沿用 scripts/ 已裝的 firebase-admin + Application Default Credentials（gcloud auth application-default login）。
// 用法：
//   node scripts/fsget.js <projectId> <path>
//   doc 路徑(偶數段)：  node scripts/fsget.js rbf2app-staging config/active
//   collection(奇數段)：node scripts/fsget.js rbf2app-staging ruleSets/<id>/dims
//   collection 可加 --ids 只列文件 id：node scripts/fsget.js rbf2app-staging observations --ids
const admin = require('firebase-admin');

const [, , projectId, path, flag] = process.argv;
if (!projectId || !path) { console.error('usage: node scripts/fsget.js <projectId> <path> [--ids]'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
const db = admin.firestore();
const segs = path.split('/').filter(Boolean);

(async () => {
  try {
    if (segs.length % 2 === 0) {
      const snap = await db.doc(path).get();
      console.log(JSON.stringify(snap.exists ? snap.data() : null, null, 1));
    } else {
      const snap = await db.collection(path).get();
      if (flag === '--ids') { console.log(JSON.stringify(snap.docs.map(d => d.id), null, 1)); }
      else { const out = {}; snap.docs.forEach(d => out[d.id] = d.data()); console.log(JSON.stringify(out, null, 1)); }
    }
    process.exit(0);
  } catch (e) { console.error('ERR', e.message); process.exit(2); }
})();
