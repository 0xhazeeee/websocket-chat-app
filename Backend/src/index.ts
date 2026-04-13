import { WebSocketServer, WebSocket } from "ws";
import mongoose from "mongoose";
import express from "express";
import cors from "cors";
import Redis from "ioredis";
import { Message } from "./models/Message";
import { verifyToken } from "./middleware/verifyToken";
import authRoutes from "./routes/auth";

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://mkhanriaz42:test1234@cluster0.xijb401.mongodb.net/chatapp?appName=Cluster0";
const REDIS_URI = process.env.REDIS_URI || "rediss://default:gQAAAAAAAVO5AAIncDI3Mjk4NjM4ZmMyZTY0NDA2YWQ1ZDJlODNjZDAwNzExZHAyODY5Njk@uncommon-rabbit-86969.upstash.io:6379"

async function connectDB() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");
}

const publisher = new Redis(REDIS_URI);
const subscriber = new Redis(REDIS_URI);

publisher.on("error", (err: any) => console.error("Redis publisher error:", err));
subscriber.on("error", (err: any) => console.error("Redis subscriber error:", err));

// ─── Express ─────────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use("/auth", authRoutes);

app.listen(3000, () => {
  console.log("HTTP server running on http://localhost:3000");
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: 8080 });

interface User {
  socket: WebSocket;
  room: string;
  username: string;
}

let allSockets: User[] = [];

subscriber.subscribe("chat", (err: any) => {
  if (err) console.error("Failed to subscribe to Redis channel:", err);
  else console.log("Subscribed to Redis chat channel");
});

subscriber.on("message", (channel: string, raw: string) => {
  if (channel !== "chat") return;

  const { room, messageId, message, username, senderSocketId } = JSON.parse(raw);

  for (const u of allSockets) {
    if (u.room === room) {
      u.socket.send(
        JSON.stringify({
          type: "chat",
          payload: {
            messageId,
            message,
            username,
            isSelf: (u.socket as any)._socketId === senderSocketId,
          },
        })
      );
    }
  }
});

wss.on("connection", (socket) => {
  const socketId = Math.random().toString(36).slice(2);
  (socket as any)._socketId = socketId;

  socket.on("message", async (raw) => {
    const parsedMessage = JSON.parse(raw.toString());

    // ── join ──────────────────────────────────────────────────────────────────
    if (parsedMessage.type === "join") {
      const { roomId, token } = parsedMessage.payload;

      let decoded;
      try {
        decoded = verifyToken(token);
      } catch {
        socket.send(JSON.stringify({ type: "error", payload: { message: "Invalid or expired token. Please log in again." } }));
        socket.close();
        return;
      }

      const username = decoded.username;
      allSockets.push({ socket, room: roomId, username });

      const history = await Message.find({ roomId })
        .sort({ timestamp: 1 })
        .limit(50)
        .lean();

      socket.send(JSON.stringify({ type: "history", payload: { messages: history } }));

      broadcastToRoom(roomId, socket, {
        type: "system",
        payload: { message: `${username} joined the room` },
      });
    }

    // ── chat ──────────────────────────────────────────────────────────────────
    if (parsedMessage.type === "chat") {
      const user = allSockets.find((u) => u.socket === socket);
      if (!user) return;

      const { message } = parsedMessage.payload;

      const saved = await Message.create({
        roomId: user.room,
        username: user.username,
        message,
        readBy: [user.username],
      });

      await publisher.publish(
        "chat",
        JSON.stringify({
          room: user.room,
          messageId: saved._id.toString(),
          message,
          username: user.username,
          senderSocketId: socketId,
        })
      );
    }

    // ── typing ────────────────────────────────────────────────────────────────
    if (parsedMessage.type === "typing") {
      const user = allSockets.find((u) => u.socket === socket);
      if (!user) return;

      broadcastToRoom(user.room, socket, {
        type: "typing",
        payload: {
          username: user.username,
          isTyping: parsedMessage.payload.isTyping,
        },
      });
    }

    // ── read ──────────────────────────────────────────────────────────────────
    if (parsedMessage.type === "read") {
      const user = allSockets.find((u) => u.socket === socket);
      if (!user) return;

      const { messageId } = parsedMessage.payload;

      // Add this user to readBy if not already there
      const updated = await Message.findByIdAndUpdate(
        messageId,
        { $addToSet: { readBy: user.username } },
        { new: true }
      );

      if (!updated) return;

      // Notify everyone in the room about the read update
      broadcastToRoom(user.room, null, {
        type: "read",
        payload: {
          messageId,
          readBy: updated.readBy,
        },
      });
    }
  });

  socket.on("close", () => {
    const user = allSockets.find((u) => u.socket === socket);
    if (!user) return;

    const { room, username } = user;
    allSockets = allSockets.filter((u) => u.socket !== socket);

    broadcastToRoom(room, null, {
      type: "system",
      payload: { message: `${username} left the room` },
    });
  });
});

function broadcastToRoom(room: string, excludeSocket: WebSocket | null, data: object) {
  for (const u of allSockets) {
    if (u.room === room && u.socket !== excludeSocket) {
      u.socket.send(JSON.stringify(data));
    }
  }
}

connectDB()
  .then(() => console.log("WebSocket server running on ws://localhost:8080"))
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });