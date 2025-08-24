const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Temp data store (later MongoDB)
const DATA_DIR = path.join(__dirname, "data");
const INCIDENTS_FILE = path.join(DATA_DIR, "incidents.json");

// Helper: load/save incidents
function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(INCIDENTS_FILE)) {
      fs.writeFileSync(INCIDENTS_FILE, "[]");
    }
  } catch (error) {
    console.error("Failed to ensure data directory/file:", error);
  }
}

function loadIncidents() {
  try {
    ensureDataFile();
    const raw = fs.readFileSync(INCIDENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (error) {
    console.error("Failed to load incidents, returning empty array:", error);
    return [];
  }
}

function saveIncidents(incidents) {
  try {
    ensureDataFile();
    fs.writeFileSync(INCIDENTS_FILE, JSON.stringify(incidents, null, 2));
  } catch (error) {
    console.error("Failed to save incidents:", error);
  }
}

// API: get all incidents
app.get("/api/incidents", (req, res) => {
  res.json(loadIncidents());
});

// API: post new incident
app.post("/api/incidents", (req, res) => {
  const { type, description, lat, lng } = req.body || {};

  const trimmedType = typeof type === "string" ? type.trim() : "";
  const cleanDescription = typeof description === "string" ? description.trim() : "";
  const numericLat = typeof lat === "string" ? parseFloat(lat) : lat;
  const numericLng = typeof lng === "string" ? parseFloat(lng) : lng;

  const isValidLat = Number.isFinite(numericLat) && numericLat >= -90 && numericLat <= 90;
  const isValidLng = Number.isFinite(numericLng) && numericLng >= -180 && numericLng <= 180;

  if (!trimmedType || !isValidLat || !isValidLng) {
    return res.status(400).json({ error: "Invalid incident data. Provide type, lat (-90..90), lng (-180..180)." });
  }

  const incidents = loadIncidents();
  const newIncident = {
    id: Date.now(),
    type: trimmedType,
    description: cleanDescription,
    lat: numericLat,
    lng: numericLng,
    timestamp: new Date().toISOString(),
  };
  incidents.push(newIncident);
  saveIncidents(incidents);

  // Emit real-time update
  io.emit("new-incident", newIncident);

  res.json(newIncident);
});

// Analytics: Get incident type statistics
app.get("/api/analytics/types", (req, res) => {
  const incidents = loadIncidents();
  const typeStats = {};
  
  incidents.forEach(incident => {
    const type = incident.type.toLowerCase();
    if (!typeStats[type]) {
      typeStats[type] = { count: 0, percentage: 0 };
    }
    typeStats[type].count++;
  });
  
  const total = incidents.length;
  Object.keys(typeStats).forEach(type => {
    typeStats[type].percentage = total > 0 ? Math.round((typeStats[type].count / total) * 100) : 0;
  });
  
  // Sort by count descending
  const sortedTypes = Object.entries(typeStats)
    .sort(([,a], [,b]) => b.count - a.count)
    .map(([type, stats]) => ({
      type: type.charAt(0).toUpperCase() + type.slice(1),
      ...stats
    }));
  
  res.json({
    total: total,
    types: sortedTypes,
    mostReported: sortedTypes[0] || null
  });
});

// Analytics: Get area trends and hotspots
app.get("/api/analytics/areas", (req, res) => {
  const incidents = loadIncidents();
  
  if (incidents.length === 0) {
    return res.json({
      hotspots: [],
      trends: {
        total: 0,
        recent24h: 0,
        recent7d: 0,
        recent30d: 0
      }
    });
  }
  
  // Calculate hotspots (clustered areas)
  const clusters = clusterIncidents(incidents);
  
  // Calculate time-based trends
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  const trends = {
    total: incidents.length,
    recent24h: incidents.filter(i => new Date(i.timestamp) > oneDayAgo).length,
    recent7d: incidents.filter(i => new Date(i.timestamp) > sevenDaysAgo).length,
    recent30d: incidents.filter(i => new Date(i.timestamp) > thirtyDaysAgo).length
  };
  
  res.json({
    hotspots: clusters,
    trends: trends
  });
});

// Helper function to cluster incidents by proximity
function clusterIncidents(incidents, radius = 0.01) { // ~1km radius
  const clusters = [];
  const processed = new Set();
  
  incidents.forEach((incident, index) => {
    if (processed.has(index)) return;
    
    const cluster = {
      center: { lat: incident.lat, lng: incident.lng },
      incidents: [incident],
      count: 1,
      types: { [incident.type.toLowerCase()]: 1 }
    };
    
    processed.add(index);
    
    // Find nearby incidents
    incidents.forEach((other, otherIndex) => {
      if (processed.has(otherIndex)) return;
      
      const distance = calculateDistance(
        incident.lat, incident.lng,
        other.lat, other.lng
      );
      
      if (distance <= radius) {
        cluster.incidents.push(other);
        cluster.count++;
        cluster.types[other.type.toLowerCase()] = 
          (cluster.types[other.type.toLowerCase()] || 0) + 1;
        processed.add(otherIndex);
      }
    });
    
    // Calculate cluster center
    if (cluster.incidents.length > 1) {
      const avgLat = cluster.incidents.reduce((sum, i) => sum + i.lat, 0) / cluster.incidents.length;
      const avgLng = cluster.incidents.reduce((sum, i) => sum + i.lng, 0) / cluster.incidents.length;
      cluster.center = { lat: avgLat, lng: avgLng };
    }
    
    // Get most common type in cluster
    cluster.mostCommonType = Object.entries(cluster.types)
      .sort(([,a], [,b]) => b - a)[0][0];
    
    clusters.push(cluster);
  });
  
  // Sort by incident count
  return clusters.sort((a, b) => b.count - a.count);
}

// Helper function to calculate distance between two points
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Socket.IO (optional for real-time)
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));