// scripts/fsset.js — 用 ADC 對 Firestore 文件做 merge 寫入(只動指定欄位),寫完印出結果驗證。
// 用法：node scripts/fsset.js <projectId> <docPath> '<jsonMergeObject>'
//   例：node scripts/fsset.js rbf2app-staging config/active '{"defaultSpice":"大辣"}'
const admin = require('firebase-admin');

const [, , projectId, path, json] = process.argv;
if (!projectId || !path || !json) { console.error("usage: node scripts/fsset.js <projectId> <docPath> '<jsonMerge>'"); process.exit(1); }
if (path.split('/').filter(Boolean).length % 2 !== 0) { console.error('path 必須是文件(偶數段)'); process.exit(1); }

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
const db = admin.firestore();

(async () => {
  try {
    const data = JSON.parse(json);
    const before = (await db.doc(path).get()).data();
    await db.doc(path).set(data, { merge: true });
    const after = (await db.doc(path).get()).data();
    console.log('before:', JSON.stringify(before));
    console.log('after :', JSON.stringify(after));
    process.exit(0);
  } catch (e) { console.error('ERR', e.message); process.exit(2); }
})();
