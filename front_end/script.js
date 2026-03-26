import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, getAuth,sendPasswordResetEmail  } 
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


function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = message;

  container.appendChild(toast);

  // trigger animation
  setTimeout(() => toast.classList.add("show"), 10);

  // auto remove
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
const signupBtn = document.getElementById("signupBtn");

signupBtn.addEventListener("click", async () => {
 const name = document.getElementById("name").value;

let email = document.getElementById("email").value;
email = email.trim().toLowerCase();

const password = document.getElementById("password").value;   // ✅ ADD THIS LINE
const confirmPassword = document.getElementById("confirmPassword").value;

if (!password || !confirmPassword) {
  showToast("Please fill all fields", "error");
  return;
}

if (password !== confirmPassword) {
  showToast("Passwords do not match", "error");
  return;
}
  try {

    // 🔐 STEP 1: UNIQUE EMAIL LOCK
  const emailRef = doc(db, "unique_emails", email);

  await setDoc(emailRef, {
    createdAt: serverTimestamp()
  });

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

    showToast("Signup successful", "success");
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

  showToast(message, "error");
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
  showToast("Login successful", "success");

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
      showToast("No account found with this email.", "error");
      break;

    case "auth/wrong-password":
      showToast("Incorrect password.", "error");
      break;

    case "auth/invalid-credential":
      showToast("Invalid email or password.", "error");
      break;

    case "auth/too-many-requests":
      showToast("Too many attempts. Try again later.", "error");
      break;

    default:
      showToast("Login failed. Please try again.", "error");
  }
}
});

// ===== SECTION TOGGLE =====

const loginSection = document.getElementById("loginSection");
const registerSection = document.getElementById("registerSection");
const forgotSection = document.getElementById("forgotSection");

function showSection(nextSection, direction = "left") {
  const current = document.querySelector(".auth-card > div.active");

  if (current === nextSection) return;

  // exit animation
  if (direction === "left") current.classList.add("exit-left");
  if (direction === "right") current.classList.add("exit-right");
  if (direction === "up") current.classList.add("exit-up");
  if (direction === "down") current.classList.add("exit-down");

  // wait for exit animation
  setTimeout(() => {
    current.classList.remove("active", "exit-left", "exit-right", "exit-up", "exit-down");

    nextSection.classList.add("active");
  }, 250);
}

// Login → Register (slide left)
document.getElementById("showRegister").onclick = () => {
  showSection(registerSection, "left");
};

// Register → Login (slide right)
document.getElementById("showLogin").onclick = () => {
  showSection(loginSection, "right");
};

// Login → Forgot (slide up)
document.getElementById("showForgot").onclick = () => {
  showSection(forgotSection, "up");
};

// Forgot → Login (slide down)
document.getElementById("backToLogin").onclick = () => {
  showSection(loginSection, "down");
};

//forgot password logic
// ===== PASSWORD RESET =====

document.getElementById("resetBtn").addEventListener("click", async () => {

  const email = document.getElementById("resetEmail").value.trim();

  if (!email) {
    showToast("Enter your email", "info");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Reset email sent. Check spam if not in inbox.", "success");
  } catch (err) {
    console.error(err);

    if (err.code === "auth/user-not-found") {
      showToast("No account found with this email.", "error");
    } else if (err.code === "auth/invalid-email") {
      showToast("Invalid email.", "error");
    } else {
      showToast("Failed to send reset email.", "error");
    }
  }
});

// ===== PASSWORD TOGGLE =====

document.querySelectorAll(".toggle-password").forEach(icon => {
  icon.addEventListener("click", () => {
    const inputId = icon.getAttribute("data-target");
    const input = document.getElementById(inputId);

    if (input.type === "password") {
      input.type = "text";
      icon.textContent = "🙈"; // hide icon
    } else {
      input.type = "password";
      icon.textContent = "👁"; // show icon
    }
  });
});

