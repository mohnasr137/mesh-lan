import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export const config = {
  // Server environment & network
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HOST: process.env.HOST || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",

  // Room parameters
  MAX_ROOM_PARTICIPANTS: parseInt(process.env.MAX_ROOM_PARTICIPANTS, 10) || 50,
  DEFAULT_ROOM_NAME_MAX_LENGTH: 50,

  // CORS configuration
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",

  // Security configuration
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,

  // Socket.IO configuration
  SOCKET_IO_OPTIONS: {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT, 10) || 60000,
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL, 10) || 25000,
  },
};

export default config;
