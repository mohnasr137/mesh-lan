import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import config from "./config/index.js";
import apiRouter from "./routes/index.js";
import healthRoutes from "./routes/healthRoutes.js";
import { requestLogger } from "./middleware/logger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.join(__dirname, "client", "dist");

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

  // Serve static client assets if built
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
  }

  // Health check routes
  app.use("/health", healthRoutes);

  // API routes
  app.use("/api", apiRouter);

  // Serve index.html for root page
  app.get("/", (req, res, next) => {
    const indexPath = path.join(clientDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    next();
  });

  // 404 & Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
