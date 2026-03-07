import { Chat } from "@/entities/messenger";
import { getDatabase } from "@/shared/lib/storage";

interface ChatRow {
  id: string;
  type: "private";
  participant_peer_id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  last_message_at: number | null;
}

function mapChatRow(row: ChatRow): Chat {
  return {
    id: row.id,
    type: row.type,
    participantPeerId: row.participant_peer_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

export async function upsertChat(chat: Chat): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
    INSERT INTO chats (
      id,
      type,
      participant_peer_id,
      title,
      created_at,
      updated_at,
      last_message_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      participant_peer_id = excluded.participant_peer_id,
      title = excluded.title,
      updated_at = excluded.updated_at,
      last_message_at = excluded.last_message_at
  `,
    chat.id,
    chat.type,
    chat.participantPeerId,
    chat.title,
    chat.createdAt,
    chat.updatedAt,
    chat.lastMessageAt,
  );
}

export async function getChatById(id: string): Promise<Chat | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ChatRow>(
    "SELECT * FROM chats WHERE id = ?",
    id,
  );
  return row ? mapChatRow(row) : null;
}

export async function listChats(): Promise<Chat[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ChatRow>(
    "SELECT * FROM chats ORDER BY last_message_at DESC, updated_at DESC",
  );
  return rows.map(mapChatRow);
}
