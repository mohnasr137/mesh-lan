import { HTTP_STATUS } from "../config/constants.js";
import logger from "../utils/logger.js";

/**
 * 404 Not Found Middleware
 */
export const notFoundHandler = (req, res, next) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Global Express Error Handling Middleware
 */
export const errorHandler = (err, req, res, next) => {
  logger.error(`Unhandled Error [${req.method} ${req.originalUrl}]:`, err.message || err);

  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
  const message = err.message || "Internal server error";

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
