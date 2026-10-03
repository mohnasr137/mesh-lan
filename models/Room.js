import bcrypt from "bcryptjs";
import config from "../config/index.js";

export class Room {
  constructor({
    id,
    name,
    isPrivate = false,
    hashedPassword = null,
    maxParticipants = config.MAX_ROOM_PARTICIPANTS,
    hostId = null,
  }) {
    this.id = id;
    this.name = name.trim();
    this.isPrivate = Boolean(isPrivate);
    this.password = hashedPassword;
    this.hostId = hostId;
    this.maxParticipants = maxParticipants || config.MAX_ROOM_PARTICIPANTS;
    // socketId -> User summary
    this.participants = new Map();
    this.createdAt = new Date();
  }

  addParticipant(user) {
    if (this.participants.size >= this.maxParticipants) {
      return false;
    }
    this.participants.set(user.socketId, {
      id: user.id,
      socketId: user.socketId,
      username: user.username,
      joinedAt: new Date(),
    });

    // If no host assigned, assign first participant as host
    if (!this.hostId) {
      this.hostId = user.socketId;
    }
    return true;
  }

  removeParticipant(socketId) {
    const existed = this.participants.delete(socketId);
    if (existed && this.hostId === socketId) {
      // Reassign host to next available participant
      const nextHost = this.participants.keys().next().value;
      this.hostId = nextHost || null;
    }
    return existed;
  }

  hasParticipant(socketId) {
    return this.participants.has(socketId);
  }

  getParticipantCount() {
    return this.participants.size;
  }

  getParticipantsList() {
    return Array.from(this.participants.values());
  }

  async verifyPassword(plainPassword) {
    if (!this.isPrivate) return true;
    if (!this.password) return true;
    if (!plainPassword) return false;
    return bcrypt.compare(plainPassword, this.password);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      isPrivate: this.isPrivate,
      participantCount: this.getParticipantCount(),
      maxParticipants: this.maxParticipants,
      hostId: this.hostId,
      createdAt: this.createdAt,
      participants: this.getParticipantsList(),
    };
  }

  toPublicJSON() {
    return {
      id: this.id,
      name: this.name,
      isPrivate: this.isPrivate,
      participantCount: this.getParticipantCount(),
      maxParticipants: this.maxParticipants,
      createdAt: this.createdAt,
    };
  }
}

export default Room;
