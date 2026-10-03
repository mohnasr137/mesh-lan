import userService from "../services/userService.js";
import { SOCKET_EVENTS } from "../config/constants.js";

export const registerSignalHandlers = (io, socket) => {
  // WebRTC Offer
  socket.on(SOCKET_EVENTS.OFFER, (data = {}) => {
    const user = userService.getUser(socket.id);
    if (!user) return;

    const payload = {
      offer: data.offer,
      from: socket.id,
      fromUserId: user.id,
      fromUsername: user.username,
    };

    if (data.to && io.sockets.sockets.has(data.to)) {
      // Direct peer-to-peer signaling
      io.to(data.to).emit(SOCKET_EVENTS.OFFER, payload);
    } else {
      // Broadcast to room or random chat
      const targetRoom = user.currentRoom || user.randomChatId;
      if (targetRoom) {
        socket.to(targetRoom).emit(SOCKET_EVENTS.OFFER, payload);
      }
    }
  });

  // WebRTC Answer
  socket.on(SOCKET_EVENTS.ANSWER, (data = {}) => {
    const user = userService.getUser(socket.id);
    if (!user) return;

    const payload = {
      answer: data.answer,
      from: socket.id,
      fromUserId: user.id,
      fromUsername: user.username,
    };

    if (data.to && io.sockets.sockets.has(data.to)) {
      io.to(data.to).emit(SOCKET_EVENTS.ANSWER, payload);
    } else {
      const targetRoom = user.currentRoom || user.randomChatId;
      if (targetRoom) {
        socket.to(targetRoom).emit(SOCKET_EVENTS.ANSWER, payload);
      }
    }
  });

  // WebRTC ICE Candidate
  socket.on(SOCKET_EVENTS.ICE_CANDIDATE, (data = {}) => {
    const user = userService.getUser(socket.id);
    if (!user) return;

    const payload = {
      candidate: data.candidate,
      from: socket.id,
      fromUserId: user.id,
      fromUsername: user.username,
    };

    if (data.to && io.sockets.sockets.has(data.to)) {
      io.to(data.to).emit(SOCKET_EVENTS.ICE_CANDIDATE, payload);
    } else {
      const targetRoom = user.currentRoom || user.randomChatId;
      if (targetRoom) {
        socket.to(targetRoom).emit(SOCKET_EVENTS.ICE_CANDIDATE, payload);
      }
    }
  });

  // Backward-compatible unified WebRTC signal (for vpn-client-main)
  socket.on(SOCKET_EVENTS.SIGNAL, (data = {}) => {
    if (data.to && io.sockets.sockets.has(data.to)) {
      io.to(data.to).emit(SOCKET_EVENTS.SIGNAL, {
        from: socket.id,
        signal: data.signal,
      });
    }
  });
};

export default registerSignalHandlers;
