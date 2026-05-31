import { db, auth } from "../firebase.js";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp,
  doc,
  getDoc,
  onSnapshot
}  
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";


const expandedServices = new Set();
let currentStatusFilter = "all";

const drawerUserName =
document.getElementById(
  "drawerUserName"
);

const drawerUserAvatar =
document.getElementById(
  "drawerUserAvatar"
);


const activeServiceList = document.getElementById("activeServiceList");
const carSelect = document.getElementById("carSelect");
const serviceNotes = document.getElementById("serviceNotes"); 
const scheduledDate = document.getElementById("scheduledDate");

const scheduledTime = document.getElementById("scheduledTime");
scheduledDate.min =
  new Date()
    .toISOString()
    .split("T")[0];
const createServiceBtn = document.getElementById("createServiceBtn");
  //priority
const priorityOrder = {

  pending_assignment: 1,

  assigned: 2,

  job_assigned: 3,

  in_service: 4,

  pending_approval: 5,

  work_done: 6

};

/* =========================
   MOBILE DRAWER
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

const servicesPage =
document.getElementById(
  "servicesPage"
);

menuToggle.addEventListener(
  "click",
  ()=>{

    const isOpen =
    mobileDrawer.classList.toggle(
      "open"
    );

    sidebarOverlay.classList.toggle(
      "show",
      isOpen
    );

    servicesPage.classList.toggle(
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
  ()=>{

    mobileDrawer.classList.remove(
      "open"
    );

    sidebarOverlay.classList.remove(
      "show"
    );

    servicesPage.classList.remove(
      "drawer-open"
    );

    menuToggle.classList.remove(
  "drawer-open"
);

  }
);

let currentRole
let currentUser
const carDataCache = {};
// 🔐 Auth check
onAuthStateChanged(auth, async (user) => {

  if (!user) {
   window.location.href = "../index.html";
  }
  else {
    currentUser = user;

    const userSnap = await getDoc(doc(db, "users", user.uid));
    currentRole = userSnap.data().role;
    const userData = userSnap.data();
   
    drawerUserName.innerText =
userData.name || "User";

drawerUserAvatar.innerText =
(
  userData.name?.charAt(0) || "U"
).toUpperCase();

    //role guard
 if (currentRole !== "customer") {
    showToast("Access denied", "error");
    window.location.href = "../index.html";
    return;
  }


  const statusFilter =
document.getElementById("statusFilter");

if(statusFilter){

statusFilter.addEventListener(
"change",
(e)=>{

currentStatusFilter =
e.target.value;

listenToCustomerServices();

});

}

 await loadCars(); 
 await loadCarOptions();
listenToCustomerServices();

    }
});

async function loadCars() {

  const q = query(
    collection(db, "cars"),
    where("ownerId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach(d => {

    carDataCache[d.id] = d.data();

  });

}
//load car options in the dropdown
async function loadCarOptions() {

  carSelect.innerHTML = "";

  const placeholder =
    new Option("Select Vehicle", "");

  placeholder.disabled = true;
  placeholder.selected = true;

  carSelect.appendChild(placeholder);

  const q = query(
    collection(db, "cars"),
    where("ownerId", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach((docSnap) => {

    const car = docSnap.data();

    const option =
      new Option(
        `${car.carNumber} - ${car.brand}`,
        docSnap.id
      );

    carSelect.appendChild(option);

  });

}

// 🚪 Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  showToast("Logged out successfully", "success");
  window.location.href = "../index.html";
});

// ------CREATE SERVICE----
createServiceBtn.addEventListener("click", async () => {
  if (!carSelect.value) {
    showToast("Please register a car before creating a service", "warning");
    return;
  }

  if (!serviceNotes.value.trim()) {
    showToast("Please add service notes", "warning");
    return;  
  }
  if (!scheduledDate.value) {

  showToast(
    "Please select a service date",
    "warning"
  );

  return;

}
  if (!scheduledTime.value) {

  showToast(
    "Please select a service time",
    "warning"
  );

  return;

}

  //check: is this car already in service?

  const activeServiceQuery = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid),
    where(
  "carSnapshot.carNumber",
  "==",
  carSelect.value
),
    where("serviceStatus", "in", [
  "pending_assignment",
  "assigned",
  "job_assigned",
  "in_service",
  "pending_approval",
  "work_done"
])
  );

  const activeSnap = await getDocs(activeServiceQuery);

  if (!activeSnap.empty) {
    showToast("This car is already under service. Please wait until it is completed.", "warning");
     serviceNotes.value = "";
    return;
  }


  try {

    const selectedCar =
  carDataCache[carSelect.value];

if (!selectedCar) {

  showToast(
    "Car data not found",
    "error"
  );

  return;

}//inactive car check
const carSnap =
await getDoc(
  doc(db, "cars", carSelect.value)
);

const carData =
carSnap.data();

if (!carData.isActive) {

  showToast(
    "Vehicle is inactive. Activate it first.",
    "warning"
  );

  return;

}

//user data

const userDoc =
await getDoc(
  doc(
    db,
    "users",
    currentUser.uid
  )
);

const currentUserData =
userDoc.exists()
? userDoc.data()
: {};

    await addDoc(
  collection(db, "services"),
  {

    ownerId: currentUser.uid,

    carId: carSelect.value,

    carSnapshot: {

  brand:
    selectedCar.brand || "",

  model:
    selectedCar.model || "",

  carNumber:
    selectedCar.carNumber || "",

  colour:
    selectedCar.colour || "",

  imageUrl:
    selectedCar.imageUrl || "",

  fuelType:
    selectedCar.fuelType || "",

  mileage:
    selectedCar.mileage || "",

  transmission:
    selectedCar.transmission || "",

  variant:
    selectedCar.variant || "",

  year:
    selectedCar.year || "",

  isActive:
    selectedCar.isActive || false,

  ownerId:
    selectedCar.ownerId || ""

},

ownerSnapshot: {

  name:
    currentUserData.name || "",

  phone:
    currentUserData.phone || "",

  email:
    currentUserData.email || "",

  profileImage:
    currentUserData.profileImage || "",

  city:
    currentUserData.city || "",

  state:
    currentUserData.state || ""

},
assignedServiceCenterId: null,

liveEnabled: false,

liveStartedAt: null,

liveStartedBy: null,


    notes:
      serviceNotes.value,

    scheduledDate:
      scheduledDate.value,

    scheduledTime:
      scheduledTime.value || null,

    serviceStatus:
      "pending_assignment",

    assignedServiceCenterId:
      null,

    createdAt:
      serverTimestamp(),

    requestedAt:
      serverTimestamp(),

   history: [
{
action: "service_requested",

at: new Date(),

clientAt: new Date(),

by: currentUser.uid,

role: "customer"
}
]

});
    showToast("Service created", "success");

    serviceNotes.value = "";
    scheduledDate.value = "";
    scheduledTime.value = "";
    carSelect.selectedIndex = 0;



  }catch (err) {
  console.log(err);
    showToast("Failed to create service", "error");
  }
});


//timeline builder function:

function buildServiceTimeline(data) {

  const format = (ts) => {

  if (!ts) return "";

  const date =
    ts.seconds
      ? new Date(ts.seconds * 1000)
      : new Date(ts);

  return date.toLocaleString("en-GB", {
    hour12: true
  });

};

  const history = data.history || [];

  if (history.length === 0) {

    return `
      <div style="margin-top:10px;">
        No timeline available
      </div>
    `;

  }

  let html = `
    <div style="
      margin-top:10px;
      font-size:14px;
    ">
  `;

  history.forEach((item, index) => {

    const isLast =
      index === history.length - 1;

    let color = "#6c757d";

    const action = item.action || "";
    if (
      action.includes("approved") ||
      action.includes("completed")
    ) {
      color = "#28a745";
    }

    if (
      action.includes("reject") ||
      action.includes("cancel")
    ) {
      color = "#dc3545";
    }

    if (
      action.includes("started")
    ) {
      color = "#17a2b8";
    }

    html += `

      <div style="
        display:flex;
        gap:10px;
      ">

        <div style="
          display:flex;
          flex-direction:column;
          align-items:center;
        ">

          <div style="
            width:16px;
            height:16px;
            border-radius:50%;
            background:${color};
          "></div>

          ${
            !isLast
            ? `
              <div style="
                width:2px;
                height:24px;
                background:#ccc;
              "></div>
            `
            : ""
          }

        </div>

        <div style="padding-bottom:10px;">

          <div style="
            font-weight:bold;
            color:${color};
          ">
           ${action
  .replaceAll("_", " ")
  .replace(/\b\w/g, c => c.toUpperCase())}
          </div>

          <div style="
            font-size:12px;
            color:#666;
          ">
            ${format(item.at)}
          </div>

          <div style="
            font-size:12px;
            color:#888;
          ">
            ${item.role || "system"}
          </div>

        </div>

      </div>
    `;

  });

  html += `</div>`;

  return html;

}


//service timeline builder function
function buildStageProgress(stages) {

  const icon = (done) => done ? "✔" : "◯";

  return `
    <div style="margin-top:8px; font-size:13px;">

      <div><strong> Service Documentation </strong></div>

      <div>${icon(stages.before)} Before Repair</div>

      <div>${icon(stages.during)} During Repair</div>

      <div>${icon(stages.after)} After Repair</div>

    </div>
  `;
}

function formatDate(ts){

if(!ts) return "Not Available";

const date =
ts.seconds
? new Date(ts.seconds * 1000)
: new Date(ts);

return date.toLocaleDateString(
"en-GB",
{
day:"2-digit",
month:"2-digit",
year:"numeric"
}
) + " • " +
date.toLocaleTimeString(
"en-GB",
{
hour:"2-digit",
minute:"2-digit"
}
);

}


// list services
let unsubscribeServices = null;
 function listenToCustomerServices() {

  if(unsubscribeServices){

unsubscribeServices();

}

  const q = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid)
  );

  unsubscribeServices = onSnapshot(
q,
async (snap) => {

    activeServiceList.innerHTML = "";
  

    if (snap.empty) {
      activeServiceList.innerHTML = `
  <li>
    <div class="empty-state">No active services</div>
  </li>
`;
      return;
    }

  const servicesArray = snap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .sort((a, b) => {

    const pA = priorityOrder[a.serviceStatus] || 99;
    const pB = priorityOrder[b.serviceStatus] || 99;

    if (pA !== pB) return pA - pB;

    const getTime = (s) => {

      let t = s.createdAt?.seconds || 0;

      if (s.assignedAt?.seconds) {
        t = s.assignedAt.seconds;
      }

      if (s.completedAt?.seconds) {
        t = s.completedAt.seconds;
      }

      if (s.cancelledAt?.seconds) {
        t = s.cancelledAt.seconds;
      }

      return t;
    };

    return getTime(b) - getTime(a);

  });

let hasActiveServices = false;
   for (const data of servicesArray) {


const li = document.createElement("li");

li.id = `service-${data.id}`;

  const carData = carDataCache[data.carId];

const carText = carData
  ? `${carData.carNumber} - ${carData.brand} (${carData.model})`
  : "Unknown car";

  const statusClass =
data.serviceStatus === "pending_assignment"
? "badge-pending"
:
data.serviceStatus === "assigned"
? "badge-assigned"
:
data.serviceStatus === "in_service"
? "badge-progress"
:
"badge-completed";

li.innerHTML = `

<div class="service-card">

<div class="service-card-top">

<!-- LEFT -->

<div class="service-left">

<div class="service-icon">
🚘
</div>

<div>

<div class="service-car-title">
${carText}
</div>

<div class="service-meta">

<div>
Service Notes:
${data.notes || "—"}
</div>

<div>
📅 Scheduled:
${
data.scheduledDate
? new Date(data.scheduledDate)
.toLocaleDateString("en-GB")
: "Not Set"
}
${data.scheduledTime ? `• ${data.scheduledTime}` : ""}
</div>

</div>

<div class="service-status">

<span class="service-badge ${statusClass}">
${data.serviceStatus.replaceAll("_"," ")}
</span>

</div>

</div>

</div>

<!-- TIMELINE -->

<div class="service-timeline">

<div class="timeline-track">

<div class="timeline-step active">
<div class="timeline-circle">✓</div>
<div class="timeline-label">Requested</div>
</div>

<div class="timeline-step ${
[
"assigned",
"job_assigned",
"in_service",
"completed"
].includes(data.serviceStatus)
? "active"
: ""
}">
<div class="timeline-circle">✓</div>
<div class="timeline-label">Assigned</div>
</div>

<div class="timeline-step ${
["in_service","completed"]
.includes(data.serviceStatus)
? "active"
: ""
}">
<div class="timeline-circle">✓</div>
<div class="timeline-label">In Progress</div>
</div>

<div class="timeline-step ${
data.serviceStatus === "completed"
? "completed"
: ""
}">
<div class="timeline-circle">✓</div>
<div class="timeline-label">Completed</div>
</div>

</div>

</div>

<!-- RIGHT -->

<div class="service-right">

<div class="service-created">

<div><strong>Created On</strong></div>

<div>
${formatDate(data.createdAt)}
</div>

</div>

<div class="service-actions">

<button
class="service-btn details-btn"
onclick="toggleServiceDetails('${data.id}')"
>
${
expandedServices.has(data.id)
? "Hide Details"
: "View Details"
}
</button>

${
data.liveEnabled === true
?
`
<button
class="service-btn live-btn"
onclick="openLiveTracking('${data.id}')"
>
View Live
</button>
`
:
""
}

${
data.serviceStatus === "pending_assignment"
||
data.serviceStatus === "assigned"
?
`
<button
class="service-btn cancel-btn-service"
onclick="cancelService('${data.id}')"
>
Cancel
</button>
`
:
""
}

</div>

</div>

</div>

<div
id="serviceDetails-${data.id}"
class="
service-expanded-details
${
expandedServices.has(data.id)
? "show-expanded"
: ""
}
"
>
</div>

</div>
`;

if (
  data.serviceStatus === "completed" ||
  data.serviceStatus === "cancelled"
) {
  continue;
}

if(

currentStatusFilter !== "all"

&&

data.serviceStatus !== currentStatusFilter

){

continue;

}

hasActiveServices = true;

activeServiceList.appendChild(li);


}
  });
}

//media loader funtion

async function loadMedia(serviceId) {


  try {

    const mediaSnap = await getDocs(
      collection(db, "services", serviceId, "media")
    );

const stages = {
  before: [],
  during: [],
  after: []
};

mediaSnap.forEach((doc) => {
  const data = doc.data();
  const stage = data.stage || "during";

  stages[stage].push(data.url);
});

const beforeContainer =
document.getElementById(
`beforeMedia-${serviceId}`
);

const duringContainer =
document.getElementById(
`duringMedia-${serviceId}`
);

const afterContainer =
document.getElementById(
`afterMedia-${serviceId}`
);

function renderImages(
container,
images
){

if(!container) return;

container.innerHTML = "";

if(images.length === 0){

container.innerHTML = `
<div class="empty-media">
No Images
</div>
`;

return;
}

images.forEach(url=>{

const img =
document.createElement("img");

img.src = url;

img.style.cursor = "pointer";

img.addEventListener("click", () => {

const modal =
document.getElementById("imageModal");

const modalImg =
document.getElementById("modalImage");

modal.style.display = "block";

modalImg.src = url;

});

container.appendChild(img);

});

}

renderImages(
beforeContainer,
stages.before
);

renderImages(
duringContainer,
stages.during
);

renderImages(
afterContainer,
stages.after
);


  } catch (err) {
    console.log("Media load failed", err);
  }

}
const modal =
  document.getElementById("imageModal");

const closeBtn =
  document.querySelector(".image-close");

if (closeBtn) {

  closeBtn.onclick = () => {
    modal.style.display = "none";
  };

}

window.onclick = (event) => {

  if (event.target === modal) {
    modal.style.display = "none";
  }

};
//canel service function
async function cancelService(serviceId) {

  const confirmCancel = confirm(
    "Cancel this service request?"
  );

  if (!confirmCancel) return;

  const reason = prompt(
    "Enter cancellation reason:"
  );

  if (!reason) {

    showToast(
      "Reason required",
      "warning"
    );

    return;
  }

  try {
    const serviceRef =
  doc(db, "services", serviceId);

const serviceSnap =
  await getDoc(serviceRef);

const serviceData =
  serviceSnap.data();

    await updateDoc(
      serviceRef,
      {
        serviceStatus: "cancelled",
        cancelReason: reason,
        cancelledRole: "customer",
        cancelledBy: currentUser.uid,
        cancelledAt: serverTimestamp(),

        history: [
  ...(serviceData.history || []),
  {
    action: "service_cancelled",

    at: new Date(),

    clientAt: new Date(),

    by: currentUser.uid,

    role: "customer"
  }
]
      }
    );

    showToast(
      "Service cancelled",
      "success"
    );

  }

  catch (err) {

    console.log(err);

    showToast(
      "Cancellation failed",
      "error"
    );

  }

}

window.cancelService = cancelService;

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


//service details toggle
window.toggleServiceDetails =
async function(serviceId){

const detailsContainer =
document.getElementById(
`serviceDetails-${serviceId}`
);

if(!detailsContainer) return;

const isExpanded =
expandedServices.has(serviceId);

if(isExpanded){

  expandedServices.delete(serviceId);

  detailsContainer.classList.remove(
    "show-expanded"
  );

  detailsContainer.innerHTML = "";



  return;
}

expandedServices.add(serviceId);

detailsContainer.classList.add(
  "show-expanded"
);

detailsContainer.innerHTML = `
<div class="expanded-loading">
Loading service details...
</div>
`;

await renderExpandedServiceDetails(
  serviceId,
  detailsContainer
);



};

//details renderer

async function renderExpandedServiceDetails(
serviceId,
container
){

 const serviceRef =
doc(db, "services", serviceId);

const serviceSnap =
await getDoc(serviceRef);

if(!serviceSnap.exists()) return;

const serviceData =
serviceSnap.data();

const history =
serviceData.history || [];

const timelineStages = [

{
  key: "service_requested",
  title: "Service Requested"
},

{
  key: "service_center_assigned",
  title: "Service Center Assigned"
},

{
  key: "mechanic_assigned",
  title: "Mechanic Assigned"
},

{
  key: "work_started",
  title: "Work Started"
},

{
  key: "service_completed",
  title: "Service Completed"
}

];

const timelineHTML =
timelineStages.map(stage=>{

const historyItem =
history.find(
h => h.action === stage.key
);

return `

<div class="
expanded-stage-item
${historyItem ? "active" : ""}
">

<div class="expanded-stage-dot"></div>

<div>

<h4>
${stage.title}
</h4>

<p>

${
historyItem
? formatDate(
historyItem.at ||
historyItem.clientAt
)
: "Pending"
}

</p>

</div>

</div>

`;

}).join("");

container.innerHTML = `

<div class="service-media show-media">

<div class="service-progress-card">

<h3>
Service Progress
</h3>

<div class="expanded-stage-timeline">

${timelineHTML}

</div>

</div>

<div class="media-stage-card">

<div class="media-stage-header">

<div class="media-stage-title">
Before Service
</div>

</div>

<div
class="media-images"
id="beforeMedia-${serviceId}"
>
</div>

</div>

<div class="media-stage-card">

<div class="media-stage-header">

<div class="media-stage-title">
During Service
</div>

</div>

<div
class="media-images"
id="duringMedia-${serviceId}"
>
</div>

</div>

<div class="media-stage-card">

<div class="media-stage-header">

<div class="media-stage-title">
After Service
</div>

</div>

<div
class="media-images"
id="afterMedia-${serviceId}"
>
</div>

</div>

</div>
`;

await loadMedia(serviceId);

}
//live tracking
window.openLiveTracking =
function(serviceId){

console.log(
"OPEN LIVE TRACKING:",
serviceId
);

};

/* =========================================
   AUTO SCROLL TO ACTIVE SERVICES
========================================= */

window.onload = ()=>{

  const params =
  new URLSearchParams(
    window.location.search
  );

  const scroll =
  params.get("scroll");

  console.log("SCROLL:",scroll);

  if(scroll === "active"){

    const target =
    document.getElementById(
      "activeServicesSection"
    );

    console.log("TARGET:",target);

    if(target){

      target.scrollIntoView({

        behavior:"smooth",

        block:"start"

      });

    }

  }

};
