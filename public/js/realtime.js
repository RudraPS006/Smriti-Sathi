// Socket.IO (alerts, reminders, chat) + a raw WebSocket heartbeat (/ws) for the online dot.
let socket = null;

export function connectSocket() {
  if (socket) return socket;
  // io() is provided by /socket.io/socket.io.js; the JWT cookie authenticates it
  socket = window.io({ withCredentials: true });
  return socket;
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}

export const getSocket = () => socket;

export function startHeartbeat(onChange) {
  let ws;
  let timer;
  const connect = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => {
      onChange(true);
      timer = setInterval(() => ws.readyState === 1 && ws.send('ping'), 15000);
    };
    ws.onclose = () => {
      onChange(false);
      clearInterval(timer);
      setTimeout(connect, 3000); // keep trying
    };
  };
  connect();
}
