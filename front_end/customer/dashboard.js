import { db, auth } from "../firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
  onAuthStateChanged,
  signOut
}
from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";


/* =========================================
   ELEMENTS
========================================= */

const menuToggle =
document.getElementById("menuToggle");

const mobileDrawer =
document.getElementById("mobileDrawer");

const sidebarOverlay =
document.getElementById("sidebarOverlay");

const logoutBtn =
document.getElementById("logoutBtn");

const drawerUserName =
document.getElementById("drawerUserName");

const drawerUserAvatar =
document.getElementById("drawerUserAvatar");

const welcomeText =
document.getElementById("welcomeText");

const dashboardMain =
document.querySelector(".dashboard-main");

const dashboardVehiclesGrid =
document.getElementById(
  "dashboardVehiclesGrid"
);

const upcomingServiceCard =
document.getElementById(
  "upcomingServiceCard"
);

const recentServicesList =
document.getElementById(
  "recentServicesList"
);

/* =========================================
   MENU
========================================= */

menuToggle.addEventListener(
  "click",
  () => {

    mobileDrawer.classList.toggle(
      "open"
    );

    sidebarOverlay.classList.toggle(
      "show"
    );

    menuToggle.classList.toggle(
      "drawer-open"
    );

    dashboardMain.classList.toggle(
      "shifted"
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

    menuToggle.classList.remove(
      "drawer-open"
    );

    dashboardMain.classList.remove(
      "shifted"
    );
  }
);
/* =========================================
   LOGOUT
========================================= */

logoutBtn.addEventListener(
  "click",
  async () => {

    await signOut(auth);

    window.location.href =
    "../index.html";
  }
);

/* =========================================
   LOAD USER
========================================= */

onAuthStateChanged(
  auth,
  async (user) => {

    if(!user){

      window.location.href =
      "../index.html";

      return;
    }

    const userRef = doc(
      db,
      "users",
      user.uid
    );

    const userSnap =
    await getDoc(userRef);

    if(userSnap.exists()){

      const userData =
      userSnap.data();

      const userName =
      userData.name || "User";

      drawerUserName.textContent =
      userName;

      welcomeText.textContent =
      userName;

      drawerUserAvatar.textContent =
      userName
      .charAt(0)
      .toUpperCase();
    }

    loadDashboardStats(user.uid);

  }
);

/* =========================================
   DASHBOARD STATS
========================================= */

async function loadDashboardStats(uid){

  const carsQuery = query(
    collection(db,"cars"),
    where("ownerId","==",uid)
  );

  const servicesQuery = query(
    collection(db,"services"),
    where("ownerId","==",uid)
  );

  const carsSnap =
  await getDocs(carsQuery);

  const servicesSnap =
  await getDocs(servicesQuery);

  console.log(
    "Vehicles:",
    carsSnap.size
  );

  console.log(
    "Services:",
    servicesSnap.size
  );


const activeStatuses = [

  "pending_assignment",

  "assigned",

  "job_assigned",

  "in_service",

  "pending_approval",

  "work_done"

];

const vehicles = [];

carsSnap.forEach((doc)=>{

  const carData = doc.data();

  if(carData.deleted){
    return;
  }

  vehicles.push({
    id:doc.id,
    ...carData
  });

});

const services = [];

servicesSnap.forEach((doc)=>{

  services.push({
    id:doc.id,
    ...doc.data()
  });

});

/* =========================
   STATS
========================= */

const totalVehicles =
document.getElementById(
  "totalVehicles"
);

const activeServices =
document.getElementById(
  "activeServices"
);

const upcomingAppointments =
document.getElementById(
  "upcomingAppointments"
);

const totalSpent =
document.getElementById(
  "totalSpent"
);

const spendingAmount =
document.getElementById(
  "spendingAmount"
);

totalVehicles.textContent =
vehicles.length;

const activeCount =

services.filter(service =>

  activeStatuses.includes(
    service.serviceStatus
  )

).length;

activeServices.textContent =
activeCount;

const upcomingCount =

services.filter(service =>

  activeStatuses.includes(
    service.serviceStatus
  )

  &&

  service.scheduledDate

).length;

upcomingAppointments.textContent =
upcomingCount;

let totalAmount = 0;

services.forEach(service=>{

  if(service.totalAmount){

    totalAmount +=
    Number(service.totalAmount);

  }

});

totalSpent.textContent =
`₹${totalAmount}`;

spendingAmount.textContent =
`₹${totalAmount}`;


/* =========================
   VEHICLES SECTION
========================= */

dashboardVehiclesGrid.innerHTML = "";

if(!vehicles.length){

  dashboardVehiclesGrid.innerHTML = `

    <div class="dashboard-add-vehicle-card">

     <a
  href="./my-vehicles.html?action=add"
  class="dashboard-add-vehicle-link"
>

        <i class="ri-add-line"></i>

      </a>

      <span>Add Vehicle</span>

    </div>

  `;

}else{

  vehicles.slice(0,2).forEach(vehicle=>{

    dashboardVehiclesGrid.innerHTML += `

      <div class="dashboard-vehicle-card">

        <div class="dashboard-vehicle-image">

          <img
            src="${
              vehicle.imageUrl ||
              './broken-car.png'
            }"
            alt="vehicle"
          >

        </div>

        <div class="dashboard-vehicle-info">

          <h4>
            ${vehicle.carNumber}
          </h4>

          <p>
            ${vehicle.brand}
            ${vehicle.model}
          </p>

          <span>
            ${vehicle.year}
            •
            ${vehicle.fuelType}
          </span>

          <div class="vehicle-status active">

            Active

          </div>

        </div>

      </div>

    `;

  });

  dashboardVehiclesGrid.innerHTML += `

    

  <div class="dashboard-add-vehicle-card">
     <a
  href="./my-vehicles.html?action=add"
  class="dashboard-add-vehicle-link"
>
        <i class="ri-add-line"></i>

      </a>


    </div>

  `;
}

/* =========================
   RECENT SERVICES
========================= */

recentServicesList.innerHTML = "";

[...services]

.sort((a,b)=>{

  const aTime =
    a.createdAt?.seconds || 0;

  const bTime =
    b.createdAt?.seconds || 0;

  return bTime - aTime;

})

.slice(0,5)

.forEach(service=>{

  const car =
    service.carSnapshot || {};

  recentServicesList.innerHTML += `

    <tr>

      <td>

        ${service.id.slice(0,10)}

      </td>

      <td>

        <div class="service-vehicle-cell">

          <strong>

            ${car.carNumber || "N/A" || car.carId}

          </strong>

          <span>
         
           ${car.brand || ""}
           (${car.model || ""})
           

          </span>

        </div>

      </td>

      <td>

        ${
          service.notes ||
          "Service"
        }

      </td>

      <td>

        ${
          service.scheduledDate ||
          "-"
        }

      </td>

      <td>

        <span class="table-status-pill">

          ${
            service.serviceStatus
            ?.replaceAll("_"," ")
          }

        </span>

      </td>

      <td>

        ₹${
          service.totalAmount || 0
        }

      </td>

      <td>

        <a
  href="./service-history.html?id=${service.id}"
  class="table-action-btn"
>

  View Details

</a>

      </td>

    </tr>

  `;

});

/* =========================
   UPCOMING SERVICE
========================= */

const upcomingService =

services

.filter(service =>

  activeStatuses.includes(
    service.serviceStatus
  )

)

.sort((a,b)=>{

  const aTime =
    a.createdAt?.seconds || 0;

  const bTime =
    b.createdAt?.seconds || 0;

  return bTime - aTime;

})

[0];

if(upcomingService){

  const car =
  upcomingService.carSnapshot || {};

  upcomingServiceCard.innerHTML = `

    <div class="upcoming-service-inner">

      <div class="upcoming-service-top">

        <img
          src="${
            car.imageUrl ||
            "./broken-car.png"
          }"
          alt="vehicle"
        >

        <div>

          <h3>

            ${
              car.carNumber || "Vehicle"
            }

          </h3>

          <p>

            ${
              car.brand || ""
            }

            ${
              car.model || ""
            }

            (${
              car.year || ""
            })

          </p>

          <span class="service-status-pill">

            ${
              upcomingService.serviceStatus
              ?.replaceAll("_"," ")
            }

          </span>

        </div>

      </div>

      <div class="upcoming-service-details">

        <p>

          📅

          ${
            upcomingService.scheduledDate ||
            "No date"
          }

        </p>

        <p>

          🕒

          ${
            upcomingService.scheduledTime ||
            "No time"
          }

        </p>

        <p>

          📍

          ${
            upcomingService.pickupAddress ||
            "AutoCare Guwahati"
          }

        </p>

        <p>

          🔧

          ${
            upcomingService.notes ||
            "Regular Servicing"
          }

        </p>

      </div>

      <a
        href="./service-history.html?id=${upcomingService.id}"
        class="view-details-btn"
      >

        View Details

      </a>

    </div>

  `;

}else{

  upcomingServiceCard.innerHTML = `

    <div class="empty-upcoming-service">

      <p>No upcoming services</p>

    </div>

  `;

}


}

/* =========================================
   AUTO SCROLL TO ACTIVE SERVICES
========================================= */

window.addEventListener(
  "load",
  ()=>{

    const params =
    new URLSearchParams(
      window.location.search
    );

    const scroll =
    params.get("scroll");

    if(scroll === "active"){

     

        const activeSection =
        document.getElementById(
          "activeServicesSection"
        );

        if(activeSection){

          activeSection.scrollIntoView({

            behavior:"smooth",

            block:"start"

          });

        }

  

    }

  }
);




