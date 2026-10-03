import { io } from "socket.io-client";

// Determine server URL dynamically (supports both direct server port and Vite dev port)
const serverUrl =
  window.location.hostname === "localhost" && window.location.port !== "3000"
    ? "http://localhost:3000"
    : window.location.origin;

const socket = io(serverUrl, {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

// DOM Elements - Status & Navigation
const statusBadge = document.getElementById("status-badge");
const statusText = document.getElementById("status-text");
const tabButtons = document.querySelectorAll(".tab-button");
const tabContents = document.querySelectorAll(".tab-content");

// DOM Elements - LAN Tab
const usernameInput = document.getElementById("username");
const roomNameInput = document.getElementById("room-name");
const roomPasswordInput = document.getElementById("room-password");
const createBtn = document.getElementById("create-btn");
const joinBtn = document.getElementById("join-btn");
const disconnectBtn = document.getElementById("disconnect-btn");
const connectionForm = document.getElementById("connection-form");
const roomInfo = document.getElementById("room-info");
const currentRoomSpan = document.getElementById("current-room");
const virtualIpSpan = document.getElementById("virtual-ip");
const usersList = document.getElementById("users-list");
const userCountBadge = document.getElementById("user-count-badge");
const roomListDiv = document.getElementById("room-list");
const refreshRoomsBtn = document.getElementById("refresh-rooms-btn");

// DOM Elements - Diagnostics & Chat
const connectionTypeSpan = document.getElementById("connection-type");
const latencySpan = document.getElementById("latency");
const packetLossSpan = document.getElementById("packet-loss");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");

// DOM Elements - Matchmaking Tab
const matchUsernameInput = document.getElementById("match-username");
const startMatchBtn = document.getElementById("start-match-btn");
const cancelMatchBtn = document.getElementById("cancel-match-btn");
const nextMatchBtn = document.getElementById("next-match-btn");
const endMatchBtn = document.getElementById("end-match-btn");
const matchIdleView = document.getElementById("match-idle-view");
const matchWaitingView = document.getElementById("match-waiting-view");
const matchActiveView = document.getElementById("match-active-view");
const partnerName = document.getElementById("partner-name");
const matchTimer = document.getElementById("match-timer");

// DOM Elements - Telemetry
const refreshHealthBtn = document.getElementById("refresh-health-btn");
const telemetryStatus = document.getElementById("telemetry-status");
const telemetryUsers = document.getElementById("telemetry-users");
const telemetryRooms = document.getElementById("telemetry-rooms");
const telemetryQueue = document.getElementById("telemetry-queue");
const telemetryUptime = document.getElementById("telemetry-uptime");
const telemetryMemory = document.getElementById("telemetry-memory");

// State
const peers = {}; // targetSocketId -> { connection, dataChannel, metadata }
const pendingCandidates = {};
let currentRoom = null;
let localUsername = localStorage.getItem("meshlan_username") || "";
let matchTimerInterval = null;
let matchSeconds = 0;

if (localUsername) {
  usernameInput.value = localUsername;
  matchUsernameInput.value = localUsername;
}

// Tab Switching Handler
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    tabContents.forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    const targetId = btn.getAttribute("data-tab");
    const content = document.getElementById(targetId);
    if (content) content.classList.add("active");

    if (targetId === "tab-telemetry") {
      fetchServerHealth();
    }
  });
});

// Socket Status Handlers
socket.on("connect", () => {
  statusBadge.className = "status-badge";
  statusText.textContent = "Server Online";
  fetchPublicRooms();
});

socket.on("connect_error", () => {
  statusBadge.className = "status-badge disconnected";
  statusText.textContent = "Offline (Reconnecting)";
});

socket.on("disconnect", () => {
  statusBadge.className = "status-badge disconnected";
  statusText.textContent = "Disconnected";
});

// Generate Virtual IP
function generateVirtualIP() {
  return `10.0.0.${Math.floor(Math.random() * 250) + 2}`;
}

// Add system message to chat log
function addChatMessage(sender, text, isSystem = false) {
  const div = document.createElement("div");
  div.className = `chat-msg ${isSystem ? "system" : ""}`;
  if (isSystem) {
    div.textContent = text;
  } else {
    div.innerHTML = `<strong>${escapeHtml(sender)}:</strong> ${escapeHtml(text)}`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[m]);
}

// Fetch Public Rooms via REST API
async function fetchPublicRooms() {
  try {
    const res = await fetch(`${serverUrl}/api/rooms`);
    const data = await res.json();
    renderPublicRooms(data.rooms || []);
  } catch (err) {
    console.error("Failed to fetch public rooms:", err);
  }
}

function renderPublicRooms(rooms) {
  if (!rooms || rooms.length === 0) {
    roomListDiv.innerHTML = `<div style="color: var(--text-dim); font-size: 13px; text-align: center; padding: 24px;">No active public rooms right now. Create one!</div>`;
    return;
  }

  roomListDiv.innerHTML = "";
  rooms.forEach((r) => {
    const card = document.createElement("div");
    card.className = "room-card";
    card.innerHTML = `
      <div class="room-card-info">
        <h4>${escapeHtml(r.name)}</h4>
        <div class="room-meta">
          <span>👥 ${r.participantCount || 0} / ${r.maxParticipants || 50}</span>
          <span class="badge badge-success">Online</span>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm join-quick-btn" data-room="${escapeHtml(r.name)}">Join</button>
    `;
    roomListDiv.appendChild(card);
  });

  roomListDiv.querySelectorAll(".join-quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      roomNameInput.value = btn.getAttribute("data-room");
      joinRoom();
    });
  });
}

refreshRoomsBtn.addEventListener("click", fetchPublicRooms);

// WebRTC Configuration
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Initialize WebRTC Peer Connection
function initPeerConnection(targetId, isInitiator) {
  console.log(`[WebRTC] Peer connection init with ${targetId}, isInitiator: ${isInitiator}`);
  const pc = new RTCPeerConnection(rtcConfig);
  let dc = null;

  if (isInitiator) {
    dc = pc.createDataChannel("meshLAN_channel", { ordered: true });
    setupDataChannel(dc, targetId);
  } else {
    pc.ondatachannel = (event) => {
      dc = event.channel;
      setupDataChannel(dc, targetId);
    };
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", {
        to: targetId,
        signal: { type: "candidate", ice: event.candidate },
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`[WebRTC] ICE state with ${targetId}: ${pc.iceConnectionState}`);
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
      connectionTypeSpan.textContent = "Direct P2P Mesh";
      addChatMessage("System", `Direct P2P connected with peer.`, true);
    } else if (pc.iceConnectionState === "disconnected") {
      connectionTypeSpan.textContent = "Reconnecting...";
    }
  };

  if (isInitiator) {
    createAndSendOffer(pc, targetId);
  }

  peers[targetId] = { connection: pc, dataChannel: dc, isInitiator };
  return peers[targetId];
}

async function createAndSendOffer(pc, targetId) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", {
      to: targetId,
      signal: { type: "offer", sdp: pc.localDescription },
    });
  } catch (err) {
    console.error("Error creating offer:", err);
  }
}

async function processSignal(from, signal) {
  try {
    if (!peers[from]) {
      initPeerConnection(from, false);
    }
    const pc = peers[from].connection;

    if (signal.type === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal", {
        to: from,
        signal: { type: "answer", sdp: pc.localDescription },
      });
    } else if (signal.type === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } else if (signal.type === "candidate") {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.ice));
      } else {
        if (!pendingCandidates[from]) pendingCandidates[from] = [];
        pendingCandidates[from].push(signal.ice);
      }
    }
  } catch (err) {
    console.error("Signal processing error:", err);
  }
}

function setupDataChannel(dc, targetId) {
  if (peers[targetId]) peers[targetId].dataChannel = dc;

  dc.onopen = () => {
    console.log(`[DataChannel] Open with ${targetId}`);
    dc.send(JSON.stringify({ type: "ping", timestamp: Date.now(), sender: localUsername }));
  };

  dc.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "chat") {
        addChatMessage(msg.sender || "Peer", msg.text);
      } else if (msg.type === "ping") {
        dc.send(JSON.stringify({ type: "pong", timestamp: msg.timestamp }));
      } else if (msg.type === "pong") {
        const ping = Date.now() - msg.timestamp;
        latencySpan.textContent = `${ping}ms`;
      }
    } catch (e) {
      console.warn("Invalid data channel packet:", event.data);
    }
  };
}

// Send P2P Chat Message
function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  addChatMessage("You", text);
  chatInput.value = "";

  const payload = JSON.stringify({
    type: "chat",
    sender: localUsername,
    text,
  });

  Object.values(peers).forEach((p) => {
    if (p.dataChannel && p.dataChannel.readyState === "open") {
      p.dataChannel.send(payload);
    }
  });
}

chatSendBtn.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChatMessage();
});

// Update Participant List
function updateUsersList(users) {
  usersList.innerHTML = "";
  const userArray = Array.isArray(users) ? users : Object.values(users || {});
  userCountBadge.textContent = `${userArray.length} online`;

  userArray.forEach((user) => {
    const li = document.createElement("li");
    li.className = `user-item ${user.id === socket.id ? "self" : ""}`;
    li.innerHTML = `
      <span>👤 ${escapeHtml(user.username)} ${user.id === socket.id ? "(You)" : ""}</span>
      <span class="user-pill">${user.id === socket.id ? "Local" : "P2P Connected"}</span>
    `;
    usersList.appendChild(li);

    // If new peer, initiate connection deterministically
    if (user.id !== socket.id && !peers[user.id]) {
      const shouldInitiate = socket.id.localeCompare(user.id) > 0;
      initPeerConnection(user.id, shouldInitiate);
    }
  });
}

function cleanupPeer(peerId) {
  if (peers[peerId]) {
    try {
      if (peers[peerId].dataChannel) peers[peerId].dataChannel.close();
      peers[peerId].connection.close();
    } catch (e) {}
    delete peers[peerId];
  }
}

// Room Actions
function createRoom() {
  const username = usernameInput.value.trim();
  const roomName = roomNameInput.value.trim();
  const password = roomPasswordInput.value.trim();

  if (!username || !roomName) {
    alert("Please enter both a nickname and a room name.");
    return;
  }

  localUsername = username;
  localStorage.setItem("meshlan_username", username);

  socket.emit("create-room", {
    name: roomName,
    isPrivate: Boolean(password),
    password: password || undefined,
    username,
  });
}

function joinRoom() {
  const username = usernameInput.value.trim();
  const roomName = roomNameInput.value.trim();
  const password = roomPasswordInput.value.trim();

  if (!username || !roomName) {
    alert("Please enter both a nickname and a room name.");
    return;
  }

  localUsername = username;
  localStorage.setItem("meshlan_username", username);

  socket.emit("join-room", {
    roomName,
    password: password || undefined,
    username,
  });
}

createBtn.addEventListener("click", createRoom);
joinBtn.addEventListener("click", joinRoom);

disconnectBtn.addEventListener("click", () => {
  socket.emit("leave-room");
  Object.keys(peers).forEach(cleanupPeer);
  connectionForm.style.display = "block";
  roomInfo.style.display = "none";
  currentRoom = null;
  addChatMessage("System", "Left the room.", true);
  fetchPublicRooms();
});

// Socket Room Listeners
socket.on("room-created", (name) => {
  currentRoom = typeof name === "string" ? name : name.roomName;
  showInRoom(currentRoom);
});

socket.on("room-joined", (name) => {
  currentRoom = typeof name === "string" ? name : name.roomName;
  showInRoom(currentRoom);
});

socket.on("user-joined", (data) => {
  if (data.users) updateUsersList(data.users);
});

socket.on("user-left", (data) => {
  if (data.userId) cleanupPeer(data.userId);
  if (data.users) updateUsersList(data.users);
});

socket.on("signal", (data) => {
  processSignal(data.from, data.signal);
});

socket.on("error", (err) => {
  const msg = typeof err === "object" ? err.message : err;
  alert(`Error: ${msg}`);
});

socket.on("rooms-list-updated", fetchPublicRooms);

function showInRoom(name) {
  connectionForm.style.display = "none";
  roomInfo.style.display = "block";
  currentRoomSpan.textContent = name;
  virtualIpSpan.textContent = generateVirtualIP();
  addChatMessage("System", `Joined room: ${name}`, true);
}

// 1-on-1 Matchmaking
startMatchBtn.addEventListener("click", () => {
  const username = matchUsernameInput.value.trim() || localUsername || "Guest";
  localUsername = username;
  localStorage.setItem("meshlan_username", username);

  socket.emit("join", { username });
  socket.emit("start_random_chat");

  matchIdleView.style.display = "none";
  matchWaitingView.style.display = "block";
});

cancelMatchBtn.addEventListener("click", () => {
  socket.emit("end_random_chat");
  matchWaitingView.style.display = "none";
  matchIdleView.style.display = "block";
});

socket.on("waiting_for_partner", () => {
  matchIdleView.style.display = "none";
  matchWaitingView.style.display = "block";
});

socket.on("random_chat_started", (data) => {
  matchWaitingView.style.display = "none";
  matchActiveView.style.display = "block";
  partnerName.textContent = data.partnerUsername || "Partner";

  matchSeconds = 0;
  clearInterval(matchTimerInterval);
  matchTimerInterval = setInterval(() => {
    matchSeconds++;
    const mins = String(Math.floor(matchSeconds / 60)).padStart(2, "0");
    const secs = String(matchSeconds % 60).padStart(2, "0");
    matchTimer.textContent = `${mins}:${secs}`;
  }, 1000);
});

socket.on("random_chat_ended", () => {
  clearInterval(matchTimerInterval);
  matchActiveView.style.display = "none";
  matchWaitingView.style.display = "none";
  matchIdleView.style.display = "block";
});

endMatchBtn.addEventListener("click", () => {
  socket.emit("end_random_chat");
});

nextMatchBtn.addEventListener("click", () => {
  socket.emit("end_random_chat");
  setTimeout(() => {
    socket.emit("start_random_chat");
  }, 300);
});

// Telemetry Polling
async function fetchServerHealth() {
  try {
    const res = await fetch(`${serverUrl}/health`);
    const data = await res.json();
    telemetryStatus.textContent = data.status;
    telemetryUsers.textContent = data.activeUsers;
    telemetryRooms.textContent = data.activeRooms;
    telemetryQueue.textContent = data.waitingQueue;
    telemetryUptime.textContent = `${data.uptime}s`;
    telemetryMemory.textContent = data.memory ? data.memory.heapUsed : "-";
  } catch (err) {
    telemetryStatus.textContent = "UNREACHABLE";
    telemetryStatus.style.color = "var(--danger)";
  }
}

refreshHealthBtn.addEventListener("click", fetchServerHealth);
setInterval(fetchServerHealth, 10000);

// Compatible Game Buttons
document.querySelectorAll(".game-item").forEach((item) => {
  item.addEventListener("click", () => {
    const game = item.getAttribute("data-game");
    alert(`[Virtual LAN] Virtual IP ${virtualIpSpan.textContent} bound. Launching LAN session for ${game}...`);
  });
});