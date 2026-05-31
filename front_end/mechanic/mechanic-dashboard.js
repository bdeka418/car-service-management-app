import { db, auth } from "../firebase.js";

import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
  getDoc,
  addDoc,
  deleteDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";


const activeJobsList = document.getElementById("activeJobsList");
const upcomingJobsList = document.getElementById("upcomingJobsList");
let currentUser = null;


onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  listenToJobs();
  loadDashboardCounters(); 
});
//logout function
// 🔓 LOGOUT FUNCTION
const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
    alert("Logged out successfully");
    window.location.href = "../index.html";
  } catch (error) {
    console.error("Logout error:", error);
    alert("Failed to logout");
  }
});

//load jobs assigned to the mechanic
function listenToJobs() {

  const q = query(
    collection(db, "jobCards"),
    where("mechanicId", "==", currentUser.uid)
  );

onSnapshot(q, async (snapshot) => {

  activeJobsList.innerHTML = "";
  upcomingJobsList.innerHTML = "";

  if (snapshot.empty) {
    activeJobsList.innerHTML = "<p>No active jobs</p>";
    upcomingJobsList.innerHTML = "<p>No upcoming jobs</p>";
    return;
  }

  const renderPromises = snapshot.docs.map(async (docSnap) => {

      const data = docSnap.data();

      const serviceSnap = await getDoc(doc(db, "services", data.serviceId));
if (!serviceSnap.exists()) return;

const serviceData = serviceSnap.data();

let carImage = serviceData.carSnapshot?.imageUrl || "";  

data.carImageUrl = carImage;

// 🚫 REMOVE COMPLETED FROM DASHBOARD
if (data.status === "completed") return;

      const li = document.createElement("div");
li.className = "job-row";

const statusBadge = `
  <span class="job-status ${data.status}">
    ${data.status.replace("_", " ")}
  </span>
`;

const displayDate = serviceData.scheduledDate || "";
const displayTime = serviceData.scheduledTime || "";

const dateText = `
  <div class="job-date">${displayDate}</div>
  <div class="job-time">${displayTime}</div>
`;

const buttonText =
  data.status === "assigned" ? "Accept Job" :
  data.status === "accepted" ? "Start Work" :
  "View Details";

const buttonAction =
  data.status === "assigned"
    ? `acceptJob('${docSnap.id}')`
    : data.status === "accepted"
    ? `openMediaFlow('${docSnap.id}')`
    : `viewActiveService('${docSnap.id}')`;
li.innerHTML = `
<div class="job-card-row">

  <div class="job-car-image">
  <img src="${data.carImageUrl || data.imageUrl || "broken-car.png"}" alt="Car">
</div>

  <div class="job-main-info">
   <h4>${serviceData.carSnapshot?.carNumber || serviceData.carId}</h4>
<p>${serviceData.carSnapshot?.brand || ""} ${serviceData.carSnapshot?.model || ""}</p>
<small>${serviceData.selectedServiceType || "General Service"}</small>
<div class="job-location">
  📍 ${serviceData.serviceCenterSnapshot?.address || serviceData.serviceCenterSnapshot?.serviceCenterName || "Service Center"}
</div>
  </div>

  <div class="job-status-section">
    ${statusBadge}
    <small>${serviceData.notes || "No notes"}</small>
  </div>

  <div class="job-time-section">
  ${dateText}
</div>

  <div class="job-action-section">
    <button class="job-btn" onclick="${buttonAction}">
      ${buttonText}
    </button>
  </div>

</div>
`;

if (data.status === "assigned") {
  upcomingJobsList.appendChild(li);
} else {
  activeJobsList.appendChild(li);
}


    });

await Promise.all(renderPromises);

// check each section separately
if (activeJobsList.children.length === 0) {
  activeJobsList.innerHTML = "<p>No active jobs</p>";
}

if (upcomingJobsList.children.length === 0) {
  upcomingJobsList.innerHTML = "<p>No upcoming jobs</p>";
}

  });
}










//ACCEPTT JOB FUNCTION
window.acceptJob = async function(jobId) {

  await updateDoc(doc(db, "jobCards", jobId), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp() 
  });

//history function fro accepted job
const jobSnap = await getDoc(doc(db, "jobCards", jobId));
const serviceId = jobSnap.data().serviceId;

try {
  await updateDoc(doc(db, "services", serviceId), {
   history: arrayUnion({
  type: "job_accepted",
  message: "Mechanic accepted the job",
  by: currentUser.uid,
  role: "mechanic",
  timestamp: new Date(),
  jobId: jobId
})
  });
} catch (err) {
  console.error("History update failed:", err);
}
};









// ===========================
// SIDEBAR TOGGLE
// ===========================

// ===========================
// SIDEBAR TOGGLE
// ===========================

const sidebar = document.getElementById("mechanicSidebar");
const menuToggle = document.getElementById("menuToggle");
const mechanicMain = document.querySelector(".mechanic-main");

menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("closed");
    mechanicMain.classList.toggle("expanded");
    menuToggle.classList.toggle("drawer-open");
});

// START WORK FUNCTION
window.openMediaFlow = async function(jobId) {
  try {
    const jobRef = doc(db, "jobCards", jobId);

    // 1️⃣ get job first
    const jobSnap = await getDoc(jobRef);
    if (!jobSnap.exists()) return;

    const jobData = jobSnap.data();
    const serviceId = jobData.serviceId;

    // 2️⃣ update ONLY job card
    await updateDoc(jobRef, {
      status: "in_progress",
      startedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // 3️⃣ update service doc status ONLY
    await updateDoc(doc(db, "services", serviceId), {
      serviceStatus: "in_progress",
      updatedAt: serverTimestamp(),

      history: arrayUnion({
        type: "job_started",
        message: "Mechanic started working on the vehicle",
        by: currentUser.uid,
        role: "mechanic",
        timestamp: new Date(),
        jobId: jobId
      })
    });

    // DO NOT enable live here

    // 4️⃣ redirect
    window.location.href = `active-service.html?id=${jobId}`;

  } catch (err) {
    console.error("Start work failed:", err);
  }
};

window.viewActiveService = function(jobId) {
  window.location.href = `active-service.html?id=${jobId}`;
};

// DASHBOARD COUNTERS
function loadDashboardCounters() {
  if (!currentUser) return;

  const q = query(
    collection(db, "jobCards"),
    where("mechanicId", "==", currentUser.uid)
  );

  onSnapshot(q, (snapshot) => {
    let activeCount = 0;
    let upcomingCount = 0;
    let completedCount = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      if (data.status === "assigned" || data.status === "accepted") {
        upcomingCount++;
      }

      else if (data.status === "in_progress") {
        activeCount++;
      }

      else if (data.status === "completed") {
        completedCount++;
      }
    });

    document.getElementById("activeJobsCount").textContent = activeCount;
    document.getElementById("upcomingJobsCount").textContent = upcomingCount;
    document.getElementById("completedJobsCount").textContent = completedCount;
  });
}