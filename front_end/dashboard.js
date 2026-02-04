import { getAuth, onAuthStateChanged, signOut } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { initializeApp } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";

const firebaseConfig = {
 apiKey: "AIzaSyBf_wiFJv5K-wHZdPKGjx48dAIwYCE36rw",
    authDomain: "car-service-app-c369c.firebaseapp.com",
    projectId: "car-service-app-c369c",
    storageBucket: "car-service-app-c369c.firebasestorage.app",
    messagingSenderId: "88111807766",
    appId: "1:88111807766:web:0ccaf8189abf18d336e437",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 🔐 Auth check
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  }
});

// 🚪 Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
