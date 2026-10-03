import { v4 as uuidv4 } from "uuid";

export class User {
  constructor(socketId, username) {
    this.id = uuidv4();
    this.socketId = socketId;
    this.username = (username || "").trim();
    this.currentRoom = null;
    this.isInRandomChat = false;
    this.randomChatId = null;
    this.joinedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      socketId: this.socketId,
      username: this.username,
      currentRoom: this.currentRoom,
      isInRandomChat: this.isInRandomChat,
      joinedAt: this.joinedAt,
    };
  }
}

export default User;
