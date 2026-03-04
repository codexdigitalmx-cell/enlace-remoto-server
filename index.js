const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.get('/', (_, res) => res.send('Enlace Remoto - Servidor de Senalizacion OK'));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 50 * 1024 * 1024,
  pingInterval: 8000,
  pingTimeout: 5000,
});

// rooms: key = "MACHINEID_SESSIONCODE" → { host: socketId, client: socketId|null }
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[+] Conectado: ${socket.id}`);

  socket.on('create-room', ({ machineId, sessionCode }) => {
    const key = `${machineId}_${sessionCode}`;
    // Reemplazar sala anterior si existe (reconexion)
    if (rooms.has(key)) {
      const old = rooms.get(key);
      io.sockets.sockets.get(old.host)?.disconnect();
    }
    rooms.set(key, { host: socket.id, client: null });
    socket.join(key);
    socket.emit('room-created', { key });
    console.log(`[SALA] Creada: ${key}`);
  });

  socket.on('join-room', ({ machineId, sessionCode }) => {
    const key = `${machineId}_${sessionCode}`;
    const room = rooms.get(key);
    if (!room) {
      socket.emit('room-error', { message: 'ID o codigo incorrectos. Verifica los datos.' });
      return;
    }
    if (room.client) {
      socket.emit('room-error', { message: 'Ya hay una sesion activa en ese equipo.' });
      return;
    }
    room.client = socket.id;
    socket.join(key);
    socket.emit('room-joined', { key });
    // Broadcast en la sala (alcanza al HOST aunque su socket ID haya cambiado)
    socket.to(key).emit('client-joined');
    console.log(`[SALA] Unido: ${key}`);
  });

  socket.on('offer',         ({ key, offer })     => socket.to(key).emit('offer',         { offer }));
  socket.on('answer',        ({ key, answer })    => socket.to(key).emit('answer',        { answer }));
  socket.on('ice-candidate', ({ key, candidate }) => socket.to(key).emit('ice-candidate', { candidate }));

  socket.on('disconnect', () => {
    console.log(`[-] Desconectado: ${socket.id}`);
    for (const [key, room] of rooms.entries()) {
      if (room.host === socket.id || room.client === socket.id) {
        socket.to(key).emit('peer-disconnected');
        rooms.delete(key);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
