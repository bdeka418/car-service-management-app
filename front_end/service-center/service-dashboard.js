import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp,
  getDoc,
  onSnapshot, 
  deleteDoc

} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";



const firebaseConfig = {
  apiKey: "AIzaSyBf_wiFJv5K-wHZdPKGjx48dAIwYCE36rw",
  authDomain: "car-service-app-c369c.firebaseapp.com",
  projectId: "car-service-app-c369c",
  storageBucket: "car-service-app-c369c.firebasestorage.app"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
//welcome note
const welcomeText = document.getElementById("welcomeText");

const serviceList = document.getElementById("serviceList");

let clickListenerAttached = false;


//can only access by the service-center
let currentUser = null;

let activeServicesUnsubscribe = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./index.html";
    return;
  }
  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  const userData = userSnap.data();
  welcomeText.innerText = `Welcome, ${userData.name}`;

//role protection
  if (userSnap.data().role !== "service_center") {
   showToast("Access denied", "error");
    await signOut(auth);
    window.location.href = "./index.html";
    return;
  }

  listenToActiveServices();


});

//car cache loader 
const carDataCache = {};

async function getCarText(carId) {

  if (carDataCache[carId]) return carDataCache[carId];

  const carSnap = await getDoc(doc(db, "cars", carId));

  if (!carSnap.exists()) return carId;

  const carText =
    `${carSnap.data().carNumber} - ${carSnap.data().brand} (${carSnap.data().model})`;

  carDataCache[carId] = carText;

  return carText;
}


//=======================================
//fetching the car service details
//=======================================

function listenToActiveServices() {
  if (activeServicesUnsubscribe) {
    activeServicesUnsubscribe();
  }
let unassignedDocs = [];
let assignedDocs = [];


  const unassignedQuery = query(
    collection(db, "services"),
    where("serviceStatus", "==", "pending_assignment"),
    where("assignedServiceCenterId", "==", null)
  );

  const assignedQuery = query(
    collection(db, "services"),
   where(
  "serviceStatus",
  "in",
  [
    "pending_assignment",
    "assigned",
    "job_assigned",
    "in_service",
    "pending_approval",
    "work_done"
  ]
),
    where("assignedServiceCenterId", "==", currentUser.uid)
  );




///////////////////////
async function renderBoard() {

  serviceList.innerHTML = "";

  const docs = [];

  // Priority: assigned first
  docs.push(...assignedDocs);
  docs.push(...unassignedDocs);

  if (docs.length === 0) {
  serviceList.innerHTML = `
    <li>
      <div class="empty-state">
        🚗 No active services available
      </div>
    </li>
  `;
  return;
}

  await Promise.all(docs.map(d => renderServiceDoc(d)));

}

  const unsub1 = onSnapshot(unassignedQuery, (snapshot) => {

  unassignedDocs = snapshot.docs;
  renderBoard();

});

const unsub2 = onSnapshot(assignedQuery, (snapshot) => {

  assignedDocs = snapshot.docs;
  renderBoard();

});

  activeServicesUnsubscribe = () => {
    unsub1();
    unsub2();
  };
}


 async function renderServiceDoc(d) {
  const data = d.data();
  const serviceId = d.id;
  console.log("Rendering:", serviceId, data);


  // -------------------------------
  // Car text (with cache)
  // -------------------------------
  const carText = await getCarText(data.carId);

  // -------------------------------
  // ui
  // -------------------------------



  let buttonHTML = "";

// SERVICE NOT ASSIGNED
if (!data.assignedServiceCenterId) {

  buttonHTML = `
    <button data-id="${serviceId}" data-action="service_center_assigned">
      Assign Me
    </button>
  `;

}



// SERVICE ASSIGNED TO THIS CENTER
else if (
  data.assignedServiceCenterId === currentUser.uid &&
  (data.serviceStatus === "assigned" || data.serviceStatus === "job_assigned")
) {

  // 🔥 AFTER JOB ASSIGNED → SHOW DETAILS BUTTON
  if (data.serviceStatus === "job_assigned") {
  buttonHTML = ``; // no button
} else {
    buttonHTML = `
      <button class="btn-cancel" data-id="${serviceId}" data-action="cancel">
        Cancel Assignment
      </button>

      <button data-id="${serviceId}" data-action="assign_job">
        Assign Job
      </button>
    `;
  }
}
  // -------------------------------
  // Render list item
  // -------------------------------
  const li = document.createElement("li");
li.id = `service-${serviceId}`;

// ✅ CONDITION: only show new UI after mechanic assigned
const showAdvancedUI =
  data.serviceStatus === "job_assigned" ||
  data.serviceStatus === "in_service" ||
  data.serviceStatus === "pending_approval" ||
  data.serviceStatus === "work_done";

if (showAdvancedUI) {

  li.innerHTML = `
    <div class="service-card">

      <div class="card-header">
        <span class="car-title">${carText}</span>

        <span class="see-details" data-id="${serviceId}" data-action="view">
          see details ➤➤
        </span>
      </div>

      <div class="status-wrapper">
        <div class="status-bar">
          <span class="status-text" id="status-${serviceId}">
            ${data.serviceStatus}
          </span>
        </div>
      </div>

    </div>
  `;

} else {

  // OLD STYLE UI
  li.innerHTML = `
  <div class="service-tile-old">

    <div class="tile-left">
      <div class="service-header">
        <strong>${carText}</strong>
      </div>

      <div class="service-notes">
        📝 Notes: ${data.notes || "—"}
      </div>

      <div class="service-status">
        Status: ${data.serviceStatus}
      </div>
    </div>

    <div class="tile-right">
      ${buttonHTML}
    </div>

  </div>
`;

}

  const existing = document.getElementById(`service-${serviceId}`);

if (existing) {
  existing.replaceWith(li);
} else {

  // PRIORITY 1: Assigned services (top)
  if (data.assignedServiceCenterId === currentUser.uid) {

    serviceList.prepend(li);

  } 
  // PRIORITY 2: Unassigned services (below assigned)
  else {

    const firstUnassigned = Array.from(serviceList.children).find(el =>
      !el.innerHTML.includes("Assign Me")
    );

    if (firstUnassigned) {
      firstUnassigned.before(li);
    } else {
      serviceList.appendChild(li);
    }

  }

}

// 🔥 STATUS FLIP LOGIC
function getRandomTime() {
  const hrs = Math.floor(Math.random() * 3) + 1;
  const mins = Math.floor(Math.random() * 60);
  return `${hrs}h ${mins}m remaining`;
}

if (showAdvancedUI) {

const statusEl = document.getElementById(`status-${serviceId}`);

if (statusEl) {
   statusEl.dataset.realStatus = data.serviceStatus;
  if (statusEl.dataset.timerAttached) return;
statusEl.dataset.timerAttached = "true";
  let showingStatus = true;

  setInterval(() => {

    statusEl.style.opacity = "0";
    statusEl.style.transform = "translateY(10px)";

    setTimeout(() => {
      statusEl.innerText = showingStatus
        ? getRandomTime()
         : statusEl.dataset.realStatus;

      statusEl.style.opacity = "1";
      statusEl.style.transform = "translateY(0)";
      showingStatus = !showingStatus;
    }, 300);

  }, 3000);
}
}

}
  



//logic for the completdAt and the ASSIGN to me buttons

if (!clickListenerAttached) {
  clickListenerAttached = true;

  serviceList.addEventListener("click", async (e) => {
  
    const element = e.target.closest("[data-action]");

if (!element) return;

const serviceId = element.dataset.id;
const action = element.dataset.action;

    if (!serviceId || !action) return;   
    console.log("ACTION:", action, "SERVICE:", serviceId);

    console.log("CLICK HANDLER EXECUTED");

    if (action === "assign") {
      console.log("ASSIGN CLICKED BY:", currentUser.uid);

      await updateDoc(doc(db, "services", serviceId), {
        serviceStatus: "assigned",
        assignedServiceCenterId: currentUser.uid,
        assignedAt: serverTimestamp(),
        hasMedia: false,
      });
      return;
    }


//assign job logic
if (action === "assign_job") {

  // redirect to new page (we will create next)
  window.location.href = `assign-job.html?serviceId=${serviceId}`;

  return;
}

//see detils logic
if (action === "view") {
  window.location.href = `service-details.html?serviceId=${serviceId}`;
  return;
}

    if (action === "cancel") {

  const reason = prompt("Enter reason for cancelling this service:");

  if (!reason) {
    showToast("Cancellation requires a reason.", "warning");
    return;
  }



  await updateDoc(doc(db, "services", serviceId), {
    serviceStatus: "cancelled",
    cancelReason: reason,
    cancelledBy: currentUser.uid,
    cancelledRole: "service_center",
    cancelledAt: serverTimestamp(),
    hasMedia: false
  });

  return;
}
  });
}
    


//logout

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  showToast("Logged out successfully", "success");
  window.location.href = "index.html";
});

//toast function
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");

  const toast = document.createElement("div");
  toast.classList.add("toast", `toast-${type}`);

  // 🔥 ICON LOGIC
  let icon = "";
  if (type === "success") icon = "✔";
  if (type === "error") icon = "✖";
  if (type === "warning") icon = "⚠";

  toast.innerHTML = `${icon} ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}