import express from "express";
import cors from "cors";
import config from "./config/index.js";
import apiRouter from "./routes/index.js";
import healthRoutes from "./routes/healthRoutes.js";
import { requestLogger } from "./middleware/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

export const createApp = () => {
  const app = express();

  // CORS middleware
  app.use(
    cors({
      origin: config.CORS_ORIGIN,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  );

  // Body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging
  app.use(requestLogger);

  // Health check routes
  app.use("/health", healthRoutes);

  // API routes
  app.use("/api", apiRouter);

  // 404 & Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
