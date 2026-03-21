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
  getDocs,
  addDoc,
  onSnapshot, 
  orderBy,
  deleteDoc

} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

//storage
import {
  getStorage,
  ref,
  getDownloadURL,
  uploadBytesResumable,
  deleteObject,

} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";


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
const completedServiceList = document.getElementById("completedServiceList");
const cancelledServiceList = document.getElementById("cancelledServiceList");
//upload(storge)
const storage = getStorage(app);
let clickListenerAttached = false;




// Cache car details to avoid async race in render loop
const carCache = {};

//can only access by the service-center
let currentUser = null;

let activeServicesUnsubscribe = null;
let completedUnsubscribe = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;

  const userSnap = await getDoc(doc(db, "users", user.uid));

  const userData = userSnap.data();
  welcomeText.innerText = `Welcome, ${userData.name}`;

//role protection
  if (userSnap.data().role !== "service_center") {
    alert("Access denied");
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  listenToActiveServices();
listenToCompletedServices();


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
  const activeMap = new Map();

  const unassignedQuery = query(
    collection(db, "services"),
    where("serviceStatus", "==", "in_progress"),
    where("assignedServiceCenterId", "==", null)
  );

  const assignedQuery = query(
    collection(db, "services"),
    where("serviceStatus", "==", "assigned"),
    where("assignedServiceCenterId", "==", currentUser.uid)
  );




///////////////////////
async function renderBoard() {

  serviceList.innerHTML = "";

  const docs = [];

  // Priority: assigned first
  docs.push(...unassignedDocs);
  docs.push(...assignedDocs);

  if (docs.length === 0) {
    serviceList.innerHTML = "<li>No active services available</li>";
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
const activityLog = await buildServiceActivityLog(serviceId, data);

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
    <button data-id="${serviceId}" data-action="assign">
      Assign Me
    </button>
  `;

}

// SERVICE ASSIGNED TO THIS CENTER
else if (
  data.assignedServiceCenterId === currentUser.uid &&
  data.serviceStatus === "assigned"
) {

  buttonHTML = `
 <button data-id="${serviceId}" data-action="cancel">
  Cancel Assignment
</button>

<select class="media-stage" data-id="${serviceId}">
  <option value="">Select Stage</option>

  <option value="before" ${data.currentStep === "before" ? "selected" : ""}>
    Before Repair
  </option>

  <option value="during" ${data.currentStep === "during" ? "selected" : ""}>
    During Repair
  </option>

  <option value="after" ${data.currentStep === "after" ? "selected" : ""}>
    After Repair
  </option>
</select>

<input type="file" class="media-input" data-id="${serviceId}">

<button data-id="${serviceId}" data-action="upload">
  Upload Media
</button>

<button 
  data-id="${serviceId}" 
  data-action="complete"
  ${!data.hasMedia ? "disabled" : ""}
>
  Complete Service
</button>
   
  `;
}
  // -------------------------------
  // Render list item
  // -------------------------------
  const li = document.createElement("li");
li.id = `service-${serviceId}`;

li.innerHTML = `
  <div class="service-tile">

    <div class="service-header">
      <strong>${carText}</strong>
    </div>

    <div class="service-notes">
      📝service Notes: ${data.notes || "—"}
    </div>
  ${activityLog}

    <div id="media-${serviceId}" class="service-media"></div>
     <div class="upload-progress" id="progress-${serviceId}"></div>
    <div class="service-actions">
      ${buttonHTML}
    </div>

  </div>
`;

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
if (
  data.assignedServiceCenterId === currentUser.uid &&
  data.serviceStatus === "assigned" &&
  data.hasMedia
) {
  await loadServiceMedia(serviceId);
}
}
  
async function loadServiceMedia(serviceId) {

 const mediaContainer = document.getElementById(`media-${serviceId}`);
if (!mediaContainer) return;

/* prevent repeated reads */
if (mediaContainer.dataset.loaded === "true") return;
mediaContainer.dataset.loaded = "true";

  try{
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

  stages[stage].push({
  url: data.url,
  id: doc.id
});
});

mediaContainer.innerHTML = "";

let completedStages = 0;

if (stages.before.length > 0) completedStages++;
if (stages.during.length > 0) completedStages++;
if (stages.after.length > 0) completedStages++;

const progressPercent = completedStages * 33;

const progressTitle = document.createElement("div");
progressTitle.innerHTML = `<strong>Progress: ${progressPercent}%</strong>`;
progressTitle.style.marginBottom = "6px";

mediaContainer.appendChild(progressTitle);

//progress bar

const progressBar = document.createElement("div");
progressBar.style.width = "200px";   // small width
progressBar.style.background = "#ddd";
progressBar.style.height = "6px";    // thinner bar
progressBar.style.borderRadius = "4px";
progressBar.style.marginBottom = "8px";

const progressFill = document.createElement("div");

progressFill.style.width = "0%";
progressFill.style.height = "6px";
progressFill.style.background = "#4CAF50";
progressFill.style.borderRadius = "6px";
progressFill.style.transition = "width 0.6s ease";   // smooth animation

progressBar.appendChild(progressFill);
mediaContainer.appendChild(progressBar);

// animate after render
setTimeout(() => {
  progressFill.style.width = progressPercent + "%";
}, 50);


for (const stage of ["before","during","after"]) {

  if (stages[stage].length === 0) continue;

  const title = document.createElement("div");
 const stageIcons = {
  before: "🟢",
  during: "🟡",
  after: "🔵"
};

title.innerHTML = `<strong>${stageIcons[stage]} ${stage.toUpperCase()} REPAIR</strong>`;
  mediaContainer.appendChild(title);

  stages[stage].forEach((media) => {

  const wrapper = document.createElement("div");
  wrapper.style.display = "inline-block";
  wrapper.style.position = "relative";
  wrapper.style.marginRight = "6px";

  const img = document.createElement("img");
  img.src = media.url;
  img.style.width = "120px";
  img.style.borderRadius = "6px";

  const deleteBtn = document.createElement("button");
  deleteBtn.innerText = "✖";
  deleteBtn.style.position = "absolute";
  deleteBtn.style.top = "2px";
  deleteBtn.style.right = "2px";
  deleteBtn.style.background = "red";
  deleteBtn.style.color = "white";
  deleteBtn.style.border = "none";
  deleteBtn.style.borderRadius = "50%";
  deleteBtn.style.cursor = "pointer";

  deleteBtn.onclick = () => deleteMedia(serviceId, media.id);

  wrapper.appendChild(img);
  wrapper.appendChild(deleteBtn);

  mediaContainer.appendChild(wrapper);

});

}
}catch (err) {
 // silent fail (rules blocked media read)
}
}

//delete media function

async function deleteMedia(serviceId, mediaId) {

  if (!confirm("Delete this image?")) return;

  try {

    const mediaRef = doc(db, "services", serviceId, "media", mediaId);
    const mediaSnap = await getDoc(mediaRef);

    if (!mediaSnap.exists()) return;

    const data = mediaSnap.data();

    // delete from storage
    const storageRef = ref(storage, data.filePath);
    await deleteObject(storageRef);

    // delete firestore doc
   await deleteDoc(mediaRef);

const container = document.getElementById(`media-${serviceId}`);
if (container) {
  container.dataset.loaded = "false";
}

loadServiceMedia(serviceId);

  } catch (err) {

    console.error("Delete failed:", err);
    alert("Failed to delete image");

  }

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
    console.log("Media log skipped");
  }

  events.sort((a,b)=>a.time.seconds - b.time.seconds);

  let html = `<div style="margin-top:10px;font-size:13px;">`;
  html += `<div><strong>Activity Log</strong></div>`;

  events.forEach(e=>{
    html += `<div>${format(e.time)} — ${e.text}</div>`;
  });

  html += `</div>`;

  return html;
}


//function for loading media in completed services
async function loadCompletedServiceMedia(serviceId) {

  const mediaContainer =
  document.getElementById(`completed-media-${serviceId}`);

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

 stages[stage].push({
  url: data.url,
  id: doc.id
});
});

mediaContainer.innerHTML = "";

for (const stage of ["before","during","after"]) {

  if (stages[stage].length === 0) continue;

  const title = document.createElement("div");

  const stageIcons = {
  before: "🟢",
  during: "🟡",
  after: "🔵"
};

title.innerHTML = `<strong>${stageIcons[stage]} ${stage.toUpperCase()} REPAIR</strong>`;
mediaContainer.appendChild(title);

stages[stage].forEach((media) => {

  const wrapper = document.createElement("div");
  wrapper.style.display = "inline-block";
  wrapper.style.position = "relative";
  wrapper.style.marginRight = "6px";

  const img = document.createElement("img");
  img.src = media.url;
  img.style.width = "120px";
  img.style.borderRadius = "6px";

  wrapper.appendChild(img);

  mediaContainer.appendChild(wrapper);

});

}
}catch (err) {
    console.log("Media read blocked or failed");
  }
}


//logic for the completdAt and the ASSIGN to me buttons

if (!clickListenerAttached) {
  clickListenerAttached = true;

  serviceList.addEventListener("click", async (e) => {
  
    const button = e.target.closest("button");

    if (!button) return;

    const serviceId = button.dataset.id;
    const action = button.dataset.action;

    if (!serviceId || !action) return;   
    const serviceTile = document.getElementById(`service-${serviceId}`);
    console.log("ACTION:", action, "SERVICE:", serviceId);


    //upload logic
    if (action === "upload") {

  const fileInput = serviceTile.querySelector(".media-input");    
  const stageSelect = serviceTile.querySelector(".media-stage");
  const stage = stageSelect.value;

const serviceSnap = await getDoc(doc(db, "services", serviceId));
const serviceData = serviceSnap.data();
let currentStep = serviceData.currentStep;


console.log("SELECTED STAGE:", stage);
console.log("CURRENT STEP:", currentStep);
// 🔥 STAGE ORDER
const stageOrder = ["before", "during", "after", "done"];

const currentIndex = stageOrder.indexOf(currentStep);
const selectedIndex = stageOrder.indexOf(stage);

// ❌ no stage selected
if (!stage) {
  alert("Please select the repair stage before uploading.");
  return;
}

// ❌ prevent skipping forward
if (selectedIndex > currentIndex + 1) {
  alert(`You must complete "${currentStep}" stage first.`);
  return;
}

// ❌ prevent going backward
if (selectedIndex < currentIndex) {
  alert("You cannot upload previous stage images.");
  return;
}

//upload limit check

const mediaSnap = await getDocs(
  collection(db, "services", serviceId, "media")
);

let stageCount = 0;

mediaSnap.forEach((doc) => {
  const m = doc.data();
  if (m.stage === stage) stageCount++;
});
if (stageCount >= 3) {
  alert("Maximum 3 photos allowed for this stage.");
  return;
}

////////////////////////////////
  const progressEl = serviceTile.querySelector(".upload-progress");

  const file = fileInput.files[0];

  if (!file) {
    alert("Please select a file first");
    return;
  }
progressEl.innerText = "Starting upload...";
  console.log("Starting upload...");

  const fileRef = ref(
    storage,
    `services/${serviceId}/media/${Date.now()}_${file.name}`
  );

 const uploadTask = uploadBytesResumable(fileRef, file, {
  customMetadata: {
    assignedServiceCenterId: currentUser.uid,
    ownerId: serviceData.ownerId
  }
});

  uploadTask.on(
    "state_changed",

    (snapshot) => {
      const progress =
        (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      console.log("Upload progress:", progress);

       progressEl.innerText = "Uploading: " + Math.round(progress) + "%";
    },

    (error) => {
       progressEl.innerText = "Upload failed";
      console.error("Upload failed:", error);
    },
    

    async () => {

      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
       progressEl.innerText = "Upload complete";

await addDoc(
  collection(db, "services", serviceId, "media"),
  {
    url: downloadURL,
    filePath: fileRef.fullPath,
    stage: stage,
    uploadedBy: currentUser.uid,
    fileName: file.name,
    createdAt: serverTimestamp()
  }
);



const container = document.getElementById(`media-${serviceId}`);
if (container) {
  container.dataset.loaded = "false";
}


loadServiceMedia(serviceId);
    }
  );
  
  return;
}
    console.log("CLICK HANDLER EXECUTED");

    if (action === "assign") {
      console.log("ASSIGN CLICKED BY:", currentUser.uid);

      await updateDoc(doc(db, "services", serviceId), {
        serviceStatus: "assigned",
        assignedServiceCenterId: currentUser.uid,
        assignedAt: serverTimestamp(),
        hasMedia: false,
//it will be used to track if any media has been uploaded for this service
        currentStep: "before"
      });
      return;
    }

    if (action === "complete") {

  const mediaSnap = await getDocs(
    collection(db, "services", serviceId, "media")
  );

  const stages = {
    before: 0,
    during: 0,
    after: 0
  };

  mediaSnap.forEach((doc) => {
    const m = doc.data();
    if (stages[m.stage] !== undefined) {
      stages[m.stage]++;
    }
  });

  if (stages.before < 1) {
  alert("Upload at least one BEFORE repair photo.");
  return;
}

if (stages.during < 1) {
  alert("Upload at least one DURING repair photo.");
  return;
}

if (stages.after < 1) {
  alert("Upload at least one AFTER repair photo.");
  return;
}

  await updateDoc(doc(db, "services", serviceId), {
    serviceStatus: "completed",
    completedAt: serverTimestamp()
  });
return;
}

    if (action === "cancel") {

  const reason = prompt("Enter reason for cancelling this service:");

  if (!reason) {
    alert("Cancellation requires a reason.");
    return;
  }

  const mediaSnap = await getDocs(
    collection(db, "services", serviceId, "media")
  );

  for (const mediaDoc of mediaSnap.docs) {

    const data = mediaDoc.data();

    try {
      const storageRef = ref(storage, data.filePath);
      await deleteObject(storageRef);
    } catch (err) {
      console.log("Storage delete skipped");
    }

    await deleteDoc(mediaDoc.ref);
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
    

  //complete service list

 function listenToCompletedServices() {

  // Stop previous listener if exists
  if (completedUnsubscribe) {
    completedUnsubscribe();
  }

  completedServiceList.innerHTML = "";

  // COMPLETED SERVICES QUERY
  const completedQuery = query(
    collection(db, "services"),
    where("serviceStatus", "==", "completed"),
    where("assignedServiceCenterId", "==", currentUser.uid),
    orderBy("completedAt", "desc")
  );

  // CANCELLED SERVICES QUERY
  const cancelledQuery = query(
    collection(db, "services"),
    where("serviceStatus", "==", "cancelled"),
    where("assignedServiceCenterId", "==", currentUser.uid),
    orderBy("cancelledAt", "desc")
  );

  const renderServices = async (snap) => {

     if (snap.empty) {
    return;
  }

    for (const d of snap.docs) {

      const data = d.data();  
      const activityLog = await buildServiceActivityLog(d.id, data);

      const carText = await getCarText(data.carId);

      const startedTime = data.startedAt
        ? new Date(data.startedAt.seconds * 1000).toLocaleString("en-GB", { hour12: true })
        : "-";

      const completedTime = data.completedAt
        ? new Date(data.completedAt.seconds * 1000).toLocaleString("en-GB", { hour12: true })
        : "-";

      const existing = document.getElementById(`completed-${d.id}`);
      const li = document.createElement("li");
        li.id = `completed-${d.id}`;

      li.innerHTML = `
        <div class="service-tile">

          <div class="service-header">
            <strong>${carText}</strong>
          </div>

          <div class="service-notes">
      📝service Notes: ${data.notes || "—"}
    </div>
      ${activityLog}
          <div>
  Started: ${startedTime}<br>

  ${
    data.serviceStatus === "completed"
      ? `Completed: ${completedTime}`
      : data.serviceStatus === "cancelled"
      ? `Cancelled: ${
          data.cancelledAt
            ? new Date(data.cancelledAt.seconds * 1000)
                .toLocaleString("en-GB", { hour12: true })
            : "-"
        }`
      : ""
  }


</div>

          ${
            data.serviceStatus === "cancelled"
            ? `
            <div style="color:red;font-weight:bold;">
              ❌ CANCELLED
            </div>

            <div>
             <b>Reason:</b> ${data.cancelReason || "No reason provided"}
            </div>
            `
            : ""
          }

          <div id="completed-media-${d.id}" class="service-media"></div>

        </div>
      `;

     if (data.serviceStatus === "cancelled") {

  const existingCancelled = document.getElementById(`cancelled-${d.id}`);
  li.id = `cancelled-${d.id}`;

  if (existingCancelled) {
    existingCancelled.replaceWith(li);
  } else {
    cancelledServiceList.appendChild(li);
  }

} else {

  const existingCompleted = document.getElementById(`completed-${d.id}`);
  li.id = `completed-${d.id}`;

  if (existingCompleted) {
    existingCompleted.replaceWith(li);
  } else {
    completedServiceList.appendChild(li);
  }

}

      if (data.hasMedia) {
        loadCompletedServiceMedia(d.id);
      }
    }
  };

  const unsubCompleted = onSnapshot(completedQuery, renderServices);
  const unsubCancelled = onSnapshot(cancelledQuery, renderServices);

  completedUnsubscribe = () => {
    unsubCompleted();
    unsubCancelled();
  };
}




//logout

const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});
