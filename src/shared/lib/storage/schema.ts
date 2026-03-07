import { SQLiteDatabase } from "expo-sqlite";

const schemaSql = `
CREATE TABLE IF NOT EXISTS peers (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  trust_level INTEGER NOT NULL DEFAULT 0,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  participant_peer_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_at INTEGER,
  FOREIGN KEY (participant_peer_id) REFERENCES peers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  chat_id TEXT NOT NULL,
  sender_peer_id TEXT NOT NULL,
  target_peer_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  ttl_ms INTEGER NOT NULL,
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  delivered_at INTEGER,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS file_transfers (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  total_bytes INTEGER NOT NULL,
  transferred_bytes INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_dedupe ON messages(dedupe_key, sender_peer_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_last_message ON chats(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_peers_last_seen ON peers(last_seen_at DESC);
`;

export async function applySchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(schemaSql);
}
