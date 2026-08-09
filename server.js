const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool, init } = require('./db');

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

const voiceRooms = {};

io.on('connection', (socket) => {
  console.log(`Connecté: ${socket.user.username}`);

  socket.on('join_channel', (channelId) => {
    socket.join(`text:${channelId}`);
  });

  socket.on('leave_channel', (channelId) => {
    socket.leave(`text:${channelId}`);
  });

  socket.on('send_message', async ({ channelId, content }) => {
    if (!content || !content.trim()) return;
    try {
      const id = uuidv4();
      await pool.query(
        'INSERT INTO messages (id, channel_id, user_id, content) VALUES ($1, $2, $3, $4)',
        [id, channelId, socket.user.id, content.trim()]
      );
      const result = await pool.query('SELECT username, avatar_color FROM users WHERE id = $1', [socket.user.id]);
      const user = result.rows[0];
      io.to(`text:${channelId}`).emit('new_message', {
        id, channelId, content: content.trim(),
        user_id: socket.user.id, username: user.username,
        avatar_color: user.avatar_color, created_at: Math.floor(Date.now() / 1000)
      });
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('voice_join', (channelId) => {
    socket.data.voiceChannel = channelId;
    if (!voiceRooms[channelId]) voiceRooms[channelId] = new Set();

    const existingPeers = [...voiceRooms[channelId]];
    voiceRooms[channelId].add(socket.id);
    socket.join(`voice:${channelId}`);

    socket.emit('voice_existing_peers', existingPeers.map(id => {
      const s = io.sockets.sockets.get(id);
      return { socketId: id, username: s?.user?.username };
    }));

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

init()
  .then(() => {
    httpServer.listen(PORT, () => console.log(`Serveur backend lancé sur le port ${PORT}`));
  })
  .catch(err => {
    console.error('Impossible de se connecter à la base de données:', err.message);
    process.exit(1);
  });
