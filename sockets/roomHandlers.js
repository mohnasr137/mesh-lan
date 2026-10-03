import roomService from "../services/roomService.js";
import userService from "../services/userService.js";
import { SOCKET_EVENTS } from "../config/constants.js";
import logger from "../utils/logger.js";

export const registerRoomHandlers = (io, socket) => {
  // Broadcast updated rooms list to all clients
  const broadcastRoomsList = () => {
    const list = roomService.getAllRoomsSummary();
    io.emit(SOCKET_EVENTS.ROOMS_LIST_UPDATED, list);
  };

  // Join a room (by roomId or roomName)
  socket.on(SOCKET_EVENTS.JOIN_ROOM, async (data = {}) => {
    try {
      const user = userService.getUser(socket.id);
      if (!user) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "User not authenticated. Please join first." });
        return;
      }

      // Support { roomId, password } or legacy { roomName, password }
      const roomIdOrName = data.roomId || data.roomName;
      if (!roomIdOrName) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Room identifier is required" });
        return;
      }

      let room = roomService.getRoom(roomIdOrName) || roomService.getRoomByName(roomIdOrName);
      if (!room) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Room not found" });
        return;
      }

      // Leave previous room if user is already in one
      if (user.currentRoom && user.currentRoom !== room.id) {
        handleLeaveRoom(user.currentRoom);
      }

      // Join room via roomService
      await roomService.joinRoom(room.id, user, data.password);

      socket.join(room.id);
      socket.roomName = room.name;

      // Notify caller
      socket.emit(SOCKET_EVENTS.ROOM_JOINED, {
        roomId: room.id,
        roomName: room.name,
        participantCount: room.getParticipantCount(),
        maxParticipants: room.maxParticipants,
        hostId: room.hostId,
        participants: room.getParticipantsList(),
      });

      // Notify other participants in the room
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
    }
  });

  // Create room via socket (supports legacy vpn-server-main and modern objects)
  socket.on(SOCKET_EVENTS.CREATE_ROOM, async (...args) => {
    try {
      let name, isPrivate, password, maxParticipants;

      if (typeof args[0] === "string") {
        // Legacy: socket.emit('create-room', roomName, username)
        name = args[0];
        const legacyUsername = args[1];
        if (legacyUsername && !userService.getUser(socket.id)) {
          userService.registerUser(socket.id, legacyUsername);
        }
      } else if (typeof args[0] === "object" && args[0] !== null) {
        ({ name, isPrivate, password, maxParticipants } = args[0]);
      }

      const user = userService.getUser(socket.id);
      if (!user) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "User not authenticated" });
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

      socket.emit(SOCKET_EVENTS.ROOM_CREATED, {
        roomId: room.id,
        roomName: room.name,
      });

      socket.emit(SOCKET_EVENTS.ROOM_JOINED, {
        roomId: room.id,
        roomName: room.name,
        participantCount: room.getParticipantCount(),
        hostId: room.hostId,
        participants: room.getParticipantsList(),
      });

      broadcastRoomsList();
    } catch (error) {
      logger.warn(`Failed to create room via socket: ${error.message}`);
      socket.emit(SOCKET_EVENTS.ERROR, { message: error.message || "Failed to create room" });
    }
  });

  // Leave room logic
  const handleLeaveRoom = (targetRoomId) => {
    const user = userService.getUser(socket.id);
    if (!user) return;

    const roomId = targetRoomId || user.currentRoom;
    if (!roomId) return;

    const room = roomService.getRoom(roomId);
    if (room) {
      const prevHost = room.hostId;
      roomService.leaveRoom(roomId, socket.id);

      socket.to(roomId).emit(SOCKET_EVENTS.USER_LEFT, {
        userId: user.id,
        socketId: socket.id,
        username: user.username,
        participantCount: room.getParticipantCount(),
        participants: room.getParticipantsList(),
        newHostId: room.hostId,
      });

      if (prevHost === socket.id && room.hostId) {
        io.to(roomId).emit(SOCKET_EVENTS.HOST_CHANGED, room.hostId);
      }
    }

    socket.leave(roomId);
    user.currentRoom = null;
    socket.roomName = null;

    socket.emit(SOCKET_EVENTS.ROOM_LEFT, { roomId });
    broadcastRoomsList();
  };

  // Leave room event
  socket.on(SOCKET_EVENTS.LEAVE_ROOM, () => {
    handleLeaveRoom();
  });

  // Get available rooms
  socket.on(SOCKET_EVENTS.GET_ROOMS, () => {
    const list = roomService.getAllRoomsSummary();
    socket.emit(SOCKET_EVENTS.ROOMS_LIST, list);
  });

  return { handleLeaveRoom, broadcastRoomsList };
};

export default registerRoomHandlers;
