// =============================================================================
// SERVER BOOTSTRAP MODULE
// Real-time Multiplayer Drawing Game Backend
// =============================================================================
// Purpose: Initialize HTTP server with Socket.IO for real-time communication
// This is a foundational module - game logic will be added in separate modules
// =============================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const playerManager = require('./players');
const roomManager = require('./rooms');

// =============================================================================
// CONFIGURATION
// =============================================================================

// Read port from environment variable, fallback to 3000 for local development
const PORT = process.env.PORT || 3000;

// =============================================================================
// EXPRESS & HTTP SERVER SETUP
// =============================================================================

// Create Express application instance
// Express is used here to provide a clean foundation for potential future routes
const app = express();

// Create HTTP server using Node's built-in http module
// We use http.createServer() instead of app.listen() to allow Socket.IO attachment
const server = http.createServer(app);

// =============================================================================
// SOCKET.IO CONFIGURATION
// =============================================================================

// Attach Socket.IO to the HTTP server with CORS configuration
// CORS is enabled to allow frontend connections from different origins
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins (suitable for development and flexible deployment)
    methods: ["GET", "POST"], // Standard methods for WebSocket handshake
    credentials: false // No credentials needed for this application
  }
});

// =============================================================================
// HELPER FUNCTIONS FOR SOCKET OPERATIONS
// =============================================================================

/**
 * Broadcast room update to all players in a room
 * @param {string} roomId - Room ID to broadcast to
 */
function broadcastRoomUpdate(roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  const serialized = roomManager.serializeRoom(room, playerManager.getPlayerById);

  // Emit to all players in the room
  room.players.forEach(playerId => {
    const player = playerManager.getPlayerById(playerId);
    if (player && player.socketId) {
      io.to(player.socketId).emit('room_updated', { room: serialized });
    }
  });
}

// =============================================================================
// SOCKET CONNECTION HANDLERS
// =============================================================================

// Listen for new socket connections on the default namespace '/'
io.on('connection', (socket) => {
  // Log successful connection with socket ID for debugging/monitoring
  console.log(`[CONNECT] Socket connected: ${socket.id}`);

  // Create player identity and store in memory
  const player = playerManager.createPlayer(socket.id);

  // Send confirmation event back to client with connection details
  // This allows the client to confirm successful connection and store socket ID
  socket.emit('connected', {
    socketId: socket.id,
    status: 'ok'
  });

  // Send initial player data to client
  socket.emit('player_updated', {
    id: player.id,
    name: player.name
  });

  // =============================================================================
  // PLAYER NAME UPDATE HANDLER
  // =============================================================================

  // Listen for player name update requests from client
  socket.on('set_player_name', (payload) => {
    // Validate payload structure
    if (!payload || typeof payload !== 'object') {
      console.log(`[PLAYER] Invalid payload from ${socket.id}: payload must be an object`);
      return;
    }

    const { name } = payload;

    // Update player name with validation
    const result = playerManager.updatePlayerName(socket.id, name);

    if (result.success) {
      // Send updated player data back to client
      socket.emit('player_updated', {
        id: result.player.id,
        name: result.player.name
      });

      // If player is in a room, broadcast update to room
      const room = roomManager.getRoomByPlayer(result.player.id);
      if (room) {
        broadcastRoomUpdate(room.id);
      }
    } else {
      // Send error back to client (optional - helps with debugging)
      console.log(`[PLAYER] Name update failed for ${socket.id}: ${result.error}`);
    }
  });

  // =============================================================================
  // ROOM CREATION HANDLER
  // =============================================================================

  socket.on('create_room', (payload) => {
    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('room_error', { error: 'Player not found' });
      return;
    }

    // Check if player is already in a room
    const existingRoom = roomManager.getRoomByPlayer(player.id);
    if (existingRoom) {
      socket.emit('room_error', { error: 'Already in a room' });
      return;
    }

    // Validate payload
    const settings = payload && typeof payload === 'object' ? payload.settings : null;

    // Create room
    const result = roomManager.createRoom(player.id, settings);

    if (result.success) {
      // Update player's roomId
      playerManager.updatePlayerRoom(player.id, result.room.id);

      // Serialize room data for client
      const serialized = roomManager.serializeRoom(result.room, playerManager.getPlayerById);

      // Send confirmation to creator
      socket.emit('room_created', {
        roomId: result.room.id,
        room: serialized
      });
    } else {
      socket.emit('room_error', { error: result.error });
    }
  });

  // =============================================================================
  // ROOM JOIN HANDLER
  // =============================================================================

  socket.on('join_room', (payload) => {
    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      socket.emit('room_error', { error: 'Player not found' });
      return;
    }

    // Check if player is already in a room
    const existingRoom = roomManager.getRoomByPlayer(player.id);
    if (existingRoom) {
      socket.emit('room_error', { error: 'Already in a room' });
      return;
    }

    // Validate payload
    if (!payload || typeof payload !== 'object' || !payload.roomId) {
      socket.emit('room_error', { error: 'Invalid room ID' });
      return;
    }

    const { roomId } = payload;

    // Join room
    const result = roomManager.joinRoom(player.id, roomId);

    if (result.success) {
      // Update player's roomId
      playerManager.updatePlayerRoom(player.id, result.room.id);

      // Serialize room data for client
      const serialized = roomManager.serializeRoom(result.room, playerManager.getPlayerById);

      // Send confirmation to joining player
      socket.emit('room_joined', { room: serialized });

      // Broadcast room update to all players in room
      broadcastRoomUpdate(result.room.id);
    } else {
      socket.emit('room_error', { error: result.error });
    }
  });

  // =============================================================================
  // ROOM LEAVE HANDLER
  // =============================================================================

  socket.on('leave_room', () => {
    const player = playerManager.getPlayer(socket.id);
    if (!player) {
      return;
    }

    // Check if player is in a room
    if (!player.roomId) {
      return;
    }

    const roomId = player.roomId;

    // Leave room
    const result = roomManager.leaveRoom(player.id, roomId);

    if (result.success) {
      // Update player's roomId to null
      playerManager.updatePlayerRoom(player.id, null);

      if (result.deleted) {
        // Room was deleted (empty)
        socket.emit('room_left', { roomId: roomId });
      } else {
        // Room still exists, broadcast update to remaining players
        socket.emit('room_left', { roomId: roomId });
        broadcastRoomUpdate(roomId);
      }
    }
  });

  // =============================================================================
  // SOCKET DISCONNECTION HANDLER
  // =============================================================================

  // Listen for socket disconnection events
  // Reason parameter helps diagnose connection issues (e.g., 'transport close', 'client namespace disconnect')
  socket.on('disconnect', (reason) => {
    console.log(`[DISCONNECT] Socket disconnected: ${socket.id} | Reason: ${reason}`);
    
    const player = playerManager.getPlayer(socket.id);
    if (player && player.roomId) {
      // Player was in a room, remove them
      const roomId = player.roomId;
      const result = roomManager.leaveRoom(player.id, roomId);

      if (result.success && !result.deleted) {
        // Room still exists, broadcast update to remaining players
        broadcastRoomUpdate(roomId);
      }
    }

    // Remove player from memory
    // This function handles cases where player might not exist gracefully
    playerManager.removePlayer(socket.id);
  });

  // =============================================================================
  // SOCKET ERROR HANDLER
  // =============================================================================

  // Catch socket-level errors to prevent server crashes
  // Errors might include malformed packets, connection issues, etc.
  socket.on('error', (error) => {
    console.error(`[ERROR] Socket error for ${socket.id}:`, error.message);
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

// Start the HTTP server and listen on the configured port
// Error handling ensures graceful failure with clear error messages
server.listen(PORT, (error) => {
  if (error) {
    console.error('[STARTUP ERROR] Failed to start server:', error.message);
    process.exit(1); // Exit with error code
  }
  
  console.log(`[SERVER] Backend server running on port ${PORT}`);
  console.log(`[SERVER] Socket.IO ready for connections`);
});

// =============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// =============================================================================

// Handle process termination signals for graceful shutdown
// This ensures connections are properly closed before the process exits
const gracefulShutdown = (signal) => {
  console.log(`\n[SHUTDOWN] Received ${signal}, closing server gracefully...`);
  
  server.close(() => {
    console.log('[SHUTDOWN] HTTP server closed');
    io.close(() => {
      console.log('[SHUTDOWN] Socket.IO server closed');
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =============================================================================
// UNHANDLED ERROR HANDLERS
// =============================================================================

// Catch unhandled promise rejections to prevent silent failures
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// Catch uncaught exceptions as a last resort
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
  process.exit(1);
});