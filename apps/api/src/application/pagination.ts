import { z } from 'zod';
import { ApplicationError } from './repository.js';

// Timestamp + ID gives deterministic keyset pagination, including equal timestamps.
// Keep PostgreSQL microseconds in the cursor rather than round-tripping through Date.
const cursorSchema = z.object({ at: z.iso.datetime(), id: z.string().min(1).max(128) }).strict();
export function decodeCursor(value: string | undefined) {
  if (!value) return undefined;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new ApplicationError(400, 'INVALID_CURSOR', 'Invalid pagination cursor.');
  }
}
export function encodeCursor(row: { cursorTime: string; id: string } | undefined) {
  if (!row) return null;
  return Buffer.from(JSON.stringify({ at: row.cursorTime, id: row.id })).toString('base64url');
}
