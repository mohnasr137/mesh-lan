import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as Client } from "socket.io-client";

import createApp from "../app.js";
import initializeSockets from "../sockets/index.js";
import roomService from "../services/roomService.js";
import userService from "../services/userService.js";
import matchmakingService from "../services/matchmakingService.js";

describe("MeshLAN Server Test Suite", () => {
  let server;
  let io;
  let port;
  let baseUrl;

  before(async () => {
    const app = createApp();
    server = createServer(app);
    io = new Server(server, { cors: { origin: "*" } });
    initializeSockets(io);

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    roomService.clear();
    userService.clear();
    matchmakingService.clear();

    await new Promise((resolve) => {
      io.close(() => {
        server.close(resolve);
      });
    });
  });

  describe("REST API Endpoints & Static UI", () => {
    test("GET / serves the WebRTC Client UI", async () => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert(text.includes("MeshLAN"));
    });

    test("GET /health returns health metrics", async () => {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.status, "OK");
      assert.equal(typeof data.uptime, "number");
      assert.equal(typeof data.activeUsers, "number");
      assert.equal(typeof data.activeRooms, "number");
    });

    test("GET /api/rooms returns list of public rooms", async () => {
      const res = await fetch(`${baseUrl}/api/rooms`);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.success, true);
      assert(Array.isArray(data.rooms));
    });

    test("POST /api/rooms creates a public room", async () => {
      const res = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General Lounge", isPrivate: false }),
      });
      assert.equal(res.status, 201);

      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.room.name, "General Lounge");
      assert.equal(data.room.isPrivate, false);
      assert.equal(typeof data.room.id, "string");
    });

    test("POST /api/rooms fails when name is missing", async () => {
      const res = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: false }),
      });
      assert.equal(res.status, 400);

      const data = await res.json();
      assert.equal(data.success, false);
    });

    test("POST /api/rooms creates and verifies a private room", async () => {
      const createRes = await fetch(`${baseUrl}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Secret Room",
          isPrivate: true,
          password: "mySecretPassword123",
        }),
      });
      assert.equal(createRes.status, 201);
      const createData = await createRes.json();
      const roomId = createData.room.id;

      const wrongRes = await fetch(`${baseUrl}/api/rooms/${roomId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wrongPassword" }),
      });
      assert.equal(wrongRes.status, 200);
      const wrongData = await wrongRes.json();
      assert.equal(wrongData.success, false);

      const rightRes = await fetch(`${baseUrl}/api/rooms/${roomId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "mySecretPassword123" }),
      });
      assert.equal(rightRes.status, 200);
      const rightData = await rightRes.json();
      assert.equal(rightData.success, true);
    });

    test("GET /api/nonexistent returns 404 error format", async () => {
      const res = await fetch(`${baseUrl}/api/nonexistent`);
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.success, false);
    });
  });

  describe("Socket.IO Real-Time & WebRTC", () => {
    test("User connects and registers with username", async () => {
      const client = Client(baseUrl, { reconnection: false });

      await new Promise((resolve, reject) => {
        client.on("connect", () => {
          client.emit("join", { username: "Alice" });
        });

        client.on("joined", (data) => {
          assert.equal(data.username, "Alice");
          assert.equal(typeof data.userId, "string");
          assert.equal(typeof data.socketId, "string");
          client.disconnect();
          resolve();
        });

        client.on("connect_error", reject);
      });
    });

    test("Client UI flow: create-room, user-joined dictionary, and signal relay", async () => {
      const client1 = Client(baseUrl, { reconnection: false });
      const client2 = Client(baseUrl, { reconnection: false });

      await new Promise((resolve) => {
        client1.on("connect", () => {
          // Frontend client creates room with roomName and username
          client1.emit("create-room", "LAN_Arena", "HostUser");
        });

        client1.on("room-created", (roomName) => {
          assert.equal(roomName, "LAN_Arena");
          // Connect second client
          client2.emit("join-room", "LAN_Arena", "GuestUser");
        });

        // Client 1 should receive user-joined with users object
        client1.on("user-joined", (data) => {
          assert(typeof data.users === "object");
          const usersList = Object.values(data.users);
          assert(usersList.length >= 1);

          // Test WebRTC signaling between client 1 and client 2
          client1.emit("signal", {
            to: client2.id,
            signal: { type: "offer", sdp: "dummy-sdp-data" },
          });
        });

        client2.on("signal", (data) => {
          assert.equal(data.from, client1.id);
          assert.equal(data.signal.type, "offer");
          client1.disconnect();
          client2.disconnect();
          resolve();
        });
      });
    });

    test("Random chat matchmaking connects two waiting users", async () => {
      const userA = Client(baseUrl, { reconnection: false });
      const userB = Client(baseUrl, { reconnection: false });

      await new Promise((resolve) => {
        userA.on("connect", () => {
          userA.emit("join", { username: "MatchA" });
        });

        userA.on("joined", () => {
          userA.emit("start_random_chat");
        });

        userA.on("waiting_for_partner", () => {
          userB.emit("join", { username: "MatchB" });
        });

        userB.on("connect", () => {});

        userB.on("joined", () => {
          userB.emit("start_random_chat");
        });

        let aStarted = false;
        let bStarted = false;

        userA.on("random_chat_started", (data) => {
          assert.equal(data.partnerUsername, "MatchB");
          assert.equal(typeof data.chatId, "string");
          aStarted = true;
          if (aStarted && bStarted) finish();
        });

        userB.on("random_chat_started", (data) => {
          assert.equal(data.partnerUsername, "MatchA");
          assert.equal(typeof data.chatId, "string");
          bStarted = true;
          if (aStarted && bStarted) finish();
        });

        function finish() {
          userA.emit("end_random_chat");
        }

        userB.on("random_chat_ended", () => {
          userA.disconnect();
          userB.disconnect();
          resolve();
        });
      });
    });
  });
});
