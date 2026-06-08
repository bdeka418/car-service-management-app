
import { auth , db } from "../firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
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
  deleteDoc, arrayUnion, arrayRemove

} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";



const firebaseConfig = {
  apiKey: "AIzaSyBf_wiFJv5K-wHZdPKGjx48dAIwYCE36rw",
  authDomain: "car-service-app-c369c.firebaseapp.com",
  projectId: "car-service-app-c369c",
  storageBucket: "car-service-app-c369c.firebasestorage.app"
};




//welcome note
const welcomeText = document.getElementById("welcomeText");

const serviceList = document.getElementById("serviceList");

const upcomingBookingsList =
document.getElementById(
  "upcomingBookingsList"
);

let clickListenerAttached = false;

const carDataCache = {};

//can only access by the service-center
let currentUser = null;

let activeServicesUnsubscribe = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {

    if (!window.location.href.includes("index.html")) {
      window.location.href = "../index.html";
    }
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
    window.location.href = "../index.html";
    return;
  }

  listenToActiveServices();
  listenToDashboardStats();
  
  

});


//car cache loader 

async function getCarText(carId) {

  if (carDataCache[carId]) return carDataCache[carId];

  const carSnap = await getDoc(doc(db, "cars", carId));

  if (!carSnap.exists()) return carId;

  const carText =
    `${carSnap.data().carNumber} - ${carSnap.data().brand} (${carSnap.data().model})`;

  carDataCache[carId] = carText;

  return carText;
}

// =======================================
// DASHBOARD STATS
// =======================================

function listenToDashboardStats() {

  const servicesRef = query(
  collection(db, "services"),
  where(
    "assignedServiceCenterId",
    "==",
    currentUser.uid
  ),
    where("serviceStatus", "in", [       // ✅ match your Firestore rules exactly
      "assigned",
      "job_assigned",
      "in_service",
      "pending_approval",
      "work_done",
      "completed",
      "cancelled"
    ])
);
  onSnapshot(
    servicesRef,
    (snapshot) => {

      let totalServices = 0;

      let activeServices = 0;

      let completedServices = 0;

      let totalRevenue = 0;

      snapshot.docs.forEach((docSnap) => {

        const data = docSnap.data();

        totalServices++;

        // ACTIVE
        if (
          [
            "assigned",
            "job_assigned",
            "in_service",
            "pending_approval",
            "work_done"
          ].includes(data.serviceStatus)
        ) {

          activeServices++;

        }

        // COMPLETED
        if (
          data.serviceStatus ===
          "completed"
        ) {

          completedServices++;

        }

        // REVENUE
        totalRevenue +=
          Number(data.totalAmount || 0);

      });

      // =========================
      // UPDATE UI
      // =========================

      document.getElementById(
        "totalServicesCount"
      ).innerText =
      totalServices;

      document.getElementById(
        "activeServicesCount"
      ).innerText =
      activeServices;

      document.getElementById(
        "completedServicesCount"
      ).innerText =
      completedServices;

      document.getElementById(
        "totalRevenue"
      ).innerText =
      `₹${totalRevenue}`;

    }
  );

}

//=======================================
//fetching the car service details
//=======================================

function listenToActiveServices() {
  if (activeServicesUnsubscribe) activeServicesUnsubscribe();

  let unassignedDocs = [];
  let assignedDocs = [];
  let renderTimeout = null;

  // ✅ Track which snapshots have fired at least once
  let unassignedReady = false;
  let assignedReady = false;

  const unassignedQuery = query(
    collection(db, "services"),
    where("serviceStatus", "==", "pending_assignment"),
    where("assignedServiceCenterId", "==", null)
  );

  const assignedQuery = query(
    collection(db, "services"),
    where("serviceStatus", "in", [
      "assigned", "job_assigned", "in_service",
      "pending_approval", "work_done"
    ]),
    where("assignedServiceCenterId", "==", currentUser.uid)
  );

  async function renderBoard() {
    // ✅ Wait until BOTH snapshots have fired at least once
    if (!unassignedReady || !assignedReady) return;

    serviceList.innerHTML = "";
    upcomingBookingsList.innerHTML = "";

    const uniqueDocsMap = new Map();

    // unassigned first so assigned can override if same ID
    [...unassignedDocs, ...assignedDocs].forEach(docSnap => {
      uniqueDocsMap.set(docSnap.id, docSnap);
    });

    const uniqueDocs = Array.from(uniqueDocsMap.values());

    // Empty upcoming bookings state
    const pendingBookings = uniqueDocs.filter(
      d => d.data().serviceStatus === "pending_assignment"
    );

    if (pendingBookings.length === 0) {
      upcomingBookingsList.innerHTML = `
        <div class="empty-bookings">
          <div class="empty-icon">📅</div>
          <h3>No Upcoming Bookings</h3>
          <p>New service requests will appear here.</p>
        </div>
      `;
    }

    // Empty active services state
    const activeServices = uniqueDocs.filter(
      d => d.data().serviceStatus !== "pending_assignment"
    );

    if (activeServices.length === 0) {
      serviceList.innerHTML = `
        <li><div class="empty-state">🚗 No active services available</div></li>
      `;
    }

    // ✅ Render ALL docs (both pending and active)
    await Promise.all(uniqueDocs.map(d => renderServiceDoc(d)));
  }

  const unsub1 = onSnapshot(unassignedQuery, (snapshot) => {
    unassignedDocs = snapshot.docs;
    unassignedReady = true;        // ✅ mark ready
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(renderBoard, 50);
  });

  const unsub2 = onSnapshot(assignedQuery, (snapshot) => {
    assignedDocs = snapshot.docs;
    assignedReady = true;          // ✅ mark ready
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(renderBoard, 50);
  });

  activeServicesUnsubscribe = () => { unsub1(); unsub2(); };
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

const carSnap = await getDoc(
  doc(db, "cars", data.carId)
);

const carData =
carSnap.exists()
? carSnap.data()
: {};

const imageUrl =
carData.imageUrl ||
"./broken-car.png";

const carName =
`${carData.brand || ""} ${carData.model || ""}`;

const serviceDate =
data.scheduledDate || "No Date";

const serviceTime =
data.scheduledTime || "No Time";

const note =
data.notes || "Regular Service";

li.className = "service-booking-item";

li.innerHTML = `

  <div class="booking-card">

    <!-- LEFT -->

    <div class="booking-left">

      <img
        src="${imageUrl}"
        alt="vehicle"
      >

      <div class="booking-info">

        <h4>
          ${carData.carNumber || data.carId}
        </h4>

        <p class="car-name">
          ${carName}
        </p>

        <p class="booking-time">
          📅 ${serviceDate}
          •
          🕒 ${serviceTime}
        </p>

        <p class="booking-note">
          🔧 ${note}
        </p>

      </div>

    </div>

    <!-- RIGHT -->

    <div class="booking-right">

      <span class="booking-status">

        ${data.serviceStatus
          .replaceAll("_"," ")}

      </span>

      <div class="booking-actions">

        ${buttonHTML}

      </div>

    </div>

  </div>

`;

  

// ====================================
// UPCOMING BOOKINGS
// ====================================

if(

  data.serviceStatus ===
  "pending_assignment"

){

  upcomingBookingsList.appendChild(li);

}

// ====================================
// ACTIVE SERVICES
// ====================================

else{

  serviceList.appendChild(li);

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

  document.addEventListener("click", async (e) => {
  
    const element = e.target.closest("[data-action]");

if (!element) return;

const serviceId = element.dataset.id;
const action = element.dataset.action;

    if (!serviceId || !action) return;   
    console.log("ACTION:", action, "SERVICE:", serviceId);

    console.log("CLICK HANDLER EXECUTED");

    if (
  action ===
  "service_center_assigned"
) {
      console.log("ASSIGN CLICKED BY:", currentUser.uid);

    // ===============================
// SERVICE CENTER SNAPSHOT
// ===============================

const serviceCenterSnap =
await getDoc(
  doc(
    db,
    "users",
    currentUser.uid
  )
);

const serviceCenterData =
serviceCenterSnap.data();



// ===============================
// UPDATE SERVICE
// ===============================

await updateDoc(
  doc(db, "services", serviceId),
  {

    // =========================
    // STATUS
    // =========================

    serviceStatus: "assigned",

    assignedServiceCenterId:
    currentUser.uid,

    assignedAt:
    serverTimestamp(),

    hasMedia: false,

    // =========================
    // SERVICE CENTER SNAPSHOT
    // =========================

    serviceCenterSnapshot: {

      id:
      currentUser.uid,

      serviceCenterName:
       serviceCenterData.serviceCenterName || "",

      name:
      serviceCenterData.name || "",

      email:
      serviceCenterData.email || "",

      phone:
      serviceCenterData.phone || "",

      address:
      serviceCenterData.address || "",

      city:
      serviceCenterData.city || "",

      state:
      serviceCenterData.state || "",

      profileImage:
      serviceCenterData.profileImage || ""

    },

    // =========================
    // HISTORY EVENT
    // =========================

    history: arrayUnion({

      action:
      "service_center_assigned",

      at:
      new Date(),

      by:
      currentUser.uid,

      role:
      "service_center",

      note:
      `${serviceCenterData.name} accepted the service request`,

      meta: {

        serviceCenterName:
        serviceCenterData.name || "",

        serviceCenterPhone:
        serviceCenterData.phone || ""

      }

    })

  }
);

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
    

// ===============================
// LOGOUT
// ===============================

const logoutBtn =
document.getElementById(
  "logoutBtn"
);

logoutBtn.addEventListener(
  "click",
  async () => {

    try{

      // disable multiple clicks
      logoutBtn.disabled = true;

      logoutBtn.innerText =
      "Logging out...";

      // signout
      await signOut(auth);

      // toast
      showToast(
        "Logged out successfully",
        "success"
      );

      // small delay for UX
      setTimeout(() => {

        window.location.href =
        "../index.html";

      },1200);

    }

    catch(error){

      console.error(error);

      showToast(
        "Logout failed",
        "error"
      );

      logoutBtn.disabled = false;

      logoutBtn.innerText =
      "Logout";

    }

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

// =======================================
// SIDEBAR TOGGLE
// =======================================

const serviceLayout =
document.querySelector(
  ".service-layout"
);

const menuToggle =
document.getElementById(
  "menuToggle"
);

menuToggle.addEventListener(
  "click",
  () => {

    // desktop
    if(window.innerWidth > 768){

      serviceLayout.classList.toggle(
        "sidebar-collapsed"
      );

    }

    // mobile
    else{

      serviceLayout.classList.toggle(
        "mobile-sidebar-open"
      );

    }

  }
);

