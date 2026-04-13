# 💬 WebSocket Chat App

A production-ready real-time multi-room chat application built with WebSockets, JWT authentication, and MongoDB persistence.

## ✨ Features

- 🔐 JWT-based register/login authentication
- 🏠 Multiple chat rooms — join any room by ID
- 💬 Real-time messaging over WebSocket
- 🕓 Message history — last 50 messages load on join
- 👤 Per-user usernames with self/other message styling
- 🔔 Join/leave system notifications
- 🧹 Automatic cleanup on disconnect

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, TypeScript, Express, ws |
| Database | MongoDB Atlas, Mongoose |
| Auth | JWT, bcrypt |

## 🚀 Getting Started

### Backend
```bash
cd Backend
npm install
npm run dev
```

### Frontend
```bash
cd Frontend
npm install
npm run dev
```

### Environment Variables
Create a `.env` file in `/Backend`:


## 📡 WebSocket Events

| Event | Description |
|-------|-------------|
| `join` | Join a room with JWT token |
| `chat` | Send a message |
| `history` | Receive last 50 messages |
| `system` | Join/leave notifications |
