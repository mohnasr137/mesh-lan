import RandomChat from "../models/RandomChat.js";
import logger from "../utils/logger.js";

class MatchmakingService {
  constructor() {
    this.waitingQueue = []; // Array of User objects
    this.activeChats = new Map(); // chatId -> RandomChat
  }

  addToQueue(user) {
    if (this.isInQueue(user.socketId)) {
      return false;
    }
    this.waitingQueue.push(user);
    logger.info(`User ${user.username} [socket: ${user.socketId}] queued for matchmaking. Queue length: ${this.waitingQueue.length}`);
    return true;
  }

  removeFromQueue(socketId) {
    const idx = this.waitingQueue.findIndex((u) => u.socketId === socketId);
    if (idx !== -1) {
      const removed = this.waitingQueue.splice(idx, 1)[0];
      logger.info(`User ${removed.username} [socket: ${socketId}] removed from matchmaking queue`);
      return removed;
    }
    return null;
  }

  isInQueue(socketId) {
    return this.waitingQueue.some((u) => u.socketId === socketId);
  }

  /**
   * Attempts to match a user with someone from the queue.
   * @param {User} user - User requesting a match
   * @param {Function} isConnected - Function (socketId) => boolean checking if partner socket is alive
   */
  match(user, isConnected = () => true) {
    while (this.waitingQueue.length > 0) {
      const candidate = this.waitingQueue.shift();

      // Check if candidate is still alive and not the same user
      if (candidate.socketId !== user.socketId && isConnected(candidate.socketId)) {
        const chat = new RandomChat(user, candidate);
        this.activeChats.set(chat.id, chat);

        user.isInRandomChat = true;
        user.randomChatId = chat.id;

        candidate.isInRandomChat = true;
        candidate.randomChatId = chat.id;

        logger.info(`Random chat matched: ${user.username} <--> ${candidate.username} [chatId: ${chat.id}]`);
        return { chat, partner: candidate };
      }
    }

    // No valid match found; queue current user
    this.addToQueue(user);
    return null;
  }

  endChat(chatId) {
    const chat = this.activeChats.get(chatId);
    if (!chat) return null;

    chat.endChat();
    const users = chat.getUsers();
    for (const u of users) {
      u.isInRandomChat = false;
      u.randomChatId = null;
    }

    this.activeChats.delete(chatId);
    logger.info(`Random chat ended [chatId: ${chatId}]`);
    return chat;
  }

  getChat(chatId) {
    return this.activeChats.get(chatId) || null;
  }

  getChatBySocketId(socketId) {
    for (const chat of this.activeChats.values()) {
      if (chat.hasUser(socketId)) {
        return chat;
      }
    }
    return null;
  }

  getQueueLength() {
    return this.waitingQueue.length;
  }

  getActiveChatsCount() {
    return this.activeChats.size;
  }

  clear() {
    this.waitingQueue = [];
    this.activeChats.clear();
  }
}

export const matchmakingService = new MatchmakingService();
export default matchmakingService;
