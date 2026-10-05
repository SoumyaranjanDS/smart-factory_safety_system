import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import pool from "./src/utils/db.js";
import authRoutes from "./src/routes/auth.js";

const app = express();

const PORT = 4000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);



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


