const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Identifiant (3+) et mot de passe (4+) requis.' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length) return res.status(400).json({ error: 'Ce pseudo est déjà pris.' });

    const id = uuidv4();
    const hash = await bcrypt.hash(password, 10);
    const colors = ['#5b7fff', '#ff6b6b', '#3ddc97', '#f7b731', '#a55eea', '#26de81'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    await pool.query(
      'INSERT INTO users (id, username, password_hash, avatar_color) VALUES ($1, $2, $3, $4)',
      [id, username, hash, color]
    );

    const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id, username, avatar_color: color } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Identifiants invalides.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Identifiants invalides.' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, avatar_color: user.avatar_color } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
