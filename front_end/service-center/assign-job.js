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
  runTransaction 
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// 🔹 GET serviceId from URL
const params = new URLSearchParams(window.location.search);
const serviceId = params.get("serviceId");

const mechanicSelect = document.getElementById("mechanicSelect");
const serviceInfo = document.getElementById("serviceInfo");
const startBtn = document.getElementById("startServiceBtn");
const availableMechanicsDiv = document.getElementById("availableMechanics");

let currentUser = null;
let serviceData = null;
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

  const serviceRef = doc(db, "services", serviceId);
  const snap = await getDoc(serviceRef);

  if (!snap.exists()) {
    alert("Service not found");
    return;
  }

  serviceData = snap.data();

  // 🔥 FETCH CAR DETAILS
  const carRef = doc(db, "cars", serviceData.carId);
  const carSnap = await getDoc(carRef);

  let carHTML = "";

if (carSnap.exists()) {
  const car = carSnap.data();

  serviceData.carNumber = car.carNumber;
  serviceData.brand = car.brand;
  serviceData.model = car.model;

  carHTML = `
    <p><strong>Car Number:</strong> ${car.carNumber}</p>
    <p><strong>Brand:</strong> ${car.brand}</p>
    <p><strong>Model:</strong> ${car.model}</p>
    <p><strong>Color:</strong> ${car.colour}</p>
  `;
} else {
  serviceData.carNumber = serviceData.carId;
  serviceData.brand = "";
  serviceData.model = "";

  carHTML = `
    <p><strong>Car Number:</strong> ${serviceData.carId}</p>
  `;
}

serviceInfo.innerHTML = `
  ${carHTML}
  <p><strong>Notes:</strong> ${serviceData.notes || "—"}</p>
`;
}

// 🔹 LOAD FREE MECHANICS
async function loadMechanics() {

  const q = query(
    collection(db, "users"),
    where("role", "==", "mechanic"),
    where("serviceCenterId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  mechanicSelect.innerHTML = `<option value="">Select Mechanic</option>`;
  availableMechanicsDiv.innerHTML = "";

  // 🔥 Store free mechanics
  let freeMechanics = [];

  // 🔁 CHECK EACH MECHANIC
  for (const docSnap of snap.docs) {

    const mechanicId = docSnap.id;

    const jobQuery = query(
      collection(db, "jobCards"),
      where("mechanicId", "==", mechanicId),
       where("assignedServiceCenterId", "==", currentUser.uid),
      where("status", "in", ["assigned", "in_progress"])
    );

    const jobSnap = await getDocs(jobQuery);

    // ✅ ONLY FREE MECHANICS
    if (jobSnap.empty) {
      freeMechanics.push({
        id: mechanicId,
        data: docSnap.data()
      });
    }
  }

  // ❌ NO FREE MECHANICS
  if (freeMechanics.length === 0) {
    availableMechanicsDiv.innerHTML = `
      <p style="color:gray; font-style:italic;">
        No active mechanic available
      </p>
    `;
    mechanicSelect.disabled = true;
    return;
  }

  // ✅ SHOW FREE MECHANICS
  freeMechanics.forEach(mech => {

    // 🔽 Dropdown
    const option = document.createElement("option");
    option.value = mech.id;
    option.textContent = mech.data.name;
    mechanicSelect.appendChild(option);

    // 🔥 UI CARD
    const mechItem = document.createElement("div");
    mechItem.classList.add("mechanic-card");

    const avatar = document.createElement("div");
    avatar.classList.add("mechanic-avatar");
    avatar.innerText = mech.data.name.charAt(0).toUpperCase();

    const name = document.createElement("div");
    name.classList.add("mechanic-name");
    name.innerText = mech.data.name;

    mechItem.appendChild(avatar);
    mechItem.appendChild(name);

    availableMechanicsDiv.appendChild(mechItem);
  });

  mechanicSelect.disabled = false;
}


// 🔹 START SERVICE
startBtn.addEventListener("click", async () => {

  // 🚫 Prevent double click
  if (isSubmitting) return;
  isSubmitting = true;

  startBtn.disabled = true;
  startBtn.innerText = "Starting...";

  const mechanicId = mechanicSelect.value;

  if (!mechanicId) {
    alert("Select a mechanic");
    isSubmitting = false;
    startBtn.disabled = false;
    startBtn.innerText = "Start Service";
    return;
  }

  

  try {
    console.log({
  serviceId,
  ownerId: serviceData.ownerId,
  mechanicId,
  assignedServiceCenterId: currentUser.uid,
  carNumber: serviceData.carNumber,
  status: "assigned"
});

if (!serviceData.carNumber) {
  alert("carNumber missing ❌");
  console.error("carNumber undefined:", serviceData);
  return;
}

// 🚨 VALIDATION (ADD THIS)
if (!serviceData.carNumber || typeof serviceData.carNumber !== "string") {
  alert("Invalid carNumber ❌");
  console.error("carNumber issue:", serviceData);
  return;
}

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
    serviceId,
    ownerId: service.ownerId,
    mechanicId,
    assignedServiceCenterId: currentUser.uid,
   carNumber: service.carSnapshot?.carNumber || "",
brand: service.carSnapshot?.brand || "",
model: service.carSnapshot?.model || "",
notes: service.notes || "",

    status: "assigned",
    createdAt: serverTimestamp()
  });

  // 🔹 UPDATE service
 transaction.update(serviceRef, {
  serviceStatus: "job_assigned",
  assignedServiceCenterId: currentUser.uid,
  serviceCenterAssignedAt: serverTimestamp(),
  mechanicAssignedAt: serverTimestamp(),
  mechanicId: mechanicId,

  jobCardId: jobId, 

  carSnapshot: {
   carNumber: service.carSnapshot?.carNumber || serviceData.carNumber,
    brand: serviceData.brand || "Unknown",
    model: serviceData.model || "Unknown"
  }
});

});
    alert("Service started successfully");
    // 3️⃣ REDIRECT
    window.location.replace(`manage-services.html?serviceId=${serviceId}`);

  } catch (error) {

  console.error("Transaction failed:", error);

  alert(error.message || "Failed to start service");

} finally {

    isSubmitting = false;
    startBtn.disabled = false;
    startBtn.innerText = "Start Service";
  }

});