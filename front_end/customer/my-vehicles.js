import { db, auth } from "../firebase.js";

import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  serverTimestamp,
  doc,
  getDoc, updateDoc
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
}
from
"https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";


// DOMS


const addCarBtn = document.getElementById("addCarBtn");
const carNumber = document.getElementById("carNumber");
const brand = document.getElementById("brand");
const model = document.getElementById("model");
const colour = document.getElementById("colour");
const year =
document.getElementById("year");

const variant =
document.getElementById("variant");

const mileage =
document.getElementById("mileage");

const fuelType =
document.getElementById("fuelType");

const transmission =
document.getElementById(
  "transmission"
);

const vehicleNotes =
document.getElementById(
  "vehicleNotes"
);

const activeVehicle =
document.getElementById(
  "activeVehicle"
);
const carImage = document.getElementById("carImage");
const previewImage =
document.getElementById(
  "previewImage"
);

const uploadBox =
document.getElementById(
  "uploadBox"
);

const chooseImageBtn =
document.getElementById(
  "chooseImageBtn"
);


const vehicleList = document.getElementById("vehicleList");

carImage.addEventListener(
  "change",

  
  (e) => {

    const file =
      e.target.files[0];

    if (!file) return;

    previewImage.src =
      URL.createObjectURL(file);

  }
);

// OPEN FILE PICKER

if (chooseImageBtn) {

chooseImageBtn.addEventListener(
  "click",
  () => {

    carImage.click();

  }
);
}

// DRAG OVER
if (chooseImageBtn) {
uploadBox.addEventListener(
  "dragover",
  (e) => {

    e.preventDefault();

    uploadBox.classList.add(
      "dragging"
    );

  }
);
}

// DRAG LEAVE

uploadBox.addEventListener(
  "dragleave",
  () => {

    uploadBox.classList.remove(
      "dragging"
    );

  }
);

// DROP IMAGE

uploadBox.addEventListener(
  "drop",
  (e) => {

    e.preventDefault();

    uploadBox.classList.remove(
      "dragging"
    );

    const file =
      e.dataTransfer.files[0];

    if (!file) return;

    carImage.files =
      e.dataTransfer.files;

    previewImage.src =
      URL.createObjectURL(file);

  }
);
// For search functionality
const vehicleSearch =
document.getElementById(
  "vehicleSearch"
);

// GLOBALS
let allCars = [];
let currentUser = null;

let editingVehicleId = null;
let existingImagePath = null;

const storage =
  getStorage();

// AUTH
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  currentUser = user;

  await loadDrawerProfile(user.uid);

  const userSnap = await getDoc(
    doc(db, "users", user.uid)
  );

  const userData = userSnap.data();

  if (userData.role !== "customer") {

    showToast("Access denied", "error");

    window.location.href = "../index.html";

    return;
  }

 

  await loadCars();

    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "add") {
      vehicleModal.classList.add("show");
    }
  

});


// // LOGOUT
// document.getElementById("logoutBtn")
// .addEventListener("click", async () => {

//   await signOut(auth);

//   window.location.href = "../index.html";

// });


// ADD CAR
addCarBtn.addEventListener("click", async () => {

 const missingFields = [];

if (!brand.value.trim()) {
  missingFields.push("Brand");
}

if (!model.value.trim()) {
  missingFields.push("Model");
}

if (!year.value.trim()) {
  missingFields.push("Year");
}

if (!carNumber.value.trim()) {
  missingFields.push(
    "Registration Number"
  );
}

if (!colour.value.trim()) {
  missingFields.push("Colour");
}

if (!fuelType.value.trim()) {
  missingFields.push("Fuel Type");
}

if (!transmission.value.trim()) {
  missingFields.push(
    "Transmission"
  );
}

if (
  !editingVehicleId &&
  !carImage.files[0]
) {

  missingFields.push(
    "Vehicle Image"
  );

}

if (missingFields.length > 0) {

  showToast(
    `Please fill: ${missingFields.join(", ")}`,
    "warning"
  );

  return;
}

  try {

    const imageFile =
  carImage.files[0];

let imageUrl = null;

let imagePath = null;

    const existingQuery = query(
      collection(db, "cars"),
      where("ownerId", "==", currentUser.uid),
      where(
        "carNumber",
        "==",
        carNumber.value.trim().toUpperCase()
      )
    );

    const existingSnap =
      await getDocs(existingQuery);

    if (
  !editingVehicleId &&
  !existingSnap.empty
) {

      showToast(
        "Vehicle already exists",
        "warning"
      );

      return;
    }

    // Upload image to Storage

    if (imageFile) {

  if (
    editingVehicleId &&
    existingImagePath
  ) {

    try {

      await deleteObject(
        ref(
          storage,
          existingImagePath
        )
      );

    }

    catch (err) {

      console.error(
        "Old image delete skipped"
      );

    }

  }

  const safeFileName =
`${Date.now()}_${imageFile.name}`;

  const imageRef = ref(
    storage,
`cars/${currentUser.uid}/${safeFileName}`
  );

  await uploadBytes(
    imageRef,
    imageFile
  );

  imageUrl =
    await getDownloadURL(
      imageRef
    );

  imagePath =
    imageRef.fullPath;

}



// Save car data to Firestore
const vehicleData = {

  ownerId:
    currentUser.uid,

  carNumber:
    carNumber.value
      .trim()
      .toUpperCase(),

  brand:
    brand.value.trim(),

  model:
    model.value.trim(),

  year:
    year.value
      ? Number(year.value)
      : null,

  variant:
    variant.value.trim(),

  colour:
    colour.value.trim(),

  mileage:
    mileage.value
      ? Number(mileage.value)
      : 0,

  fuelType:
    fuelType.value,

  transmission:
    transmission.value,

  notes:
    vehicleNotes.value.trim(),

  isActive:
    activeVehicle.checked

};

if (imageUrl) {

  vehicleData.imageUrl =
    imageUrl;

  vehicleData.imagePath =
    imagePath;

}

  if (editingVehicleId) {

  await updateDoc(
    doc(
      db,
      "cars",
      editingVehicleId
    ),
    vehicleData
  );

  showToast(
    "Vehicle updated successfully",
    "success"
  );

  resetVehicleForm();

vehicleModal.classList.remove(
  "show"
);

loadCars();

}

else {

  await setDoc(

  doc(
    db,
    "cars",
    carNumber.value
      .trim()
      .toUpperCase()
  ),

  {
    ...vehicleData,

    status: "active",

    deleted: false,

    deletedAt: null,

    createdAt:
      serverTimestamp()
  }

);

    showToast(
      "Vehicle added successfully",
      "success"
    );

 resetVehicleForm();

    loadCars();

    vehicleModal.classList.remove(
  "show"
);

  }

}  catch (err) {

    console.log(err);

    showToast(
      "Failed to add vehicle",
      "error"
    );

  }

});


// LOAD VEHICLES
async function loadCars() {

  vehicleList.innerHTML = "";

  const q = query(
    collection(db, "cars"),
    where("ownerId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

 allCars = [];

 const servicesQuery = query(
  collection(db, "services"),
  where(
    "ownerId",
    "==",
    currentUser.uid
  )
);

const servicesSnap =
await getDocs(servicesQuery);

const latestServiceMap = {};

servicesSnap.forEach((serviceDoc) => {

  const service =
    serviceDoc.data();

  const carNumber =
    service.carSnapshot?.carNumber;

  if (!carNumber) return;

  const currentTime =
    service.createdAt?.seconds || 0;

  if (
    !latestServiceMap[carNumber] ||
    currentTime >
    latestServiceMap[carNumber].time
  ) {

    latestServiceMap[carNumber] = {

      status:
        service.serviceStatus,

      time:
        currentTime

    };

  }

});

snap.forEach((docSnap) => {
  allCars.push(docSnap);
});

  const visibleCars =
allCars.filter(
  (docSnap) =>
    !docSnap.data().deleted
);

document.getElementById(
  "totalVehicles"
).innerText =
  visibleCars.length;

let activeCount = 0;
let inactiveCount = 0;
let inServiceCount = 0;

document.getElementById(
  "activeVehicles"
).innerText = 0;

document.getElementById(
  "inactiveVehicles"
).innerText = 0;

document.getElementById(
  "dueVehicles"
).innerText = 0;

  if (visibleCars.length === 0) {

    vehicleList.innerHTML = `
      <div class="empty-state">
        No vehicles added yet
      </div>
    `;

    return;
  }

  allCars.forEach((docSnap) => {

    const car = docSnap.data();

    if (car.deleted) return;
//status badge logic
const latestStatus =
latestServiceMap[
  car.carNumber
]?.status;

let vehicleBadge =
"Active";

if (!car.isActive) {

  vehicleBadge =
  "Inactive";

}

else if (
  [
  "pending_assignment",
  "assigned",
  "job_assigned",
  "in_service",
  "pending_approval",
  "work_done"
].includes(latestStatus)
) {

  vehicleBadge =
  "In Service";

}

    if (vehicleBadge === "Active") {

  activeCount++;

}

else if (
  vehicleBadge === "In Service"
) {

  inServiceCount++;

}

else {

  inactiveCount++;

}

    const div = document.createElement("div");

    div.className =
  "vehicle-card";

div.innerHTML = `

<div class="vehicle-image-wrapper">

  <img
    src="${
      car.imageUrl ||
      "./broken-car.png"
    }"
    class="vehicle-card-image"
  >

  <div class="vehicle-top-actions">

  <span class="
vehicle-status
${
  vehicleBadge === "Inactive"
  ? "inactive"
  : vehicleBadge === "In Service"
  ? "in-service"
  : ""
}
">
    ${vehicleBadge}
  </span>

  <div class="vehicle-menu-wrapper">

    <button class="vehicle-menu-btn">
      ⋮
    </button>

    <div class="vehicle-menu">
    <button
  type="button"
  class="edit-vehicle-btn"
>
  Edit
</button>

      <button
  class="mark-inactive-btn"
  ${
    vehicleBadge === "In Service"
    ? "disabled"
    : ""
  }
>
        ${car.isActive
          ? "Mark Inactive"
          : "Mark Active"}
      </button>

      <button class="delete-vehicle-btn">
        Delete Vehicle
      </button>

    </div>

  </div>

</div>

</div>

<div class="vehicle-card-body">

  <h3 class="vehicle-card-title">
    ${car.brand} ${car.model}
  </h3>

  <div class="vehicle-number">
    ${car.carNumber}
  </div>

  <div class="vehicle-meta">

    <div class="vehicle-meta-item">
      <small>Year</small>
      <p>${car.year || "N/A"}</p>
    </div>

    <div class="vehicle-meta-item">
      <small>Fuel Type</small>
      <p>${car.fuelType || "N/A"}</p>
    </div>

    <div class="vehicle-meta-item">
      <small>Transmission</small>
      <p>${car.transmission || "N/A"}</p>
    </div>

  </div>

  <div class="vehicle-meta">

    <div class="vehicle-meta-item">
      <small>Colour</small>
      <p>${car.colour || "N/A"}</p>
    </div>

    <div class="vehicle-meta-item">
      <small>Odometer Reading</small>
      <p>${car.mileage || 0} km</p>
    </div>

    <div class="vehicle-meta-item">
      <small>Variant</small>
      <p>${car.variant || "N/A"}</p>
    </div>

  </div>

 
  <!-- EXPANDABLE DETAILS -->

  <div class="vehicle-expanded-details">

    <div class="expanded-grid">

      

      <div class="expanded-item">
        <small>Brand</small>
        <p>${car.brand}</p>
      </div>

      <div class="expanded-item">
        <small>Model</small>
        <p>${car.model}</p>
      </div>

      <div class="expanded-item">
        <small>Year</small>
        <p>${car.year || "N/A"}</p>
      </div>

      <div class="expanded-item">
        <small>Fuel Type</small>
        <p>${car.fuelType || "N/A"}</p>
      </div>

      <div class="expanded-item">
        <small>Transmission</small>
        <p>${car.transmission || "N/A"}</p>
      </div>

      <div class="expanded-item">
        <small>Colour</small>
        <p>${car.colour || "N/A"}</p>
      </div>

      <div class="expanded-item">
        <small>Odometer Reading</small>
        <p>${car.mileage || 0} km</p>
      </div>

      <div class="expanded-item">
        <small>Variant</small>
        <p>${car.variant || "N/A"}</p>
      </div>

    </div>

    <div class="expanded-notes">

      <small>Notes</small>

      <p>
        ${car.notes || "No notes added"}
      </p>

    </div>

    </div>

 <div class="vehicle-actions">

    <button class="history-btn">
      View History
    </button>

    <button class="details-btn">
      View Details
    </button>

  </div>


  </div>

</div>
`;
    vehicleList.appendChild(div);
    //3dot menu logic
    const menuBtn =
div.querySelector(".vehicle-menu-btn");

const menu =
div.querySelector(".vehicle-menu");

menuBtn.addEventListener(
  "click",
  (e) => {

    e.stopPropagation();

    menu.classList.toggle(
      "show"
    );

  }
);
menu.addEventListener(
  "click",
  (e) => e.stopPropagation()
);


//edit button logic
const editBtn =
div.querySelector(
  ".edit-vehicle-btn"
);

editBtn.addEventListener(
  "click",
  (e) => {

    e.stopPropagation();

    editingVehicleId =
      car.carNumber;

    existingImagePath =
      car.imagePath || null;

    vehicleModal.classList.add(
      "show"
    );

    document.querySelector(
      ".vehicle-modal-header h2"
    ).innerText =
      "Edit Vehicle";

    addCarBtn.innerText =
      "Save Changes";

    carNumber.value =
      car.carNumber;

    brand.value =
      car.brand || "";

    model.value =
      car.model || "";

    year.value =
      car.year || "";

    variant.value =
      car.variant || "";

    colour.value =
      car.colour || "";

    mileage.value =
      car.mileage || "";

    fuelType.value =
      car.fuelType || "";

    transmission.value =
      car.transmission || "";

    vehicleNotes.value =
      car.notes || "";

    activeVehicle.checked =
      car.isActive;

    previewImage.src =
      car.imageUrl ||
      "./fortuner.png";

    carNumber.disabled = true;

    menu.classList.remove(
      "show"
    );

  }
);

//active/inactive toggle logic

const inactiveBtn =
div.querySelector(
  ".mark-inactive-btn"
);

inactiveBtn.addEventListener(
  "click",
  async (e) => {

  e.stopPropagation();

  if (vehicleBadge === "In Service") {

  showToast(
    "Vehicle is currently in service",
    "warning"
  );

  return;

}

    const confirmChange =
    confirm(
      car.isActive
      ? "Inactive vehicles cannot start services. Continue?"
      : "Mark vehicle active?"
    );

    if (!confirmChange) return;

    await updateDoc(
      doc(
        db,
        "cars",
        car.carNumber
      ),
      {
        isActive:
          !car.isActive
      }
    );

    showToast(
      car.isActive
      ? "Vehicle marked inactive"
      : "Vehicle marked active",
      "success"
    );
//STOP RELOAD PAGE 
    car.isActive = !car.isActive;

if (!car.isActive) {

  vehicleBadge = "Inactive";

}
else {

  vehicleBadge = "Active";

}

const statusBadge =
div.querySelector(
  ".vehicle-status"
);

statusBadge.innerText =
vehicleBadge;

statusBadge.className =
"vehicle-status";

if (vehicleBadge === "Inactive") {

  statusBadge.classList.add(
    "inactive"
  );

}

else if (
  vehicleBadge === "In Service"
) {

  statusBadge.classList.add(
    "in-service"
  );

}

inactiveBtn.innerText =
car.isActive
? "Mark Inactive"
: "Mark Active";

  }
);

//delte logic
const deleteBtn =
div.querySelector(
  ".delete-vehicle-btn"
);

deleteBtn.addEventListener(
  "click",
  async (e) => {

  e.stopPropagation();

    const confirmed =
    confirm(
      "Delete this vehicle permanently?"
    );

    if (!confirmed) return;

    // Delete image from Storage if exists

    if (car.imagePath) {

  try {

    await deleteObject(
      ref(
        storage,
        car.imagePath
      )
    );

  }

  catch(err) {

    console.error(err);

  }

}

    await updateDoc(
      doc(
        db,
        "cars",
        car.carNumber
      ),
      {
        deleted: true,
        deletedAt:
          serverTimestamp()
      }
    );

    showToast(
      "Vehicle deleted",
      "success"
    );

    loadCars();

  }
);

//history button logic
const historyBtn =
div.querySelector(".history-btn");

historyBtn.addEventListener(
  "click",
  () => {

    window.location.href =
`./service-history.html?carNumber=${encodeURIComponent(car.carNumber)}&from=my-vehicles`;

  }
);

    const detailsBtn =
div.querySelector(".details-btn");

const expandedSection =
div.querySelector(
  ".vehicle-expanded-details"
);

detailsBtn.addEventListener(
  "click",
  () => {

    expandedSection.classList.toggle(
      "show-expanded"
    );

    detailsBtn.innerText =
      expandedSection.classList.contains(
        "show-expanded"
      )
      ? "Hide Details"
      : "View Details";

  }
);

  });

  document.getElementById(
  "activeVehicles"
).innerText = activeCount;

document.getElementById(
  "inactiveVehicles"
).innerText = inactiveCount;

document.getElementById(
  "dueVehicles"
).innerText = inServiceCount;
}

//listerner for search functionality
vehicleSearch.addEventListener(
  "input",
  () => {

    const search =
    vehicleSearch.value
    .toLowerCase()
    .trim();

    document
    .querySelectorAll(".vehicle-card")
    .forEach((card) => {

      const text =
      card.innerText.toLowerCase();

      card.style.display =
      text.includes(search)
      ? "inline-block"
      : "none";

    });

  }
);


// TOAST
function showToast(message, type = "success") {

  const container =
    document.getElementById("toastContainer");

  const toast =
    document.createElement("div");

  toast.classList.add(
    "toast",
    `toast-${type}`
  );

  toast.innerText = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);

}

/* =========================
   DRAWER
========================= */

const menuToggle =
  document.getElementById(
    "menuToggle"
  );

const mobileDrawer =
  document.getElementById(
    "mobileDrawer"
  );

const sidebarOverlay =
  document.getElementById(
    "sidebarOverlay"
  );

const vehiclesPage =
  document.getElementById(
    "vehiclesPage"
  );

menuToggle.addEventListener(
  "click",
  () => {

    const isOpen =
      mobileDrawer.classList.toggle(
        "open"
      );

    sidebarOverlay.classList.toggle(
      "show"
    );

    vehiclesPage.classList.toggle(
      "drawer-open",
      isOpen
    );

    menuToggle.classList.toggle(
      "drawer-open",
      isOpen
    );

  }
);

sidebarOverlay.addEventListener(
  "click",
  () => {

    mobileDrawer.classList.remove(
      "open"
    );

    sidebarOverlay.classList.remove(
      "show"
    );

    vehiclesPage.classList.remove(
      "drawer-open"
    );

    menuToggle.classList.remove(
      "drawer-open"
    );

  }
);
//reset form and preview on modal close



function resetVehicleForm(){

  editingVehicleId = null;

existingImagePath = null;

carNumber.disabled = false;

addCarBtn.innerText =
  "Add Vehicle";

document.querySelector(
  ".vehicle-modal-header h2"
).innerText =
  "Add New Vehicle";


  carNumber.value = "";
  brand.value = "";
  model.value = "";
  colour.value = "";

  year.value = "";
  variant.value = "";
  mileage.value = "";

  fuelType.selectedIndex = 0;
  transmission.selectedIndex = 0;

  vehicleNotes.value = "";

  activeVehicle.checked = true;

  carImage.value = "";

  previewImage.src =
  "./fortuner.png";

}

/* =========================
   MODAL
========================= */

const vehicleModal =
  document.getElementById(
    "vehicleModal"
  );

 


const openVehicleModal =
  document.getElementById(
    "openVehicleModal"
  );

const closeVehicleModal =
  document.getElementById(
    "closeVehicleModal"
  );

const cancelVehicleModal =
document.getElementById(
  "cancelVehicleModal"
);

openVehicleModal
.addEventListener(
  "click",
  () => {

    vehicleModal.classList.add(
      "show"
    );

  }
);





closeVehicleModal
.addEventListener(
  "click",
  () => {

    vehicleModal.classList.remove(
      "show"
    );

    resetVehicleForm();

  }
);

cancelVehicleModal
.addEventListener(
  "click",
  () => {

    vehicleModal.classList.remove(
      "show"
    );

    resetVehicleForm();

  }
);

vehicleModal
.addEventListener(
  "click",
  (e) => {

    if (
      e.target === vehicleModal
    ) {

      vehicleModal.classList.remove(
        "show"
      );
      resetVehicleForm();
    }

  }
);

async function loadDrawerProfile(userId){

  try{

    const userRef =
    doc(db,"users",userId);

    const userSnap =
    await getDoc(userRef);

    if(!userSnap.exists()) return;

    const userData =
    userSnap.data();

    const avatar =
    document.getElementById(
      "drawerUserAvatar"
    );

    const name =
    document.getElementById(
      "drawerUserName"
    );

    if(name){

      name.textContent =
      userData.name || "User";

    }

    if(
      avatar &&
      userData.name
    ){

      avatar.textContent =
      userData.name.charAt(0)
      .toUpperCase();

    }

  }catch(err){

    console.error(
      "Drawer profile error:",
      err
    );

  }

}

document.addEventListener(
  "click",
  () => {

    document
      .querySelectorAll(
        ".vehicle-menu"
      )
      .forEach((menu) => {

        menu.classList.remove(
          "show"
        );

      });

  }
);

//logout

const logoutBtn =
document.getElementById(
  "logoutBtn"
);

if(logoutBtn){

  logoutBtn.addEventListener(
    "click",
    async()=>{

      try{

        await signOut(auth);

        window.location.href =
        "./login.html";

      }catch(err){

        console.error(err);

      }

    }
  );

}