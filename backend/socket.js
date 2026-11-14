import { Server } from 'socket.io';
import { db, id, now, save } from './store.js';
import { verifyToken } from './Middleware/auth.js';
import { notifyUser } from './Routes/notification.js';
import { config } from './config.js';

export function configureSocket(httpServer) {
  const io = new Server(httpServer, {
    maxHttpBufferSize: 16384,
    cors: { origin: config.clientUrl, credentials: true },
    allowRequest: (req, done) => done(null, !req.headers.origin || req.headers.origin === config.clientUrl),
  });
  io.use((socket, next) => {
    try { socket.data.user = verifyToken(socket.handshake.auth?.token); next(); }
    catch { next(new Error('Session expired. Please reconnect.')); }
  });
  io.on('connection', socket => {
    let lastSent = 0;
    function validSession() {
      const session = db.sessions.find(s => s.id === socket.data.user.sessionId && s.expiresAt > Date.now());
      if (!session) socket.disconnect(true);
      return !!session;
    }
    socket.on('room:join', (roomId, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      if (!validSession()) return;
      if (!db.threads.some(t => t.id === roomId)) return ack({ error: 'Thread not found.' });
      for (const room of socket.rooms) if (room !== socket.id) socket.leave(room);
      socket.join(roomId);
      ack({ messages: db.messages.filter(m => m.threadId === roomId).slice(-100).map(m => ({ ...m, user: db.users.find(u => u.id === m.userId)?.name || 'Deleted user' })) });
    });
    socket.on('chat:message', (data, callback) => {
      const ack = typeof callback === 'function' ? callback : () => {};
      if (!validSession()) return;
      if (!data || typeof data !== 'object') return ack({ error: 'Invalid message.' });
      const { roomId, text } = data;
      if (!socket.rooms.has(roomId) || !db.threads.some(t => t.id === roomId)) return ack({ error: 'Join an existing thread first.' });
      if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000) return ack({ error: 'Messages must contain 1–2000 characters.' });
      if (Date.now() - lastSent < 500) return ack({ error: 'Please wait a moment before sending again.' });
      lastSent = Date.now();
      const user = db.users.find(u => u.id === socket.data.user.id);
      const message = { id: id(), threadId: roomId, text: text.trim(), userId: user.id, user: user.name, at: now() };
      db.messages.push(message);
      save();
      io.to(roomId).emit('chat:message', message);
      const thread = db.threads.find(t => t.id === roomId);
      if (thread.authorId !== user.id) notifyUser(thread.authorId, `${user.name} sent a message in “${thread.title}”.`, thread.id);
      ack({ ok: true });
    });
  });
  return io;
}
