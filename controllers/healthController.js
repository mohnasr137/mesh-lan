import userService from "../services/userService.js";
import roomService from "../services/roomService.js";
import matchmakingService from "../services/matchmakingService.js";
import { HTTP_STATUS } from "../config/constants.js";

/**
 * Health check & runtime telemetry endpoint
 */
export const getHealth = (req, res) => {
  const memory = process.memoryUsage();

  res.status(HTTP_STATUS.OK).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    activeUsers: userService.getOnlineCount(),
    activeRooms: roomService.getRoomCount(),
    waitingQueue: matchmakingService.getQueueLength(),
    activeRandomChats: matchmakingService.getActiveChatsCount(),
    memory: {
      rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
    },
  });
};
