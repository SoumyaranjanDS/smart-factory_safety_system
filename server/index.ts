import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import pool from "./src/utils/db.js";
import authRoutes from "./src/routes/auth.js";

const app = express();

const PORT = 4000;

app.use(cors());
app.use(express.json());

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
app.post("/api/alerts", (req, res) => {
    const { cameraId, alerts } = req.body;
    
    if (!alerts || alerts.length === 0) {
        return res.json({ success: true, message: "No alerts" });
    }
    
    console.log(`[ALERT RECEIVED] Camera ${cameraId}:`, alerts);
    
    // Broadcast to all connected dashboards instantly!
    const alertData = JSON.stringify({ cameraId, alerts, timestamp: new Date().toISOString() });
    for (const client of alertClients) {
        client.write(`data: ${alertData}\n\n`);
    }
    
    // We can add database saving here later!
    
    res.json({ success: true });
});

async function connectDB() {
  try{
    await pool.query("SELECT 1");
    console.log("Database connected successfully");
    app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
});
  }catch(error){
    console.log("Database connection failed", error);
    process.exit(1);
  }
}
connectDB();


