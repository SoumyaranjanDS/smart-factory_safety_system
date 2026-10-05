import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../utils/db.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey_change_me_in_prod";

router.post("/signup", async (req, res) => {
    try {
        const { system_id, password, role } = req.body;
        
        if (!system_id || !password || !role) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const userCheck = await pool.query("SELECT * FROM users WHERE system_id = $1", [system_id]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ message: "System ID already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await pool.query(
            "INSERT INTO users (system_id, password, role) VALUES ($1, $2, $3)",
            [system_id, hashedPassword, role]
        );

        res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ message: "Server error during signup" });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { system_id, password } = req.body;

        if (!system_id || !password) {
            return res.status(400).json({ message: "System ID and password are required" });
        }

        const result = await pool.query("SELECT * FROM users WHERE system_id = $1", [system_id]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ message: "Invalid System ID or Password" });
        }

        const user = result.rows[0];

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: "Invalid System ID or Password" });
        }

        const token = jwt.sign(
            { id: user.id, system_id: user.system_id, role: user.role },
            JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.status(200).json({
            message: "Login successful",
            token,
            user: { system_id: user.system_id, role: user.role }
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Server error during login" });
    }
});

export default router;
