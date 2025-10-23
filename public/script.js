const socket = io();
let map, map2;
let homeCluster, incidentsCluster;
let homeHeatmap, incidentsHeatmap;
let allIncidents = [];
let myDeletionId = null;  // Track your own deletions
let myUpdateId = null;    // Track your own updates

document.addEventListener('DOMContentLoaded', () => {

  // Initialize maps when their containers are visible
  function initializeMaps() {
    console.log('Initializing maps...');
    if (!map && document.getElementById('map')) {
      console.log('Initializing home map...');
      map = L.map("map").setView([28.6139, 77.2090], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors"
      }).addTo(map);

      // Create cluster group for home map
      if (!homeCluster && window.L && L.markerClusterGroup) {
        homeCluster = L.markerClusterGroup({ /* ... options ... */ });
        map.addLayer(homeCluster);
      }

      // Initialize heatmap for home map
      if (!homeHeatmap && window.L && L.heatLayer) {
        homeHeatmap = L.heatLayer([], {
          radius: 30,
          blur: 20,
          maxZoom: 16,
          max: 1.0,
          gradient: {
            0.1: 'rgba(0, 100, 255, 0.3)',
            0.3: 'rgba(0, 255, 255, 0.5)',
            0.5: 'rgba(0, 255, 0, 0.7)',
            0.7: 'rgba(255, 255, 0, 0.8)',
            0.9: 'rgba(255, 165, 0, 0.9)',
            1.0: 'rgba(255, 0, 0, 1.0)'
          }
        });
        console.log('Home heatmap layer created');
      }

      map.on("click", (e) => {
        latEl.value = e.latlng.lat.toFixed(6);
        lngEl.value = e.latlng.lng.toFixed(6);
        checkWeather(e.latlng.lat, e.latlng.lng);
      });
    }

    const map2Container = document.getElementById('map2');
    if (!map2 && map2Container) {
      console.log('Initializing incidents map...');
      map2 = L.map("map2").setView([28.6139, 77.2090], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors"
      }).addTo(map2);

      // Create cluster group for incidents map
      if (!incidentsCluster && window.L && L.markerClusterGroup) {
        incidentsCluster = L.markerClusterGroup({ /* ... options ... */ });
        map2.addLayer(incidentsCluster);
      }

      // Initialize heatmap for incidents map
      if (!incidentsHeatmap && window.L && L.heatLayer) {
        incidentsHeatmap = L.heatLayer([], {
          radius: 30,
          blur: 20,
          maxZoom: 16,
          max: 1.0,
          gradient: {
            0.1: 'rgba(0, 100, 255, 0.3)',
            0.3: 'rgba(0, 255, 255, 0.5)',
            0.5: 'rgba(0, 255, 0, 0.7)',
            0.7: 'rgba(255, 255, 0, 0.8)',
            0.9: 'rgba(255, 165, 0, 0.9)',
            1.0: 'rgba(255, 0, 0, 1.0)'
          }
        });
        console.log('Incidents heatmap layer created');
      }
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
  const mapMinButtons = document.querySelectorAll('.map-min');
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
  const heatmapGuide = document.getElementById('heatmapGuide');
  const heatmapGuideOverlay = document.getElementById('heatmapGuideOverlay');
  const closeGuideBtn = document.getElementById('closeGuide');

  // Initialize maps first
  console.log('Page loaded, initializing map containers...');
  initializeMaps();

  // Fetch incidents and populate
  fetch("/api/incidents")
    .then(async res => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json();
    })
    .then(async (incidents) => {
      incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      allIncidents = incidents;
      console.log(`Loaded ${allIncidents.length} incidents.`);

      await Promise.all(allIncidents.map(async incident => {
        await addIncidentToMap(incident);
        addIncidentToList(incident);
        maybeNotifyForIncident(incident);
      }));

      updateHeatmap(map, homeHeatmap, allIncidents);
      updateHeatmap(map2, incidentsHeatmap, allIncidents);
    })
    .catch(error => {
      console.error("Failed to load initial incidents:", error);
      showToast("Load Error", "Could not load incident data from the server.");
    });

  // Fullscreen toggles
  mapMaxButtons.forEach(btn => {
    btn.addEventListener('click', () => toggleMapFullscreen(btn.dataset.target));
  });

  // 📍 ADD EVENT LISTENERS FOR MINIMIZE BUTTONS
  mapMinButtons.forEach(btn => {
    btn.addEventListener('click', () => toggleMapFullscreen(btn.dataset.target));
  });
  // Heatmap toggle
  const heatmapToggleButtons = document.querySelectorAll('.heatmap-toggle');
  const heatmapInfoButtons = document.querySelectorAll('.heatmap-info');
  let heatmapStates = { home: false, incidents: false };

  heatmapToggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetMap = btn.dataset.target;
      const heatmapType = btn.dataset.heatmap;

      heatmapStates[heatmapType] = !heatmapStates[heatmapType];

      let mapInstance, heatmapLayer;
      if (targetMap === 'map') {
        mapInstance = map;
        heatmapLayer = homeHeatmap;
      } else if (targetMap === 'map2') {
        mapInstance = map2;
        heatmapLayer = incidentsHeatmap;
      }

      toggleHeatmap(mapInstance, heatmapLayer, heatmapStates[heatmapType]);

      btn.textContent = heatmapStates[heatmapType] ? 'Hide Heatmap' : 'Show Heatmap';
      btn.classList.toggle('active', heatmapStates[heatmapType]);

      if (heatmapStates[heatmapType] && !localStorage.getItem('heatmapGuideShown')) {
        showHeatmapGuide();
        localStorage.setItem('heatmapGuideShown', 'true');
      }

      const action = heatmapStates[heatmapType] ? 'enabled' : 'disabled';
      showToast('Incident Heatmap ' + action, heatmapStates[heatmapType] ?
        'Heatmap shows incident-prone areas: Blue=Low Risk, Yellow=High Risk, Red=Critical Areas.' :
        'Heatmap hidden. Individual markers are still visible.');
    });
  });

  heatmapInfoButtons.forEach(btn => {
    btn.addEventListener('click', () => showHeatmapGuide());
  });

  // Update the toggleMapFullscreen function
  function toggleMapFullscreen(targetId) {
    const panel = document.getElementById(targetId)?.closest('.map-panel');
    if (!panel) return;

    const isFs = panel.classList.toggle('fullscreen');

    const toolbar = panel.querySelector('.map-toolbar');
    if (toolbar) {
      const maxBtn = toolbar.querySelector('.map-max');
      const minBtn = toolbar.querySelector('.map-min');

      if (maxBtn && minBtn) {
        if (isFs) {
          // Fullscreen: hide maximize, show minimize
          maxBtn.style.display = 'none';
          minBtn.style.display = 'inline-flex';
        } else {
          // Normal: show maximize, hide minimize
          maxBtn.style.display = 'inline-flex';
          minBtn.style.display = 'none';
        }
      }
    }

    // Resize map after transition
    setTimeout(() => {
      if (targetId === 'map' && map) map.invalidateSize();
      if (targetId === 'map2' && map2) map2.invalidateSize();
    }, 200);
  }

  // Real-time updates
  socket.on('new-incident', async (incident) => {
    allIncidents.unshift(incident);
    await addIncidentToMap(incident);  // 🔧 ADD await
    addIncidentToList(incident, true);
    maybeNotifyForIncident(incident);

    updateHeatmap(map, homeHeatmap, allIncidents);
    updateHeatmap(map2, incidentsHeatmap, allIncidents);
  });

  // NEW Socket listener for incident updates
  // Socket listener for incident updates
  socket.on('incident-updated', async (data) => {
    console.log('Incident updated:', data);

    // 🔧 Skip if this was YOUR update
    if (myUpdateId === data.incident.id) {
      console.log('⏭️ Skipping own update - ID:', myUpdateId);

      // Clear clusters and re-add everything (just once)
      if (homeCluster) homeCluster.clearLayers();
      if (incidentsCluster) incidentsCluster.clearLayers();

      for (const inc of allIncidents) {
        await addIncidentToMap(inc);
      }

      updateHeatmap(map, homeHeatmap, allIncidents);
      updateHeatmap(map2, incidentsHeatmap, allIncidents);

      myUpdateId = null; // Reset after handling
      return;
    }

    // This runs only for OTHER users' updates
    const index = allIncidents.findIndex(i => i.id === data.incident.id);
    if (index !== -1) {
      allIncidents[index] = data.incident;
    }

    // Clear and refresh markers
    if (homeCluster) homeCluster.clearLayers();
    if (incidentsCluster) incidentsCluster.clearLayers();

    for (const inc of allIncidents) {
      await addIncidentToMap(inc);
    }

    updateHeatmap(map, homeHeatmap, allIncidents);
    updateHeatmap(map2, incidentsHeatmap, allIncidents);

    showToast('Incident Updated', `${data.incident.type} status: ${data.incident.status}`);
  });

  // Real-time deletion updates
  socket.on('incident-deleted', async (data) => {
    console.log('Incident deleted:', data.id);

    const index = allIncidents.findIndex(i => i.id === data.id);
    if (index !== -1) {
      const deletedIncident = allIncidents[index];
      allIncidents.splice(index, 1);

      // 🔧 FIX: Clear layers, then add sequentially
      if (homeCluster) homeCluster.clearLayers();
      if (incidentsCluster) incidentsCluster.clearLayers();

      // ✅ Process one at a time to prevent duplicates
      for (const inc of allIncidents) {
        await addIncidentToMap(inc);
      }

      updateHeatmap(map, homeHeatmap, allIncidents);
      updateHeatmap(map2, incidentsHeatmap, allIncidents);

      // Remove from incident list
      const incidentList = document.getElementById('incidentList');
      if (incidentList) {
        const listItems = Array.from(incidentList.children);
        listItems.forEach(item => {
          const metaDiv = item.querySelector('.meta');
          if (metaDiv) {
            const hasIncident = allIncidents.some(inc => {
              const coordText = `${inc.lat.toFixed(4)}, ${inc.lng.toFixed(4)}`;
              return metaDiv.textContent.includes(coordText);
            });

            if (!hasIncident && metaDiv.textContent) {
              item.remove();
            }
          }
        });
      }

      showToast('Incident Removed', `${deletedIncident.type} was deleted`);
    }
  });


  // Geolocate
  locateMeBtn?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast('Location unavailable', 'Geolocation not supported');
      return;
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
        showToast('Location failed', 'Could not determine location');
      })
      .finally(() => { locateMeBtn.disabled = false; });
  });

  function getAccuratePosition({ attempts = 2, highAccuracy = true, timeout = 9000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('no geolocation'));
      let done = false;
      const tryOnce = (useHighAccuracy, to) => {
        navigator.geolocation.getCurrentPosition((pos) => {
          if (done) return;
          done = true;
          resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        }, (err) => {
          if (attempts > 0) {
            attempts -= 1;
            tryOnce(false, to + 4000);
          } else {
            reject(err);
          }
        }, { enableHighAccuracy: useHighAccuracy, timeout: to });
      };
      tryOnce(highAccuracy, timeout);
    });
  }

  // Proximity alerts
  let alertsEnabled = false;
  let userPosition = null;
  let positionWatchId = null;
  const NOTIFY_RADIUS_KM = 2;

  enableAlertsBtn?.addEventListener('click', async () => {
    let permission = 'default';
    if ('Notification' in window) {
      try {
        permission = await Notification.requestPermission();
      } catch (_) {
        permission = 'default';
      }
    }

    alertsEnabled = true;
    enableAlertsBtn.textContent = 'Alerts Enabled';
    enableAlertsBtn.disabled = true;

    if (permission !== 'granted') {
      showToast('Alerts enabled', 'Using in-app alerts');
    } else {
      showToast('Alerts enabled', 'You will receive nearby notifications');
    }

    if (navigator.geolocation && positionWatchId == null) {
      positionWatchId = navigator.geolocation.watchPosition((pos) => {
        userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }, (err) => {
        console.warn('Geolocation watch failed', err);
      }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 8000 });
    }

    allIncidents.forEach(maybeNotifyForIncident);
  });

  function maybeNotifyForIncident(incident) {
    if (!alertsEnabled || !userPosition) return;
    const distanceKm = haversineKm(userPosition.lat, userPosition.lng, incident.lat, incident.lng);
    if (distanceKm <= NOTIFY_RADIUS_KM) {
      const title = `Nearby ${incident.type}`;
      const body = `${distanceKm.toFixed(1)} km away`;
      if (document.hasFocus() || Notification.permission !== 'granted') {
        showToast(title, body);
      } else {
        new Notification(title, { body });
      }
    }
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (v) => v * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Heatmap functions
  function processIncidentsForHeatmap(incidents) {
    const hotspots = createIncidentHotspots(incidents);
    return hotspots.map(hotspot => {
      const { lat, lng, totalIntensity } = hotspot;
      let baseIntensity = Math.min(totalIntensity / 10, 1.0);
      return [lat, lng, Math.max(baseIntensity, 0.1)];
    });
  }

  function createIncidentHotspots(incidents, clusterRadius = 0.01) {
    const hotspots = [];
    const processed = new Set();

    incidents.forEach((incident, index) => {
      if (processed.has(index)) return;

      const cluster = [incident];
      processed.add(index);

      incidents.forEach((otherIncident, otherIndex) => {
        if (processed.has(otherIndex)) return;

        const distance = Math.sqrt(
          Math.pow(incident.lat - otherIncident.lat, 2) +
          Math.pow(incident.lng - otherIncident.lng, 2)
        );

        if (distance <= clusterRadius) {
          cluster.push(otherIncident);
          processed.add(otherIndex);
        }
      });

      const centerLat = cluster.reduce((sum, inc) => sum + inc.lat, 0) / cluster.length;
      const centerLng = cluster.reduce((sum, inc) => sum + inc.lng, 0) / cluster.length;

      const totalIntensity = cluster.reduce((sum, inc) => {
        const severity = getIncidentSeverity(inc.type);
        const timeWeight = getTimeWeight(inc.timestamp);
        return sum + (severity * timeWeight);
      }, 0);

      hotspots.push({
        lat: centerLat,
        lng: centerLng,
        incidents: cluster,
        totalIntensity: totalIntensity,
        count: cluster.length
      });
    });

    return hotspots;
  }

  function getIncidentSeverity(type) {
    switch (type.toLowerCase()) {
      case 'earthquake': return 10;
      case 'fire': return 9;
      case 'crime': return 8;
      case 'accident': return 7;
      case 'medical': return 6;
      case 'hazard': return 5;
      default: return 4;
    }
  }

  function getTimeWeight(timestamp) {
    const now = Date.now();
    const age = now - new Date(timestamp).getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    if (age < oneDay) return 1.0;
    if (age < oneWeek) return 0.8;
    if (age < oneMonth) return 0.6;
    return 0.3;
  }

  function updateHeatmap(mapInstance, heatmapLayer, incidents) {
    if (!mapInstance || !heatmapLayer) return;
    const heatmapData = processIncidentsForHeatmap(incidents);
    heatmapLayer.setLatLngs(heatmapData);
  }

  function toggleHeatmap(mapInstance, heatmapLayer, isVisible) {
    if (!mapInstance || !heatmapLayer) return;

    if (isVisible) {
      if (!mapInstance.hasLayer(heatmapLayer)) {
        mapInstance.addLayer(heatmapLayer);
      }
    } else {
      if (mapInstance.hasLayer(heatmapLayer)) {
        mapInstance.removeLayer(heatmapLayer);
      }
    }
  }

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

  function showHeatmapGuide() {
    if (!heatmapGuide || !heatmapGuideOverlay) return;
    heatmapGuideOverlay.style.display = 'block';
    heatmapGuide.style.display = 'block';
  }

  function hideHeatmapGuide() {
    if (!heatmapGuide || !heatmapGuideOverlay) return;
    heatmapGuideOverlay.style.display = 'none';
    heatmapGuide.style.display = 'none';
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

    if (!type || !Number.isFinite(lat) || !Number.isFinite(lng) || !imageDataUrl) {
      return alert("Please fill in all required fields including a photo.");
    }

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
      console.log("✅ Incident saved");
      form.reset();
      resetPhotoUI();
    } catch (error) {
      console.error(error);
      alert("Network error");
    }
  });

  // 📍 NEW: Create incident popup with updates
  async function createIncidentPopup(incident) {
    let updates = [];
    try {
      const response = await fetch(`/api/incidents/${incident.id}/updates`);
      updates = await response.json();
    } catch (err) {
      console.error('Error fetching updates:', err);
    }

    const statusEmojis = {
      'reported': '📝',
      'verified': '✓',
      'responding': '🚨',
      'resolved': '✅',
      'false_alarm': '❌'
    };

    const statusLabels = {
      'reported': 'Reported',
      'verified': 'Verified',
      'responding': 'Responding',
      'resolved': 'Resolved',
      'false_alarm': 'False Alarm'
    };

    let popupContent = `
    <div class="incident-popup">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span class="badge">${incident.type}</span>
        <span class="status-badge status-${incident.status || 'reported'}">
          ${statusEmojis[incident.status || 'reported']} ${statusLabels[incident.status || 'reported']}
        </span>
      </div>
      <p style="font-size: 12px; margin: 6px 0;">${incident.description || 'No description'}</p>
      <div class="meta">${new Date(incident.timestamp).toLocaleString()}</div>
  `;

    if (incident.image) {
      popupContent += `
      <img src="${incident.image}" alt="Incident photo" 
           style="width: 100%; max-height: 150px; object-fit: cover; border-radius: 6px; margin-top: 8px; cursor: pointer;"
           onclick="window.open('${incident.image}', '_blank')">
    `;
    }

    if (updates.length > 0) {
      popupContent += `
      <div class="popup-updates">
        <h4 style="font-size: 11px; color: var(--muted); margin: 8px 0 6px 0;">Updates (${updates.length})</h4>
    `;

      updates.slice(0, 3).forEach(update => {
        popupContent += `
        <div class="popup-update">
          <div class="popup-update-status">
            ${statusEmojis[update.status]} ${statusLabels[update.status]}
          </div>
          <div class="popup-update-text">${update.update_text}</div>
          <div class="popup-update-time">${new Date(update.timestamp).toLocaleString()}</div>
        </div>
      `;
      });

      if (updates.length > 3) {
        popupContent += `<div style="font-size: 10px; color: var(--muted); margin-top: 4px;">+ ${updates.length - 3} more updates</div>`;
      }

      popupContent += `</div>`;
    }

    popupContent += `
    <button class="btn btn-primary" style="width: 100%; margin-top: 10px; font-size: 11px; padding: 6px;"
            onclick="openIncidentDetail(${incident.id})">
      View Details & Add Update
    </button>
    <button class="btn btn-secondary delete-incident-btn" style="width: 100%; font-size: 11px; padding: 6px;"
            onclick="confirmDeleteIncident(${incident.id})">
      🗑️ Delete Incident
    </button></div>
  `;

    return popupContent;
  }

  // 📍 NEW: Modal functions
  window.openIncidentDetail = function (incidentId) {
    const incident = allIncidents.find(i => i.id === incidentId);
    if (!incident) return;

    const modalHTML = `
    <div id="incidentModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div class="card" style="max-width: 500px; width: 100%; max-height: 90vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h2 style="margin: 0;">Incident Details</h2>
          <button onclick="closeIncidentModal()" class="btn btn-secondary" style="padding: 6px 12px;">✕</button>
        </div>
        
        <div class="incident-detail-content">
          <div style="margin-bottom: 12px;">
            <span class="badge">${incident.type}</span>
            <span class="status-badge status-${incident.status || 'reported'}" style="margin-left: 8px;">
              ${incident.status || 'reported'}
            </span>
          </div>
          
          <p>${incident.description || 'No description'}</p>
          <div class="meta">${new Date(incident.timestamp).toLocaleString()}</div>
          
          ${incident.image ? `<img src="${incident.image}" style="width: 100%; border-radius: 10px; margin: 12px 0;">` : ''}
          
          <div class="updates-section" id="updatesTimeline">
            <h4>Update Timeline</h4>
            <div id="updatesList"></div>
          </div>

          <button class="btn btn-secondary delete-incident-btn" style="width: 100%;"
                  onclick="confirmDeleteIncident(${incidentId})">
            🗑️ Delete This Incident
          </button>
          
          <div class="add-update-form">
            <h4>Add an Update</h4>
            <form id="addUpdateForm" onsubmit="submitUpdate(event, ${incidentId})">
              <select id="updateStatus" required>
                <option value="">Select status</option>
                <option value="reported">📝 Reported</option>
                <option value="verified">✓ Verified</option>
                <option value="responding">🚨 Responding</option>
                <option value="resolved">✅ Resolved</option>
                <option value="false_alarm">❌ False Alarm</option>
              </select>
              <textarea id="updateText" rows="3" placeholder="What's the latest update?" required></textarea>
              <button type="submit" class="btn btn-primary">Post Update</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    loadIncidentUpdates(incidentId);
  };

  window.closeIncidentModal = function () {
    const modal = document.getElementById('incidentModal');
    if (modal) modal.remove();
  };

  async function loadIncidentUpdates(incidentId) {
    try {
      const response = await fetch(`/api/incidents/${incidentId}/updates`);
      const updates = await response.json();

      const updatesList = document.getElementById('updatesList');

      if (updates.length === 0) {
        updatesList.innerHTML = '<p style="font-size: 12px; color: var(--muted);">No updates yet. Be the first to add one!</p>';
        return;
      }

      updatesList.innerHTML = updates.map(update => `
      <div class="update-item">
        <div class="update-header">
          <span class="status-badge status-${update.status}">${update.status}</span>
          <span class="update-time">${new Date(update.timestamp).toLocaleString()}</span>
        </div>
        <div class="update-text">${update.update_text}</div>
      </div>
    `).join('');
    } catch (err) {
      console.error('Error loading updates:', err);
    }
  }

  window.submitUpdate = async function (event, incidentId) {
    event.preventDefault();

    const status = document.getElementById('updateStatus').value;
    const update_text = document.getElementById('updateText').value;

    try {
      // 🔧 Set tracking variable BEFORE the request
      myUpdateId = incidentId;

      const response = await fetch(`/api/incidents/${incidentId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, update_text })
      });

      if (response.ok) {
        showToast('Update Posted', 'Update added successfully');
        document.getElementById('addUpdateForm').reset();

        // Reload the updates in the modal
        loadIncidentUpdates(incidentId);

        // 🔧 DON'T refresh the entire map here!
        // The socket listener will handle it (but skip for your own update)

        // Just update the specific incident in memory
        const res = await fetch(`/api/incidents/${incidentId}`);
        const updatedIncident = await res.json();

        const index = allIncidents.findIndex(i => i.id === incidentId);
        if (index !== -1) {
          allIncidents[index] = updatedIncident;
        }

      } else {
        myUpdateId = null; // Reset on error
        showToast('Error', 'Failed to post update');
      }
    } catch (err) {
      myUpdateId = null; // Reset on error
      console.error('Error posting update:', err);
      showToast('Error', 'Failed to post update');
    }
  };

  async function addIncidentToMap(incident) {
    if (map) {
      const marker = L.marker([incident.lat, incident.lng]);
      const popupContent = await createIncidentPopup(incident);
      marker.bindPopup(popupContent, { maxWidth: 300 });

      if (homeCluster) {
        homeCluster.addLayer(marker);
      } else {
        marker.addTo(map);
      }
    }

    if (map2) {
      const marker2 = L.marker([incident.lat, incident.lng]);
      const popupContent = await createIncidentPopup(incident);
      marker2.bindPopup(popupContent, { maxWidth: 300 });

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
      const activeTab = document.querySelector('.nav-tab-btn.active').dataset.navTab;
      if (activeTab === 'home' && map) {
        map.setView([incident.lat, incident.lng], 16);
      } else if (activeTab === 'incidents' && map2) {
        map2.setView([incident.lat, incident.lng], 16);
      }
      checkWeather(incident.lat, incident.lng);
    });

    item.appendChild(type);
    item.appendChild(info);
    item.appendChild(locateBtn);

    if (incidentList.firstChild) {
      incidentList.insertBefore(item, incidentList.firstChild);
    } else {
      incidentList.appendChild(item);
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  // Navigation tabs
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const viewPanels = document.querySelectorAll('.view-panel');

  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetNavTab = btn.dataset.navTab;

      navTabBtns.forEach(b => b.classList.remove('active'));
      viewPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(targetNavTab + 'Panel').classList.add('active');

      setTimeout(() => {
        if (targetNavTab === 'home' && map) map.invalidateSize();
        else if (targetNavTab === 'incidents' && map2) map2.invalidateSize();
      }, 150);

      if (targetNavTab === 'analytics') loadTypeAnalytics();
    });
  });

  // Analytics tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab + 'Tab').classList.add('active');

      if (targetTab === 'types') {
        loadTypeAnalytics();
      } else if (targetTab === 'areas') {
        loadAreaAnalytics();
      }
    });
  });

  async function loadTypeAnalytics() {
    try {
      const response = await fetch('/api/analytics/types');
      const data = await response.json();

      document.getElementById('totalIncidents').textContent = data.total;
      document.getElementById('mostReportedType').textContent = data.mostReported ? data.mostReported.type : 'None';

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

  async function loadAreaAnalytics() {
    try {
      const response = await fetch('/api/analytics/areas');
      const data = await response.json();

      document.getElementById('recent24h').textContent = data.trends.recent24h;
      document.getElementById('recent7d').textContent = data.trends.recent7d;
      document.getElementById('hotspots').textContent = data.hotspots.length;

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

        item.addEventListener('click', () => {
          map.setView([hotspot.center.lat, hotspot.center.lng], 14);
        });

        hotspotContainer.appendChild(item);
      });
    } catch (error) {
      console.error('Failed to load area analytics:', error);
    }
  }

  // Footer year
  document.getElementById("year").textContent = new Date().getFullYear();

  // Photo handlers
  photoInput?.addEventListener('change', async () => {
    const file = photoInput.files && photoInput.files[0];
    if (!file) {
      resetPhotoUI();
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      photoInput.value = '';
      resetPhotoUI();
      return;
    }
    const maxRawSize = 8 * 1024 * 1024;
    if (file.size > maxRawSize) {
      alert('Image too large (max 8MB)');
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
        photoMeta.textContent = `${file.name || 'image'} • ${(file.size / 1024).toFixed(0)} KB`;
        photoMeta.style.display = 'block';
      }
      if (uploadActions) uploadActions.style.display = 'flex';
    } catch (e) {
      console.error('Preview failed', e);
      alert('Could not preview image');
      photoInput.value = '';
      resetPhotoUI();
    }
  });

  clearPhotoBtn?.addEventListener('click', () => {
    photoInput.value = '';
    resetPhotoUI();
  });

  closeGuideBtn?.addEventListener('click', hideHeatmapGuide);
  heatmapGuideOverlay?.addEventListener('click', hideHeatmapGuide);

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

  // Drag & drop
  if (uploadArea) {
    ['dragenter', 'dragover'].forEach(evt => uploadArea.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.add('is-dragover');
    }));
    ['dragleave', 'drop'].forEach(evt => uploadArea.addEventListener(evt, (e) => {
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

      const dt = new DataTransfer();
      dt.items.add(file);
      photoInput.files = dt.files;
    });
  }

  // Image compression
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

  // Weather check
  async function checkWeather(lat, lng) {
    if (!OWM_API_KEY && !WEATHERAPI_KEY) return;
    try {
      let summary = 'Weather data';
      let temp = 0;
      let wind = 0;
      let conditions = { id: 0, rain1h: 0, snow1h: 0, visibility: 10000 };

      if (WEATHERAPI_KEY) {
        const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHERAPI_KEY}&q=${lat},${lng}&aqi=no`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('WeatherAPI failed');
        const data = await res.json();
        summary = data.current?.condition?.text || summary;
        temp = Math.round(data.current?.temp_c ?? 0);
        wind = Math.round((data.current?.wind_kph ?? 0) / 3.6);
        conditions = {
          id: mapWeatherApiCodeToOwmLike(data.current?.condition?.code || 0),
          rain1h: 0,
          snow1h: 0,
          visibility: Math.round((data.current?.vis_km ?? 10) * 1000)
        };
      } else if (OWM_API_KEY) {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OWM_API_KEY}&units=metric`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OpenWeather failed');
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
      updateWeatherUI(level, `${summary} • ${temp}°C`, `Wind ${wind} m/s • Vis ${(conditions.visibility / 1000).toFixed(1)} km`);
    } catch (e) {
      console.warn('Weather unavailable', e);
    }
  }

  function evaluateWeatherSafety({ id, temp, wind, rain1h, snow1h, visibility }) {
    const thunder = id >= 200 && id < 300;
    const heavyRain = (id >= 500 && id < 600) && (rain1h >= 7);
    const heavySnow = (id >= 600 && id < 700) && (snow1h >= 3);
    const extremeHeat = temp >= 40;
    const extremeCold = temp <= -10;
    const lowVis = visibility <= 1000;

    if (thunder || heavyRain || heavySnow || extremeHeat || extremeCold || lowVis) return 'danger';
    if (wind >= 10 || rain1h >= 3 || snow1h >= 1) return 'warning';
    return 'safe';
  }

  function updateWeatherUI(level, summary, detail) {
    if (!weatherCard || !weatherStatus) return;
    weatherCard.style.display = 'block';
    weatherStatus.classList.remove('weather-safe', 'weather-warning', 'weather-danger');
    if (level === 'danger') weatherStatus.classList.add('weather-danger');
    else if (level === 'warning') weatherStatus.classList.add('weather-warning');
    else weatherStatus.classList.add('weather-safe');
    if (weatherSummary) weatherSummary.textContent = level === 'danger' ? 'Unsafe weather' : level === 'warning' ? 'Caution' : 'Safe to travel';
    if (weatherDetail) weatherDetail.textContent = `${summary} • ${detail}`;
  }

  function mapWeatherApiCodeToOwmLike(code) {
    if (code === 1087) return 200;
    if ([1063, 1180, 1183, 1186, 1189, 1192, 1195, 1240, 1243, 1246].includes(code)) return 500;
    if ([1066, 1069, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(code)) return 600;
    if ([1204, 1207, 1237, 1261, 1264].includes(code)) return 611;
    if ([1030, 1135, 1147].includes(code)) return 741;
    if ([1273, 1276, 1279, 1282].includes(code)) return 202;
    return 800;
  }

  window.confirmDeleteIncident = function (incidentId) {
    const incident = allIncidents.find(i => i.id === incidentId);
    if (!incident) return;

    // Create confirmation dialog
    const confirmHTML = `
    <div id="deleteConfirmModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div class="delete-confirm-dialog">
        <h3>⚠️ Delete Incident?</h3>
        <p>Are you sure you want to permanently delete this <strong>${incident.type}</strong> incident?</p>
        <p style="font-size: 12px; color: var(--muted);">This action cannot be undone.</p>
        
        <div class="delete-confirm-actions">
          <button class="btn btn-secondary" onclick="closeDeleteConfirm()">Cancel</button>
          <button class="btn delete-incident-btn" onclick="deleteIncident(${incidentId})" style="margin: 0;">
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  `;

    document.body.insertAdjacentHTML('beforeend', confirmHTML);
  };

  window.closeDeleteConfirm = function () {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.remove();
  };

  window.deleteIncident = async function (incidentId) {
    try {
      const response = await fetch(`/api/incidents/${incidentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        closeDeleteConfirm();
        closeIncidentModal();

        // Remove from allIncidents array
        const index = allIncidents.findIndex(i => i.id === incidentId);
        if (index !== -1) {
          allIncidents.splice(index, 1);
        }

        // 🔧 DON'T refresh markers here - let the socket listener handle it
        // The socket listener will receive 'incident-deleted' and do the refresh

        // Remove from incident list immediately (for better UX)
        const listItem = document.querySelector(`#incidentList li[data-incident-id="${incidentId}"]`);
        if (listItem) {
          listItem.remove();
        }

        showToast('Incident Deleted', 'The incident has been removed');
      } else {
        showToast('Error', 'Failed to delete incident');
      }
    } catch (err) {
      console.error('Error deleting incident:', err);
      showToast('Error', 'Network error');
    }
  };

});
