// Unit III — Socket services.
//  * Socket.IO: live alerts, reminders and the family chat (rooms per patient)
//  * A plain WebSocket server (ws) at /ws: a tiny heartbeat the browser uses
//    to show "connected / offline" — the low-level version of the same idea.
const { Server } = require('socket.io');
const { WebSocketServer } = require('ws');
const { prisma } = require('../config/db');
const ChatMessage = require('../models/ChatMessage');
const bus = require('../events/bus');
const { verifyToken, canAccessPatient, COOKIE } = require('../middleware/auth');

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((c) => c.trim().split('=')).filter(([k, v]) => k && v).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])
  );
}

function initSockets(httpServer) {
  const io = new Server(httpServer, { cors: { origin: false } });

  // Socket.IO middleware: authenticate the connection with the same JWT cookie
  // Socket.IO middleware: authenticate with the same JWT cookie, and work out the
  // rooms BEFORE the connection is accepted — so no alert can slip past a client
  // that is "connected" but has not joined its rooms yet.
  io.use(async (socket, next) => {
    let user;
    try {
      const token = socket.handshake.auth?.token || parseCookies(socket.handshake.headers.cookie)[COOKIE];
      user = verifyToken(token);
    } catch {
      return next(new Error('unauthorised'));
    }
    try {
      const rooms = [`user:${user.id}`];
      if (user.role === 'patient') rooms.push(`patient:${user.id}`);
      if (user.role === 'admin') rooms.push('admins');
      if (user.role === 'caregiver') {
        const links = await prisma.careLink.findMany({ where: { carerId: user.id }, select: { patientId: true } });
        links.forEach((l) => rooms.push(`team:${l.patientId}`));
      }
      socket.user = user;
      socket.join(rooms);
      next();
    } catch (e) {
      next(e);
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket;

    // Join a patient's chat room (permission checked)
    socket.on('chat:join', async ({ patientId }, ack = () => {}) => {
      const pid = Number(patientId);
      if (!(await canAccessPatient(user, pid))) return ack({ ok: false, error: 'not allowed' });
      socket.join(`chat:${pid}`);
      ack({ ok: true });
    });

    // Send a chat message — the callback (ack) tells the sender it was saved
    socket.on('chat:send', async ({ patientId, text }, ack = () => {}) => {
      const pid = Number(patientId);
      const clean = String(text || '').trim().slice(0, 1000);
      if (!clean) return ack({ ok: false, error: 'empty message' });
      if (!(await canAccessPatient(user, pid))) return ack({ ok: false, error: 'not allowed' });
      const msg = await ChatMessage.create({ patientId: pid, senderId: user.id, senderName: user.name, senderRole: user.role, text: clean });
      io.to(`chat:${pid}`).emit('chat:message', msg.toObject());
      ack({ ok: true, id: msg._id });
    });

    socket.on('chat:typing', ({ patientId }) => {
      socket.to(`chat:${Number(patientId)}`).emit('chat:typing', { name: user.name });
    });
  });

  // Event bus -> sockets
  bus.on(bus.EVENTS.ALERT_CREATED, async (alert) => {
    const patient = await prisma.user.findUnique({ where: { id: alert.patientId }, select: { id: true, name: true } }).catch(() => null);
    const payload = { ...alert, patient };
    io.to(`team:${alert.patientId}`).to('admins').emit('alert:new', payload);
    if (alert.type === 'sos') io.to(`patient:${alert.patientId}`).emit('sos:received', { id: alert.id });
  });
  // Every patient action is pushed live to their caregivers' dashboards
  bus.on(bus.EVENTS.ACTIVITY_LOGGED, (entry) => {
    io.to(`team:${entry.patientId}`).to('admins').emit('activity:new', entry);
  });
  bus.on(bus.EVENTS.REMINDER_DUE, (reminder) => {
    io.to(`patient:${reminder.patientId}`).emit('reminder:due', reminder);
  });

  // ---- plain WebSocket heartbeat at /ws ----
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') return; // everything else belongs to Socket.IO
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'hello', time: Date.now() }));
    ws.on('message', (data) => {
      // echo pings back so the client can measure latency
      if (String(data) === 'ping') ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
    });
  });

  return { io, wss };
}

module.exports = { initSockets };
