import { v4 as uuidv4 } from "uuid";

export class RandomChat {
  constructor(user1, user2) {
    this.id = uuidv4();
    this.user1 = user1;
    this.user2 = user2;
    this.createdAt = new Date();
    this.endedAt = null;
    this.isActive = true;
  }

  endChat() {
    this.isActive = false;
    this.endedAt = new Date();
  }

  getPartner(socketId) {
    if (this.user1.socketId === socketId) return this.user2;
    if (this.user2.socketId === socketId) return this.user1;
    return null;
  }

  hasUser(socketId) {
    return this.user1.socketId === socketId || this.user2.socketId === socketId;
  }

  getUsers() {
    return [this.user1, this.user2];
  }

  toJSON() {
    return {
      id: this.id,
      user1: this.user1.toJSON(),
      user2: this.user2.toJSON(),
      createdAt: this.createdAt,
      endedAt: this.endedAt,
      isActive: this.isActive,
    };
  }
}

export default RandomChat;
