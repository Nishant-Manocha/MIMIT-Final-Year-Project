import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { connectDb } from "./config/db.js";
import authRoutes from "./routes/auth.js";
import learningRoutes from "./routes/learning.js";
import { seedDemoContent } from "./seed.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const allowedOrigins = clientOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "intellilearn-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api", learningRoutes);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error(`Socket CORS blocked origin: ${origin}`));
    },
    credentials: true,
  },
});

const callUsersByRoom = new Map();

io.on("connection", (socket) => {
  socket.on("study-call:join", ({ roomId, userName }) => {
    if (!roomId) return;

    socket.data.roomId = roomId;
    socket.data.userName = userName || "Learner";
    socket.join(roomId);

    const users = callUsersByRoom.get(roomId) || new Map();
    const peers = Array.from(users.values());
    users.set(socket.id, { socketId: socket.id, name: socket.data.userName });
    callUsersByRoom.set(roomId, users);

    socket.emit("study-call:peers", peers);
    socket.to(roomId).emit("study-call:user-joined", {
      socketId: socket.id,
      name: socket.data.userName,
    });
  });

  socket.on("study-call:signal", ({ to, signal }) => {
    if (!to || !signal) return;
    io.to(to).emit("study-call:signal", {
      from: socket.id,
      name: socket.data.userName || "Learner",
      signal,
    });
  });

  socket.on("study-call:leave", () => {
    removeCallUser(socket);
  });

  socket.on("disconnect", () => {
    removeCallUser(socket);
  });
});

function removeCallUser(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const users = callUsersByRoom.get(roomId);
  if (users) {
    users.delete(socket.id);
    if (users.size === 0) callUsersByRoom.delete(roomId);
  }

  socket.to(roomId).emit("study-call:user-left", { socketId: socket.id });
  socket.leave(roomId);
  socket.data.roomId = null;
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

await connectDb();
await seedDemoContent();

httpServer.listen(port, () => {
  console.log(`[api] Server running on http://localhost:${port}`);
});
