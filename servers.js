const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Non authentifié.' });
  try {
    req.user = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide.' });
  }
}

router.get('/mine', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT s.* FROM servers s
    JOIN server_members m ON m.server_id = s.id
    WHERE m.user_id = $1
  `, [req.user.id]);
  res.json(result.rows);
});

router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis.' });
    const id = uuidv4();
    const inviteCode = Math.random().toString(36).substring(2, 9);
    await pool.query(
      'INSERT INTO servers (id, name, owner_id, invite_code) VALUES ($1, $2, $3, $4)',
      [id, name, req.user.id, inviteCode]
    );
    await pool.query('INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)', [id, req.user.id]);

    const genChan = async (chanName, type) => {
      const cid = uuidv4();
      await pool.query('INSERT INTO channels (id, server_id, name, type) VALUES ($1, $2, $3, $4)', [cid, id, chanName, type]);
    };
    await genChan('général', 'text');
    await genChan('Général', 'voice');

    res.json({ id, name, invite_code: inviteCode });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/join', auth, async (req, res) => {
  try {
    const { invite_code } = req.body;
    const result = await pool.query('SELECT * FROM servers WHERE invite_code = $1', [invite_code]);
    const server = result.rows[0];
    if (!server) return res.status(404).json({ error: 'Code invalide.' });
    const already = await pool.query('SELECT * FROM server_members WHERE server_id = $1 AND user_id = $2', [server.id, req.user.id]);
    if (!already.rows.length) {
      await pool.query('INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)', [server.id, req.user.id]);
    }
    res.json(server);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.get('/:id/channels', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM channels WHERE server_id = $1', [req.params.id]);
  res.json(result.rows);
});

router.get('/:id/members', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT u.id, u.username, u.avatar_color FROM users u
    JOIN server_members m ON m.user_id = u.id
    WHERE m.server_id = $1
  `, [req.params.id]);
  res.json(result.rows);
});

router.get('/channels/:channelId/messages', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT m.*, u.username, u.avatar_color FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = $1
    ORDER BY m.created_at ASC LIMIT 100
  `, [req.params.channelId]);
  res.json(result.rows);
});

module.exports = { router, auth, JWT_SECRET };
