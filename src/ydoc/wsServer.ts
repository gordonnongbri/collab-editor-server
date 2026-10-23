// server/src/ydoc/wsServer.ts
import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const docs = new Map<string, Y.Doc>();

function getOrCreateDoc(roomId: string): Y.Doc {
  if (!docs.has(roomId)) docs.set(roomId, new Y.Doc());
  return docs.get(roomId)!;
}

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export function startYjsWsServer(port = 1234) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket, req) => {
    const roomId = req.url?.slice(1).split('?')[0] ?? 'default';
    const doc = getOrCreateDoc(roomId);
    const awareness = new awarenessProtocol.Awareness(doc);

    // 1. Send full document state to the new client
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, doc);
    ws.send(encoding.toUint8Array(encoder));

    ws.on('message', (raw: Buffer) => {
      const decoder = decoding.createDecoder(new Uint8Array(raw));
      const msgType = decoding.readVarUint(decoder);

      if (msgType === MESSAGE_SYNC) {
        const replyEncoder = encoding.createEncoder();
        encoding.writeVarUint(replyEncoder, MESSAGE_SYNC);
        const syncReply = syncProtocol.readSyncMessage(decoder, replyEncoder, doc, null);
        if (syncReply) {
          ws.send(encoding.toUint8Array(replyEncoder));
        }
        // Broadcast update to all other clients in the same room
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(raw);
          }
        });
      }

      if (msgType === MESSAGE_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);
        // Broadcast awareness to others
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(raw);
          }
        });
      }
    });

    ws.on('close', () => {
      awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
    });
  });

  console.log(`[yjs-ws] server on :${port}`);
  return wss;
}