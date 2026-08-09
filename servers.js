const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

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

// Liste des serveurs de l'utilisateur
router.get('/mine', auth, (req, res) => {
  const servers = db.prepare(`
    SELECT s.* FROM servers s
    JOIN server_members m ON m.server_id = s.id
    WHERE m.user_id = ?
  `).all(req.user.id);
  res.json(servers);
});

// Créer un serveur
router.post('/', auth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis.' });
  const id = uuidv4();
  const inviteCode = Math.random().toString(36).substring(2, 9);
  db.prepare('INSERT INTO servers (id, name, owner_id, invite_code) VALUES (?, ?, ?, ?)')
    .run(id, name, req.user.id, inviteCode);
  db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(id, req.user.id);

  const genChan = (name, type) => {
    const cid = uuidv4();
    db.prepare('INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)').run(cid, id, name, type);
  };
  genChan('général', 'text');
  genChan('Général', 'voice');

  res.json({ id, name, invite_code: inviteCode });
});

// Rejoindre via code d'invitation
router.post('/join', auth, (req, res) => {
  const { invite_code } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(invite_code);
  if (!server) return res.status(404).json({ error: 'Code invalide.' });
  const already = db.prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?').get(server.id, req.user.id);
  if (!already) db.prepare('INSERT INTO server_members (server_id, user_id) VALUES (?, ?)').run(server.id, req.user.id);
  res.json(server);
});

// Salons d'un serveur
router.get('/:id/channels', auth, (req, res) => {
  const channels = db.prepare('SELECT * FROM channels WHERE server_id = ?').all(req.params.id);
  res.json(channels);
});

// Membres d'un serveur
router.get('/:id/members', auth, (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.username, u.avatar_color FROM users u
    JOIN server_members m ON m.user_id = u.id
    WHERE m.server_id = ?
  `).all(req.params.id);
  res.json(members);
});

// Historique des messages d'un salon
router.get('/channels/:channelId/messages', auth, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, u.username, u.avatar_color FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ?
    ORDER BY m.created_at ASC LIMIT 100
  `).all(req.params.channelId);
  res.json(messages);
});

module.exports = { router, auth, JWT_SECRET };
