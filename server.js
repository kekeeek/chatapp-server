const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const authRoutes = require('./auth');
const { router: serverRoutes, JWT_SECRET } = require('./servers');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);

app.get('/', (req, res) => res.send('ChatApp backend en ligne.'));

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// Auth pour les sockets
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const user = jwt.verify(token, JWT_SECRET);
    socket.user = user;
    next();
  } catch {
    next(new Error('Non authentifié.'));
  }
});

// Qui est dans quel salon vocal : { channelId: Set(socketId) }
const voiceRooms = {};

io.on('connection', (socket) => {
  console.log(`Connecté: ${socket.user.username}`);

  // --- CHAT TEXTE ---
  socket.on('join_channel', (channelId) => {
    socket.join(`text:${channelId}`);
  });

  socket.on('leave_channel', (channelId) => {
    socket.leave(`text:${channelId}`);
  });

  socket.on('send_message', ({ channelId, content }) => {
    if (!content || !content.trim()) return;
    const id = uuidv4();
    db.prepare('INSERT INTO messages (id, channel_id, user_id, content) VALUES (?, ?, ?, ?)')
      .run(id, channelId, socket.user.id, content.trim());
    const user = db.prepare('SELECT username, avatar_color FROM users WHERE id = ?').get(socket.user.id);
    io.to(`text:${channelId}`).emit('new_message', {
      id, channelId, content: content.trim(),
      user_id: socket.user.id, username: user.username,
      avatar_color: user.avatar_color, created_at: Math.floor(Date.now() / 1000)
    });
  });

  // --- SALON VOCAL / VIDEO (WebRTC signaling, topologie mesh) ---
  socket.on('voice_join', (channelId) => {
    socket.data.voiceChannel = channelId;
    if (!voiceRooms[channelId]) voiceRooms[channelId] = new Set();

    const existingPeers = [...voiceRooms[channelId]];
    voiceRooms[channelId].add(socket.id);
    socket.join(`voice:${channelId}`);

    // On informe le nouveau des pairs déjà présents
    socket.emit('voice_existing_peers', existingPeers.map(id => {
      const s = io.sockets.sockets.get(id);
      return { socketId: id, username: s?.user?.username };
    }));

    // On informe les autres qu'un nouveau arrive
    socket.to(`voice:${channelId}`).emit('voice_peer_joined', {
      socketId: socket.id, username: socket.user.username
    });
  });

  socket.on('voice_leave', (channelId) => {
    voiceRooms[channelId]?.delete(socket.id);
    socket.leave(`voice:${channelId}`);
    socket.to(`voice:${channelId}`).emit('voice_peer_left', { socketId: socket.id });
    socket.data.voiceChannel = null;
  });

  // Relais WebRTC (offer/answer/ice) d'un pair à un autre, ciblé par socketId
  socket.on('webrtc_signal', ({ to, data }) => {
    io.to(to).emit('webrtc_signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    const vc = socket.data.voiceChannel;
    if (vc && voiceRooms[vc]) {
      voiceRooms[vc].delete(socket.id);
      socket.to(`voice:${vc}`).emit('voice_peer_left', { socketId: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Serveur backend lancé sur le port ${PORT}`));
