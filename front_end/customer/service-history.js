import {
  db,
  auth
} from "../firebase.js";

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  getDocs
} from  "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";


/* =========================
   ELEMENTS
========================= */

const historyList =
  document.getElementById("historyList");

const emptyState =
  document.getElementById("emptyState");

const detailsContent =
  document.getElementById("detailsContent");

  const historySearch =
document.getElementById(
  "historySearch"
);

  const drawerUserName =
document.getElementById(
  "drawerUserName"
);

const drawerUserAvatar =
document.getElementById(
  "drawerUserAvatar"
);

const logoutBtn =
document.getElementById(
  "logoutBtn"
);
// Get carNumber from URL params for specific car history view
  const urlParams =
new URLSearchParams(
  window.location.search
);

const selectedCarNumber =
urlParams.get("carNumber");

const selectedServiceId =
urlParams.get("id");

const fromPage =
urlParams.get("from");

/* =========================
   SIDEBAR
========================= */

const menuToggle =
  document.getElementById("menuToggle");

const customerSidebar =
  document.getElementById("mobileDrawer");

const sidebarOverlay =
  document.getElementById("sidebarOverlay");

  const historyLayout =
  document.getElementById("historyLayout");

  const backBtn =
document.getElementById(
  "backBtn"
);

let allServices = [];

backBtn.addEventListener(
  "click",
  () => {

    if (fromPage === "my-vehicles") {

      window.location.href =
      "./my-vehicles.html";

    }

    else {

      window.history.back();

    }

  }
);

/* =========================
   MENU TOGGLE
========================= */

menuToggle.addEventListener(
  "click",
  () => {

    const isOpen =
      customerSidebar.classList.toggle("open");

    sidebarOverlay.classList.toggle("show");

    historyLayout.classList.toggle(
      "drawer-open",
      isOpen
    );

    menuToggle.classList.toggle(
      "drawer-open",
      isOpen
    );

});
sidebarOverlay.addEventListener(
  "click",
  () => {

    customerSidebar.classList.remove("open");

    sidebarOverlay.classList.remove("show");

    historyLayout.classList.remove(
      "drawer-open"
    );

});

/* =========================
   AUTH
========================= */

onAuthStateChanged(auth, (user) => {

  if (!user) {

    window.location.href =
      "../login.html";

    return;

  }

  loadUserData(user);

loadHistory(user.uid);

});

/* =========================
   LOAD USER DATA
========================= */

async function loadUserData(user){

  const userRef =
  doc(
    db,
    "users",
    user.uid
  );

  const userSnap =
  await getDoc(userRef);

  if(!userSnap.exists()) return;

  const userData =
  userSnap.data();

  drawerUserName.innerText =
  userData.name || "Customer";

  const initials =
  (userData.name || "U")
  .split(" ")
  .map(word => word[0])
  .join("")
  .substring(0,2);

  drawerUserAvatar.innerText =
  initials;

}

/* =========================
   format date
========================= */
function formatDate(dateStr) {

  if (!dateStr) return "No Date";

  const date =
    new Date(dateStr);

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );

}

/* =========================
   LOAD HISTORY
========================= */

function loadHistory(uid) {

  let q;

q = query(

  collection(db, "services"),

  where("ownerId", "==", uid)

);

  onSnapshot(q, (snapshot) => {

    historyList.innerHTML = "";

    if (snapshot.empty) {

      historyList.innerHTML = `
        <div class="details-empty">
          No service history found
        </div>
      `;

      return;

    }
    let firstLoaded = false;
    let matchedCount = 0;
    const services = [];

    snapshot.forEach((docSnap) => {

  const data = docSnap.data();

  const service =
normalizeServiceData(data);

  // FILTER SPECIFIC CAR HISTORY
  if (selectedCarNumber) {

    const matchesCar =

      service.carNumber === selectedCarNumber ||

      data.carId === selectedCarNumber;

    if (!matchesCar) return;

  }

  // FILTER SPECIFIC SERVICE

if(selectedServiceId){

  if(docSnap.id !== selectedServiceId){

    return;

  }

}
      

      matchedCount++;

  services.push({

  id: docSnap.id,

  ...data

});

    });

    services.sort((a,b)=>{

  const aDate =

    a.assignedAt?.seconds ||

    a.startedAt?.seconds ||

    a.createdAt?.seconds ||

    0;

  const bDate =

    b.assignedAt?.seconds ||

    b.startedAt?.seconds ||

    b.createdAt?.seconds ||

    0;

  return bDate - aDate;

});

allServices = services;

historyList.innerHTML = "";

services.forEach((service,index)=>{

  const card =
  createHistoryCard(
    service.id,
    service
  );

  historyList.appendChild(card);

  if(index === 0){

    card.classList.add("active");

    renderDetails(
      service.id,
      service
    );

  }

});

    if (matchedCount === 0) {

  historyList.innerHTML = `
    <div class="details-empty">
      No service history found
    </div>
  `;

  detailsContent.style.display = "none";

}

  });

  

}

/* =========================
   CREATE CARD
========================= */

function createHistoryCard(id, data) {

  const div =
    document.createElement("div");

    const service =
normalizeServiceData(data);

  div.className = "history-card";

  div.innerHTML = `

    <img
      class="history-card-image"
      src="${
  service.carImage ||
  './broken-car.png'
}"
    >

    <div class="history-card-content">

      <div class="history-card-top">

        <div>

          <div class="history-card-id">
            #${id.slice(0, 6)}
          </div>

          <div class="history-card-car">
            ${service.carNumber || "Vehicle"}
          </div>

          <div class="history-card-owner">
            ${data.serviceStatus
  ?.replaceAll("_", " ")
  || ""}
          </div>

        </div>

        <div class="history-card-date">

          ${
            service.mainDate?.seconds

? formatDate(
    new Date(
      service.mainDate.seconds * 1000
    )
  )

: formatDate(service.mainDate)
          }

        </div>

      </div>

    </div>
  `;

  div.addEventListener(
    "click",
    () => {

      document
        .querySelectorAll(".history-card")
        .forEach(card =>
          card.classList.remove("active")
        );

      div.classList.add("active");

      renderDetails(id, data);

    });

  return div;

}

function normalizeServiceData(data){

  return {

    serviceType:
      data.serviceType ||
      "General Service",

    notes:
      data.notes ||
      data.problemDescription ||
      "No notes added",

    serviceCenter:
      data.assignedServiceCenterName ||
      data.serviceCenterName ||
      "Not Assigned",

    mechanic:
      data.assignedMechanicName ||
      data.mechanicName ||
      "Not Assigned",

    owner:
      data.ownerName ||
      "Customer",

    status:
      data.serviceStatus ||
      "pending",

    totalAmount:
      data.totalAmount ||
      0,


     mainDate:

  data.assignedAt ||

  data.startedAt ||

  data.createdAt ||

  data.scheduledDate ||

  null,

mainTime:

  data.assignedTime ||

  data.startedTime ||

  data.scheduledTime ||

  null,

    completedAt:
      data.completedAt?.seconds
        ? new Date(
            data.completedAt.seconds * 1000
          )
        : data.completedAt || null,

   history:

  data.history ||

  [
    {
      action:"service_created",
      at:
        data.createdAt ||
        data.startedAt,
      role:"customer"
    },

    ...(data.assignedAt
      ? [{
          action:"assigned",
          at:data.assignedAt,
         role:
  data.assignedByRole ||
  "service_center"
        }]
      : []),

    ...(data.completedAt
      ? [{
          action:"completed",
          at:data.completedAt,
          role:
  data.assignedByRole ||
  "service_center"
        }]
      : []),

    ...(data.cancelledAt
      ? [{
          action:"cancelled",
          at:data.cancelledAt,
          role:"customer"
        }]
      : [])
  ],

    carNumber:
      data.carSnapshot?.carNumber ||
      data.carId ||
      "N/A",

    carBrand:
      data.carSnapshot?.brand ||
      "",

    carModel:
      data.carSnapshot?.model ||
      "",

    carImage:
      data.carSnapshot?.imageUrl ||
      "./broken-car.png"

  };

}

//Load service media grouped by stage (before, during, after)

async function loadServiceMedia(serviceId){

  const mediaSnap =
  await getDocs(
    collection(
      db,
      "services",
      serviceId,
      "media"
    )
  );

  const grouped = {
    before: [],
    during: [],
    after: []
  };

  mediaSnap.forEach((docSnap)=>{

    const media =
    docSnap.data();

   const stage =

media.stage ||

media.type ||

media.mediaType ||

media.category ||

"during";

    grouped[stage].push(media);

  });

  return grouped;

}

/* =========================
   DETAILS RENDER
========================= */

async function renderDetails(id, data) {

  const service =
normalizeServiceData(data);


  emptyState.style.display = "none";

  detailsContent.style.display = "block";

  document.getElementById(
    "breadcrumbServiceId"
  ).textContent = `#${id.slice(0, 6)}`;

  document.getElementById(
    "serviceId"
  ).textContent = `#${id.slice(0, 6)}`;

  document.getElementById(
  "carTitle"
).textContent = `

${service.carBrand || ""}

${service.carModel || ""}

(${service.carNumber || ""})

`;
  document.getElementById(
  "scheduledDate"
).textContent =

service.mainDate?.seconds

? formatDate(
    new Date(
      service.mainDate.seconds * 1000
    )
  )

: formatDate(service.mainDate);

 document.getElementById(
  "scheduledTime"
).textContent =

service.mainTime ||

(
  service.mainDate?.seconds

  ? new Date(
      service.mainDate.seconds * 1000
    ).toLocaleTimeString()

  : "No Time"
);

    document.getElementById(
  "carImage"
).src =

service.carImage ||

"./broken-car.png";

  /* STATUS */

  const badges = [
    document.getElementById("topStatusBadge"),
    document.getElementById("headerStatusBadge")
  ];

  badges.forEach((badge) => {

    badge.className =
      `status-badge ${data.serviceStatus}`;

    badge.textContent =
      data.serviceStatus
        ?.replaceAll("_", " ");

  });

  /* =========================
   SERVICE INFO GRID
========================= */

const serviceInfoGrid =
document.getElementById(
  "serviceInfoGrid"
);

serviceInfoGrid.innerHTML = `

<div class="info-item">

  <div class="info-label">
    Service Type
  </div>

  <div class="info-value">
    ${
      data.serviceType ||
      "General Service"
    }
  </div>

</div>

<div class="info-item">

  <div class="info-label">
    Service Center
  </div>

  <div class="info-value">
    ${
      service.serviceCenter ||
      "Not Assigned"
    }
  </div>

</div>

<div class="info-item">

  <div class="info-label">
    Mechanic
  </div>

  <div class="info-value">
    ${
      service.mechanic ||
      "Not Assigned"
    }
  </div>

</div>

<div class="info-item">

  <div class="info-label">
    Vehicle Number
  </div>

  <div class="info-value">
    ${
      service.carNumber || data.carSnapshot?.carId ||
      "N/A"
    }
  </div>

</div>

<div class="info-item">

  <div class="info-label">
    Owner
  </div>

  <div class="info-value">
    ${
      service.owner ||
      "Customer"
    }
  </div>

</div>

<div class="info-item">

  <div class="info-label">
    Notes
  </div>

  <div class="info-value">
    ${
      service.notes ||
      "No notes added"
    }
  </div>

</div>

`;

/* =========================
   TIMELINE
========================= */

const timelineContainer =
document.getElementById(
  "timelineContainer"
);

timelineContainer.innerHTML = "";

const history =
service.history || [];

history.forEach((item)=>{

  const div =
  document.createElement("div");

  div.className =
  "timeline-step";

  const action =
    item.action ||
    item.status ||
    "updated";

  const role =
    item.role ||
    item.updatedByRole ||
    "system";

  const time =
    item.at?.seconds
      ? new Date(
          item.at.seconds * 1000
        )
      : item.at ||
        item.timestamp ||
        null;

  div.innerHTML = `

    <div class="timeline-circle">
      ✓
    </div>

    <div class="timeline-title">

      ${
        action
        .replaceAll("_"," ")
      }

    </div>

    <div class="timeline-date">

      ${
        time
        ? new Date(time)
            .toLocaleString()
        : "No Date"
      }

    </div>

    <div class="timeline-role">
      ${role}
    </div>

  `;

  timelineContainer.appendChild(div);

});
/* =========================
   MEDIA GALLERY
========================= */

const mediaContainer =
document.getElementById(
  "mediaContainer"
);

mediaContainer.innerHTML = "";

const groupedMedia =
await loadServiceMedia(id);
const mediaStages = [

  {
    title:"Before Service",
    media:groupedMedia.before
  },

  {
    title:"During Service",
    media:groupedMedia.during
  },

  {
    title:"After Service",
    media:groupedMedia.after
  }

];

mediaStages.forEach((stage)=>{

  const section =
  document.createElement("div");

  section.className =
  "media-stage";

  section.innerHTML = `

    <div class="media-stage-header">

      <div class="media-stage-title">
        ${stage.title}
      </div>

      <div class="media-count">
        ${stage.media.length} Photos
      </div>

    </div>

    <div class="media-grid">

      ${stage.media.map((img)=>`

        <div class="media-item">

          <img
            src="${img.url || img}"
            alt="service image"
          >

        </div>

      `).join("")}

    </div>

  `;

  mediaContainer.appendChild(
    section
  );

});

/* =========================
   COMPLETION
========================= */

const completionSection =
document.getElementById(
  "completionSection"
);

const completionGrid =
document.getElementById(
  "completionGrid"
);

if(
  data.serviceStatus ===
  "completed"
){

  completionSection.style.display =
  "block";

  completionGrid.innerHTML = `

    <div class="info-item">

      <div class="info-label">
        Completed At
      </div>

      <div class="info-value">

        ${
         service.completedAt
? service.completedAt.toLocaleString()
: "N/A"
        }

      </div>

    </div>

    <div class="info-item">

      <div class="info-label">
        Approved By
      </div>

      <div class="info-value">

        ${
          data.approvedByName ||
          "Customer"
        }

      </div>

    </div>

    <div class="info-item">

      <div class="info-label">
        Total Amount
      </div>

      <div class="info-value">

        ₹${data.totalAmount || 0}

      </div>

    </div>

  `;

}else{

  completionSection.style.display =
  "none";

}

/* =========================
   CANCELLATION
========================= */

const cancelSection =
document.getElementById(
  "cancelSection"
);

const cancelGrid =
document.getElementById(
  "cancelGrid"
);

if(
  data.serviceStatus ===
  "cancelled"
){

  cancelSection.style.display =
  "block";

  cancelGrid.innerHTML = `

    <div class="info-item">

      <div class="info-label">
        Cancelled By
      </div>

      <div class="info-value">

        ${
          data.cancelledByRole ||
          "Unknown"
        }

      </div>

    </div>

    <div class="info-item">

      <div class="info-label">
        Reason
      </div>

      <div class="info-value">

        ${
          data.cancelReason ||
          "No reason provided"
        }

      </div>

    </div>

  `;

}else{

  cancelSection.style.display =
  "none";

}

}


/* =========================
   LOGOUT
========================= */

logoutBtn.addEventListener(
  "click",
  async()=>{

    await signOut(auth);

    window.location.href =
    "../index.html";

  }
);

/* =========================
   SEARCH SERVICES
========================= */

historySearch.addEventListener(
  "input",
  (e)=>{

    const value =
    e.target.value
    .toLowerCase()
    .trim();

    historyList.innerHTML = "";

    const filtered =
    allServices.filter((service)=>{

      const normalized =
      normalizeServiceData(service);

      return (

        normalized.carNumber
        .toLowerCase()
        .includes(value)

        ||

        normalized.status
        .toLowerCase()
        .includes(value)

        ||

        service.id
        .toLowerCase()
        .includes(value)

      );

    });

    filtered.forEach((service,index)=>{

      const card =
      createHistoryCard(
        service.id,
        service
      );

      historyList.appendChild(card);

      if(index === 0){

        card.classList.add("active");

        renderDetails(
          service.id,
          service
        );

      }

    });

  }
);