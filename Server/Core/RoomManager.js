import GuessNumber from '../Games/GuessNumber.js';

export default class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();
        this.playerToRoom = new Map();
    }

    handleConnection(socket) {
        socket.on('create_room', (data) => this.createRoom(socket, data));
        socket.on('join_room', (data) => this.joinRoom(socket, data));
        socket.on('disconnect', () => this.handleDisconnect(socket));
        
        // Game-specific event routing
        socket.on('game_event', (data) => this.routeGameEvent(socket, data));
    }

    createRoom(socket, data) {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const room = {
            id: roomId,
            players: [{ id: socket.id, name: data.playerName, ready: false }],
            status: 'WAITING',
            gameType: data.gameType || 'GUESS_NUMBER',
            gameState: {}
        };

        this.rooms.set(roomId, room);
        this.playerToRoom.set(socket.id, roomId);
        
        socket.join(roomId);
        socket.emit('room_created', { roomId, players: room.players });
    }

    joinRoom(socket, data) {
        const roomId = data.roomId?.toUpperCase();
        const room = this.rooms.get(roomId);

        if (!room) {
            return socket.emit('error', { message: 'Room not found' });
        }

        if (room.players.length >= 2) {
            return socket.emit('error', { message: 'Room is full' });
        }

        room.players.push({ id: socket.id, name: data.playerName, ready: false });
        this.playerToRoom.set(socket.id, roomId);
        
        socket.join(roomId);
        this.io.to(roomId).emit('player_joined', { players: room.players });

        if (room.players.length === 2) {
            room.status = 'READY';
            this.io.to(roomId).emit('room_ready', { room });
            this.initializeGame(room);
        }
    }

    initializeGame(room) {
        if (room.gameType === 'GUESS_NUMBER') {
            room.gameState = GuessNumber.createInitialState();
            this.io.to(room.id).emit('game_init', { gameState: room.gameState });
        }
    }

    routeGameEvent(socket, data) {
        const roomId = this.playerToRoom.get(socket.id);
        const room = this.rooms.get(roomId);
        if (!room) return;

        if (room.gameType === 'GUESS_NUMBER') {
            GuessNumber.handleEvent(this.io, room, socket.id, data);
        }
    }

    handleDisconnect(socket) {
        const roomId = this.playerToRoom.get(socket.id);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                this.rooms.delete(roomId);
            } else {
                this.io.to(roomId).emit('player_left', { players: room.players });
                room.status = 'WAITING';
            }
        }
        this.playerToRoom.delete(socket.id);
    }
}
