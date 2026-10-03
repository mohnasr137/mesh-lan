import { HTTP_STATUS } from "../config/constants.js";

/**
 * Validates request payload for creating a room
 */
export const validateCreateRoom = (req, res, next) => {
  const { name, isPrivate, password } = req.body || {};

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "Room name is required and cannot be empty",
    });
  }

  if (name.trim().length > 50) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "Room name cannot exceed 50 characters",
    });
  }

  if (isPrivate && (!password || typeof password !== "string" || password.trim().length === 0)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "Password is required for private rooms",
    });
  }

  next();
};

/**
 * Validates request payload for verifying a room password
 */
export const validateVerifyPassword = (req, res, next) => {
  const { password } = req.body || {};

  if (!password || typeof password !== "string" || password.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: "Password is required",
    });
  }

  next();
};
