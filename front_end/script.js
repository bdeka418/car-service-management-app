import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, getFirestore }
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

// ============================================================
// CHANGE 1: Track which role the user is registering as.
// This variable is set when the user clicks one of the two
// register cards on the login page.
// ============================================================
let currentRegisterRole = "customer"; // "customer" | "service_center"

// ===== TOAST =====
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== SECTION ANIMATION =====
// CHANGE 2: Updated showSection to work with the new HTML structure.
// The old code used .hidden class; now sections animate with transforms.
const loginSection    = document.getElementById("loginSection");
const registerSection = document.getElementById("registerSection");
const forgotSection   = document.getElementById("forgotSection");

function showSection(nextSection, direction = "left") {
  const current = document.querySelector(".section.active");
  if (!current || current === nextSection) return;

  const exitClass = {
    left: "exit-left",
    right: "exit-right",
    up: "exit-up",
    down: "exit-down",
  }[direction] || "exit-left";

  current.classList.add(exitClass);

  setTimeout(() => {
    current.classList.remove("active", "exit-left", "exit-right", "exit-up", "exit-down");
    current.classList.add("hidden");
    nextSection.classList.remove("hidden");
    nextSection.classList.add("active");
  }, 280);
}

// ===== NAVIGATION — CHANGE 3: =====
// Replaced old showRegister / showLogin IDs with the new card IDs.
// "showRegisterCustomer" and "showRegisterService" are the two new cards.

document.getElementById("showRegisterCustomer").onclick = () => {
  currentRegisterRole = "customer";
  // Update register form UI for customer
  document.getElementById("registerTitle").textContent = "Create Account";
  document.getElementById("registerSubtitle").textContent = "Join as a Customer";
  document.getElementById("serviceCenterNameGroup").style.display = "none";
  document.getElementById("serviceCenterName").value = "";
  showSection(registerSection, "left");
};

document.getElementById("showRegisterService").onclick = () => {
  currentRegisterRole = "service_center";
  // CHANGE 4: Show the extra "Service Center Name" field for service_center role
  document.getElementById("registerTitle").textContent = "Register Service Center";
  document.getElementById("registerSubtitle").textContent = "Set up your service center account";
  document.getElementById("serviceCenterNameGroup").style.display = "block";
  showSection(registerSection, "left");
};

document.getElementById("showLogin").onclick = () => {
  showSection(loginSection, "right");
};

document.getElementById("showForgot").onclick = () => {
  showSection(forgotSection, "up");
};

document.getElementById("backToLogin").onclick = () => {
  showSection(loginSection, "down");
};

// ===== SIGNUP =====
// CHANGE 5: Reads serviceCenterName when role is service_center and
// saves it to Firestore. Also sets role dynamically.
document.getElementById("signupBtn").addEventListener("click", async () => {
  const name = document.getElementById("name").value.trim();
  let email = document.getElementById("email").value.trim().toLowerCase();
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  // Validate service center name if needed
  if (currentRegisterRole === "service_center") {
    const scName = document.getElementById("serviceCenterName").value.trim();
    if (!scName) {
      showToast("Please enter the service center name", "error");
      return;
    }
  }

  if (!name || !email) {
    showToast("Please fill all fields", "error");
    return;
  }

  if (!password || !confirmPassword) {
    showToast("Please fill all fields", "error");
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match", "error");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Unique email lock check
    const emailRef = doc(db, "unique_emails", email);
    const emailSnap = await getDoc(emailRef);

    if (emailSnap.exists()) {
      showToast("Account already exists with this email", "error");
      return;
    }

    await setDoc(emailRef, { createdAt: serverTimestamp() });

    // CHANGE 6: Build user data based on role.
    // service_center gets an extra "serviceCenterName" field.
    const userData = {
      name,
      email,
      role: currentRegisterRole,
      createdAt: serverTimestamp(),
    };

    if (currentRegisterRole === "service_center") {
      userData.serviceCenterName = document.getElementById("serviceCenterName").value.trim();
    }

    await setDoc(doc(db, "users", user.uid), userData);

    showToast("Account created successfully!", "success");

    // Redirect based on role
    if (currentRegisterRole === "service_center") {
      window.location.href = "service-center/service-dashboard.html";
    } else {
      window.location.href = "customer/dashboard.html";
    }

  } catch (error) {
    console.error("SIGNUP ERROR:", error);

    let message = "Signup failed. Please try again.";
    if (error.code === "auth/email-already-in-use") message = "An account with this email already exists.";
    else if (error.code === "auth/invalid-email")   message = "Please enter a valid email address.";
    else if (error.code === "auth/weak-password")   message = "Password should be at least 6 characters.";
    else if (error.code === "auth/network-request-failed") message = "Network issue. Check your internet connection.";

    showToast(message, "error");
  }
});

// ===== LOGIN =====
// No changes needed here — logic is the same.
document.getElementById("loginBtn").addEventListener("click", async () => {
  let email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Login successful", "success");
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    switch (error.code) {
      case "auth/user-not-found":      showToast("No account found with this email.", "error"); break;
      case "auth/wrong-password":      showToast("Incorrect password.", "error"); break;
      case "auth/invalid-credential":  showToast("Invalid email or password.", "error"); break;
      case "auth/too-many-requests":   showToast("Too many attempts. Try again later.", "error"); break;
      default:                         showToast("Login failed. Please try again.", "error");
    }
  }
});

// ===== AUTH STATE (redirect on already logged in) =====
// No changes needed here.
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) { showToast("User profile missing", "error"); return; }

    const role = userSnap.data().role;

    if (role === "service_center") {
      window.location.href = "service-center/service-dashboard.html";
    } else if (role === "mechanic") {
      window.location.href = "mechanic/mechanic-dashboard.html";
    } else {
      window.location.href = "customer/dashboard.html";
    }
  } catch (error) {
    console.error("AUTH STATE ERROR:", error);
    showToast("Failed to load user data", "error");
  }
});

// ===== FORGOT PASSWORD =====
// No changes needed.
document.getElementById("resetBtn").addEventListener("click", async () => {
  const email = document.getElementById("resetEmail").value.trim();
  if (!email) { showToast("Enter your email", "info"); return; }

  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Reset email sent. Check spam if not in inbox.", "success");
  } catch (err) {
    console.error(err);
    if (err.code === "auth/user-not-found") showToast("No account found with this email.", "error");
    else if (err.code === "auth/invalid-email") showToast("Invalid email.", "error");
    else showToast("Failed to send reset email.", "error");
  }
});

// ===== PASSWORD TOGGLE =====
// CHANGE 7: Updated selector — icons are now SVG spans, not emoji.
// The toggle-password spans still use data-target so this works the same way.
document.querySelectorAll(".toggle-password").forEach(icon => {
  icon.addEventListener("click", () => {
    const inputId = icon.getAttribute("data-target");
    const input = document.getElementById(inputId);
    const svg = icon.querySelector("svg");

    if (input.type === "password") {
      input.type = "text";
      // crossed-eye icon
      svg.innerHTML = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`;
    } else {
      input.type = "password";
      svg.innerHTML = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
    }
  });
});

// ===== GOOGLE SIGN-IN placeholder =====
// CHANGE 8: Added Google button handler stub.
// Uncomment and wire up GoogleAuthProvider when ready.
document.getElementById("googleBtn").addEventListener("click", () => {
  showToast("Google sign-in coming soon!", "info");
  // import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
  // const provider = new GoogleAuthProvider();
  // await signInWithPopup(auth, provider);
});