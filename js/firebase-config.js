// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "women-secret-nails.firebaseapp.com",
  projectId: "women-secret-nails",
  storageBucket: "women-secret-nails.firebasestorage.app",
  messagingSenderId: "245460116956",
  appId: "1:245460116956:web:a0881d15b5bbf76119db19"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
