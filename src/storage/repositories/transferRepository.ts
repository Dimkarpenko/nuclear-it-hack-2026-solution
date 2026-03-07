import { FileTransfer, TransferStatus } from "../../domain/models";
import { getDatabase } from "../database";

interface TransferRow {
  id: string;
  message_id: string;
  chat_id: string;
  direction: "upload" | "download";
  file_name: string;
  mime_type: string;
  total_bytes: number;
  transferred_bytes: number;
  chunk_size: number;
  status: TransferStatus;
  created_at: number;
  updated_at: number;
}

function mapTransferRow(row: TransferRow): FileTransfer {
  return {
    id: row.id,
    messageId: row.message_id,
    chatId: row.chat_id,
    direction: row.direction,
    fileName: row.file_name,
    mimeType: row.mime_type,
    totalBytes: row.total_bytes,
    transferredBytes: row.transferred_bytes,
    chunkSize: row.chunk_size,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertTransfer(transfer: FileTransfer): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
    INSERT INTO file_transfers (
      id,
      message_id,
      chat_id,
      direction,
      file_name,
      mime_type,
      total_bytes,
      transferred_bytes,
      chunk_size,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      transferred_bytes = excluded.transferred_bytes,
      chunk_size = excluded.chunk_size,
      status = excluded.status,
      updated_at = excluded.updated_at
  `,
    transfer.id,
    transfer.messageId,
    transfer.chatId,
    transfer.direction,
    transfer.fileName,
    transfer.mimeType,
    transfer.totalBytes,
    transfer.transferredBytes,
    transfer.chunkSize,
    transfer.status,
    transfer.createdAt,
    transfer.updatedAt,
  );
}

export async function listTransfersByChat(
  chatId: string,
): Promise<FileTransfer[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<TransferRow>(
    "SELECT * FROM file_transfers WHERE chat_id = ? ORDER BY updated_at DESC",
    chatId,
  );

  return rows.map(mapTransferRow);
}

export async function updateTransferProgress(
  transferId: string,
  transferredBytes: number,
  status: TransferStatus,
  updatedAt: number,
): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    "UPDATE file_transfers SET transferred_bytes = ?, status = ?, updated_at = ? WHERE id = ?",
    transferredBytes,
    status,
    updatedAt,
    transferId,
  );
}
