import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDX-vL7Chmz2vr8OqljOYF0Kj8QYgHh6To",
  authDomain: "coparent-app-f46fd.firebaseapp.com",
  projectId: "coparent-app-f46fd",
  storageBucket: "coparent-app-f46fd.firebasestorage.app",
  messagingSenderId: "1037026520605",
  appId: "1:1037026520605:web:e9aa49dc88f6a2b30560f4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
