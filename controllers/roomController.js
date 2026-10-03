import roomService from "../services/roomService.js";
import { HTTP_STATUS } from "../config/constants.js";

/**
 * Get all public rooms
 */
export const getPublicRooms = async (req, res, next) => {
  try {
    const publicRooms = roomService.getPublicRooms();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      rooms: publicRooms,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new room
 */
export const createRoom = async (req, res, next) => {
  try {
    const { name, isPrivate, password, maxParticipants } = req.body;
    const room = await roomService.createRoom({
      name,
      isPrivate,
      password,
      maxParticipants,
    });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      room: room.toPublicJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get room by ID
 */
export const getRoomById = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = roomService.getRoom(roomId);

    if (!room) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: "Room not found",
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      room: room.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify room password
 */
export const verifyRoomPassword = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const { password } = req.body;

    const room = roomService.getRoom(roomId);
    if (!room) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: "Room not found",
      });
    }

    if (!room.isPrivate) {
      return res.status(HTTP_STATUS.OK).json({ success: true });
    }

    const isValid = await room.verifyPassword(password);
    res.status(HTTP_STATUS.OK).json({ success: isValid });
  } catch (error) {
    next(error);
  }
};
