const path = require('path');
const Database = require('better-sqlite3');

const dataDirectory = path.join(__dirname, 'data');
const dbPath = path.join(dataDirectory, 'app.db');

require('fs').mkdirSync(dataDirectory, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const SCHEMA_VERSION = 4;

function runMigrations() {
  const userRow = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get();

  if (!userRow) {
    db.exec(`
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE linkedin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TEXT,
        profile_json TEXT,
        connected_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE imports (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        imported_at TEXT NOT NULL DEFAULT (datetime('now')),
        total_recipients INTEGER NOT NULL DEFAULT 0,
        valid_recipients INTEGER NOT NULL DEFAULT 0,
        invalid_recipients INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE campaigns (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        sender_email TEXT,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        body_type TEXT NOT NULL DEFAULT 'text',
        recipients_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        scheduled_for TEXT,
        delay_ms INTEGER NOT NULL DEFAULT 5000,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        opened_count INTEGER NOT NULL DEFAULT 0,
        clicked_count INTEGER NOT NULL DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE campaign_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );
      CREATE TABLE campaign_sends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        recipient_json TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        message_id TEXT,
        preview_url TEXT,
        error_message TEXT,
        sent_at TEXT,
        opened_at TEXT,
        clicked_at TEXT,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );
      CREATE TABLE tracking_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT,
        recipient_email TEXT,
        event_type TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        link_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_campaigns_user ON campaigns(user_id, created_at);
      CREATE INDEX idx_logs_campaign ON campaign_logs(campaign_id, timestamp);
      CREATE INDEX idx_sends_campaign ON campaign_sends(campaign_id);
      CREATE INDEX idx_events_campaign ON tracking_events(campaign_id, event_type);
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        location TEXT NOT NULL,
        visa_status TEXT NOT NULL,
        employment_type TEXT NOT NULL,
        posted_date TEXT NOT NULL,
        source TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        description TEXT,
        job_hash TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_jobs_date ON jobs(posted_date);
      CREATE INDEX idx_jobs_hash ON jobs(job_hash);
    `);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  } else {
    const row = db.prepare('SELECT version FROM schema_version').get();
    let current = row ? row.version : 0;
    if (current < 2) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS campaign_sends (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id TEXT NOT NULL,
          recipient_email TEXT NOT NULL,
          recipient_json TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          message_id TEXT,
          preview_url TEXT,
          error_message TEXT,
          sent_at TEXT,
          opened_at TEXT,
          clicked_at TEXT,
          FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_sends_campaign ON campaign_sends(campaign_id);
      `);
      current = 2;
      db.prepare('UPDATE schema_version SET version = ?').run(current);
    }
    if (current < 3) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tracking_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id TEXT,
          recipient_email TEXT,
          event_type TEXT NOT NULL,
          ip_address TEXT,
          user_agent TEXT,
          link_url TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_events_campaign ON tracking_events(campaign_id, event_type);
      `);
      current = 3;
      db.prepare('UPDATE schema_version SET version = ?').run(current);
    }
    if (current < 4) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          company TEXT NOT NULL,
          location TEXT NOT NULL,
          visa_status TEXT NOT NULL,
          employment_type TEXT NOT NULL,
          posted_date TEXT NOT NULL,
          source TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          description TEXT,
          job_hash TEXT UNIQUE NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_jobs_date ON jobs(posted_date);
        CREATE INDEX IF NOT EXISTS idx_jobs_hash ON jobs(job_hash);
      `);
      current = 4;
      db.prepare('UPDATE schema_version SET version = ?').run(current);
    }
  }
}

runMigrations();

function jsonParse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

module.exports = { db, jsonParse };
