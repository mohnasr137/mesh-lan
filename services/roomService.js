import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import Room from "../models/Room.js";
import config from "../config/index.js";
import logger from "../utils/logger.js";

class RoomService {
  constructor() {
    // roomId -> Room
    this.rooms = new Map();
  }

  async createRoom({
    name,
    isPrivate = false,
    password = null,
    maxParticipants = config.MAX_ROOM_PARTICIPANTS,
    hostId = null,
  }) {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new Error("Room name is required");
    }

    const trimmedName = name.trim();
    if (trimmedName.length > config.DEFAULT_ROOM_NAME_MAX_LENGTH) {
      throw new Error(`Room name cannot exceed ${config.DEFAULT_ROOM_NAME_MAX_LENGTH} characters`);
    }

    const roomId = uuidv4();
    let hashedPassword = null;

    if (isPrivate && password) {
      hashedPassword = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    }

    const room = new Room({
      id: roomId,
      name: trimmedName,
      isPrivate,
      hashedPassword,
      maxParticipants,
      hostId,
    });

    this.rooms.set(roomId, room);
    logger.info(`Room created: "${room.name}" [id: ${roomId}, private: ${isPrivate}]`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  getRoomByName(name) {
    if (!name) return null;
    const lower = name.trim().toLowerCase();
    for (const room of this.rooms.values()) {
      if (room.name.toLowerCase() === lower) {
        return room;
      }
    }
    return null;
  }

  getPublicRooms() {
    return Array.from(this.rooms.values())
      .filter((room) => !room.isPrivate)
      .map((room) => room.toPublicJSON());
  }

  getAllRoomsSummary() {
    return Array.from(this.rooms.values()).map((room) => ({
      name: room.name,
      id: room.id,
      userCount: room.getParticipantCount(),
      maxParticipants: room.maxParticipants,
      isPrivate: room.isPrivate,
      host: room.hostId,
    }));
  }

  async verifyRoomPassword(roomId, password) {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("Room not found");
    }
    return room.verifyPassword(password);
  }

  async joinRoom(roomId, user, password = null) {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.isPrivate) {
      const isValid = await room.verifyPassword(password);
      if (!isValid) {
        throw new Error("Invalid password");
      }
    }

    const added = room.addParticipant(user);
    if (!added) {
      throw new Error("Room is full");
    }

    user.currentRoom = roomId;
    logger.info(`User ${user.username} joined room: "${room.name}"`);
    return room;
  }

  leaveRoom(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return null;

    const removed = room.removeParticipant(socketId);
    if (removed) {
      logger.info(`User [socket: ${socketId}] left room: "${room.name}"`);
      // Auto-cleanup empty public rooms
      if (room.getParticipantCount() === 0) {
        this.rooms.delete(roomId);
        logger.info(`Empty room cleaned up: "${room.name}" [id: ${roomId}]`);
      }
    }
    return room;
  }

  deleteRoom(roomId) {
    return this.rooms.delete(roomId);
  }

  getRoomCount() {
    return this.rooms.size;
  }

  clear() {
    this.rooms.clear();
  }
}

export const roomService = new RoomService();
export default roomService;
