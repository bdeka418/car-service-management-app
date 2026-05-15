import { db,auth } from "../firebase.js";
import { collection, doc, getDoc , query, where, getDocs,  deleteDoc } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

console.log("add-mechanic.js loaded");

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { getFunctions, httpsCallable } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";

let currentUser = null;
let allMechanics = [];
let mechanicStatusMap = {};

// 🔐 Protect page + role check
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
  console.log("User doc missing");
  window.location.href = "index.html";
  return;
}

const role = userSnap.data().role;

console.log("ROLE:", role);
// 🔥 Password warning (non-blocking)
if (userSnap.data().mustResetPassword) {
  showToast("Please set your password using email link", "warning");
}

// 🔥 Role-based redirect
if (role !== "service_center") {
  window.location.href = "index.html";
  return;
}

 console.log("Authorized service center:", user.email);

// 🔥 CALL IT DIRECTLY
await loadMechanics(user);// 👈 call your main logic here
});

const functions = getFunctions(undefined, "asia-south1");
const createMechanic = httpsCallable(functions, "createMechanicAndSendEmail");

//toast function
function showToast(message, type = "info") {
  alert(message); // simple fallback for now
}
//add mechanic logic
window.addMechanic = async function () {

const btn = document.getElementById("addMechanicBtn");  btn.disabled = true;

  const name = document.getElementById("mechName").value;
  const email = document.getElementById("mechEmail").value;

  if (!name || !email) {
    showToast("Fill all fields", "error");
    btn.disabled = false;
    return;
  }

  try {

    if (!currentUser) {
      showToast("Auth not ready. Please wait...", "error");
      btn.disabled = false;
      return;
    }

    await createMechanic({
      name,
      email,
      serviceCenterId: currentUser.uid
    });

    showToast("Mechanic added & email sent", "success");

    document.getElementById("mechName").value = "";
    document.getElementById("mechEmail").value = "";

await loadMechanics(currentUser);

  } catch (error) {

    console.error("🔥 FULL ERROR OBJECT:", error);
    console.error("🔥 ERROR MESSAGE:", error.message);
    console.error("🔥 ERROR CODE:", error.code);
    console.error("🔥 ERROR DETAILS:", error.details);

    alert("ERROR: " + error.message);

    if (error.message.includes("email-already-exists")) {
      showToast("Mechanic already exists", "error");
    } else {
      showToast("Failed to add mechanic", "error");
    }
  }

  btn.disabled = false;
};
//==========================================================
async function loadMechanics(user) {
const mechanicList = document.getElementById("mechanicList");
  if (!mechanicList) return;

  mechanicList.innerHTML = "<p>Loading...</p>";

  try {
    const q = query(
      collection(db, "users"),
      where("role", "==", "mechanic"),
      where("serviceCenterId", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    // 🔥 FETCH ALL ACTIVE JOBS ONCE
// ✅ FIXED — filtered query (matches Firestore rules)
const jobSnap = await getDocs(
  query(
    collection(db, "jobCards"),
    where("assignedServiceCenterId", "==", user.uid),
    where("status", "in", ["assigned", "in_progress"])
  )
);


mechanicStatusMap = {};

jobSnap.forEach(doc => {
  const data = doc.data();

  if (
  ["assigned", "in_progress"].includes(data.status) &&
  data.assignedServiceCenterId === user.uid
) {
  mechanicStatusMap[data.mechanicId] = true;
}
});
// 🔥 CACHE ALL MECHANICS FOR SEARCH
    allMechanics = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));

    if (snapshot.empty) {
      mechanicList.innerHTML = `
        <div class="empty-state">No mechanics added yet</div>
      `;
      return;
    }

    mechanicList.innerHTML = "";

const searchInput = document.getElementById("searchInput");
const existingSearch = searchInput.value.toLowerCase();

let filteredList = allMechanics;

if (existingSearch) {
  filteredList = allMechanics.filter(m =>
    (m.name || "").toLowerCase().includes(existingSearch) ||
    (m.email || "").toLowerCase().includes(existingSearch)
  );
}
   renderMechanics(filteredList, user);


  } catch (error) {
    console.error("Error loading mechanics:", error);
    mechanicList.innerHTML = `<p>Error loading mechanics</p>`;
  }

 
}

// 🔹 RENDER MECHANIC
 function renderMechanics(list, user) {

  const mechanicList = document.getElementById("mechanicList");
  mechanicList.innerHTML = "";

  for (const data of list) {

    const mechanicId = data.id;

    // 🔍 check busy
   const isBusy = mechanicStatusMap[mechanicId] || false;

    const card = document.createElement("div");
    card.className = "mechanic-item";

    card.innerHTML = `
     <div class="mechanic-left">

  <div class="avatar-wrapper">
    <div class="avatar-circle">
      ${data.name?.charAt(0).toUpperCase() || "M"}
    </div>

    <span class="status-dot ${isBusy ? "dot-busy" : "dot-active"}"></span>
  </div>

  <div class="mechanic-details">
    <div class="mechanic-name">${data.name}</div>
    <div class="mechanic-email">${data.email}</div>
    <div class="mechanic-phone">📞 ${data.phone || "+91 XXXXX XXXXX"}</div>
  </div>

</div>
      <div class="mechanic-stats">
        Jobs Completed <br><strong>${data.jobsCompleted || 0}</strong>
      </div>

      <div class="mechanic-status">
        <span class="status-badge ${isBusy ? "status-busy" : "status-active"}">
          ${isBusy ? "Busy" : "Active"}
        </span>
      </div>

      <div class="mechanic-actions">
        <button class="btn-edit">Edit</button>
        <button class="btn-delete" onclick="deleteMechanic('${mechanicId}')">Delete</button>
      </div>
    `;

    mechanicList.appendChild(card);
  }
}

window.deleteMechanic = async function (mechanicId) {

  const confirmDelete = confirm("Delete this mechanic?");
  if (!confirmDelete) return;

  try {
    await deleteDoc(doc(db, "users", mechanicId));

    showToast("Mechanic deleted", "success");

    await loadMechanics(currentUser);

  } catch (error) {
    console.error(error);
    showToast("Delete failed", "error");
  }
};
// seat search logic outside of loadMechanics to avoid re-attaching event listener on every load
const searchInput = document.getElementById("searchInput");

searchInput.oninput = (e) => {
  const value = e.target.value.toLowerCase();

  const filtered = allMechanics.filter(m =>
    (m.name || "").toLowerCase().includes(value) ||
    (m.email || "").toLowerCase().includes(value)
  );

  renderMechanics(filtered, currentUser);
};

