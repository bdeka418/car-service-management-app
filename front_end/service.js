import { db,auth } from "./firebase.js";
import { collection, addDoc, serverTimestamp, doc, getDoc , query, where, getDocs, updateDoc, setDoc } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

console.log("service.js loaded");

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";


// 🔐 Protect page + role check
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  const role = userSnap.data().role;

if (!userSnap.exists()) {
  console.log("User doc missing");
  window.location.href = "index.html";
  return;
}

  if (role !== "service_center") {
    window.location.href = "dashboard.html";
    return;
  }

  console.log("Authorized service center:", user.email);

  // ✅ NOW SAFE TO USE auth.currentUser
  initializePage(user);   // 👈 call your main logic here
});
async function createJobCard( serviceId, customerId, ownerId, carNumber, notes, mechanicId){

  console.log("ACTUAL jobCard:", {
  serviceId,
  ownerId: customerId || ownerId,
  carNumber,
  notes,
  mechanicId,
  assignedServiceCenterId: auth.currentUser.uid,
  status: "assigned"
});

console.log("AUTH UID (token):", auth.currentUser.uid);
console.log("SENDING UID:", auth.currentUser.uid);
  try {
    const jobData = {
  serviceId,
  ownerId,
  carNumber,
  notes,
  mechanicId,
  assignedServiceCenterId: auth.currentUser.uid,
  status: "assigned",
  createdAt: serverTimestamp()
};

console.log("FINAL OBJECT SENT:", JSON.stringify(jobData, null, 2));

await addDoc(collection(db, "jobCards"), jobData);

    console.log("Job card created");
    return true;   // ✅ IMPORTANT

  } catch (error) {
    console.error("Error creating job card:", error);
    return false;  // ❌ FAIL SAFE
  }
}

function initializePage(user) {
  console.log("User UID:", user.uid);

loadServices(user);
  // Later:
  // fetch services
  // show UI
}

//add mechanic logic
window.addMechanic = async function () {

  // ======== prevent spam clicks =============
   const btn = document.querySelector("button");
  btn.disabled = true; 


  const name = document.getElementById("mechName").value;
  const email = document.getElementById("mechEmail").value;

  if (!name || !email) {
    console.log("Fill all fields");
    return;
  }



  try {
// 🔐 UNIQUE EMAIL LOCK
const emailRef = doc(db, "unique_emails", email.toLowerCase());

try {
  await setDoc(emailRef, {
    createdAt: serverTimestamp(),
    serviceCenterId: auth.currentUser.uid
  });

} catch (error) {
  console.log("Duplicate email blocked:", error);
  alert("Mechanic with this email already exists");
  btn.disabled = false;
  return;
}


  
    await addDoc(collection(db, "users"), {
      name: name,
      email,
      role: "mechanic",
      serviceCenterId: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });

    console.log("Mechanic added");

document.getElementById("mechName").value = "";
document.getElementById("mechEmail").value = "";
  } catch (error) {
    console.error("Error adding mechanic:", error);
  }
  btn.disabled = false; 
};

async function loadMechanics(user) {

  const mechList = document.getElementById("mechanicSelect");

  try {
    const q = query(
      collection(db, "users"),
      where("role", "==", "mechanic"),
      where("serviceCenterId", "==", user.uid)
    );

    const snapshot = await getDocs(q);

    mechList.innerHTML = '<option value="">Select Mechanic</option>';

    snapshot.forEach(doc => {
      const data = doc.data();

      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = data.name + " (" + data.email + ")";

      mechList.appendChild(option);
    });

    console.log("Mechanics loaded");

  } catch (error) {
    console.error("Error loading mechanics:", error);
  }
}

async function loadServices(user) {

  const container = document.getElementById("servicesContainer");

  try {
    const q = query(
  collection(db, "services"),
  where("serviceStatus", "==", "in_progress"),
  where("assignedServiceCenterId", "==", null)
);

    const snapshot = await getDocs(q);

    container.innerHTML = "";

    let mechanicsHTML = "";

const mechQuery = query(
  collection(db, "users"),
  where("role", "==", "mechanic"),
  where("serviceCenterId", "==", user.uid)
);

const mechSnap = await getDocs(mechQuery);

mechSnap.forEach(doc => {
  const data = doc.data();
  mechanicsHTML += `<option value="${doc.id}">
    ${data.name} (${data.email})
  </option>`;
});
   for (const docSnap of snapshot.docs) {

  const data = docSnap.data();

  // 🔥 FETCH CAR DATA
  const carRef = doc(db, "cars", data.carId);
  const carSnap = await getDoc(carRef);

  let carInfo = "Unknown Car";

  if (carSnap.exists()) {
    const car = carSnap.data();
    carInfo = `${data.carId} - ${car.brand} (${car.model})`;
  }

  const div = document.createElement("div");
  div.className = "service-card";

  div.innerHTML = `
    <h4>${carInfo}</h4>
    <p>Note: ${data.notes || "No notes provided"}</p>

    <select id="mech-${docSnap.id}">
      <option value="">Select Mechanic</option>
      ${mechanicsHTML}
    </select>

   <button onclick="assignMechanic(
  '${docSnap.id}', 
  '${data.ownerId}', 
  '${data.carId}', 
  '${(data.notes || "").replace(/\n/g, " ")}'
)">
      Assign
    </button>

    <hr>
  `;

  container.appendChild(div);
}
    console.log("Services loaded");

  } catch (error) {
    console.error("Error loading services:", error);
  }
}
//assign mechanic logic
window.assignMechanic = async function(serviceId, customerId, carNumber,notes) {

  const select = document.getElementById(`mech-${serviceId}`);
  const mechanicId = select.value;

console.log("AUTH UID:", auth.currentUser.uid);
console.log("SELECTED MECH ID:", mechanicId);

const mechRef = doc(db, "users", mechanicId);
const mechSnap = await getDoc(mechRef);
console.log("MECH DATA:", mechSnap.data());

  if (!mechanicId) {
    console.log("Select a mechanic");
    return;
  }
if (!auth.currentUser) {
  console.log("Auth not ready");
  return;
}
  try {
    // 1️⃣ Create job card
    // 1️⃣ Create job card
const jobCreated = await createJobCard(
  serviceId,
  customerId,
  customerId,
  carNumber,
  notes,
  mechanicId
);

// ❌ STOP if failed
if (!jobCreated) {
  console.log("Job card failed → stopping assignment");
  return;
}

// 2️⃣ Update service ONLY if job created
await updateDoc(doc(db, "services", serviceId), {
  serviceStatus: "assigned",
  assignedServiceCenterId: auth.currentUser.uid,
  assignedAt: serverTimestamp()
});

    console.log("Service assigned");

    // Reload services
    loadServices(auth.currentUser);

  } catch (error) {
    console.error("Error assigning mechanic:", error);
  }
}

