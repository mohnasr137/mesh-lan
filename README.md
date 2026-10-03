# VPN Server (WebRTC Signaling, Voice Chat & Virtual LAN)

A modular, high-performance WebRTC signaling and real-time voice chat server built with **Node.js**, **Express**, and **Socket.IO**.

---

## 🚀 Features

- **Public & Private Rooms**:
  - Create and discover rooms with configurable capacity limits.
  - Password protection using bcrypt hashing for private rooms.
  - Host tracking with automatic host reassignment upon departure.
  - Automatic cleanup of deserted temporary rooms.
- **Random 1-on-1 Voice/Chat Matchmaking**:
  - Omegle/roulette-style waiting queue.
  - Automatic pairing of available users into private sessions.
  - Clean state transitions on partner disconnection.
- **WebRTC Signaling**:
  - Support for direct peer-to-peer (mesh) signaling: `offer`, `answer`, `ice-candidate`.
  - Targeted peer signaling (`to: socketId`) as well as room broadcasting.
  - Legacy `signal` event compatibility for Virtual LAN clients.
- **Audio / Voice Data Relay Fallback**:
  - `voice_data` event routing for low-overhead audio packet relay.
- **Health & Telemetry**:
  - `/health` endpoint reporting uptime, active users, active rooms, queue size, and memory usage.
- **Resilient Architecture**:
  - Layered architecture with models, services, controllers, routes, and socket handlers.
  - Express global error handling and 404 middleware.
  - Graceful shutdown handlers for `SIGINT` and `SIGTERM`.

---

## 📁 Project Structure

```
vpn/
├── app.js                # Express app factory (middleware, routes, error handlers)
├── server.js             # Server entry point & graceful shutdown
├── config/
│   ├── index.js          # Centralized environment configuration
│   └── constants.js      # Socket event names & HTTP status codes
├── models/
│   ├── Room.js           # Room domain model & password verification
│   ├── User.js           # User domain model
│   └── RandomChat.js     # 1-on-1 session domain model
├── services/
│   ├── roomService.js    # Business logic for rooms & lifecycle
│   ├── userService.js    # User registry & session management
│   └── matchmakingService.js # Waiting queue & matchmaking
├── controllers/
│   ├── roomController.js # REST API handlers for rooms
│   └── healthController.js # Telemetry & health check handler
├── routes/
│   ├── roomRoutes.js     # /api/rooms endpoints
│   ├── healthRoutes.js   # /health endpoint
│   └── index.js          # API router aggregator
├── sockets/
│   ├── index.js          # Socket connection coordinator & lifecycle
│   ├── roomHandlers.js   # Room join/leave/create socket events
│   ├── matchHandlers.js  # Random 1-on-1 matchmaking events
│   ├── signalHandlers.js # WebRTC signaling (mesh, 1-on-1, legacy)
│   └── voiceHandlers.js  # Voice packet relay fallback
├── middleware/
│   ├── errorHandler.js   # Global error & 404 middleware
│   ├── validator.js      # Request validation schemas
│   └── logger.js         # HTTP request logger
├── utils/
│   └── logger.js         # Timestamped console logging
├── tests/
│   └── server.test.js    # Automated Node.js native test suite
├── .env.example          # Environment variables template
├── .gitignore            # Git ignore configuration
├── package.json          # Project metadata & scripts
└── README.md             # Project documentation
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher (supports modern ES Modules and native test runner)
- **npm**: v8.0.0 or higher

### 2. Installation
```bash
npm install
```

### 3. Environment Setup
```bash
cp .env.example .env
```
Default configuration values:
```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=*
MAX_ROOM_PARTICIPANTS=50
BCRYPT_ROUNDS=10
SOCKET_PING_TIMEOUT=60000
SOCKET_PING_INTERVAL=25000
```

### 4. Running the Server

- **Production Mode**:
  ```bash
  npm start
  ```

- **Development Mode (Auto-reload on file change)**:
  ```bash
  npm run dev
  ```

### 5. Running Tests
```bash
npm test
```

---

## 📡 REST API Reference

### Health Check
- **`GET /health`**
  - **Response (200 OK)**:
    ```json
    {
      "status": "OK",
      "timestamp": "2026-10-03T19:15:58.815Z",
      "uptime": 42,
      "activeUsers": 2,
      "activeRooms": 1,
      "waitingQueue": 0,
      "activeRandomChats": 0,
      "memory": {
        "rss": "92MB",
        "heapUsed": "13MB"
      }
    }
    ```

### Rooms
- **`GET /api/rooms`**
  - Returns array of active public rooms.
  - **Response (200 OK)**:
    ```json
    {
      "success": true,
      "rooms": [
        {
          "id": "f5ea1b7c-a3c5-4703-8d9a-450def436792",
          "name": "Dev Lounge",
          "isPrivate": false,
          "participantCount": 3,
          "maxParticipants": 50,
          "createdAt": "2026-10-03T19:16:03.876Z"
        }
      ]
    }
    ```

- **`POST /api/rooms`**
  - **Request Body**:
    ```json
    {
      "name": "Gaming Lounge",
      "isPrivate": true,
      "password": "secretPassword123"
    }
    ```
  - **Response (201 Created)**:
    ```json
    {
      "success": true,
      "room": {
        "id": "293a685e-520e-4f5e-adaf-c90067c079fb",
        "name": "Gaming Lounge",
        "isPrivate": true,
        "participantCount": 0,
        "maxParticipants": 50,
        "createdAt": "2026-10-03T19:15:44.085Z"
      }
    }
    ```

- **`POST /api/rooms/:roomId/verify`**
  - **Request Body**: `{"password": "secretPassword123"}`
  - **Response (200 OK)**: `{"success": true}`

---

## ⚡ Socket.IO Events

### Client Registration
| Event Sent | Payload | Response Event Received | Payload |
|---|---|---|---|
| `join` | `{ "username": "Alice" }` | `joined` | `{ userId, socketId, username }` |

### Room Events
| Event Sent | Payload | Target / Response |
|---|---|---|
| `join_room` | `{ "roomId": "...", "password": "..." }` | `room_joined` to sender, `user_joined` to room peers |
| `leave_room` | `{}` | `room_left` to sender, `user_left` to room peers |
| `create-room`| `{ "name": "...", "isPrivate": false }` | `room_created`, `room_joined` |
| `get-rooms`  | `{}` | `rooms-list` |

### Random 1-on-1 Matchmaking
| Event Sent | Action |
|---|---|
| `start_random_chat` | Queues user or connects to waiting user. Emits `random_chat_started` to both or `waiting_for_partner`. |
| `end_random_chat` | Ends 1-on-1 session. Emits `random_chat_ended` to both peers. |

### WebRTC Signaling
| Event | Payload | Description |
|---|---|---|
| `offer` | `{ "to": "targetSocketId", "offer": sdp }` | Relays SDP offer to peer or room |
| `answer` | `{ "to": "targetSocketId", "answer": sdp }` | Relays SDP answer to peer or room |
| `ice-candidate` | `{ "to": "targetSocketId", "candidate": ice }` | Relays ICE candidate to peer or room |
| `signal` | `{ "to": "targetSocketId", "signal": data }` | Unified signal event for Virtual LAN clients |
| `voice_data` | `{ "to": "...", "data": audioBuffer }` | Relays raw/compressed audio packets |
