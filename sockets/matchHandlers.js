import matchmakingService from "../services/matchmakingService.js";
import userService from "../services/userService.js";
import { SOCKET_EVENTS } from "../config/constants.js";
import logger from "../utils/logger.js";

export const registerMatchHandlers = (io, socket) => {
  // Start random chat matchmaking
  socket.on(SOCKET_EVENTS.START_RANDOM_CHAT, () => {
    const user = userService.getUser(socket.id);
    if (!user) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: "User not authenticated" });
      return;
    }

    if (user.isInRandomChat) {
      socket.emit(SOCKET_EVENTS.ERROR, { message: "Already in random chat" });
      return;
    }

    if (matchmakingService.isInQueue(socket.id)) {
      socket.emit(SOCKET_EVENTS.WAITING_FOR_PARTNER);
      return;
    }

    // Attempt to match with waiting queue
    const matchResult = matchmakingService.match(user, (partnerSocketId) => {
      return io.sockets.sockets.has(partnerSocketId);
    });

    if (matchResult) {
      const { chat, partner } = matchResult;

      // Join both sockets to the private chat room
      socket.join(chat.id);
      const partnerSocket = io.sockets.sockets.get(partner.socketId);
      if (partnerSocket) {
        partnerSocket.join(chat.id);
      }

      // Notify initiating user
      socket.emit(SOCKET_EVENTS.RANDOM_CHAT_STARTED, {
        chatId: chat.id,
        partnerId: partner.id,
        partnerUsername: partner.username,
        partnerSocketId: partner.socketId,
      });

      // Notify partner user
      io.to(partner.socketId).emit(SOCKET_EVENTS.RANDOM_CHAT_STARTED, {
        chatId: chat.id,
        partnerId: user.id,
        partnerUsername: user.username,
        partnerSocketId: user.socketId,
      });

      logger.info(`Match established: ${user.username} <--> ${partner.username}`);
    } else {
      socket.emit(SOCKET_EVENTS.WAITING_FOR_PARTNER);
    }
  });

  // End random chat logic
  const handleEndRandomChat = (reason = "Chat ended") => {
    const user = userService.getUser(socket.id);
    if (!user || !user.isInRandomChat) return;

    const chat = matchmakingService.getChatBySocketId(socket.id);
    if (!chat) return;

    const partner = chat.getPartner(socket.id);

    matchmakingService.endChat(chat.id);

    // Leave socket room
    socket.leave(chat.id);
    socket.emit(SOCKET_EVENTS.RANDOM_CHAT_ENDED, { reason });

    // Notify partner if connected
    if (partner) {
      const partnerSocket = io.sockets.sockets.get(partner.socketId);
      if (partnerSocket) {
        partnerSocket.leave(chat.id);
        partnerSocket.emit(SOCKET_EVENTS.RANDOM_CHAT_ENDED, {
          reason: "Partner ended the chat",
        });
      }
    }
  };

  socket.on(SOCKET_EVENTS.END_RANDOM_CHAT, () => {
    handleEndRandomChat("Chat ended by user");
  });

  return { handleEndRandomChat };
};

export default registerMatchHandlers;
