/**
 * Socket.IO and Application Event Constants
 */
export const SOCKET_EVENTS = {
  // Inbound / Outbound User Lifecycle
  CONNECTION: "connection",
  DISCONNECT: "disconnect",
  JOIN: "join",
  JOINED: "joined",
  ERROR: "error",

  // Room Events
  CREATE_ROOM: "create-room",
  ROOM_CREATED: "room-created",
  JOIN_ROOM: "join_room",
  ROOM_JOINED: "room_joined",
  LEAVE_ROOM: "leave_room",
  ROOM_LEFT: "room_left",
  USER_JOINED: "user_joined",
  USER_LEFT: "user_left",
  GET_ROOMS: "get-rooms",
  ROOMS_LIST: "rooms-list",
  ROOMS_LIST_UPDATED: "rooms-list-updated",
  HOST_CHANGED: "host-changed",

  // Matchmaking / Random Chat Events
  START_RANDOM_CHAT: "start_random_chat",
  END_RANDOM_CHAT: "end_random_chat",
  RANDOM_CHAT_STARTED: "random_chat_started",
  RANDOM_CHAT_ENDED: "random_chat_ended",
  WAITING_FOR_PARTNER: "waiting_for_partner",

  // WebRTC Signaling Events
  OFFER: "offer",
  ANSWER: "answer",
  ICE_CANDIDATE: "ice-candidate",
  SIGNAL: "signal", // Legacy & peer-to-peer unified signal event

  // Voice Data Fallback
  VOICE_DATA: "voice_data",
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};
