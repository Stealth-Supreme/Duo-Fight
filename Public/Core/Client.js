import UI from './Ui.js';
import GuessNumberClient from '../Games/GuessNumber/GuessNumber.js';

class GameClient {
    constructor() {
        this.socket = io();
        this.room = null;
        this.currentGame = null;
        this.playerName = "Player";
        this.gameType = null;

        this.init();
    }

    init() {
        this.setupSocket();
        this.setupEvents();
    }

    setupSocket() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });

        this.socket.on('room_created', (data) => {
            this.room = data;
            UI.showWaitingRoom(data.roomId, data.players);
        });

        this.socket.on('player_joined', (data) => {
            UI.updatePlayers(data.players);
        });

        this.socket.on('room_ready', (data) => {
            UI.showStatus('Opponent found! Initializing game...');
            this.room = data.room;
        });

        this.socket.on('game_init', (data) => {
            this.startGame(data.gameState);
        });

        this.socket.on('game_update', (data) => {
            if (this.currentGame) {
                this.currentGame.onUpdate(data);
            }
        });

        this.socket.on('timer_sync', (data) => {
            if (this.currentGame) {
                this.currentGame.onTimer(data.timeLeft);
            }
        });

        this.socket.on('error', (data) => {
            UI.showToast(data.message, 'error');
        });

        this.socket.on('player_left', (data) => {
            UI.showToast('Opponent disconnected', 'warning');
            UI.updatePlayers(data.players);
            // Handle restart or exit
        });
    }

    setupEvents() {
        document.getElementById('btn-guess-number').addEventListener('click', () => {
            this.gameType = 'GUESS_NUMBER';
            this.playerName = document.getElementById('player-name').value || "Player";
            UI.showRoomScreen('Guess the Number');
        });

        document.getElementById('btn-create-room').addEventListener('click', () => {
            this.socket.emit('create_room', { 
                playerName: this.playerName, 
                gameType: this.gameType 
            });
        });

        document.getElementById('btn-join-room').addEventListener('click', () => {
            const roomId = document.getElementById('room-code-input').value;
            if (!roomId) return UI.showToast('Enter room code', 'error');
            this.socket.emit('join_room', { 
                playerName: this.playerName, 
                roomId 
            });
        });
    }

    startGame(gameState) {
        UI.showGameContainer();
        if (this.gameType === 'GUESS_NUMBER') {
            this.currentGame = new GuessNumberClient(this.socket, gameState);
            this.currentGame.render();
        }
    }
}

window.addEventListener('load', () => {
    new GameClient();
});
