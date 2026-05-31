import { db,auth } from "../firebase.js";
import { collection, doc, getDoc , query, where, getDocs,  deleteDoc, updateDoc } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

console.log("add-mechanic.js loaded");

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { getFunctions, httpsCallable } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-functions.js";

let currentUser = null;
let allMechanics = [];
let mechanicStatusMap = {};

// PAGINATION
let currentMechanicPage = 1;
let currentRequestPage = 1;

const ITEMS_PER_PAGE = 5;

// add-mechanic.js
let searchListenerAttached = false;  


// 🔐 Protect page + role check
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  currentUser = user;

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
  console.log("User doc missing");
  window.location.href = "../index.html";
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
  window.location.href = "../index.html";
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

 const name =

mechName.value
.trim()
.toLowerCase()
.split(" ")
.map(word =>

  word.charAt(0).toUpperCase() +
  word.slice(1)

)
.join(" ");

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
  serviceCenterId: currentUser.uid,
  mechanicJoinStatus: "pending"
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
    const allDocs = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));

// ✅ approved + legacy mechanics
allMechanics = allDocs.filter(mech =>

  mech.mechanicJoinStatus === "approved"

  ||

  !mech.mechanicJoinStatus

);

// ✅ requested mechanics
const requestedMechanics = allDocs.filter(mech =>

  mech.mechanicJoinStatus === "requested"

  ||

  mech.mechanicJoinStatus === "pending"

);
renderRequestedMechanics(requestedMechanics);

    if (snapshot.empty) {
      mechanicList.innerHTML = `
        <div class="empty-state">No mechanics added yet</div>
      `;
      return;
    }

    mechanicList.innerHTML = "";

const searchInput =
document.getElementById(
  "searchInput"
);

const existingSearch =
searchInput
? searchInput.value.toLowerCase()
: "";


let filteredList = allMechanics;

if (existingSearch) {
  filteredList = allMechanics.filter(m =>
    (m.name || "").toLowerCase().includes(existingSearch) ||
    (m.email || "").toLowerCase().includes(existingSearch)
  );
}
   renderMechanics(filteredList, user);

   // set search logic outside of loadMechanics to avoid re-attaching event listener on every load


searchInput.oninput = (e) => {
  const value = e.target.value.toLowerCase();

  const filtered = allMechanics.filter(m =>
    (m.name || "").toLowerCase().includes(value) ||
    (m.email || "").toLowerCase().includes(value)
  );

  renderMechanics(filtered, currentUser);
};



  } catch (error) {
    console.error("Error loading mechanics:", error);
    mechanicList.innerHTML = `<p>Error loading mechanics</p>`;
  }

 
}

// 🔹 RENDER MECHANIC
 function renderMechanics(list, user) {

  const mechanicList = document.getElementById("mechanicList");
  mechanicList.innerHTML = "";

  mechanicList.innerHTML = "";

// =======================
// PAGINATION
// =======================

const start =
(currentMechanicPage - 1)
* ITEMS_PER_PAGE;

const end =
start + ITEMS_PER_PAGE;

const paginatedList =
list.slice(start, end);

// render only current page
for (const data of paginatedList) {
const mechanicId = data.id;

    // 🔍 check busy
   const isBusy = mechanicStatusMap[mechanicId] || false;

    const card = document.createElement("div");
    card.className = "mechanic-row";

card.innerHTML = `

  <div class="mechanic-row-left">

   <div class="avatar-wrapper">

  ${
    data.profileImage

    ?

    `

      <img
        src="${data.profileImage}"
        class="mechanic-avatar-image"
      >

    `

    :

    `

      <div class="avatar-circle">

        ${
          (
            (data.name || "M")
            .split(" ")
            .map(word => word[0])
            .slice(0,2)
            .join("")
          ).toUpperCase()
        }

      </div>

    `
  }

  <span class="status-dot ${isBusy ? "dot-busy" : "dot-active"}"></span>

</div>

    <div class="mechanic-meta">

      <h4>
        ${data.name}
      </h4>

      <p>
        ${data.email}
      </p>

      <p>
        📞 ${data.phone || "+91 XXXXX XXXXX"}
      </p>

      <p>
        Exp: ${data.experience || 5} Years
      </p>

    </div>

  </div>

  <div class="mechanic-right">

    <div class="mechanic-job-count">

      <span>
        Jobs
      </span>

      <strong>
        ${data.jobsCompleted || 0}
      </strong>

    </div>

    <div class="mechanic-badge ${
      isBusy
      ? "badge-busy"
      : "badge-active"
    }">

      ${
        isBusy
        ? "Busy"
        : "Active"
      }

    </div>

    <div class="mechanic-actions">

      <button
        class="view-details-btn"
      >

        View Details

      </button>

      <button
        class="btn-delete"
        onclick="deleteMechanic('${mechanicId}')"
      >

        Delete

      </button>

    </div>

  </div>

`;

    mechanicList.appendChild(card);
  }
  renderMechanicPagination(list);
}


// =======================
// MECHANIC PAGINATION
// =======================

function renderMechanicPagination(fullList){

const mechanicList =
document.getElementById(
  "mechanicList"
);

const totalPages =
Math.ceil(
  fullList.length /
  ITEMS_PER_PAGE
);

if(totalPages <= 1) return;

const pagination =
document.createElement("div");

pagination.className =
"pagination-wrapper";

pagination.innerHTML = `

<button
  ${currentMechanicPage === 1 ? "disabled" : ""}
  id="prevMechanicPage"
>

  ←

</button>

<span>

  ${currentMechanicPage}
  / ${totalPages}

</span>

<button
  ${currentMechanicPage === totalPages ? "disabled" : ""}
  id="nextMechanicPage"
>

  →

</button>

`;

mechanicList.appendChild(
  pagination
);

// PREV
pagination.querySelector(
  "#prevMechanicPage"
)?.addEventListener(
  "click",
  () => {

    currentMechanicPage--;

    renderMechanics(
      fullList,
      currentUser
    );

  }
);

// NEXT
pagination.querySelector(
  "#nextMechanicPage"
)?.addEventListener(
  "click",
  () => {

    currentMechanicPage++;

    renderMechanics(
      fullList,
      currentUser
    );

  }
);

}


// 🔹 RENDER REQUESTED MECHANICS

function renderRequestedMechanics(list){

const newMechanicList =
document.getElementById("newMechanicList");

if(!newMechanicList) return;

newMechanicList.innerHTML = "";

if(list.length === 0){

newMechanicList.innerHTML = `
  <div class="empty-state">
    No joining requests
  </div>
`;

return;

}

const start =
(currentRequestPage - 1)
* ITEMS_PER_PAGE;

const end =
start + ITEMS_PER_PAGE;

const paginatedList =
list.slice(start, end);

paginatedList.forEach(data => {

const card = document.createElement("div");

card.className = "mechanic-row";

card.innerHTML = `

<div class="mechanic-row-left">

  <div class="avatar-wrapper">

    ${
      data.profileImage

      ?

      `

        <img
          src="${data.profileImage}"
          class="mechanic-avatar-image"
        >

      `

      :

      `

        <div class="avatar-circle">

          ${
            (
              (data.name || "M")
              .split(" ")
              .map(word => word[0])
              .slice(0,2)
              .join("")
            ).toUpperCase()
          }

        </div>

      `
    }

  </div>

  <div class="mechanic-meta">

    <h4>
      ${data.name}
    </h4>

    <p>
      ${data.email}
    </p>

   <p>

  ${
    data.mechanicJoinStatus === "pending"

    ?

    "Invitation sent"

    :

    "Requested to join"
  }

</p>

  </div>

</div>

<div class="mechanic-actions">

 <button
    class="view-details-btn"
  >

    View Details

  </button>

  ${
    data.mechanicJoinStatus === "requested"

    ?

    `

      <button
        class="approve-btn"
        onclick="approveMechanic('${data.id}')"
      >

        Approve Joining

      </button>

    `

    :

    `

      <span class="pending-label">

        Waiting For Mechanic

      </span>

    `
  }

</div>

`;

newMechanicList.appendChild(card);

});

}

// =======================
// REQUEST PAGINATION
// =======================

function renderRequestPagination(fullList){

const newMechanicList =
document.getElementById(
  "newMechanicList"
);

const totalPages =
Math.ceil(
  fullList.length /
  ITEMS_PER_PAGE
);

if(totalPages <= 1) return;

const pagination =
document.createElement("div");

pagination.className =
"pagination-wrapper";

pagination.innerHTML = `

<button
  ${currentRequestPage === 1 ? "disabled" : ""}
  id="prevRequestPage"
>

  ←

</button>

<span>

  ${currentRequestPage}
  / ${totalPages}

</span>

<button
  ${currentRequestPage === totalPages ? "disabled" : ""}
  id="nextRequestPage"
>

  →

</button>

`;

newMechanicList.appendChild(
  pagination
);

// PREV
pagination.querySelector(
  "#prevRequestPage"
)?.addEventListener(
  "click",
  () => {

    currentRequestPage--;

    renderRequestedMechanics(
      fullList
    );

  }
);

// NEXT
pagination.querySelector(
  "#nextRequestPage"
)?.addEventListener(
  "click",
  () => {

    currentRequestPage++;

    renderRequestedMechanics(
      fullList
    );

  }
);

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

//approve mechanics

window.approveMechanic = async function(mechanicId){

try{

await updateDoc(
  doc(db,"users",mechanicId),
  {
    mechanicJoinStatus:"approved"
  }
);

showToast(
  "Mechanic approved",
  "success"
);

await loadMechanics(currentUser);

}catch(error){

console.error(error);

showToast(
  "Approval failed",
  "error"
);

}

}

// 🔹 ATTACH ADD BUTTON

document
.getElementById("addMechanicBtn")
?.addEventListener(
  "click",
  addMechanic
);

// ========================================
// SIDEBAR TOGGLE
// ========================================

const menuToggle =
document.getElementById(
  "menuToggle"
);

const sidebar =
document.getElementById(
  "serviceSidebar"
);

const serviceMain =
document.querySelector(
  ".service-main"
);

// default state
let sidebarOpen = true;

menuToggle?.addEventListener(
  "click",
  () => {

    sidebarOpen = !sidebarOpen;

    // sidebar
    sidebar.classList.toggle(
      "closed"
    );

    // content expand
    serviceMain.classList.toggle(
      "expanded"
    );

    // move button
    menuToggle.classList.toggle(
      "collapsed"
    );

  }
);