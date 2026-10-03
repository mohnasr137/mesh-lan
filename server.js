import { createServer } from "http";
import { Server } from "socket.io";
import config from "./config/index.js";
import createApp from "./app.js";
import initializeSockets from "./sockets/index.js";
import logger from "./utils/logger.js";

const app = createApp();
const server = createServer(app);

const io = new Server(server, config.SOCKET_IO_OPTIONS);

// Attach Socket.IO handlers
initializeSockets(io);

// Start server
server.listen(config.PORT, config.HOST, () => {
  logger.info(`Voice & WebRTC VPN Server running at http://${config.HOST}:${config.PORT}`);
  logger.info(`Health check: http://${config.HOST === "0.0.0.0" ? "localhost" : config.HOST}:${config.PORT}/health`);
  logger.info(`Environment: ${config.NODE_ENV}`);
});

// Graceful shutdown handling
const shutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  io.close(() => {
    logger.info("Socket.IO connections closed.");
    server.close(() => {
      logger.info("HTTP server closed. Exiting process.");
      process.exit(0);
    });
  });

  // Force shutdown if taking too long
  setTimeout(() => {
    logger.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export { app, server, io };
