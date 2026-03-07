import { SQLiteDatabase, openDatabaseAsync } from "expo-sqlite";

import { StorageStats } from "../domain/models";
import { applySchema } from "./schema";

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function initDatabase(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync("hex-mesh-chat.db");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await applySchema(db);
  return db;
}

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = initDatabase();
  }

  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  await getDatabase();
}

export async function getStorageStats(): Promise<StorageStats> {
  const db = await getDatabase();

  const [peers, chats, messages, transfers] = await Promise.all([
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM peers"),
    db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM chats"),
    db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM messages",
    ),
    db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM file_transfers",
    ),
  ]);

  return {
    peers: peers?.count ?? 0,
    chats: chats?.count ?? 0,
    messages: messages?.count ?? 0,
    transfers: transfers?.count ?? 0,
  };
}
