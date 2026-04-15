export default class GuessNumber {
    static createInitialState() {
        return {
            status: 'MODE_SELECTION',
            selectedMode: null,
            playerModes: {}, // {playerId: mode}
            numbers: {}, // {playerId: number}
            turn: null,
            history: {}, // {playerId: [guesses]}
            timers: {
                selection: 10,
                turn: 8
            },
            winner: null
        };
    }

    static handleEvent(io, room, playerId, data) {
        const { type, payload } = data;
        const state = room.gameState;

        switch (type) {
            case 'SELECT_MODE':
                this.handleModeSelection(io, room, playerId, payload);
                break;
            case 'SET_NUMBER':
                this.handleNumberSelection(io, room, playerId, payload);
                break;
            case 'SUBMIT_GUESS':
                this.handleGuess(io, room, playerId, payload);
                break;
        }
    }

    static handleModeSelection(io, room, playerId, mode) {
        const state = room.gameState;
        if (state.status !== 'MODE_SELECTION') return;

        state.playerModes[playerId] = mode;
        
        // Notify others
        io.to(room.id).emit('game_update', { 
            type: 'MODE_SELECTED', 
            playerId, 
            mode 
        });

        const playerIds = room.players.map(p => p.id);
        if (playerIds.every(id => state.playerModes[id] === mode)) {
            state.selectedMode = mode;
            state.status = 'NUMBER_SELECTION';
            state.timers.selection = 10;
            
            io.to(room.id).emit('game_update', { 
                type: 'START_NUMBER_SELECTION', 
                mode,
                timer: state.timers.selection 
            });

            this.startSelectionTimer(io, room);
        }
    }

    static startSelectionTimer(io, room) {
        if (room.selectionInterval) clearInterval(room.selectionInterval);
        const state = room.gameState;
        let timeLeft = state.timers.selection;

        room.selectionInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(room.selectionInterval);
                this.finalizeNumberSelection(io, room);
            } else {
                io.to(room.id).emit('timer_sync', { timeLeft });
            }
        }, 1000);
    }

    static handleNumberSelection(io, room, playerId, number) {
        const state = room.gameState;
        if (state.status !== 'NUMBER_SELECTION') return;

        const val = parseInt(number);
        const range = this.getRange(state.selectedMode);
        
        // Strict validation: if out of range, tell them to choose correctly
        if (isNaN(val) || val < range.min || val > range.max) {
            return io.to(playerId).emit('error', { message: 'Do not choose invalid numbers! Stay within range.' });
        }

        state.numbers[playerId] = val;
        
        // Check if both selected
        const playerIds = room.players.map(p => p.id);
        if (playerIds.every(id => state.numbers[id] !== undefined)) {
            if (room.selectionInterval) {
                clearInterval(room.selectionInterval);
                room.selectionInterval = null;
            }
            this.finalizeNumberSelection(io, room);
        }
    }

    static finalizeNumberSelection(io, room) {
        const state = room.gameState;
        if (state.status !== 'NUMBER_SELECTION') return;

        const range = this.getRange(state.selectedMode);
        room.players.forEach(p => {
            // If they didn't pick, assign a random number
            if (state.numbers[p.id] === undefined) {
                state.numbers[p.id] = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
            }
            state.history[p.id] = [];
        });

        state.status = 'PLAYING';
        state.turn = room.players[0].id; // Player 1 starts
        
        state.timeline = []; // Clear timeline

        // Send start event and current numbers to EACH player PRIVATELY
        room.players.forEach(p => {
            io.to(p.id).emit('game_update', { 
                type: 'START_PLAYING', 
                turn: state.turn,
                myNumber: state.numbers[p.id]
            });
        });

        this.startTurnTimer(io, room);
    }

    static handleGuess(io, room, playerId, guess) {
        const state = room.gameState;
        if (state.status !== 'PLAYING' || state.turn !== playerId) return;

        const val = parseInt(guess);
        const range = this.getRange(state.selectedMode);
        
        // Basic validation: must be within range
        if (isNaN(val) || val < range.min || val > range.max) {
            return io.to(playerId).emit('error', { message: `Guess must be between ${range.min} and ${range.max}` });
        }

        // Clear existing timer immediately when a valid guess is made
        if (room.turnInterval) {
            clearInterval(room.turnInterval);
            room.turnInterval = null;
        }

        const opponentId = room.players.find(p => p.id !== playerId).id;
        const target = state.numbers[opponentId];

        let result = "";
        if (val < target) result = "higher";
        else if (val > target) result = "lower";
        else result = "correct";

        const guessData = { playerId, guess: val, result, timestamp: Date.now() };
        state.history[playerId].push(guessData);
        if (!state.timeline) state.timeline = [];
        state.timeline.push(guessData);

        if (result === "correct") {
            state.status = 'FINISHED';
            state.winner = playerId;
            io.to(room.id).emit('game_update', { 
                type: 'GAME_OVER', 
                winner: playerId,
                history: state.history,
                timeline: state.timeline,
                allNumbers: state.numbers // Reveal all at the end
            });
        } else {
            // Switch turn
            state.turn = opponentId;
            
            io.to(room.id).emit('game_update', { 
                type: 'GUESS_RESULT', 
                playerId, 
                guess: val, 
                result,
                nextTurn: state.turn,
                timeline: state.timeline
            });
            
            this.startTurnTimer(io, room);
        }
    }

    static startTurnTimer(io, room) {
        if (room.turnInterval) clearInterval(room.turnInterval);
        const state = room.gameState;
        let timeLeft = state.timers.turn;

        room.turnInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(room.turnInterval);
                room.turnInterval = null;
                this.autoSkipTurn(io, room);
            } else {
                io.to(room.id).emit('timer_sync', { timeLeft });
            }
        }, 1000);
    }

    static autoSkipTurn(io, room) {
        const state = room.gameState;
        if (state.status !== 'PLAYING') return;

        const opponentId = room.players.find(p => p.id !== state.turn).id;
        state.turn = opponentId;
        
        io.to(room.id).emit('game_update', { 
            type: 'TURN_SKIPPED', 
            nextTurn: state.turn 
        });

        this.startTurnTimer(io, room);
    }

    static getRange(mode) {
        switch (mode) {
            case 'EASY': return { min: 1, max: 100 };
            case 'MEDIUM': return { min: 1, max: 500 };
            case 'HARD': return { min: 1, max: 1000 };
            default: return { min: 1, max: 100 };
        }
    }
}
