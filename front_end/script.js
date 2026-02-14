import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, getAuth  } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { doc, getDoc,setDoc, serverTimestamp, getFirestore }
    from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

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



const signupBtn = document.getElementById("signupBtn");

signupBtn.addEventListener("click", async () => {
  const name = document.getElementById("name").value;
 let email = document.getElementById("email").value;
  email = email.trim().toLowerCase();
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


const loginBtn = document.getElementById("loginBtn");

loginBtn.addEventListener("click", async () => {
 let email = document.getElementById("loginEmail").value;
 email = email.trim().toLowerCase();
const password = document.getElementById("loginPassword").value;
//alerts
  try {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;
  alert("Login successful");

//redirects to the dashboard based on ROLE:

  const userSnap = await getDoc(doc(db, "users", user.uid));
const role = userSnap.data().role;

if (role === "service_center") {
  window.location.href = "service-dashboard.html";
} else {
  window.location.href = "dashboard.html";
}
}


catch (error) {
  switch (error.code) {
    case "auth/user-not-found":
      alert("No account found with this email.");
      break;

    case "auth/wrong-password":
      alert("Incorrect password.");
      break;

    case "auth/invalid-credential":
      alert("Invalid email or password.");
      break;

    case "auth/too-many-requests":
      alert("Too many attempts. Try again later.");
      break;

    default:
      alert("Login failed. Please try again.");
  }
}


});
