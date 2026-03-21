import { getAuth, onAuthStateChanged, signOut } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import { initializeApp } 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";

import {getFirestore ,collection, addDoc, query, where, getDocs,setDoc, updateDoc,serverTimestamp, doc, getDoc, onSnapshot} 
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";



const firebaseConfig = {
 apiKey: "AIzaSyBf_wiFJv5K-wHZdPKGjx48dAIwYCE36rw",
    authDomain: "car-service-app-c369c.firebaseapp.com",
    projectId: "car-service-app-c369c",
    storageBucket: "car-service-app-c369c.firebasestorage.app",
    messagingSenderId: "88111807766",
    appId: "1:88111807766:web:0ccaf8189abf18d336e437",
  };
  
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  //welcome note
  const welcomeText = document.getElementById("welcomeText");
  //car DOMS
  const addCarBtn = document.getElementById("addCarBtn");
  const carNumber = document.getElementById("carNumber");
  const brand = document.getElementById("brand");
  const model = document.getElementById("model");
  const colour = document.getElementById("colour");
  //Service DOMS
  const carSelect = document.getElementById("carSelect");
  const serviceNotes = document.getElementById("serviceNotes");
  const activeServiceList = document.getElementById("activeServiceList");
  const serviceHistoryList = document.getElementById("serviceHistoryList");  
  const createServiceBtn = document.getElementById("createServiceBtn");
  const historyList = document.getElementById("historyList");
  const carHistory = document.getElementById("carHistory");
  //priority
  const priorityOrder = {
  assigned: 1,
  in_progress: 2,
  completed: 3,
  cancelled: 4
};
  //role
let currentRole = null;
let currentUser = null;

const carDataCache = {};
// 🔐 Auth check
onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "index.html";
  }
  else {
    currentUser = user;

    const userSnap = await getDoc(doc(db, "users", user.uid));
    currentRole = userSnap.data().role;
    const userData = userSnap.data();
    welcomeText.innerText = `Welcome, ${userData.name}`;

    //role guard
 if (currentRole !== "customer") {
    alert("Access denied");
    window.location.href = "index.html";
    return;
  }

    
    //the button are enbale once the user is logged in*(UI)
    addCarBtn.disabled = false;
    createServiceBtn.disabled = false;

loadCarOptions();
listenToCustomerServices();

    }
});

// 🚪 Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});


//the car logic



addCarBtn.addEventListener("click", async () => {

  //checks is the car is already exists

  const carCheckQuery = query(
  collection(db, "cars"),
  where("ownerId", "==", currentUser.uid),
  where("carNumber", "==", carNumber.value.trim())
);

const existingCars = await getDocs(carCheckQuery);

if (!existingCars.empty) {
  alert("This car is already registered");
  return;
}

  if (
    !carNumber.value.trim() ||
    !brand.value.trim() ||
    !model.value.trim() ||
    !colour.value.trim()
  ) {
    alert("Fill all car details");
    return;
  }
  //disable button the user is known or logged in
  addCarBtn.disabled = true;
createServiceBtn.disabled = true;

  try {
    await setDoc(
      //set the RC number as the CarID
    doc(db, "cars", carNumber.value.trim().toUpperCase()), {
      ownerId: currentUser.uid,
      carNumber: carNumber.value.trim().toUpperCase(),
      brand: brand.value.trim(),
      model: model.value.trim(),
      colour: colour.value.trim(),
      createdAt: serverTimestamp()
    });

    carNumber.value = "";
    brand.value = "";
    model.value = "";
    colour.value = "";

    alert("Car added successfully");

    carNumber.value = "";
    brand.value = "";
    model.value = "";
    colour.value = "";

    loadCarOptions();

  } catch (e) {
    console.error(e);
    alert("Failed to add car");
   } finally {
    addCarBtn.disabled = false;
    createServiceBtn.disabled = false;
   }
});



// populate car dropdown
async function loadCarOptions() {
  carSelect.innerHTML = "";
  carHistory.innerHTML = "";

  // Add the "Placeholder" options first
  const placeholder1 = new Option("Select Car", "");
  placeholder1.disabled = true;  // Optional: makes it unselectable once changed
  placeholder1.selected = true;  // Makes it the default visible text
  carSelect.appendChild(placeholder1);

  const placeholder2 = new Option("Select Car for History", "");
  placeholder2.disabled = true;
  placeholder2.selected = true;
  carHistory.appendChild(placeholder2);

  const q = query(collection(db, "cars"), 
  where("ownerId", "==", currentUser.uid));

  const snap = await getDocs(q);

  //  No car -> block service creation
  if (snap.empty) {
    createServiceBtn.disabled = true;
    return;
  }

  // Cars exist -> allow service creation
  createServiceBtn.disabled = false;
  
 snap.forEach(d => {

  const carData = d.data();

  carDataCache[d.id] = carData;
    const displayText = `${carData.carNumber} - ${carData.brand} (${carData.model})`;
    const carId = d.id;

    // Add to 'Create Service' dropdown
    const opt1 = new Option(displayText, carId);
    carSelect.appendChild(opt1);

    // Add to 'View History' dropdown
    const opt2 = new Option(displayText, carId);
    carHistory.appendChild(opt2);
  });
}
//verfying and blocking if or car is not selected or no note added for the service created
// ------CREATE SERVICE----
createServiceBtn.addEventListener("click", async () => {
  if (!carSelect.value) {
    alert("Please register a car before creating a service");
    return;
  }

  if (!serviceNotes.value.trim()) {
    alert("Please add service notes");
    return;
  }

  //check: is this car already in service?

  const activeServiceQuery = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid),
    where("carId", "==", carSelect.value),
    where("serviceStatus", "in", ["in_progress", "assigned"])
  );

  const activeSnap = await getDocs(activeServiceQuery);

  if (!activeSnap.empty) {
    alert("This car is already under service. Please wait until it is completed.");
     serviceNotes.value = "";
    return;
  }


  try {
    await addDoc(collection(db, "services"), {
      ownerId: currentUser.uid,
      carId: carSelect.value,
      notes: serviceNotes.value,
      serviceStatus: "in_progress",
      assignedServiceCenterId: null, // NOT assigned yet

      createdAt: serverTimestamp(),
      startedAt: serverTimestamp()
    });
    alert("Service created");

    serviceNotes.value = "";
    carSelect.selectedIndex = 0;

   // listenToCustomerServices();

  } catch {
    alert("Failed to create service");
  }
});

//analytics function

function calculateServiceMetrics(service) {

  if (!service.startedAt || !service.completedAt) return "";

  const start = service.startedAt.seconds * 1000;
  const complete = service.completedAt.seconds * 1000;

  const total = complete - start;

  let waiting = null;
  let repair = null;

  if (service.assignedAt) {
    const assign = service.assignedAt.seconds * 1000;

    waiting = assign - start;
    repair = complete - assign;
  }

  function format(ms) {
    const mins = Math.floor(ms / 60000);
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  let html = `<div class="service-analytics">`;

  html += `<div><strong>Service Analytics</strong></div>`;

  if (waiting !== null) {
    html += `<div>⏳ Waiting Time: ${format(waiting)}</div>`;
  }

  if (repair !== null) {
    html += `<div>🔧 Repair Time: ${format(repair)}</div>`;
  }

  html += `<div>📊 Total Time: ${format(total)}</div>`;

  html += `</div>`;

  return html;
}

//timeline builder function:

function buildServiceTimeline(data) {

  const format = (ts) => {
    if (!ts?.seconds) return null;
    return new Date(ts.seconds * 1000)
      .toLocaleString("en-GB", { hour12: true });
  };

  let html = `<div style="margin-left:10px; font-size:14px;">`;

  function step(color, label, time, icon="●", last=false) {

    if (!time) return "";

    return `
      <div style="display:flex; align-items:flex-start; gap:6px;">
        
        <div style="display:flex; flex-direction:column; align-items:center;">
          
          <div style="
            width:18px;
            height:18px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:12px;
            font-weight:bold;
            color:white;
            background:${color};
          ">
            ${icon}
          </div>

          ${!last ? `
          <div style="
            width:2px;
            height:18px;
            background:#ccc;
          "></div>` : ""}

        </div>

        <div>
          <div style="font-weight:bold; color:${color};">
            ${label}
          </div>
          <div style="font-size:12px; color:#666;">
            ${format(time)}
          </div>
        </div>

      </div>
    `;
  }

  html += step("#28a745", "Started", data.startedAt);

  html += step("#f0ad4e", "Assigned", data.assignedAt);

  if (data.cancelledAt) {

    html += step("#dc3545", "Cancelled", data.cancelledAt, "✖", true);

  } else {

    html += step("#6c757d", "Repair In Progress", data.assignedAt);

    html += step("#28a745", "Completed", data.completedAt, "✔", true);

  }

  html += `</div>`;

  return html;
}

//service timelog builder function

async function buildServiceActivityLog(serviceId, data) {

const format = (ts) => {
if (!ts?.seconds) return null;
return new Date(ts.seconds * 1000)
.toLocaleString("en-GB", { hour12: true });
};

const events = [];

if (data.startedAt) {
events.push({ time: data.startedAt, text: "Service requested" });
}

if (data.assignedAt) {
events.push({ time: data.assignedAt, text: "Assigned to service center" });
}

if (data.completedAt) {
events.push({ time: data.completedAt, text: "Service completed" });
}

if (data.cancelledAt) {
events.push({ time: data.cancelledAt, text: "Service cancelled" });
}

try {


const mediaSnap = await getDocs(
  collection(db, "services", serviceId, "media")
);

mediaSnap.forEach((doc) => {

  const m = doc.data();

  if (!m.createdAt) return;

  let label = "Photo uploaded";

  if (m.stage === "before") label = "Before repair photo uploaded";
  if (m.stage === "during") label = "During repair photo uploaded";
  if (m.stage === "after") label = "After repair photo uploaded";

  events.push({
    time: m.createdAt,
    text: label
  });

});


} catch (e) {
console.log("Media log skipped", e);
}

// sort timeline
events.sort((a, b) => a.time.seconds - b.time.seconds);

let html = `<div style="margin-top:10px;font-size:13px;">`;

html += `<div><strong>Activity Log</strong></div>`;

events.forEach(e => {
html += `<div>${format(e.time)} — ${e.text}</div>`;
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



// list services

 function listenToCustomerServices() {

  const q = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid)
  );

  onSnapshot(q, async (snap) => {

    activeServiceList.innerHTML = "";
    serviceHistoryList.innerHTML = "";

    if (snap.empty) {
      serviceList.innerHTML = "<li>No services yet</li>";
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


   for (const data of servicesArray) {
const activityLog = await buildServiceActivityLog(data.id, data);
  const li = document.createElement("li");
  li.id = `service-${data.id}`;

  const carData = carDataCache[data.carId];

const carText = carData
  ? `${carData.carNumber} - ${carData.brand} (${carData.model})`
  : "Unknown car";

  li.innerHTML = `
<div class="service-tile">

  <div>
    <strong>${carText}</strong>
  </div>

  <div>
    📝Service Notes: ${data.notes || "—"}
  </div>

  <div>
    Status: <b>${data.serviceStatus.toUpperCase()}</b>
  </div>
  ${
  data.serviceStatus === "cancelled"
  ? `
    <div style="color:red;">
      ❌ Cancelled By: ${
        data.cancelledRole === "service_center"
        ? "Service Center"
        : "Customer"
      }
    </div>

    <div>
      Reason: ${data.cancelReason || "No reason provided"}
    </div>
  `
  : ""
}

  <div><strong>Timeline</strong></div>
${buildServiceTimeline(data)}

${activityLog}

  ${
    data.serviceStatus === "in_progress"
      ? `<button onclick="cancelService('${data.id}')">Cancel Service</button>`
      : ""
  }

  <div id="media-${data.id}" class="service-media"></div>

</div>
`;

  const existing = document.getElementById(`service-${data.id}`);

  if (data.serviceStatus === "completed" || data.serviceStatus === "cancelled") {

  serviceHistoryList.appendChild(li);

} else {

  activeServiceList.appendChild(li);

}

  if (data.hasMedia) {
    loadMedia(data.id, `media-${data.id}`);
  }

}
  });
}


//cancel service function

async function cancelService(serviceId) {

  const confirmCancel = confirm(
    "Are you sure you want to cancel this service request?"
  );

  if (!confirmCancel) return;

   const reason = prompt("Enter reason for cancelling this service:");

  if (!reason) {
    alert("Cancellation requires a reason");
    return;
  }

  try {

    await updateDoc(doc(db, "services", serviceId), {
      serviceStatus: "cancelled",
      cancelReason: reason,
      cancelledRole: "customer",
      cancelledBy: currentUser.uid,
      cancelledAt: serverTimestamp()
    });

    alert("Service request cancelled");

  } catch (err) {

    console.error(err);
    alert("Failed to cancel service");

  }
}
window.cancelService = cancelService;
//service history list

async function loadServiceHistory(carId) {
  historyList.innerHTML = "";

  const q = query(
    collection(db, "services"),
    where("ownerId", "==", currentUser.uid),
    where("carId", "==", carId)
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    historyList.innerHTML = "<li>No service history</li>";
    return;
  }

  const services = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.startedAt?.seconds || 0) - (a.startedAt?.seconds || 0));

  for (const s of services) {

    const li = document.createElement("li");
    li.id = `history-${s.id}`;   // ⭐ important for safe rendering

    const statusLabel =
      s.serviceStatus === "completed"
        ? "COMPLETED"
        : s.serviceStatus === "assigned"
        ? "ASSIGNED TO TECHNICIAN"
        : s.serviceStatus === "cancelled"
        ? "CANCELLED"
        : "IN PROGRESS (Awaiting service center)";
        


    li.innerHTML = `
<div class="service-tile">

  <div>
    <strong style="
  color:${s.serviceStatus === "cancelled" ? "red" :
         s.serviceStatus === "completed" ? "green" :
         s.serviceStatus === "assigned" ? "goldenrod" : "black"}
">
${statusLabel}
</strong>
  </div>

  ${
    s.serviceStatus === "cancelled"
    ? `
    
      <div style="color:red;">
      Cancelled By: ${
        s.cancelledRole === "service_center"
        ? "Service Center"
        : "Customer"
      }
    </div>

      <div>
        Reason: ${s.cancelReason || "No reason provided"}
      </div>
    `
    : ""
  }

  <div><strong>Timeline</strong></div>
  ${buildServiceTimeline(s)}

${await buildServiceActivityLog(s.id, s)}

  ${s.serviceStatus === "completed" ? calculateServiceMetrics(s) : ""}

  <div>
    📝Service Notes: ${s.notes || "—"}
  </div>

  <div id="history-media-${s.id}" class="service-media"></div>

</div>
`;

    const existing = document.getElementById(`history-${s.id}`);

    if (existing) {
      existing.replaceWith(li);
    } else {
      historyList.appendChild(li);
    }

    if (s.hasMedia) {
      loadMedia(s.id, `history-media-${s.id}`);
    }

  }
}

//trigger on click show service history

carHistory.addEventListener("change", () => {
  const selectedCarId = carHistory.value;
  
  // Only load if the value isn't the empty placeholder string
  if (selectedCarId) {
    loadServiceHistory(selectedCarId);
  } else {
    historyList.innerHTML = ""; 
  }
});

//media loader funtion

async function loadMedia(serviceId, containerId) {

  const mediaContainer = document.getElementById(containerId);
  if (!mediaContainer) return;

  if (mediaContainer.dataset.loaded === "true") return;
  mediaContainer.dataset.loaded = "true";

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

const stageStatus = {
  before: stages.before.length > 0,
  during: stages.during.length > 0,
  after: stages.after.length > 0
};

mediaContainer.innerHTML += buildStageProgress(stageStatus);

for (const stage of ["before","during","after"]) {

  if (stages[stage].length === 0) continue;

  const title = document.createElement("div");
  title.innerHTML = `<strong>${stage.toUpperCase()} REPAIR</strong>`;
  mediaContainer.appendChild(title);

  stages[stage].forEach(url => {

    const img = document.createElement("img");
    img.src = url;
    img.style.width = "120px";
    img.style.marginRight = "6px";
    img.style.borderRadius = "6px";

    mediaContainer.appendChild(img);

  });

}

  } catch (err) {
    console.log("Media load failed");
  }
}