
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,
  createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,doc,getDoc,setDoc,collection,query,orderBy,limit,getDocs,serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig={
  apiKey:"AIzaSyA0wHZaUESU1cdmWtp0nRpvEPytHcitIA4",
  authDomain:"idle-legends-manager.firebaseapp.com",
  projectId:"idle-legends-manager",
  storageBucket:"idle-legends-manager.firebasestorage.app",
  messagingSenderId:"522871886650",
  appId:"1:522871886650:web:a21005dc71a933b8c97603"
};

const app=initializeApp(firebaseConfig);
export const auth=getAuth(app);
export const db=getFirestore(app);
const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:"select_account"});

export function watchAuth(callback){
  getRedirectResult(auth).catch(console.warn);
  return onAuthStateChanged(auth,callback);
}
export async function googleLogin(){
  if(matchMedia("(max-width:700px)").matches) return signInWithRedirect(auth,provider);
  return signInWithPopup(auth,provider);
}
export async function emailLogin(email,password){return signInWithEmailAndPassword(auth,email,password)}
export async function emailRegister(email,password){return createUserWithEmailAndPassword(auth,email,password)}
export async function logout(){return signOut(auth)}

export async function loadUserSave(uid){
  const snap=await getDoc(doc(db,"users",uid));
  return snap.exists()?snap.data():null;
}
export async function saveUser(uid,user,save,run){
  await setDoc(doc(db,"users",uid),{
    uid,
    displayName:user.displayName||"",
    email:user.email||"",
    save,
    activeRun:run||null,
    updatedAt:serverTimestamp()
  },{merge:true});
}
export async function publishLeaderboard(uid,user,save){
  await setDoc(doc(db,"leaderboards",uid),{
    uid,
    displayName:user.displayName||user.email?.split("@")[0]||"Fighter",
    championships:save.championships||0,
    matchWins:save.matchWins||0,
    totalKOs:save.totalKOs||0,
    longestStreak:save.longestStreak||0,
    bestBracket:save.bestBracket||4,
    damageDealt:save.damageDealt||0,
    fastestChampionship:save.fastestChampionship||null,
    updatedAt:serverTimestamp()
  },{merge:true});
}
export async function fetchLeaderboard(field="championships"){
  const q=query(collection(db,"leaderboards"),orderBy(field,"desc"),limit(50));
  const snap=await getDocs(q);
  return snap.docs.map(d=>d.data());
}
