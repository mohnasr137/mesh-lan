import userService from "../services/userService.js";
import { SOCKET_EVENTS } from "../config/constants.js";

export const registerVoiceHandlers = (io, socket) => {
  // Voice binary/audio chunk data relay
  socket.on(SOCKET_EVENTS.VOICE_DATA, (data = {}) => {
    const user = userService.getUser(socket.id);
    if (!user) return;

    const payload = {
      userId: user.id,
      socketId: socket.id,
      username: user.username,
      data: data.data || data,
    };

    // If targeted to a specific peer
    if (data.to && io.sockets.sockets.has(data.to)) {
      io.to(data.to).emit(SOCKET_EVENTS.VOICE_DATA, payload);
      return;
    }

    // Otherwise relay to active room or random chat
    if (user.currentRoom) {
      socket.to(user.currentRoom).emit(SOCKET_EVENTS.VOICE_DATA, payload);
    } else if (user.isInRandomChat && user.randomChatId) {
      socket.to(user.randomChatId).emit(SOCKET_EVENTS.VOICE_DATA, payload);
    }
  });
};

export default registerVoiceHandlers;
