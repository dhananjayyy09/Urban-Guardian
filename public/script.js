const socket = io();

// Create maps for different views
let map, map2;
let homeCluster, incidentsCluster;

// Initialize maps when their containers are visible
function initializeMaps() {
  console.log('Initializing maps...');
  
  // Home map
  if (!map && document.getElementById('map')) {
    console.log('Initializing home map...');
    map = L.map("map").setView([28.6139, 77.2090], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map);
    // Create cluster group for home map
    if (!homeCluster && window.L && L.markerClusterGroup) {
      homeCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        spiderfyOnEveryZoom: false,
        spiderfyOnMaxZoom: true,
        removeOutsideVisibleBounds: true,
        iconCreateFunction: (cluster) => createClusterIcon(cluster)
      });
      map.addLayer(homeCluster);
    }
    
    // Click on map to fill coordinates
    map.on("click", (e) => {
      latEl.value = e.latlng.lat.toFixed(6);
      lngEl.value = e.latlng.lng.toFixed(6);
    });
  }
  
  // Incidents map
  const map2Container = document.getElementById('map2');
  if (!map2 && map2Container) {
    console.log('Initializing incidents map...');
    map2 = L.map("map2").setView([28.6139, 77.2090], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map2);
    // Create cluster group for incidents map
    if (!incidentsCluster && window.L && L.markerClusterGroup) {
      incidentsCluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 60,
        spiderfyOnEveryZoom: false,
        spiderfyOnMaxZoom: true,
        removeOutsideVisibleBounds: true,
        iconCreateFunction: (cluster) => createClusterIcon(cluster)
      });
      map2.addLayer(incidentsCluster);
    }
    
    // Load existing incidents on map2
    fetch("/api/incidents").then(r => r.json()).then((incidents) => {
      console.log('Loading incidents on map2:', incidents.length);
      incidents.forEach((incident) => {
        const marker = L.marker([incident.lat, incident.lng]);
        const desc = incident.description ? incident.description : "No description";
        marker.bindPopup(`<b>${escapeHtml(incident.type)}</b><br>${escapeHtml(desc)}<br>${new Date(incident.timestamp).toLocaleString()}`);
        if (incidentsCluster) {
          incidentsCluster.addLayer(marker);
        } else {
          marker.addTo(map2);
        }
      });
    });
  } else {
    console.log('Map2 container not found or already initialized');
  }
}

// Initialize incidents map specifically
function initializeIncidentsMap() {
  const map2Container = document.getElementById('map2');
  if (map2Container && !map2) {
    console.log('Initializing incidents map specifically...');
    map2 = L.map("map2").setView([28.6139, 77.2090], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors"
    }).addTo(map2);
    
    // Load existing incidents on map2
    fetch("/api/incidents").then(r => r.json()).then((incidents) => {
      console.log('Loading incidents on map2:', incidents.length);
      incidents.forEach((incident) => {
        const marker = L.marker([incident.lat, incident.lng]);
        const desc = incident.description ? incident.description : "No description";
        marker.bindPopup(`<b>${escapeHtml(incident.type)}</b><br>${escapeHtml(desc)}<br>${new Date(incident.timestamp).toLocaleString()}`);
        if (incidentsCluster) {
          incidentsCluster.addLayer(marker);
        } else {
          marker.addTo(map2);
        }
      });
    });
  }
}

const incidentList = document.getElementById("incidentList");
const form = document.getElementById("incidentForm");
const typeEl = document.getElementById("type");
const descEl = document.getElementById("description");
const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");
const locateMeBtn = document.getElementById("locateMe");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photoPreview");
const clearPhotoBtn = document.getElementById("clearPhoto");
const uploadArea = document.getElementById('uploadArea');
const uploadActions = document.getElementById('uploadActions');

// Load existing incidents
fetch("/api/incidents").then(r => r.json()).then((incidents) => {
  // Sort incidents by timestamp (most recent first)
  incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  incidents.forEach((incident) => {
    addIncidentToMap(incident);
    addIncidentToList(incident);
  });
});

// Initialize maps on page load
console.log('Page loaded, initializing maps...');
initializeMaps();

// Debug: Check if map containers exist
setTimeout(() => {
  console.log('Map containers check:');
  console.log('map container:', document.getElementById('map'));
  console.log('map2 container:', document.getElementById('map2'));
  console.log('map2 container visible:', document.getElementById('map2')?.offsetParent !== null);
}, 1000);

// Real-time updates
socket.on("new-incident", (incident) => {
  addIncidentToMap(incident);
  addIncidentToList(incident, true);
  
  // Refresh analytics if analytics tab is currently visible
  const activeNavTab = document.querySelector('.nav-tab-btn.active');
  if (activeNavTab && activeNavTab.dataset.navTab === 'analytics') {
    const activeAnalyticsTab = document.querySelector('.tab-btn.active');
    if (activeAnalyticsTab) {
      if (activeAnalyticsTab.dataset.tab === 'types') {
        loadTypeAnalytics();
      } else if (activeAnalyticsTab.dataset.tab === 'areas') {
        loadAreaAnalytics();
      }
    }
  }
});



// Geolocate
locateMeBtn?.addEventListener("click", () => {
  if (!navigator.geolocation) return alert("Geolocation is not supported by your browser");
  locateMeBtn.disabled = true;
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude, longitude } = pos.coords;
    map.setView([latitude, longitude], 15);
    latEl.value = latitude.toFixed(6);
    lngEl.value = longitude.toFixed(6);
    locateMeBtn.disabled = false;
  }, (err) => {
    alert("Could not get your location");
    console.error(err);
    locateMeBtn.disabled = false;
  }, { enableHighAccuracy: true, timeout: 8000 });
});

// Form submission
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const type = typeEl.value.trim();
  const description = descEl.value.trim();
  const lat = parseFloat(latEl.value);
  const lng = parseFloat(lngEl.value);
  let imageDataUrl = null;

  if (photoInput && photoInput.files && photoInput.files[0]) {
    const file = photoInput.files[0];
    try {
      const compressed = await compressImage(file, 1600, 0.82);
      imageDataUrl = await readFileAsDataURL(compressed);
    } catch (err) {
      console.error('Failed to read image', err);
    }
  }

  if (!type || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return alert("Please provide a type and valid coordinates.");
  }

  try {
    const res = await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, description, lat, lng, image: imageDataUrl })
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
      return alert(error || "Failed to save incident");
    }
    const newIncident = await res.json();
    if (imageDataUrl) newIncident.image = imageDataUrl;
    addIncidentToList(newIncident, true);
    form.reset();
    resetPhotoUI();
  } catch (error) {
    console.error(error);
    alert("Network error while submitting incident");
  }
});

function addIncidentToMap(incident) {
  // Add to home map
  if (map) {
    const marker = L.marker([incident.lat, incident.lng]);
    const desc = incident.description ? incident.description : "No description";
    const img = incident.image ? `<div style="margin-top:6px;"><img src="${incident.image}" alt="incident image" style="max-width:220px; max-height:160px; border-radius:8px;"/></div>` : "";
    marker.bindPopup(`<b>${escapeHtml(incident.type)}</b><br>${escapeHtml(desc)}<br>${new Date(incident.timestamp).toLocaleString()}${img}`);
    if (homeCluster) {
      homeCluster.addLayer(marker);
    } else {
      marker.addTo(map);
    }
  }
  
  // Add to incidents map
  if (map2) {
    const marker2 = L.marker([incident.lat, incident.lng]);
    const desc = incident.description ? incident.description : "No description";
    const img = incident.image ? `<div style="margin-top:6px;"><img src="${incident.image}" alt="incident image" style="max-width:220px; max-height:160px; border-radius:8px;"/></div>` : "";
    marker2.bindPopup(`<b>${escapeHtml(incident.type)}</b><br>${escapeHtml(desc)}<br>${new Date(incident.timestamp).toLocaleString()}${img}`);
    if (incidentsCluster) {
      incidentsCluster.addLayer(marker2);
    } else {
      marker2.addTo(map2);
    }
  }
}

function addIncidentToList(incident, prepend = false) {
  if (!incidentList) return;
  const item = document.createElement("li");
  const type = document.createElement("span");
  type.className = "badge";
  type.textContent = incident.type;

  const info = document.createElement("div");
  const desc = document.createElement("div");
  desc.textContent = incident.description || "No description";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${incident.lat.toFixed(4)}, ${incident.lng.toFixed(4)} • ${new Date(incident.timestamp).toLocaleString()}`;
  info.appendChild(desc);
  info.appendChild(meta);

  if (incident.image) {
    const img = document.createElement('img');
    img.src = incident.image;
    img.alt = 'incident image';
    img.style.maxWidth = '100%';
    img.style.maxHeight = '180px';
    img.style.borderRadius = '8px';
    img.style.marginTop = '6px';
    info.appendChild(img);
  }

  const locateBtn = document.createElement("button");
  locateBtn.className = "btn btn-secondary";
  locateBtn.textContent = "View";
  locateBtn.addEventListener("click", () => {
    // Use the appropriate map based on current view
    const activeTab = document.querySelector('.nav-tab-btn.active').dataset.navTab;
    if (activeTab === 'home' && map) {
      map.setView([incident.lat, incident.lng], 16);
    } else if (activeTab === 'incidents' && map2) {
      map2.setView([incident.lat, incident.lng], 16);
    }
  });

  item.appendChild(type);
  item.appendChild(info);
  item.appendChild(locateBtn);

  // Always add new incidents at the top
  if (incidentList.firstChild) {
    incidentList.insertBefore(item, incidentList.firstChild);
  } else {
    incidentList.appendChild(item);
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Navigation tabs functionality
const navTabBtns = document.querySelectorAll('.nav-tab-btn');
const viewPanels = document.querySelectorAll('.view-panel');

console.log('Navigation tabs found:', navTabBtns.length);
console.log('View panels found:', viewPanels.length);

// Navigation tab switching
navTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetNavTab = btn.dataset.navTab;
    console.log('Navigation tab clicked:', targetNavTab);
    
    // Update active states
    navTabBtns.forEach(b => b.classList.remove('active'));
    viewPanels.forEach(p => p.classList.remove('active'));
    
    btn.classList.add('active');
    const targetPanel = document.getElementById(targetNavTab + 'Panel');
    targetPanel.classList.add('active');
    console.log('Target panel:', targetPanel);
    
    // Initialize maps when switching to views that need them
    setTimeout(() => {
      initializeMaps();
      
      // Special handling for incidents view
      if (targetNavTab === 'incidents') {
        console.log('Switching to incidents view...');
        // Initialize incidents map specifically
        setTimeout(() => {
          initializeIncidentsMap();
          if (map2) {
            setTimeout(() => {
              map2.invalidateSize();
              console.log('Map2 invalidated size');
            }, 200);
          }
        }, 200);
      }
    }, 100);
    
    // Load analytics data if switching to analytics tab
    if (targetNavTab === 'analytics') {
      console.log('Loading analytics...');
      loadTypeAnalytics();
    }
  });
});

// Analytics functionality
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Analytics tab switching
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    
    // Update active states
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(targetTab + 'Tab').classList.add('active');
    
    // Load analytics data
    if (targetTab === 'types') {
      loadTypeAnalytics();
    } else if (targetTab === 'areas') {
      loadAreaAnalytics();
    }
  });
});

// Load type analytics
async function loadTypeAnalytics() {
  try {
    console.log('Loading type analytics...');
    const response = await fetch('/api/analytics/types');
    const data = await response.json();
    console.log('Type analytics data:', data);
    
    // Update stats
    document.getElementById('totalIncidents').textContent = data.total;
    document.getElementById('mostReportedType').textContent = 
      data.mostReported ? data.mostReported.type : 'None';
    
    // Create type chart
    const chartContainer = document.getElementById('typeChart');
    chartContainer.innerHTML = '';
    
    data.types.forEach(type => {
      const bar = document.createElement('div');
      bar.className = 'type-bar';
      bar.innerHTML = `
        <div class="type-name">${type.type}</div>
        <div class="type-bar-bg">
          <div class="type-bar-fill" style="width: ${type.percentage}%"></div>
        </div>
        <div class="type-count">${type.count}</div>
      `;
      chartContainer.appendChild(bar);
    });
  } catch (error) {
    console.error('Failed to load type analytics:', error);
  }
}

// Load area analytics
async function loadAreaAnalytics() {
  try {
    console.log('Loading area analytics...');
    const response = await fetch('/api/analytics/areas');
    const data = await response.json();
    console.log('Area analytics data:', data);
    
    // Update stats
    document.getElementById('recent24h').textContent = data.trends.recent24h;
    document.getElementById('recent7d').textContent = data.trends.recent7d;
    document.getElementById('hotspots').textContent = data.hotspots.length;
    
    // Create hotspot list
    const hotspotContainer = document.getElementById('hotspotList');
    hotspotContainer.innerHTML = '';
    
    data.hotspots.forEach((hotspot, index) => {
      const item = document.createElement('div');
      item.className = 'hotspot-item';
      item.innerHTML = `
        <div class="hotspot-count">${hotspot.count}</div>
        <div class="hotspot-info">
          <div class="hotspot-type">${hotspot.mostCommonType.charAt(0).toUpperCase() + hotspot.mostCommonType.slice(1)}</div>
          <div class="hotspot-location">${hotspot.center.lat.toFixed(4)}, ${hotspot.center.lng.toFixed(4)}</div>
        </div>
        <div class="hotspot-view">View</div>
      `;
      
      // Add click handler to center map on hotspot
      item.addEventListener('click', () => {
        map.setView([hotspot.center.lat, hotspot.center.lng], 14);
        
        // Add a temporary marker to highlight the hotspot
        const marker = L.marker([hotspot.center.lat, hotspot.center.lng], {
          icon: L.divIcon({
            className: 'hotspot-marker',
            html: `<div style="background: #ef4444; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${hotspot.count}</div>`,
            iconSize: [20, 20]
          })
        }).addTo(map);
        
        // Remove marker after 3 seconds
        setTimeout(() => {
          map.removeLayer(marker);
        }, 3000);
      });
      
      hotspotContainer.appendChild(item);
    });
  } catch (error) {
    console.error('Failed to load area analytics:', error);
  }
}



// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Photo input handlers
photoInput?.addEventListener('change', async () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) { resetPhotoUI(); return; }
  const previewBlob = await compressImage(file, 1600, 0.82).catch(() => file);
  const url = URL.createObjectURL(previewBlob);
  photoPreview.src = url;
  photoPreview.style.display = 'block';
  if (uploadActions) uploadActions.style.display = 'flex';
  if (clearPhotoBtn) clearPhotoBtn.style.display = 'inline-flex';
});

clearPhotoBtn?.addEventListener('click', () => {
  photoInput.value = '';
  resetPhotoUI();
});

function resetPhotoUI() {
  if (photoPreview) {
    photoPreview.src = '';
    photoPreview.style.display = 'none';
  }
  if (clearPhotoBtn) clearPhotoBtn.style.display = 'none';
  if (uploadActions) uploadActions.style.display = 'none';
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Drag & drop and paste support
if (uploadArea) {
  ['dragenter','dragover'].forEach(evt => uploadArea.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('is-dragover');
  }));
  ['dragleave','drop'].forEach(evt => uploadArea.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('is-dragover');
  }));
  uploadArea.addEventListener('drop', async (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const previewBlob = await compressImage(file, 1600, 0.82).catch(() => file);
    const url = URL.createObjectURL(previewBlob);
    photoPreview.src = url;
    photoPreview.style.display = 'block';
    if (uploadActions) uploadActions.style.display = 'flex';
    if (clearPhotoBtn) clearPhotoBtn.style.display = 'inline-flex';
    // Reflect into file input for form submission
    const dt = new DataTransfer();
    dt.items.add(file);
    photoInput.files = dt.files;
  });

  // Paste support
  uploadArea.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile();
        if (!file) continue;
        const previewBlob = await compressImage(file, 1600, 0.82).catch(() => file);
        const url = URL.createObjectURL(previewBlob);
        photoPreview.src = url;
        photoPreview.style.display = 'block';
        if (uploadActions) uploadActions.style.display = 'flex';
        if (clearPhotoBtn) clearPhotoBtn.style.display = 'inline-flex';
        const dt = new DataTransfer();
        dt.items.add(file);
        photoInput.files = dt.files;
        break;
      }
    }
  });
}

// Client-side image compression
function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const { width, height } = scaleToFit(img.width, img.height, maxSize);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Compression failed'));
        resolve(blob);
      }, 'image/jpeg', quality);
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function scaleToFit(w, h, max) {
  const ratio = Math.min(max / w, max / h, 1);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

// Cluster icon with count-based tiers
function createClusterIcon(cluster) {
  const count = cluster.getChildCount();
  let c = ' marker-cluster-small';
  if (count >= 50) c = ' marker-cluster-large';
  else if (count >= 10) c = ' marker-cluster-medium';
  const html = `<div><span>${count}</span></div>`;
  return new L.DivIcon({ html, className: 'marker-cluster' + c, iconSize: new L.Point(40, 40) });
}
