const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 5e6 // Allow up to 5MB frames
});

let pythonSocketId = null;

io.on('connection', (socket) => {
  console.log(`[Node] Socket connected: ${socket.id}`);

  // Python AI engine registers itself
  socket.on('register_python', () => {
    pythonSocketId = socket.id;
    console.log(`[Node] Python engine registered: ${socket.id}`);
  });

  // React client sends a raw video frame
  // relay it to the Python engine
  socket.on('frame', (frameData) => {
    if (pythonSocketId) {
      // Tag it with the sender's socket ID so Python knows who to reply to
      io.to(pythonSocketId).emit('frame', { clientId: socket.id, frame: frameData });
    }
  });

  // Python engine sends back processed result
  // relay it to the specific React client
  socket.on('processed_frame', (data) => {
    const { clientId, frame, workers, incidents } = data;
    if (clientId) {
      io.to(clientId).emit('processed_frame', { frame, workers, incidents });
    }
  });

  socket.on('disconnect', () => {
    if (socket.id === pythonSocketId) {
      pythonSocketId = null;
      console.log('[Node] Python engine disconnected');
      io.emit('engine_offline');
    }
    console.log(`[Node] Socket disconnected: ${socket.id}`);
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`[Node] Signaling server running on http://localhost:${PORT}`);
});
