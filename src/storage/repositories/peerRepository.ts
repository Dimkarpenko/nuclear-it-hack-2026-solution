import { Peer } from "../../domain/models";
import { getDatabase } from "../database";

interface PeerRow {
  id: string;
  display_name: string;
  public_key: string;
  trust_level: number;
  is_blocked: number;
  last_seen_at: number | null;
  created_at: number;
  updated_at: number;
}

function mapPeerRow(row: PeerRow): Peer {
  return {
    id: row.id,
    displayName: row.display_name,
    publicKey: row.public_key,
    trustLevel: row.trust_level,
    isBlocked: row.is_blocked === 1,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertPeer(peer: Peer): Promise<void> {
  const db = await getDatabase();

  await db.runAsync(
    `
    INSERT INTO peers (
      id,
      display_name,
      public_key,
      trust_level,
      is_blocked,
      last_seen_at,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      public_key = excluded.public_key,
      trust_level = excluded.trust_level,
      is_blocked = excluded.is_blocked,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `,
    peer.id,
    peer.displayName,
    peer.publicKey,
    peer.trustLevel,
    peer.isBlocked ? 1 : 0,
    peer.lastSeenAt,
    peer.createdAt,
    peer.updatedAt,
  );
}

export async function getPeerById(id: string): Promise<Peer | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<PeerRow>(
    "SELECT * FROM peers WHERE id = ?",
    id,
  );
  return row ? mapPeerRow(row) : null;
}

export async function listPeers(): Promise<Peer[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<PeerRow>(
    "SELECT * FROM peers ORDER BY updated_at DESC",
  );
  return rows.map(mapPeerRow);
}
