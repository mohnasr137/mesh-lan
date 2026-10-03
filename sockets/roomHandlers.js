import roomService from "../services/roomService.js";
import userService from "../services/userService.js";
import { SOCKET_EVENTS } from "../config/constants.js";
import logger from "../utils/logger.js";

export const registerRoomHandlers = (io, socket) => {
  // Build user map expected by WebRTC client: { [socketId]: { id, username, peerId } }
  const getUsersMap = (room) => {
    const map = {};
    room.getParticipantsList().forEach((p) => {
      map[p.socketId] = {
        id: p.socketId,
        username: p.username,
        peerId: null,
      };
    });
    return map;
  };

  // Broadcast updated rooms list to all clients
  const broadcastRoomsList = () => {
    const list = roomService.getAllRoomsSummary();
    io.emit(SOCKET_EVENTS.ROOMS_LIST_UPDATED, list);
    // Also emit legacy room list (array of strings) if needed
    io.emit("rooms-list-updated", list.map((r) => r.name));
  };

  // Join room handler supporting both (roomIdOrName, username) and ({ roomId, password })
  const handleJoinRoom = async (...args) => {
    try {
      let roomIdOrName, password, username;

      if (typeof args[0] === "string") {
        roomIdOrName = args[0];
        username = args[1];
        if (username && !userService.getUser(socket.id)) {
          userService.registerUser(socket.id, username);
        }
      } else if (typeof args[0] === "object" && args[0] !== null) {
        ({ roomId: roomIdOrName, roomName: roomIdOrName, password, username } = args[0]);
        if (username && !userService.getUser(socket.id)) {
          userService.registerUser(socket.id, username);
        }
      }

      const user = userService.getUser(socket.id);
      if (!user) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "User not authenticated. Please join first." });
        socket.emit("error", "User not authenticated. Please join first.");
        return;
      }

      if (!roomIdOrName) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Room identifier is required" });
        socket.emit("error", "Room identifier is required");
        return;
      }

      let room = roomService.getRoom(roomIdOrName) || roomService.getRoomByName(roomIdOrName);
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Room not found" });
        socket.emit("error", "Room does not exist");
        return;
      }

      // Leave previous room if user is already in one
      if (user.currentRoom && user.currentRoom !== room.id) {
        handleLeaveRoom(user.currentRoom);
      }

      // Join room via roomService
      await roomService.joinRoom(room.id, user, password);

      socket.join(room.id);
      socket.roomName = room.name;

      const usersMap = getUsersMap(room);

      // Notify caller (room-joined with string name for client.js, room_joined with object for modern API)
      socket.emit("room-joined", room.name);
      socket.emit("room_joined", {
        roomId: room.id,
        roomName: room.name,
        participantCount: room.getParticipantCount(),
        maxParticipants: room.maxParticipants,
        hostId: room.hostId,
        participants: room.getParticipantsList(),
      });

      // Notify everyone in the room (both formats)
      io.to(room.id).emit("user-joined", {
        users: usersMap,
        host: room.hostId,
        user: { id: socket.id, username: user.username },
      });

      socket.to(room.id).emit(SOCKET_EVENTS.USER_JOINED, {
        userId: user.id,
        socketId: user.socketId,
        username: user.username,
        participantCount: room.getParticipantCount(),
        participants: room.getParticipantsList(),
        hostId: room.hostId,
      });

      broadcastRoomsList();
    } catch (error) {
      logger.warn(`Failed to join room: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: error.message || "Failed to join room" });
      socket.emit("error", error.message || "Failed to join room");
    }
  };

  // Create room handler supporting both (roomName, username) and ({ name, isPrivate, password })
  const handleCreateRoom = async (...args) => {
    try {
      let name, isPrivate, password, maxParticipants, legacyUsername;

      if (typeof args[0] === "string") {
        name = args[0];
        legacyUsername = args[1];
        if (legacyUsername && !userService.getUser(socket.id)) {
          userService.registerUser(socket.id, legacyUsername);
        }
      } else if (typeof args[0] === "object" && args[0] !== null) {
        ({ name, isPrivate, password, maxParticipants, username: legacyUsername } = args[0]);
        if (legacyUsername && !userService.getUser(socket.id)) {
          userService.registerUser(socket.id, legacyUsername);
        }
      }

      const user = userService.getUser(socket.id);
      if (!user) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "User not authenticated" });
        socket.emit("error", "User not authenticated");
        return;
      }

      const room = await roomService.createRoom({
        name,
        isPrivate,
        password,
        maxParticipants,
        hostId: socket.id,
      });

      await roomService.joinRoom(room.id, user, password);
      socket.join(room.id);
      socket.roomName = room.name;

      const usersMap = getUsersMap(room);

      // Emit creation events
      socket.emit("room-created", room.name);
      socket.emit("room_created", {
        roomId: room.id,
        roomName: room.name,
      });

      // Emit join confirmation
      socket.emit("room-joined", room.name);
      socket.emit("room_joined", {
        roomId: room.id,
        roomName: room.name,
        participantCount: room.getParticipantCount(),
        hostId: room.hostId,
        participants: room.getParticipantsList(),
      });

      // Emit user-joined to room so UI updates
      io.to(room.id).emit("user-joined", {
        users: usersMap,
        host: room.hostId,
      });

      broadcastRoomsList();
    } catch (error) {
      logger.warn(`Failed to create room via socket: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: error.message || "Failed to create room" });
      socket.emit("error", error.message || "Failed to create room");
    }
  };

  // Leave room logic
  const handleLeaveRoom = (targetRoomId) => {
    const user = userService.getUser(socket.id);
    if (!user) return;

    const roomId = targetRoomId || user.currentRoom;
    if (!roomId) return;

    const room = roomService.getRoom(roomId) || roomService.getRoomByName(roomId);
    if (room) {
      const prevHost = room.hostId;
      roomService.leaveRoom(room.id, socket.id);

      const remainingUsersMap = getUsersMap(room);

      // Notify other participants (both formats)
      socket.to(room.id).emit(SOCKET_EVENTS.USER_LEFT, {
        userId: user.id,
        socketId: socket.id,
        username: user.username,
        participantCount: room.getParticipantCount(),
        participants: room.getParticipantsList(),
        newHostId: room.hostId,
      });

      socket.to(room.id).emit("user-left", {
        userId: socket.id,
        users: remainingUsersMap,
      });

      if (prevHost === socket.id && room.hostId) {
        io.to(room.id).emit(SOCKET_EVENTS.HOST_CHANGED, room.hostId);
        io.to(room.id).emit("host-changed", room.hostId);
      }

      socket.leave(room.id);
    }

    user.currentRoom = null;
    socket.roomName = null;

    socket.emit(SOCKET_EVENTS.ROOM_LEFT, { roomId });
    socket.emit("room-left");
    broadcastRoomsList();
  };

  // Bind dual events (hyphenated & underscore)
  socket.on(SOCKET_EVENTS.JOIN_ROOM, handleJoinRoom);
  socket.on("join-room", handleJoinRoom);

  socket.on(SOCKET_EVENTS.CREATE_ROOM, handleCreateRoom);
  socket.on("create_room", handleCreateRoom);

  socket.on(SOCKET_EVENTS.LEAVE_ROOM, () => handleLeaveRoom());
  socket.on("leave-room", () => handleLeaveRoom());

  // Get available rooms
  socket.on(SOCKET_EVENTS.GET_ROOMS, () => {
    const list = roomService.getAllRoomsSummary();
    socket.emit(SOCKET_EVENTS.ROOMS_LIST, list);
    socket.emit("rooms-list", list);
  });
  socket.on("get_rooms", () => {
    const list = roomService.getAllRoomsSummary();
    socket.emit(SOCKET_EVENTS.ROOMS_LIST, list);
    socket.emit("rooms-list", list);
  });

  return { handleLeaveRoom, broadcastRoomsList };
};

export default registerRoomHandlers;
