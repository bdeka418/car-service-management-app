import { db, auth } from "../firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  query,
  where,
  getDocs,
  updateDoc,
  onSnapshot,
  arrayUnion,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

let currentUser = null;

// 🔐 Auth + role protection
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  if (!userSnap.exists() || userSnap.data().role !== "service_center") {
    window.location.href = "index.html";
    return;
  }

  initializePage(user);
});

// =======================
// INIT
// =======================
function initializePage(user) {
  loadServices(user);
}

// =======================
// LOAD SERVICES
// =======================
async function loadServices(user) {

  const container = document.getElementById("servicesContainer");

  const q = query(
    collection(db, "services"),
    where("assignedServiceCenterId", "==", user.uid),
where("serviceStatus", "in", [
  "job_assigned",
  "in_progress",
  "pending_approval",
  "work_done"
])  );

 onSnapshot(q, async (snapshot) => {

  container.innerHTML = "";

  for (const docSnap of snapshot.docs) {

    const data = docSnap.data();
    const serviceId = docSnap.id;

   let carInfo = "Unknown";

if (data.carSnapshot) {
  carInfo = `${data.carSnapshot.carNumber} - ${data.carSnapshot.brand} (${data.carSnapshot.model})`;
}

    const div = document.createElement("div");
    div.className = "service-card";

    div.innerHTML = `
      <h4>${carInfo}</h4>
      <p><b>Note:</b> ${data.notes || "-"}</p>
      <p>
  <b>Status:</b> 
  ${
    data.serviceStatus === "in_progress" ? "🟡 In Progress" :
    data.serviceStatus === "pending_approval" ? "🟠 Pending Approval" :
    data.serviceStatus === "work_done" ? "🔵 Work Verified" :
    data.serviceStatus
  }
</p>

      <div id="mech-${serviceId}"></div>
      <div id="media-${serviceId}"></div>

${data.serviceStatus === "pending_approval" ? `        <button onclick="approveWork('${serviceId}')" style="background:green;color:white">
          Approve
        </button>

        <button onclick="rejectWork('${serviceId}')" style="background:orange;color:white">
          Reject
        </button>
      ` : ""}

      ${data.cancelRequested ? `
        <div style="margin-top:10px;">
          <p style="color:red;">
            Cancel Requested: ${data.cancelReason}
          </p>

          <button onclick="approveCancel('${serviceId}')" style="background:red;color:white">
            Accept Cancel
          </button>

          <button onclick="rejectCancel('${serviceId}')" style="background:gray;color:white">
            Reject Cancel
          </button>
        </div>
      ` : ""}

      ${data.serviceStatus === "work_done" ? `
        <button onclick="completeService('${serviceId}')">
          Complete Service
        </button>
      ` : ""}

      <hr>
    `;

    container.appendChild(div);

    loadMechanicsForService(serviceId);
    loadMediaPreview(serviceId);
  }
});
}

// =======================
// LOAD MECHANICS
// =======================
async function loadMechanicsForService(serviceId) {

  const container = document.getElementById(`mech-${serviceId}`);

  const q = query(
    collection(db, "jobCards"),
    where("serviceId", "==", serviceId),
    where("assignedServiceCenterId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    container.innerHTML = "No mechanic assigned";
    return;
  }

  let html = "<b>Mechanics:</b><br>";

  for (const docSnap of snap.docs) {

    const data = docSnap.data();

    const mechSnap = await getDoc(doc(db, "users", data.mechanicId));

    const name = mechSnap.exists() ? mechSnap.data().name : "Unknown";

    html += `• ${name} → ${data.status}<br>`;
  }

  container.innerHTML = html;
}

// =======================
// MEDIA PREVIEW
// =======================
async function loadMediaPreview(serviceId) {

  const container = document.getElementById(`media-${serviceId}`);
  if (!container) return;
container.innerHTML = `<span style="font-size:12px;">Loading media...</span>`;


  const snap = await getDocs(
    collection(db, "services", serviceId, "media")
  );

  let before = [], during = [], after = [];

  snap.forEach(doc => {
    const data = doc.data();

    if (data.stage === "before") before.push(data.url);
    if (data.stage === "during") during.push(data.url);
    if (data.stage === "after") after.push(data.url);
  });

 let html = `<div style="margin-top:10px;"></div>`;

// show only if images exist
if (before.length > 0) {
  html += `<div style="margin-bottom:10px;"><b>Before:</b><br>${renderImages(before)}</div>`;
}

if (during.length > 0) {
  html += `<div style="margin-bottom:10px;"><b>During:</b><br>${renderImages(during)}</div>`;
}

if (after.length > 0) {
  html += `<div style="margin-bottom:10px;"><b>After:</b><br>${renderImages(after)}</div>`;
}

// if no images at all → hide entire section
if (html === "") {
  container.style.display = "none";
} else {
  container.style.display = "block";
  container.innerHTML = html;
}
}

function renderImages(list) {
  return list.map(url =>
    `<img src="${url}" style="width:60px;margin-right:5px;">`
  ).join("");
}

// =======================
// COMPLETE SERVICE
// =======================
window.completeService = async function(serviceId) {

  try {

    await runTransaction(db, async (transaction) => {

      const serviceRef = doc(db, "services", serviceId);
      const serviceSnap = await transaction.get(serviceRef);

      if (!serviceSnap.exists()) {
        throw new Error("Service not found");
      }

      const service = serviceSnap.data();

      // 🔹 update service
      transaction.update(serviceRef, {
        serviceStatus: "completed",
        completedAt: serverTimestamp(),

        history: arrayUnion({
          action: "completed",
          by: currentUser.uid,
          role: "service_center",
          at: serverTimestamp()
        })
      });

      // 🔹 update jobCard (single target)
      if (!service.jobCardId) {
  throw new Error("Missing jobCardId → data inconsistency");
}
      const jobRef = doc(db, "jobCards", service.jobCardId);

      transaction.update(jobRef, {
        status: "completed",
        updatedAt: serverTimestamp()
      });

    });

    alert("✅ Service fully completed");

  } catch (error) {
    console.error("Complete failed:", error);
    alert("Failed to complete service");
  }
};

// =======================
// CANCEL SERVICE
// =======================
window.cancelService = async function(serviceId) {

  const reason = prompt("Enter cancel reason");
  if (!reason) return;

  await updateDoc(doc(db, "services", serviceId), {
    serviceStatus: "cancelled",
    cancelReason: reason,
    cancelledAt: serverTimestamp(),
    cancelledBy: currentUser.uid
  });

  alert("Cancelled");
};

//approve work
window.approveWork = async function(serviceId) {

  try {

    await runTransaction(db, async (transaction) => {

      const serviceRef = doc(db, "services", serviceId);
      const serviceSnap = await transaction.get(serviceRef);

      if (!serviceSnap.exists()) {
        throw new Error("Service not found");
      }

      const service = serviceSnap.data();

      // 🔹 update service
      transaction.update(serviceRef, {
        serviceStatus: "work_done",
        rejectionReason: null,
        approvedAt: serverTimestamp(),

        history: arrayUnion(
          {
            action: "approved",
            by: currentUser.uid,
            role: "service_center",
            at: serverTimestamp()
          },
          {
            action: "work_done",
            by: currentUser.uid,
            role: "service_center",
            at: serverTimestamp()
          }
        )
      });

     // 🔥 SINGLE TARGET UPDATE (NO QUERY)
     if (!service.jobCardId) {
  throw new Error("Missing jobCardId → data inconsistency");
}
      const jobRef = doc(db, "jobCards", service.jobCardId);

      transaction.update(jobRef, {
       status: "work_done",
        updatedAt: serverTimestamp(),
        rejectionReason: null
      });

    });

    alert("Work approved. Ready for completion.");

  } catch (error) {
    console.error("Approval failed:", error);
    alert(error.message || "Failed to approve work");  }
};

//reject work
window.rejectWork = async function(serviceId) {

  const reason = prompt("Enter rejection reason");
  if (!reason) return;

  try {

    await runTransaction(db, async (transaction) => {

      const serviceRef = doc(db, "services", serviceId);
      const serviceSnap = await transaction.get(serviceRef);

      if (!serviceSnap.exists()) {
        throw new Error("Service not found");
      }

      const service = serviceSnap.data();

      // 🔹 update service
      transaction.update(serviceRef, {
        serviceStatus: "in_progress",
        rejectionReason: reason,

        history: arrayUnion({
          action: "rejected",
          reason: reason,
          by: currentUser.uid,
          role: "service_center",
          at: serverTimestamp()
        })
      });

      // 🔹 update jobCard
      if (!service.jobCardId) {
  throw new Error("Missing jobCardId → data inconsistency");
}
      const jobRef = doc(db, "jobCards", service.jobCardId);

      transaction.update(jobRef, {
        status: "in_progress",
        rejectionReason: reason,
        updatedAt: serverTimestamp()
      });

    });

    alert("Work rejected → back to mechanic");

  } catch (error) {
    console.error("Reject failed:", error);
    alert("Reject failed");
  }
};
//approve cancel

window.approveCancel = async function(serviceId) {

  try {

    await runTransaction(db, async (transaction) => {

      const serviceRef = doc(db, "services", serviceId);
      const serviceSnap = await transaction.get(serviceRef);

      if (!serviceSnap.exists()) {
        throw new Error("Service not found");
      }

      const service = serviceSnap.data();

      // 🔹 update service
      transaction.update(serviceRef, {
        serviceStatus: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelApproved: true,

        history: arrayUnion({
          action: "cancelled",
          by: currentUser.uid,
          role: "service_center",
          at: serverTimestamp()
        })
      });

      // 🔹 update jobCard
      if (!service.jobCardId) {
  throw new Error("Missing jobCardId → data inconsistency");
}
      const jobRef = doc(db, "jobCards", service.jobCardId);

      transaction.update(jobRef, {
        status: "cancelled",
        updatedAt: serverTimestamp()
      });

    });

    alert("Service cancelled");

  } catch (error) {
    console.error("Cancel failed:", error);
    alert("Cancel failed");
  }
};

//reject cancel
window.rejectCancel = async function(serviceId) {

  await updateDoc(doc(db, "services", serviceId), {
    cancelRequested: false,
    cancelReason: null
  });

  alert("Cancel request rejected");
};