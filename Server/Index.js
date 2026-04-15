import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import RoomManager from './Core/RoomManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../Public')));

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    roomManager.handleConnection(socket);
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
