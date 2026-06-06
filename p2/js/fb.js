// p2/js/fb.js — P2 admin 共用 Firebase（rbf2app-staging）。供各功能區編輯器 import。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

export const RBF2_STAGING = {
  apiKey: 'AIzaSyDZ3z9LV1g3rnhO0QjmYOfipUGMtD1cq7g',
  authDomain: 'rbf2app-staging.firebaseapp.com',
  projectId: 'rbf2app-staging',
  storageBucket: 'rbf2app-staging.firebasestorage.app',
  messagingSenderId: '565853308902',
  appId: '1:565853308902:web:8a7a3e63df1291124df827'
};

let app, auth, db, _fbOK = false;
try { app = initializeApp(RBF2_STAGING); auth = getAuth(app); db = getFirestore(app); _fbOK = true; }
catch (e) { _fbOK = false; }

export { auth, db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch };
export const fbOK = () => _fbOK;

export function onUser(cb) {
  if (!_fbOK) { cb(null, null); return; }
  onAuthStateChanged(auth, async (u) => {
    let role = null;
    if (u) { try { const s = await getDoc(doc(db, 'users', u.uid)); if (s.exists()) role = s.data().role || null; } catch (e) {} }
    cb(u, role);
  });
}
export async function login() { if (!_fbOK) throw new Error('Firebase 未初始化'); await signInWithPopup(auth, new GoogleAuthProvider()); }
export async function logout() { if (auth) await signOut(auth); }
