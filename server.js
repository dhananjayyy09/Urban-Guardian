// server.js
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise'); // Use the promise-based version
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app); // Create an HTTP server for Socket.IO
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Socket.IO Setup ---
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in development
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('🔌 A user connected');
  socket.on('disconnect', () => {
    console.log(' disconnected');
  });
});

// --- MySQL Connection Pool (Better for Web Servers) ---
const db = mysql.createPool({
  connectionLimit: 10,
  host: 'localhost',
  user: 'root',
  password: 'DJdjdj12', // Your MySQL password
  database: 'urban_guardian'
});

// Check Pool Connection
db.getConnection()
  .then(connection => {
    console.log('✅ Connected to MySQL Database Pool: urban_guardian');
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL Pool Connection Failed:', err);
    process.exit(1);
  });

// --- Routes ---

// POST: Add a new incident (Corrected for base64 image and Socket.IO)
app.post('/api/incidents', async (req, res) => {
  const { type, description, lat, lng, image } = req.body; // Image comes from body

  if (!type || lat == null || lng == null || !image) {
    return res.status(400).json({ error: 'Missing required fields: type, lat, lng, Image' });
  }

  const sql = `INSERT INTO incidents (type, description, lat, lng, image) VALUES (?, ?, ?, ?, ?)`;

  try {
    const [result] = await db.query(sql, [type, description, lat, lng, image]);
    const newIncidentId = result.insertId;

    // Retrieve the full incident object to broadcast
    const [rows] = await db.query('SELECT * FROM incidents WHERE id = ?', [newIncidentId]);
    const newIncident = rows[0];

    if (newIncident) {
      console.log('📢 Broadcasting new incident:', newIncident.id);
      io.emit('new-incident', newIncident); // Broadcast to all clients
    }

    res.status(201).json(newIncident);
  } catch (err) {
    console.error('❌ Error inserting incident:', err);
    return res.status(500).json({ error: 'Database insert failed' });
  }
});


// GET: Fetch all incidents
app.get('/api/incidents', async (req, res) => {
  const sql = `SELECT id, type, description, lat, lng, timestamp, image FROM incidents ORDER BY timestamp DESC`;
  try {
    const [rows] = await db.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching incidents:', err);
    return res.status(500).json({ error: 'Database fetch failed' });
  }
});


// GET: Serve single incident by ID
app.get('/api/incidents/:id', async (req, res) => {
  const sql = `SELECT * FROM incidents WHERE id = ?`;
  try {
    const [rows] = await db.query(sql, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Incident not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Error fetching incident:', err);
    return res.status(500).json({ error: 'Database fetch failed' });
  }
});


// DELETE: Remove an incident
app.delete('/api/incidents/:id', async (req, res) => {
  const sql = `DELETE FROM incidents WHERE id = ?`;
  try {
    await db.query(sql, [req.params.id]);
    res.json({ message: '🗑️ Incident deleted successfully' });
  } catch (err) {
    console.error('❌ Error deleting incident:', err);
    return res.status(500).json({ error: 'Database delete failed' });
  }
});


// GET: Fetch updates for a specific incident
app.get('/api/incidents/:id/updates', async (req, res) => {
  const sql = `SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY timestamp DESC`;
  try {
    const [updates] = await db.query(sql, [req.params.id]);
    res.json(updates);
  } catch (err) {
    console.error('❌ Error fetching updates:', err);
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
});

// POST: Add an update to an incident
app.post('/api/incidents/:id/updates', async (req, res) => {
  const { id } = req.params;
  const { status, update_text } = req.body;

  if (!status || !update_text) {
    return res.status(400).json({ error: 'Status and update text are required' });
  }

  try {
    // Insert the update
    const insertSql = `INSERT INTO incident_updates (incident_id, status, update_text) VALUES (?, ?, ?)`;
    await db.query(insertSql, [id, status, update_text]);

    // Update the main incident status
    const updateIncidentSql = `UPDATE incidents SET status = ? WHERE id = ?`;
    await db.query(updateIncidentSql, [status, id]);

    // Get the updated incident with all updates
    const [incident] = await db.query('SELECT * FROM incidents WHERE id = ?', [id]);
    const [updates] = await db.query('SELECT * FROM incident_updates WHERE incident_id = ? ORDER BY timestamp DESC', [id]);

    // Broadcast to all connected clients
    io.emit('incident-updated', {
      incident: incident[0],
      updates: updates
    });

    res.json({
      success: true,
      incident: incident[0],
      updates: updates
    });
  } catch (err) {
    console.error('❌ Error adding update:', err);
    res.status(500).json({ error: 'Failed to add update' });
  }
});


// GET: Analytics for incident types
app.get('/api/analytics/types', async (req, res) => {
  try {
    const totalQuery = 'SELECT COUNT(*) as total FROM incidents';
    const typesQuery = `
      SELECT type, COUNT(*) as count 
      FROM incidents 
      GROUP BY type 
      ORDER BY count DESC
    `;

    const [totalResult] = await db.query(totalQuery);
    const [typesResult] = await db.query(typesQuery);

    const total = totalResult[0].total;
    const typesWithPercentage = typesResult.map(t => ({
      ...t,
      percentage: total > 0 ? (t.count / total) * 100 : 0
    }));

    res.json({
      total: total,
      mostReported: typesResult[0] || null,
      types: typesWithPercentage
    });
  } catch (err) {
    console.error('❌ Error fetching type analytics:', err);
    res.status(500).json({ error: 'Failed to fetch type analytics' });
  }
});


// GET: Analytics for area trends and hotspots
app.get('/api/analytics/areas', async (req, res) => {
  try {
    const trendsQuery = `
        SELECT
            (SELECT COUNT(*) FROM incidents WHERE timestamp >= NOW() - INTERVAL 1 DAY) as recent24h,
            (SELECT COUNT(*) FROM incidents WHERE timestamp >= NOW() - INTERVAL 7 DAY) as recent7d
    `;
    const hotspotsQuery = `
        SELECT 
            ROUND(lat, 2) as lat_group, 
            ROUND(lng, 2) as lng_group, 
            COUNT(*) as count,
            (SELECT type FROM incidents WHERE ROUND(lat, 2) = lat_group AND ROUND(lng, 2) = lng_group GROUP BY type ORDER BY COUNT(*) DESC LIMIT 1) as mostCommonType
        FROM incidents
        GROUP BY lat_group, lng_group
        HAVING count > 1
        ORDER BY count DESC
        LIMIT 5
    `;

    const [trendsResult] = await db.query(trendsQuery);
    const [hotspotsResult] = await db.query(hotspotsQuery);

    const hotspots = hotspotsResult.map(h => ({
      count: h.count,
      mostCommonType: h.mostCommonType,
      center: { lat: parseFloat(h.lat_group), lng: parseFloat(h.lng_group) }
    }));

    res.json({
      trends: trendsResult[0],
      hotspots: hotspots
    });
  } catch (err) {
    console.error('❌ Error fetching area analytics:', err);
    res.status(500).json({ error: 'Failed to fetch area analytics' });
  }
});


// Start server using the http server instance for Socket.IO
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));