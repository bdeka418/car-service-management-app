import { db, auth } from "../firebase.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// 🔹 GET serviceId from URL
const params = new URLSearchParams(window.location.search);
const serviceId = params.get("serviceId");

const mechanicList =
document.getElementById(
  "mechanicList"
);

const serviceDetailsCard =
document.getElementById(
  "serviceDetailsCard"
);

const assignBtn =
document.getElementById(
  "assignMechanicBtn"
);

const serviceTypeSelect =
document.getElementById(
  "serviceTypeSelect"
);

let currentUser = null;
let serviceData = null;
let selectedMechanicId = null;
let selectedMechanicData = null;
let isSubmitting = false;
// 🔐 AUTH CHECK
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  await loadService();
  await loadMechanics();
});

// 🔹 LOAD SERVICE DETAILS

async function loadService() {

  const serviceRef = doc(
    db,
    "services",
    serviceId
  );

  const serviceSnap =
  await getDoc(serviceRef);

  if (!serviceSnap.exists()) {

    alert("Service not found");

    window.location.href =
    "manage-services.html";

    return;

  }

  serviceData =
  serviceSnap.data();

  // RENDER CARD

  serviceDetailsCard.innerHTML = `

    <div class="service-vehicle">

      <img
        src="${
          serviceData.carSnapshot?.imageUrl ||
          './broken-car.png'
        }"
        class="service-vehicle-image"
      >

      <div>

        <h2>
          ${serviceData.carSnapshot?.carNumber || "N/A"}
        </h2>

        <p>
          ${serviceData.brand || ""}
          ${serviceData.model || ""}
        </p>

        <span>
          Customer:
          ${
            serviceData.ownerSnapshot?.name ||
            "Unknown"
          }
        </span>

      </div>

    </div>

    <div class="service-meta">

      <div class="service-meta-row">

        <span>
          Service Note
        </span>

        <strong>
          ${serviceData.notes || "—"}
        </strong>

      </div>
      <div class="service-meta-row">

        <span>
          Brand & Model
        </span>

        <strong>
          ${
            serviceData.carSnapshot?.brand ||
            ""
          }

          

          (${
            serviceData.carSnapshot?.model  ||
            ""
          })
        </strong>

      </div>
      <div class="service-meta-row">

        <span>
          Colour
        </span>

        <strong>
          ${serviceData.carSnapshot?.colour || ""}
        </strong>

      </div>

      <div class="service-meta-row">

        <span>
          Scheduled
        </span>

        <strong>
          ${
            serviceData.scheduledDate ||
            "No Date"
          }

          •

          ${
            serviceData.scheduledTime ||
            "No Time"
          }
        </strong>

      </div>

    </div>

  `;

}

// 🔹 LOAD SERVICE DETAILS
async function loadMechanics() {

  const q = query(
    collection(db, "users"),
    where("role", "==", "mechanic"),
    where("serviceCenterId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  mechanicList.innerHTML = "";

  let freeMechanics = [];

  for (const docSnap of snap.docs) {

    const mechanicId = docSnap.id;

    const jobQuery = query(
      collection(db, "jobCards"),
      where("mechanicId", "==", mechanicId),
      where("assignedServiceCenterId", "==", currentUser.uid),
      where("status", "in", ["assigned", "in_progress"])
    );

    const jobSnap = await getDocs(jobQuery);

    if (jobSnap.empty) {

      freeMechanics.push({
        id: mechanicId,
        data: docSnap.data()
      });

    }

  }

  // EMPTY

  if (freeMechanics.length === 0) {

    mechanicList.innerHTML = `

      <div class="empty-mechanics">

        <h3>
          No Free Mechanics
        </h3>

      </div>

    `;

    return;

  }

  // RENDER

  freeMechanics.forEach(mech => {

    const mechanicCard =
    document.createElement("div");

    mechanicCard.className =
    "mechanic-card";

    mechanicCard.innerHTML = `

      <div class="mechanic-left">

        <img
          src="./default-avatar.png"
          class="mechanic-avatar"
        >

        <div class="mechanic-info">

          <h3>
            ${mech.data.name}
          </h3>

          <p>
            General Service, Diagnostics
          </p>

          <div class="mechanic-exp">
            Exp: 5 Years
          </div>

        </div>

      </div>

      <div class="view-profile">
        View Profile →
      </div>

    `;

    // SELECT

    mechanicCard.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".mechanic-card")
          .forEach(card =>
            card.classList.remove("active")
          );

        mechanicCard.classList.add(
          "active"
        );

        selectedMechanicId = mech.id;
        selectedMechanicData = mech.data;

      }
    );

    mechanicList.appendChild(
      mechanicCard
    );

  });

}


// 🔹 START SERVICE
assignBtn.addEventListener("click", async () => {

  // 🚫 Prevent double click
  if (isSubmitting) return;
  isSubmitting = true;

  assignBtn.disabled = true;
assignBtn.innerText =
"Assigning...";


  const mechanicId =
selectedMechanicId;

const selectedServiceType =
serviceTypeSelect.value;

if(!selectedServiceType){

  alert(
    "Select service type"
  );

  return;

}

  if (!mechanicId) {
    alert("Select a mechanic");
    isSubmitting = false;
    assignBtn.disabled = false;
    assignBtn.innerText =
    "Assign Selected Mechanic";
    return;
  }

  

  try {
   

    //transaction to ensure atomicity
    await runTransaction(db, async (transaction) => {

  // 🔹 refs
  const serviceRef = doc(db, "services", serviceId);
  const jobRef = doc(collection(db, "jobCards")); // auto id
  const jobId = jobRef.id;

  // 🔹 get latest service inside transaction
  const serviceSnap = await transaction.get(serviceRef);

  if (!serviceSnap.exists()) {
    throw new Error("Service not found");
  }

  const service = serviceSnap.data();

  // 🔥 prevent duplicate assignment (IMPORTANT)
  if (service.serviceStatus === "job_assigned") {
    throw new Error("Job already assigned");
  }

  // 🔹 CREATE jobCard
transaction.set(jobRef, {
  // ===== BASIC JOB INFO =====
  jobId: jobRef.id,
  serviceId,
  carId: service.carId || "",
   carNumber: service.carSnapshot?.carNumber || service.carId || "",
  ownerId: service.ownerId,
  mechanicId,
  assignedServiceCenterId: currentUser.uid,

  status: "assigned",
  priority: "normal",

  selectedServiceType: service.selectedServiceType || "",
  notes: service.notes || "",

  createdAt: serverTimestamp(),
  assignedAt: serverTimestamp(),
  acceptedAt: null,
  startedAt: null,
  completedAt: null,
  updatedAt: serverTimestamp(),

  // ===== CUSTOMER SNAPSHOT (LIMITED - PRIVACY SAFE) =====
  customerSnapshot: {
    name: service.ownerSnapshot?.name || "",
    phone: service.ownerSnapshot?.phone || "",      // needed for service coordination
    city: service.ownerSnapshot?.city || "",
    state: service.ownerSnapshot?.state || "",
    profileImage: service.ownerSnapshot?.profileImage || ""
    // NO email
    // NO internal IDs
    // NO extra personal info
  },

  // ===== CAR SNAPSHOT =====
  carSnapshot: {
    carNumber: service.carSnapshot?.carNumber || "",
    brand: service.carSnapshot?.brand || "",
    model: service.carSnapshot?.model || "",
    variant: service.carSnapshot?.variant || "",
    year: service.carSnapshot?.year || "",
    colour: service.carSnapshot?.colour || "",
    fuelType: service.carSnapshot?.fuelType || "",
    transmission: service.carSnapshot?.transmission || "",
    mileage: service.carSnapshot?.mileage || "",
    imageUrl: service.carSnapshot?.imageUrl || ""
  },

  // ===== SERVICE SNAPSHOT =====
  serviceSnapshot: {
    serviceType: service.selectedServiceType || "",
    issueDescription: service.notes || "",
    requestedDate: service.requestedAt || null,
    scheduledDate: service.scheduledDate || "",
    scheduledTime: service.scheduledTime || ""
  },

  // ===== SERVICE CENTER SNAPSHOT =====
  serviceCenterSnapshot: {
    name: service.serviceCenterSnapshot?.serviceCenterName ||
          service.serviceCenterSnapshot?.name || "",

    phone: service.serviceCenterSnapshot?.phone || "",
    address: service.serviceCenterSnapshot?.address || "",
    city: service.serviceCenterSnapshot?.city || "",
    state: service.serviceCenterSnapshot?.state || "",
    profileImage: service.serviceCenterSnapshot?.profileImage || ""
  },

  // ===== STAGE SUMMARY =====
  stageSummary: {
    totalStages: 7,
    completedStages: 0,
    currentStage: "Vehicle Received",
    progressPercent: 0
  },

  // ===== MEDIA SUMMARY =====
  mediaSummary: {
    photoCount: 0,
    videoCount: 0,
    lastUploadAt: null
  },

  // ===== LIVE TRACKING =====
  liveTracking: {
    enabled: false,
    startedAt: null,
    startedBy: null,
    currentStage: "Vehicle Received",
    currentStageIndex: 0
  },

  // ===== FEEDBACK =====
  feedback: {
    rating: null,
    review: "",
    reviewedAt: null
  }
});
  // 🔹 UPDATE service
 transaction.update(serviceRef, {
  serviceStatus: "job_assigned",
  assignedServiceCenterId: currentUser.uid,
  serviceCenterAssignedAt: serverTimestamp(),
  mechanicAssignedAt: serverTimestamp(),
  mechanicId: mechanicId,
  selectedServiceType,

  //history

  history: arrayUnion({

  type: "mechanic_assigned",

  message:
    `Job assigned to mechanic`,

  mechanicId,

  mechanicName:
    selectedMechanicData?.name || "",

  assignedBy:
    currentUser.uid,

  assignedAt:
    new Date(),

  serviceType:
    selectedServiceType

}),

  jobCardId: jobId, 

});

});
    alert("Mechanic assigned successfully");
    // 3️⃣ REDIRECT
    window.location.replace(`manage-services.html?serviceId=${serviceId}`);

  } catch (error) {

  console.error("Transaction failed:", error);

  alert(error.message || "Failed to start service");

} finally {

    isSubmitting = false;
     assignBtn.disabled = false;           
  assignBtn.innerText = "Assign Selected Mechanic"; 
  }

});