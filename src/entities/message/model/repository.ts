import { Message, MessageDeliveryStatus } from "@/entities/messenger";
import { getDatabase } from "@/shared/lib/storage";

interface MessageRow {
  id: string;
  chat_id: string;
  sender_peer_id: string;
  target_peer_id: string;
  kind: "text" | "file" | "system";
  body: string;
  ttl_ms: number;
  dedupe_key: string;
  status: MessageDeliveryStatus;
  created_at: number;
  updated_at: number;
  delivered_at: number | null;
}

function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderPeerId: row.sender_peer_id,
    targetPeerId: row.target_peer_id,
    kind: row.kind,
    body: row.body,
    ttlMs: row.ttl_ms,
    dedupeKey: row.dedupe_key,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deliveredAt: row.delivered_at,
  };
}

export async function upsertMessage(message: Message): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
    INSERT INTO messages (
      id,
      chat_id,
      sender_peer_id,
      target_peer_id,
      kind,
      body,
      ttl_ms,
      dedupe_key,
      status,
      created_at,
      updated_at,
      delivered_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      body = excluded.body,
      updated_at = excluded.updated_at,
      delivered_at = excluded.delivered_at
  `,
    message.id,
    message.chatId,
    message.senderPeerId,
    message.targetPeerId,
    message.kind,
    message.body,
    message.ttlMs,
    message.dedupeKey,
    message.status,
    message.createdAt,
    message.updatedAt,
    message.deliveredAt,
  );

  await db.runAsync(
    "UPDATE chats SET last_message_at = ?, updated_at = ? WHERE id = ?",
    message.createdAt,
    message.updatedAt,
    message.chatId,
  );
}

export async function listMessagesByChat(
  chatId: string,
  limit = 100,
): Promise<Message[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MessageRow>(
    "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?",
    chatId,
    limit,
  );

  return rows.map(mapMessageRow);
}

export async function updateMessageStatus(
  messageId: string,
  status: MessageDeliveryStatus,
  updatedAt: number,
  deliveredAt: number | null,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    "UPDATE messages SET status = ?, updated_at = ?, delivered_at = ? WHERE id = ?",
    status,
    updatedAt,
    deliveredAt,
    messageId,
  );
}
