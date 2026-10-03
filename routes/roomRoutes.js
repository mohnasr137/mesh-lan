import { Router } from "express";
import {
  getPublicRooms,
  createRoom,
  getRoomById,
  verifyRoomPassword,
} from "../controllers/roomController.js";
import {
  validateCreateRoom,
  validateVerifyPassword,
} from "../middleware/validator.js";

const router = Router();

// List public rooms (supports /api/rooms and /api/rooms/public)
router.get("/", getPublicRooms);
router.get("/public", getPublicRooms);

// Create a new room
router.post("/", validateCreateRoom, createRoom);

// Get specific room metadata
router.get("/:roomId", getRoomById);

// Verify password for private room
router.post("/:roomId/verify", validateVerifyPassword, verifyRoomPassword);

export default router;
