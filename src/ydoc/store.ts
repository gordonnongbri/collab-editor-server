import * as Y from 'yjs';
import { Snapshot, Update } from '../db';

const docs = new Map<string, Y.Doc>();

export async function getDoc(roomId: string): Promise<Y.Doc> {
  if (docs.has(roomId)) return docs.get(roomId)!;

  const ydoc = new Y.Doc();

  const snap = await Snapshot.findOne({ roomId });
  if (snap) {
    Y.applyUpdate(ydoc, new Uint8Array(snap.snapshot));
  }

  const since = snap?.updatedAt ?? new Date(0);
  const updates = await Update.find({ roomId, ts: { $gt: since } }).sort({ ts: 1 });
  for (const u of updates) {
    Y.applyUpdate(ydoc, new Uint8Array(u.update));
  }

  docs.set(roomId, ydoc);
  return ydoc;
}

export async function applyAndPersist(roomId: string, update: Uint8Array) {
  const ydoc = await getDoc(roomId);
  Y.applyUpdate(ydoc, update);

  await Update.create({ roomId, update: Buffer.from(update) });

  const count = await Update.countDocuments({ roomId });
  if (count % 50 === 0) await writeSnapshot(roomId, ydoc);
}

async function writeSnapshot(roomId: string, ydoc: Y.Doc) {
  const snapshot = Buffer.from(Y.encodeStateAsUpdate(ydoc));
  await Snapshot.findOneAndUpdate(
    { roomId },
    { snapshot, updatedAt: new Date() },
    { upsert: true }
  );

  await Update.deleteMany({ roomId, ts: { $lte: new Date() } });
  console.log(`[ydoc] Snapshot written for room ${roomId}`);
}

export function getCurrentState(roomId: string): Uint8Array | null {
  const doc = docs.get(roomId);
  return doc ? Y.encodeStateAsUpdate(doc) : null;
}

