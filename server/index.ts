import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import pool from "./src/utils/db.js";
import authRoutes from "./src/routes/auth.js";

const app = express();

const PORT = 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

import { generateToken04 } from "./src/utils/zegoToken.js";

app.use("/api/auth", authRoutes);

app.get("/api/zego-token", (req, res) => {
    const userId = req.query.userId as string;
    const roomId = req.query.roomId as string;
    
    if (!userId || !roomId) {
        return res.status(400).json({ error: "userId and roomId are required" });
    }

    const appId = Number(process.env.VITE_ZEGO_APP_ID);
    const secret = process.env.VITE_ZEGO_SERVER_SECRET;
    
    if (!appId || !secret) {
        return res.status(500).json({ error: "Server missing Zego credentials in .env (VITE_ZEGO_APP_ID or VITE_ZEGO_SERVER_SECRET)" });
    }
    
    try {
        const payload = JSON.stringify({
            room_id: roomId,
            privilege: { "1": 1, "2": 1 }
        });
        const token = generateToken04(appId, userId, secret, 86400, payload);
        res.json({ token });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- ALERT NOTIFICATION SYSTEM (SSE) ---
const alertClients = new Set<express.Response>();

// The React Dashboard will connect to this to listen for real-time alerts
app.get("/api/alerts/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    alertClients.add(res);
    
    req.on("close", () => {
        alertClients.delete(res);
    });
});

// Python AI Engine will hit this when it detects a violation
app.post("/api/alerts", async (req, res) => {
    const { cameraId, alerts, frame } = req.body;
    
    if (!alerts || alerts.length === 0) {
        return res.json({ success: true, message: "No alerts" });
    }
    
    console.log(`[ALERT RECEIVED] Camera ${cameraId}:`, alerts);
    
    // Broadcast to all connected dashboards instantly!
    const alertData = JSON.stringify({ cameraId, alerts, timestamp: new Date().toISOString() });
    for (const client of alertClients) {
        client.write(`data: ${alertData}\n\n`);
    }
    
    // Save to PostgreSQL Database
    try {
        await pool.query(
            "INSERT INTO incidents (camera_id, alerts, frame_data) VALUES ($1, $2, $3)",
            [cameraId, JSON.stringify(alerts), frame || null]
        );
    } catch (err) {
        console.error("Failed to save incident to DB:", err);
    }
    
    res.json({ success: true });
});

// Fetch historical incidents for the Alerts page
app.get("/api/incidents", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT id, camera_id, alerts, frame_data, created_at FROM incidents ORDER BY created_at DESC LIMIT 50"
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Failed to fetch incidents:", err);
        res.status(500).json({ error: "Database error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

async function connectDB(retries = 10, delay = 3000) {
    while (retries > 0) {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS incidents (
                    id SERIAL PRIMARY KEY,
                    camera_id VARCHAR(255) NOT NULL,
                    alerts JSONB NOT NULL,
                    frame_data TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log("Database connected and incidents table verified");
            return;
        } catch (error: any) {
            console.log(`Database connection failed. Neon DB might be waking up... Retrying in ${delay/1000}s... (${retries - 1} attempts left)`);
            retries -= 1;
            await new Promise(res => setTimeout(res, delay));
        }
    }
    console.error("Failed to connect to the database after multiple attempts.");
}
connectDB();


