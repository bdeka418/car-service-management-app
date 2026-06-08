import { db, auth } from "../firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  onSnapshot,
  arrayUnion,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

let currentUser = null;
let allServicesData = []; // 🔹 Added to store real-time data for filtering
let currentPage = 1;      // 🔹 Current pagination page
const ITEMS_PER_PAGE = 5; // 🔹 Max services per page

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
// LOAD SERVICES (Fetch Data)
// =======================
async function loadServices(user) {
    const container = document.getElementById("servicesContainer");

    const q = query(
        collection(db, "services"),
        where("assignedServiceCenterId", "==", user.uid),
        where("serviceStatus", "in", [
            "assigned", "job_assigned", "in_service", "in_progress", "pending_approval", "work_done"
        ]),
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (snapshot) => {
        allServicesData = []; // Clear array on new snapshot
        let total = 0, pending = 0, progress = 0;

        snapshot.forEach((docSnap) => {
            const service = docSnap.data();
            service.id = docSnap.id; 
            allServicesData.push(service);

            // Update Stats
            total++;
            if (service.serviceStatus === "pending_approval") pending++;
            if (service.serviceStatus === "in_progress" || service.serviceStatus === "job_assigned") progress++;
        });
        document.getElementById("totalServicesCount").textContent = total;
        document.getElementById("inProgressCount").textContent = progress;
        document.getElementById("pendingReviewCount").textContent = pending;

        // Call the render function after data loads
        applyFiltersAndRender(); 

    }, (error) => {
        console.error("❌ Firestore error:", error.code, error.message);
        container.innerHTML = `<div style="padding: 20px; color: red;">Error loading services.</div>`;
    });
}

// =======================
// RENDER & FILTER UI
// =======================
function applyFiltersAndRender() {
    const container = document.getElementById("servicesContainer");
    container.innerHTML = "";

    // 1. Get filter values
    const searchTerm = document.getElementById("searchInput").value.toLowerCase();
    const statusFilter = document.getElementById("statusFilter").value;
    const typeFilter = document.getElementById("typeFilter").value;

    // 2. Filter the data array
    const filteredServices = allServicesData.filter(service => {
        // Text extractions
        const shortId = "SRV" + service.id.substring(0, 5).toLowerCase();
        const carName = `${service.carSnapshot?.brand || ''} ${service.carSnapshot?.model || ''}`.toLowerCase();
        const custName = (service.ownerSnapshot?.name || '').toLowerCase();
        const custPhone = (service.ownerSnapshot?.phone || '').toLowerCase();
        
        const serviceType = service.selectedServiceType || 'Regular Servicing';
        const searchServiceType = serviceType.toLowerCase();

        const displayStatus = (service.serviceStatus || 'IN PROGRESS').toUpperCase().replace(/_/g, ' ');
        const searchStatus = displayStatus.toLowerCase();
        
        const searchStage = (service.currentStep || 'Pending').replace(/_/g, ' ').toLowerCase();

        let mechanicName = 'Unassigned';
        if (service.history && Array.isArray(service.history)) {
            const mechanicData = service.history.find(h => h.mechanicName);
            if (mechanicData) mechanicName = mechanicData.mechanicName;
        }
        if (mechanicName === 'Unassigned' && service.mechanicId) mechanicName = 'Assigned';
        const searchMechanic = mechanicName.toLowerCase();

        // Match Logic (Now includes all fields)
        const matchesSearch = !searchTerm || 
            shortId.includes(searchTerm) || 
            carName.includes(searchTerm) || 
            custName.includes(searchTerm) ||
            custPhone.includes(searchTerm) ||
            searchServiceType.includes(searchTerm) ||
            searchStatus.includes(searchTerm) ||
            searchStage.includes(searchTerm) ||
            searchMechanic.includes(searchTerm);

        const matchesStatus = statusFilter === "All Status" || displayStatus === statusFilter;
        const matchesType = typeFilter === "All Service Types" || serviceType === typeFilter;

        return matchesSearch && matchesStatus && matchesType;
    });

   // Handle Empty State
    if (filteredServices.length === 0) {
        container.innerHTML = `<div style="padding: 20px; text-align: center; color: #64748b;">No services match your filters.</div>`;
        renderPaginationControls(0, 0); // Clear pagination
        return;
    }

    // 🔹 PAGINATION LOGIC
    const totalItems = filteredServices.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    
    // Safety check: if current page is now out of bounds due to a new filter, pull it back
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const paginatedServices = filteredServices.slice(startIndex, endIndex);

    // 3. Render rows (Using paginatedServices instead of filteredServices)
    paginatedServices.forEach((service) => {
        const serviceId = service.id;
        const shortId = "SRV" + serviceId.substring(0, 5).toUpperCase();
        
        const carImg = service.carSnapshot?.imageUrl || './broken-car.png';
        const carName = `${service.carSnapshot?.brand || ''} ${service.carSnapshot?.model || ''}`;
        const serviceType = service.selectedServiceType || 'Regular Servicing';

        const custImg = service.ownerSnapshot?.profileImage || './default-avatar.png';
        const custName = service.ownerSnapshot?.name || 'Unknown';
        const custPhone = service.ownerSnapshot?.phone || '-';

        let mechanicName = 'Unassigned';
        if (service.history && Array.isArray(service.history)) {
            const mechanicData = service.history.find(h => h.mechanicName);
            if (mechanicData) mechanicName = mechanicData.mechanicName;
        }
        if (mechanicName === 'Unassigned' && service.mechanicId) mechanicName = 'Assigned';
        const mechanicImg = './default-avatar.png'; 
        
        const centerName = service.serviceCenterSnapshot?.serviceCenterName || '-';
        const centerLoc = service.serviceCenterSnapshot?.city ? `${service.serviceCenterSnapshot.city}, Assam` : 'Guwahati, Assam';

        const rawStage = service.currentStep || 'Pending';
        const formattedStage = rawStage.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); 
        
        let badgeClass = "in-progress";
        let displayStatus = (service.serviceStatus || 'IN PROGRESS').toUpperCase().replace(/_/g, ' ');
        if(displayStatus.includes('PENDING')) badgeClass = "pending";
        if(displayStatus.includes('CANCEL')) badgeClass = "cancellation";

        // Date Parsing
        function parseCustomDate(val) {
            if (!val) return null;
            if (typeof val.toDate === 'function') return val.toDate();
            if (typeof val === 'string') {
                const cleaned = val.replace(" at ", " "); 
                const d = new Date(cleaned);
                return isNaN(d) ? null : d;
            }
            return new Date(val);
        }

        let startTimestamp = 0;
        let endTimestamp = "";
        let startDate = "Unknown";
        let startTime = "--";

        const reqDateObj = parseCustomDate(service.requestedAt);
        if (reqDateObj) {
            startTimestamp = reqDateObj.getTime();
            startDate = reqDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); 
            startTime = reqDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }

        if (service.serviceStatus === "completed" || service.serviceStatus === "work_done") {
            if (service.history && service.history.length > 0) {
                let lastHistory = service.history[service.history.length - 1];
                let endDateObj = parseCustomDate(lastHistory.at || lastHistory.timestamp);
                if (endDateObj) endTimestamp = endDateObj.getTime();
            }
        }

        const row = document.createElement("div");
        row.className = "list-row";
        
        row.innerHTML = `
            <div class="col-id">${shortId}</div>
            <div class="col-flex">
                <img src="${carImg}" alt="car">
                <div class="text-group">
                    <h4>${carName}</h4><p>${serviceType}</p>
                </div>
            </div>
            <div class="col-flex">
                <img src="${custImg}" class="img-avatar" alt="cust">
                <div class="text-group">
                    <h4>${custName}</h4><p>${custPhone}</p>
                </div>
            </div>
            <div class="col-flex">
                <img src="${mechanicImg}" class="img-avatar" alt="mech" style="width:30px; height:30px;">
                <div class="text-group"><h4>${mechanicName}</h4></div>
            </div>
            <div class="text-group"><h4>${centerName}</h4><p>${centerLoc}</p></div>
            <div class="text-group"><h4>${formattedStage}</h4></div>
            <div><span class="badge ${badgeClass}">${displayStatus}</span></div>
            <div class="text-group"><h4>${startDate}</h4><p>${startTime}</p></div>
            <div class="text-group">
                <h4 class="live-duration" data-start="${startTimestamp}" data-end="${endTimestamp}">--</h4>
            </div>
            <div>
                <button class="btn-monitor" onclick="openMonitor('${serviceId}')">👁️ Monitor</button>
            </div>
        `;
        container.appendChild(row);
    });

    updateLiveDurations();
    renderPaginationControls(totalItems, totalPages);
}

// =======================
// PAGINATION CONTROLS
// =======================
function renderPaginationControls(totalItems, totalPages) {
    // 1. Remove old pagination if it exists
    let paginationContainer = document.getElementById("servicesPagination");
    if (paginationContainer) paginationContainer.remove();

    // 2. Hide if 1 page or less
    if (totalPages <= 1) return; 

    // 3. Create wrapper
    paginationContainer = document.createElement("div");
    paginationContainer.id = "servicesPagination";
    paginationContainer.className = "pagination-wrapper"; // Reusing your CSS class!
    
    paginationContainer.innerHTML = `
        <button id="prevPageBtn" ${currentPage === 1 ? "disabled" : ""}>←</button>
        <span>${currentPage} / ${totalPages}</span>
        <button id="nextPageBtn" ${currentPage === totalPages ? "disabled" : ""}>→</button>
    `;

    // 4. Append below the table
    document.querySelector(".dashboard-list-container").after(paginationContainer);

    // 5. Click Listeners
    paginationContainer.querySelector("#prevPageBtn")?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            applyFiltersAndRender();
        }
    });

    paginationContainer.querySelector("#nextPageBtn")?.addEventListener("click", () => {
        if (currentPage < totalPages) {
            currentPage++;
            applyFiltersAndRender();
        }
    });
}
// =======================
// FILTER EVENT LISTENERS
// =======================

// Standard Filters
const handleFilterChange = () => {
    currentPage = 1; // Reset to page 1 on new search/filter
    applyFiltersAndRender();
};

document.getElementById("filterBtn")?.addEventListener("click", handleFilterChange);
document.getElementById("searchInput")?.addEventListener("input", handleFilterChange); 
document.getElementById("statusFilter")?.addEventListener("change", handleFilterChange);
document.getElementById("typeFilter")?.addEventListener("change", handleFilterChange);

// "View All" Card Links
const setStatusFilter = (e, statusValue) => {
    e.preventDefault(); 
    const statusDropdown = document.getElementById("statusFilter");
    if (statusDropdown) {
        statusDropdown.value = statusValue;
        handleFilterChange(); // Use the reset wrapper
        document.querySelector(".list-filters").scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

document.getElementById("viewAllActive")?.addEventListener("click", (e) => setStatusFilter(e, "All Status"));
document.getElementById("viewAllInProgress")?.addEventListener("click", (e) => setStatusFilter(e, "IN PROGRESS"));
document.getElementById("viewAllPending")?.addEventListener("click", (e) => setStatusFilter(e, "PENDING APPROVAL"));
document.getElementById("viewAllReInspection")?.addEventListener("click", (e) => setStatusFilter(e, "RE-INSPECTION"));
document.getElementById("viewAllCancelled")?.addEventListener("click", (e) => setStatusFilter(e, "CANCELLATION REQUESTED"));
// =======================
// LIVE DURATION TICKER
// =======================
function updateLiveDurations() {
    document.querySelectorAll('.live-duration').forEach(el => {
        const start = parseInt(el.getAttribute('data-start'));
        const endAttr = el.getAttribute('data-end');
        
        const end = (endAttr && endAttr !== "undefined" && endAttr !== "") 
            ? parseInt(endAttr) 
            : Date.now();
        
        if (!start || isNaN(start)) return;

        const diff = end - start;
        if (diff < 0) {
            el.textContent = "0h 0m";
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        el.textContent = `${hours}h ${minutes}m`;
    });
}

// Run immediately, then every 60 seconds
setInterval(updateLiveDurations, 60000);
// Trigger a single check right after data loads to prevent initial blank values



window.openMonitor = function(serviceId){

window.location.href =
`monitor.html?serviceId=${serviceId}`;

};

// =======================================
// SIDEBAR TOGGLE
// =======================================
const serviceLayout = document.querySelector(".service-layout");
const menuToggle = document.getElementById("menuToggle");

if (menuToggle && serviceLayout) {
    menuToggle.addEventListener("click", () => {
        // desktop
        if(window.innerWidth > 768){
            serviceLayout.classList.toggle("sidebar-collapsed");
        }
        // mobile
        else{
            serviceLayout.classList.toggle("mobile-sidebar-open");
        }
    });
}

// ===============================
// LOGOUT
// ===============================
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        try {
            logoutBtn.innerText = "Logging out...";
            const { signOut } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");
            await signOut(auth);
            window.location.href = "../index.html";
        } catch (error) {
            console.error(error);
            alert("Logout failed");
            logoutBtn.innerText = "Logout";
        }
    });
}