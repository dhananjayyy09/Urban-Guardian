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
      checkWeather(e.latlng.lat, e.latlng.lng);
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
const enableAlertsBtn = document.getElementById('enableAlerts');
const mapMaxButtons = document.querySelectorAll('.map-max');
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photoPreview");
const photoMeta = document.getElementById('photoMeta');
const clearPhotoBtn = document.getElementById("clearPhoto");
const uploadArea = document.getElementById('uploadArea');
const uploadActions = document.getElementById('uploadActions');
const weatherCard = document.getElementById('weatherCard');
const weatherStatus = document.getElementById('weatherStatus');
const weatherSummary = document.getElementById('weatherSummary');
const weatherDetail = document.getElementById('weatherDetail');
const OWM_API_KEY = document.querySelector('meta[name="owm-api-key"]')?.content || '';
const WEATHERAPI_KEY = document.querySelector('meta[name="weatherapi-key"]')?.content || '';
const toastContainer = document.getElementById('toastContainer');

// Load existing incidents
fetch("/api/incidents").then(r => r.json()).then((incidents) => {
  // Sort incidents by timestamp (most recent first)
  incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  incidents.forEach((incident) => {
    addIncidentToMap(incident);
    addIncidentToList(incident);
    maybeNotifyForIncident(incident);
  });
});

// Initialize maps on page load
console.log('Page loaded, initializing maps...');
initializeMaps();

// Fullscreen toggles for maps
mapMaxButtons.forEach(btn => {
  btn.addEventListener('click', () => toggleMapFullscreen(btn.dataset.target));
});

function toggleMapFullscreen(targetId) {
  const panel = document.getElementById(targetId)?.closest('.map-panel');
  if (!panel) return;
  const isFs = panel.classList.toggle('fullscreen');
  // Replace toolbar button label
  const toolbar = panel.querySelector('.map-toolbar');
  if (toolbar) {
    toolbar.innerHTML = '';
    const button = document.createElement('button');
    button.className = 'btn btn-secondary ' + (isFs ? 'map-min' : 'map-max');
    button.dataset.target = targetId;
    button.textContent = isFs ? 'Minimize' : 'Maximize';
    button.addEventListener('click', () => toggleMapFullscreen(targetId));
    toolbar.appendChild(button);
  }
  // Ensure Leaflet map resizes correctly
  setTimeout(() => {
    if (targetId === 'map' && map) map.invalidateSize();
    if (targetId === 'map2' && map2) map2.invalidateSize();
  }, 200);
}

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
  maybeNotifyForIncident(incident);
  
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
  if (!navigator.geolocation) { showToast('Location unavailable', 'Geolocation is not supported by your browser.'); return; }
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    showToast('Secure context required', 'Enable HTTPS for precise location on mobile.');
  }
  locateMeBtn.disabled = true;
  getAccuratePosition({ attempts: 2, highAccuracy: true, timeout: 9000 })
    .then(({ latitude, longitude }) => {
      map.setView([latitude, longitude], 15);
      latEl.value = latitude.toFixed(6);
      lngEl.value = longitude.toFixed(6);
      checkWeather(latitude, longitude);
    })
    .catch((err) => {
      console.error('Geolocation failed', err);
      showToast('Location failed', 'Could not determine your location. Check permissions and GPS.');
    })
    .finally(() => { locateMeBtn.disabled = false; });
});

function getAccuratePosition({ attempts = 2, highAccuracy = true, timeout = 9000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    let done = false;
    const tryOnce = (useHighAccuracy, to) => {
      navigator.geolocation.getCurrentPosition((pos) => {
        if (done) return; done = true;
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      }, (err) => {
        if (attempts > 0) {
          attempts -= 1;
          // fallback to lower accuracy and extended timeout
          tryOnce(false, to + 4000);
        } else {
          reject(err);
        }
      }, { enableHighAccuracy: useHighAccuracy, timeout: to });
    };
    tryOnce(highAccuracy, timeout);
  });
}

// --- Proximity Alerts (2 km) ---
let alertsEnabled = false;
let userPosition = null; // { lat, lng }
let positionWatchId = null;
const NOTIFY_RADIUS_KM = 2;

enableAlertsBtn?.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    showToast('Notifications unavailable', 'Your browser does not support notifications.');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Permission needed', 'Allow notifications to enable alerts.');
      return;
    }
    alertsEnabled = true;
    enableAlertsBtn.textContent = 'Alerts Enabled';
    enableAlertsBtn.disabled = true;
    // Start tracking location if not already
    if (navigator.geolocation && positionWatchId == null) {
      positionWatchId = navigator.geolocation.watchPosition((pos) => {
        userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }, (err) => {
        console.warn('Geolocation watch failed', err);
      }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 });
    }
    // On enabling, evaluate currently loaded incidents
    fetch('/api/incidents').then(r => r.json()).then(list => {
      list.forEach(maybeNotifyForIncident);
    }).catch(() => {});
  } catch (e) {
    console.error('Notification setup failed', e);
  }
});

function maybeNotifyForIncident(incident) {
  if (!alertsEnabled || !userPosition) return;
  const distanceKm = haversineKm(userPosition.lat, userPosition.lng, incident.lat, incident.lng);
  if (distanceKm <= NOTIFY_RADIUS_KM) {
    try {
      const title = `Nearby ${incident.type}`;
      const body = `${(distanceKm).toFixed(1)} km away • ${new Date(incident.timestamp).toLocaleTimeString()}`;
      const icon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🛡️</text></svg>';
      if (document.hasFocus() || Notification.permission !== 'granted') {
        showToast(title, body);
      } else {
        new Notification(title, { body, icon });
      }
    } catch (e) {
      // Fallback if Notification fails
      console.warn('Notification failed, falling back to toast');
      showToast(`Nearby ${incident.type}`, `${(distanceKm).toFixed(1)} km away`);
    }
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (v) => v * Math.PI / 180;
  const R = 6371; // Earth radius km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --- Toast helpers ---
function showToast(title, body) {
  if (!toastContainer) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div><div class="toast-body">${escapeHtml(body || '')}</div>`;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .4s ease';
    setTimeout(() => el.remove(), 450);
  }, 3500);
}

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

  // Optional: check weather at submit time as well
  checkWeather(lat, lng);

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
    // Show weather for that incident location
    checkWeather(incident.lat, incident.lng);
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

// Photo input handlers with validation
photoInput?.addEventListener('change', async () => {
  const file = photoInput.files && photoInput.files[0];
  if (!file) { resetPhotoUI(); return; }
  // Basic validations
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file.');
    photoInput.value = '';
    resetPhotoUI();
    return;
  }
  const maxRawSize = 8 * 1024 * 1024; // 8MB limit before compression
  if (file.size > maxRawSize) {
    alert('Image is too large (max 8MB). Please choose a smaller one.');
    photoInput.value = '';
    resetPhotoUI();
    return;
  }
  try {
    const previewBlob = await compressImage(file, 1600, 0.82).catch(() => file);
    const url = URL.createObjectURL(previewBlob);
    photoPreview.src = url;
    photoPreview.style.display = 'block';
    if (photoMeta) {
      photoMeta.textContent = `${file.name || 'image'} • ${(file.size/1024).toFixed(0)} KB`;
      photoMeta.style.display = 'block';
    }
    if (uploadActions) uploadActions.style.display = 'flex';
    if (clearPhotoBtn) clearPhotoBtn.style.display = 'inline-flex';
  } catch (e) {
    console.error('Preview failed', e);
    alert('Could not preview this image. Try a different file.');
    photoInput.value = '';
    resetPhotoUI();
  }
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
  if (photoMeta) {
    photoMeta.textContent = '—';
    photoMeta.style.display = 'none';
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
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please drop an image.'); return; }
    const maxRawSize = 8 * 1024 * 1024;
    if (file.size > maxRawSize) { alert('Image is too large (max 8MB).'); return; }
    try {
      const previewBlob = await compressImage(file, 1600, 0.82).catch(() => file);
      const url = URL.createObjectURL(previewBlob);
      photoPreview.src = url;
      photoPreview.style.display = 'block';
      if (photoMeta) {
        photoMeta.textContent = `${file.name || 'image'} • ${(file.size/1024).toFixed(0)} KB`;
        photoMeta.style.display = 'block';
      }
      if (uploadActions) uploadActions.style.display = 'flex';
      if (clearPhotoBtn) clearPhotoBtn.style.display = 'inline-flex';
      // Reflect into file input for form submission
      const dt = new DataTransfer();
      dt.items.add(file);
      photoInput.files = dt.files;
    } catch (err) {
      console.error('Drop preview failed', err);
      alert('Could not preview this image.');
    }
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
        const maxRawSize = 8 * 1024 * 1024;
        if (file.size > maxRawSize) { alert('Image is too large (max 8MB).'); return; }
        try {
          const previewBlob = await compressImage(file, 1600, 0.82).catch(() => file);
          const url = URL.createObjectURL(previewBlob);
          photoPreview.src = url;
          photoPreview.style.display = 'block';
          if (photoMeta) {
            photoMeta.textContent = `${file.name || 'image'} • ${(file.size/1024).toFixed(0)} KB`;
            photoMeta.style.display = 'block';
          }
          if (uploadActions) uploadActions.style.display = 'flex';
          if (clearPhotoBtn) clearPhotoBtn.style.display = 'inline-flex';
          const dt = new DataTransfer();
          dt.items.add(file);
          photoInput.files = dt.files;
        } catch (err) {
          console.error('Paste preview failed', err);
          alert('Could not preview this image.');
        }
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

// Weather: fetch and evaluate safety
async function checkWeather(lat, lng) {
  if (!OWM_API_KEY && !WEATHERAPI_KEY) return; // no key set, skip UI
  try {
    let summary = 'Weather data available';
    let temp = 0;
    let wind = 0;
    let conditions = { id: 0, rain1h: 0, snow1h: 0, visibility: 10000 };

    if (WEATHERAPI_KEY) {
      const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHERAPI_KEY}&q=${lat},${lng}&aqi=no`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('WeatherAPI fetch failed');
      const data = await res.json();
      summary = data.current?.condition?.text || summary;
      temp = Math.round(data.current?.temp_c ?? 0);
      wind = Math.round((data.current?.wind_kph ?? 0) / 3.6);
      // WeatherAPI does not give 1h rain directly in current endpoint
      const code = data.current?.condition?.code || 0;
      conditions = {
        id: mapWeatherApiCodeToOwmLike(code),
        rain1h: 0,
        snow1h: 0,
        visibility: Math.round((data.current?.vis_km ?? 10) * 1000)
      };
    } else if (OWM_API_KEY) {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OWM_API_KEY}&units=metric`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('OpenWeather fetch failed');
      const data = await res.json();
      summary = data.weather?.[0]?.description || summary;
      temp = Math.round(data.main?.temp ?? 0);
      wind = Math.round(data.wind?.speed ?? 0);
      conditions = {
        id: data.weather?.[0]?.id || 0,
        rain1h: data.rain?.['1h'] || 0,
        snow1h: data.snow?.['1h'] || 0,
        visibility: data.visibility || 10000
      };
    }

    const level = evaluateWeatherSafety({ temp, wind, ...conditions });
    updateWeatherUI(level, `${summary} • ${temp}°C`, `Wind ${wind} m/s • Vis ${(conditions.visibility/1000).toFixed(1)} km`);
  } catch (e) {
    console.warn('Weather unavailable', e);
  }
}

function evaluateWeatherSafety({ id, temp, wind, rain1h, snow1h, visibility }) {
  // Danger if thunderstorms, heavy rain/snow, extreme temps, very high wind, low vis
  const thunder = id >= 200 && id < 300;
  const heavyRain = (id >= 500 && id < 600) && (rain1h >= 7);
  const heavySnow = (id >= 600 && id < 700) && (snow1h >= 3);
  const extremeHeat = temp >= 40;
  const extremeCold = temp <= -10;
  const highWind = wind >= 15; // ~54 km/h
  const lowVis = visibility <= 1000;

  if (thunder || heavyRain || heavySnow || extremeHeat || extremeCold || lowVis) return 'danger';
  if (wind >= 10 || rain1h >= 3 || snow1h >= 1) return 'warning';
  return 'safe';
}

// Feeds scaffold (placeholders for future integrations)
async function fetchTrafficContext(lat, lng) {
  // TODO: Integrate traffic API (e.g., TomTom HERE) for incidents/flow
  return null;
}

async function fetchGovernmentFeeds(lat, lng) {
  // TODO: Integrate local open data portals or CAP feeds
  return null;
}

async function fetchCrowdsourcedSignals(lat, lng) {
  // TODO: Integrate X/Twitter or other open signals with rate limits
  return null;
}

function updateWeatherUI(level, summary, detail) {
  if (!weatherCard || !weatherStatus) return;
  weatherCard.style.display = 'block';
  weatherStatus.classList.remove('weather-safe','weather-warning','weather-danger');
  if (level === 'danger') weatherStatus.classList.add('weather-danger');
  else if (level === 'warning') weatherStatus.classList.add('weather-warning');
  else weatherStatus.classList.add('weather-safe');
  if (weatherSummary) weatherSummary.textContent = level === 'danger' ? 'Unsafe weather – consider avoiding travel' : level === 'warning' ? 'Caution – conditions may be risky' : 'Safe to travel';
  if (weatherDetail) weatherDetail.textContent = `${summary} • ${detail}`;
}

// Map WeatherAPI condition code roughly to OWM-like id buckets for our rules
function mapWeatherApiCodeToOwmLike(code) {
  // Thunder: 1000 clear, 1003-1009 cloud; 1087 thunder
  if (code === 1087) return 200; // thunderstorm
  // Drizzle/rain
  if ([1063,1180,1183,1186,1189,1192,1195,1240,1243,1246].includes(code)) return 500; // rain
  // Snow
  if ([1066,1069,1114,1117,1210,1213,1216,1219,1222,1225,1255,1258].includes(code)) return 600; // snow
  // Sleet/ice pellets
  if ([1204,1207,1237,1261,1264].includes(code)) return 611; // sleet
  // Fog/mist
  if ([1030,1135,1147].includes(code)) return 741; // fog
  // Extreme
  if ([1273,1276,1279,1282].includes(code)) return 202; // heavy thunder
  return 800; // clear/other
}
