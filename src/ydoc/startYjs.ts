import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

interface Room {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Set<WebSocket>;
}

const rooms = new Map<string, Room>();
// awareness client ids owned by each socket, so we can remove them on disconnect
const controlled = new WeakMap<WebSocket, Set<number>>();

function getRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null); // server itself has no presence
    rooms.set(roomId, { doc, awareness, clients: new Set() });
  }
  return rooms.get(roomId)!;
}

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

function send(ws: WebSocket, data: Uint8Array) {
  if (ws.readyState === WebSocket.OPEN) ws.send(data);
}

const server = http.createServer((_, res) => {
  res.writeHead(200);
  res.end('Yjs WebSocket server');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket, req) => {
  const roomId = decodeURIComponent((req.url ?? '/default').slice(1).split('?')[0]) || 'default';
  const room = getRoom(roomId);
  room.clients.add(ws);
  console.log(`[yjs] joined room "${roomId}" — ${room.clients.size} client(s)`);

  const syncEnc = encoding.createEncoder();
  encoding.writeVarUint(syncEnc, MSG_SYNC);
  syncProtocol.writeSyncStep1(syncEnc, room.doc);
  send(ws, encoding.toUint8Array(syncEnc));

  const states = room.awareness.getStates();
  if (states.size > 0) {
    const aEnc = encoding.createEncoder();
    encoding.writeVarUint(aEnc, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      aEnc,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys()))
    );
    send(ws, encoding.toUint8Array(aEnc));
  }

  ws.on('message', (rawData: Buffer) => {
    const data = new Uint8Array(rawData);
    const dec = decoding.createDecoder(data);
    const msgType = decoding.readVarUint(dec);

    if (msgType === MSG_SYNC) {
      const replyEnc = encoding.createEncoder();
      encoding.writeVarUint(replyEnc, MSG_SYNC);
      syncProtocol.readSyncMessage(dec, replyEnc, room.doc, ws);
      // only reply if readSyncMessage wrote something beyond the type byte
      if (encoding.length(replyEnc) > 1) send(ws, encoding.toUint8Array(replyEnc));
      room.clients.forEach((c) => { if (c !== ws) send(c, data); });
    }

    if (msgType === MSG_AWARENESS) {
      const update = decoding.readVarUint8Array(dec);
      const onUpd = ({ added, updated }: { added: number[]; updated: number[] }, origin: unknown) => {
        if (origin !== ws) return;
        const set = controlled.get(ws) ?? new Set<number>();
        [...added, ...updated].forEach((id) => set.add(id));
        controlled.set(ws, set);
      };
      room.awareness.on('update', onUpd);
      awarenessProtocol.applyAwarenessUpdate(room.awareness, update, ws);
      room.awareness.off('update', onUpd);
      room.clients.forEach((c) => { if (c !== ws) send(c, data); });
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    const ids = Array.from(controlled.get(ws) ?? []);
    if (ids.length) {
      awarenessProtocol.removeAwarenessStates(room.awareness, ids, null);
      // tell remaining peers these cursors are gone
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(room.awareness, ids));
      room.clients.forEach((c) => send(c, encoding.toUint8Array(enc)));
    }
    console.log(`[yjs] left room "${roomId}" — ${room.clients.size} remaining`);
  });

  ws.on('error', (err) => {
    console.error(`[yjs] error in room "${roomId}":`, err.message);
    room.clients.delete(ws);
  });
});

const PORT = Number(process.env.YJS_PORT ?? 1234);
server.listen(PORT, () => console.log(`[yjs] WebSocket server running on ws://localhost:${PORT}`));
