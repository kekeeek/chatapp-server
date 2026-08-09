const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Identifiant (3+) et mot de passe (4+) requis.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: "Ce pseudo est déjà pris." });

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 10);
  const colors = ['#5b7fff', '#ff6b6b', '#3ddc97', '#f7b731', '#a55eea', '#26de81'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  db.prepare('INSERT INTO users (id, username, password_hash, avatar_color) VALUES (?, ?, ?, ?)')
    .run(id, username, hash, color);

  const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, username, avatar_color: color } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return res.status(400).json({ error: 'Identifiants invalides.' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ error: 'Identifiants invalides.' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, username: user.username, avatar_color: user.avatar_color } });
});

module.exports = router;
