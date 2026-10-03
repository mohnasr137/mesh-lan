import userService from "../services/userService.js";
import matchmakingService from "../services/matchmakingService.js";
import roomService from "../services/roomService.js";
import { SOCKET_EVENTS } from "../config/constants.js";
import logger from "../utils/logger.js";
import registerRoomHandlers from "./roomHandlers.js";
import registerMatchHandlers from "./matchHandlers.js";
import registerSignalHandlers from "./signalHandlers.js";
import registerVoiceHandlers from "./voiceHandlers.js";

/**
 * Initializes and binds Socket.IO event listeners
 * @param {import("socket.io").Server} io
 */
export const initializeSockets = (io) => {
  io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.info(`Client connected: [socket: ${socket.id}]`);

    // Attach sub-handlers
    const { handleLeaveRoom, broadcastRoomsList } = registerRoomHandlers(io, socket);
    const { handleEndRandomChat } = registerMatchHandlers(io, socket);
    registerSignalHandlers(io, socket);
    registerVoiceHandlers(io, socket);

    // Initial user authentication / registration
    socket.on(SOCKET_EVENTS.JOIN, (data = {}) => {
      const username = (data.username || "").trim();

      if (!username) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: "Username is required" });
        return;
      }

      const user = userService.registerUser(socket.id, username);

      socket.emit(SOCKET_EVENTS.JOINED, {
        userId: user.id,
        socketId: user.socketId,
        username: user.username,
      });

      // Send initial public rooms list
      socket.emit(SOCKET_EVENTS.ROOMS_LIST, roomService.getAllRoomsSummary());
    });

    // Client disconnection and cleanup
    socket.on(SOCKET_EVENTS.DISCONNECT, (reason) => {
      logger.info(`Client disconnected: [socket: ${socket.id}, reason: ${reason}]`);

      // 1. Remove from matchmaking queue
      matchmakingService.removeFromQueue(socket.id);

      // 2. Terminate active random chat session
      handleEndRandomChat("Partner disconnected");

      // 3. Leave any joined room
      handleLeaveRoom();

      // 4. Remove user session
      userService.removeUser(socket.id);

      // 5. Broadcast updated room status
      broadcastRoomsList();
    });
  });
};

export default initializeSockets;
