import User from "../models/User.js";
import logger from "../utils/logger.js";

class UserService {
  constructor() {
    // socketId -> User
    this.users = new Map();
  }

  registerUser(socketId, username) {
    const user = new User(socketId, username);
    this.users.set(socketId, user);
    logger.info(`User registered: ${user.username} [socket: ${socketId}, id: ${user.id}]`);
    return user;
  }

  getUser(socketId) {
    return this.users.get(socketId) || null;
  }

  getUserById(userId) {
    for (const user of this.users.values()) {
      if (user.id === userId) return user;
    }
    return null;
  }

  removeUser(socketId) {
    const user = this.users.get(socketId);
    if (user) {
      this.users.delete(socketId);
      logger.info(`User unregistered: ${user.username} [socket: ${socketId}]`);
    }
    return user || null;
  }

  getOnlineCount() {
    return this.users.size;
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  clear() {
    this.users.clear();
  }
}

export const userService = new UserService();
export default userService;
