const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error("ERREUR: la variable d'environnement DATABASE_URL n'est pas définie. Ajoute-la dans Render (ou dans un fichier .env en local) avec l'URL de connexion Supabase.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT DEFAULT '#5b7fff',
      created_at BIGINT DEFAULT extract(epoch from now())::bigint
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_at BIGINT DEFAULT extract(epoch from now())::bigint
    );

    CREATE TABLE IF NOT EXISTS server_members (
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (server_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      created_at BIGINT DEFAULT extract(epoch from now())::bigint
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at BIGINT DEFAULT extract(epoch from now())::bigint
    );
  `);
  console.log('Base de données initialisée (Postgres/Supabase).');
}

module.exports = { pool, init };
