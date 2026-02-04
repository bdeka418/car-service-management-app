import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {getAuth } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {getFirestore} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

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
const db = getFirestore(app);
console.log("Firebase initialized");

//logic for the authentication of the user (signup)

import { createUserWithEmailAndPassword }
    from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { doc, setDoc, serverTimestamp }
    from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const signupBtn = document.getElementById("signupBtn");

signupBtn.addEventListener("click", async () => {
  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    // 1️⃣ Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = userCredential.user;

    // 2️⃣ Create user document in Firestore
    await setDoc(doc(db, "users", user.uid), {
      name: name,
      email: email,
      role: "customer",
      createdAt: serverTimestamp()
    });

    alert("Signup successful");
   window.location.href = "dashboard.html"; //redirects to the dashboard
  } 
  //alerts
  catch (error) {
  let message = "Signup failed. Please try again.";

  if (error.code === "auth/email-already-in-use") {
    message = "An account with this email already exists.";
  } 
  else if (error.code === "auth/invalid-email") {
    message = "Please enter a valid email address.";
  } 
  else if (error.code === "auth/weak-password") {
    message = "Password should be at least 6 characters.";
  } 
  else if (error.code === "auth/network-request-failed") {
    message = "Network issue. Check your internet connection.";
  }

  alert(message);
}

});

//signin logic

import { signInWithEmailAndPassword } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

const loginBtn = document.getElementById("loginBtn");

loginBtn.addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
//alerts
  try {
  await signInWithEmailAndPassword(auth, email, password);
  alert("Login successful");
  window.location.href = "dashboard.html"; //redirects to the dashboard
} catch (error) {
  let message = "Something went wrong. Please try again.";

  if (error.code === "auth/user-not-found" ||  error.code === "auth/invalid-credential") {
    message = "No account found with this email.";
  } 
  else if (error.code === "auth/wrong-password") {
    message = "Incorrect password. Please try again.";
  } 
  else if (error.code === "auth/invalid-email") {
    message = "Please enter a valid email address.";
  } 
  else if (error.code === "auth/network-request-failed") {
    message = "Network issue. Check your internet connection.";
  }

  alert(message);
}

});
