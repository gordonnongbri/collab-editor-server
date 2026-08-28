import { Server, Socket } from 'socket.io';
import http from 'http';
import { applyAndPersist, getDoc, getCurrentState } from '../ydoc/store';
import * as Y from 'yjs';

export function initSocketServer(httpServer: http.Server) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket'],

    pingInterval: 10000,
    pingTimeout: 5000,
  });

    io.on('connection', (socket: Socket) => {
        const { userId } = socket.handshake.query as { userId: string };
        console.log(`[ws] connect ${socket.id} user=${userId}`);

    socket.on('join-room', async ({ roomId }: { roomId: string }) => {
      await socket.join(roomId);
      console.log(`[ws] ${socket.id} joined room ${roomId}`);

      const state = getCurrentState(roomId);
      if (state) {
        socket.emit('sync-state', state);
      } else {

        const ydoc = await getDoc(roomId);
        const initialState = Y.encodeStateAsUpdate(ydoc);
        socket.emit('sync-state', initialState);
      }

      const room = io.sockets.adapter.rooms.get(roomId);
      io.to(roomId).emit('peer-count', room?.size ?? 1);
    });

    socket.on('doc-update', async ({ roomId, update }: { roomId: string; update: ArrayBuffer }) => {
      const updateArr = new Uint8Array(update);

      socket.to(roomId).emit('doc-update', update);

      applyAndPersist(roomId, updateArr).catch((err) => {
        console.error('[ydoc] persist error', err);
      });
    });

    socket.on('awareness-update', ({ roomId, update }: { roomId: string; update: ArrayBuffer }) => {
      socket.to(roomId).emit('awareness-update', update);
    });

    socket.on('disconnecting', () => {
      for (const roomId of socket.rooms) {
        if (roomId !== socket.id) {
          const room = io.sockets.adapter.rooms.get(roomId);
          const size = room ? room.size - 1 : 0;
          io.to(roomId).emit('peer-count', size);
        }
      }
    });
  });

  console.log('[ws] Socket.io server ready');
  return io;
}