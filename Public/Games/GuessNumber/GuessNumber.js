export default class GuessNumberClient {
    constructor(socket, initialState) {
        this.socket = socket;
        this.state = initialState;
        this.container = document.getElementById('game-container');
        this.myId = socket.id;
    }

    render() {
        this.container.innerHTML = `
            <div id="gn-game" class="gn-layout">
                <header class="gn-header">
                    <h2>Guess the Number</h2>
                    <div id="gn-timer" class="gn-timer">--</div>
                </header>

                <div id="gn-content" class="gn-content">
                    <!-- Dynamic content based on state -->
                </div>

                <div id="gn-opponent-info" class="gn-info-bar">
                    <p id="gn-status">Initializing...</p>
                </div>
            </div>
        `;
        this.updateUI();
    }

    updateUI() {
        const content = document.getElementById('gn-content');
        const status = document.getElementById('gn-status');

        switch (this.state.status) {
            case 'MODE_SELECTION':
                status.innerText = "Vote for a difficulty mode. Both must agree!";
                const myChoice = this.state.playerModes[this.myId];
                const opponentId = Object.keys(this.state.playerModes).find(id => id !== this.myId);
                const oppChoice = opponentId ? this.state.playerModes[opponentId] : null;

                content.innerHTML = `
                    <div class="mode-grid">
                        ${['EASY', 'MEDIUM', 'HARD'].map(m => `
                            <button class="mode-btn ${myChoice === m ? 'selected' : ''}" data-mode="${m}">
                                <span>${m.charAt(0) + m.slice(1).toLowerCase()}</span>
                                <small>${this.getRange(m).min}-${this.getRange(m).max}</small>
                                <div class="vote-indicators">
                                    ${myChoice === m ? '<span class="vote-dot you">You</span>' : ''}
                                    ${oppChoice === m ? '<span class="vote-dot opponent">Opponent</span>' : ''}
                                </div>
                            </button>
                        `).join('')}
                        <button class="mode-btn disabled" disabled>Extreme (Locked)</button>
                    </div>
                `;
                content.querySelectorAll('.mode-btn:not(.disabled)').forEach(btn => {
                    btn.onclick = () => {
                        const mode = btn.dataset.mode;
                        this.state.playerModes[this.myId] = mode; // Optimistic update
                        this.socket.emit('game_event', { type: 'SELECT_MODE', payload: mode });
                        this.updateUI();
                    };
                });
                break;

            case 'NUMBER_SELECTION':
                status.innerText = "Set your secret number for the opponent!";
                const range = this.getRange(this.state.selectedMode);
                content.innerHTML = `
                    <div class="flex-col animate-fade selection-area">
                        <p class="range-info">Mode: <strong>${this.state.selectedMode}</strong> (${range.min} to ${range.max})</p>
                        <div class="input-wrapper">
                            <input type="number" id="secret-number" min="${range.min}" max="${range.max}" placeholder="Enter Secret Number">
                            <button id="btn-set-number">Lock In</button>
                        </div>
                    </div>
                `;
                document.getElementById('btn-set-number').onclick = () => {
                    const num = document.getElementById('secret-number').value;
                    if (!num) return;
                    this.socket.emit('game_event', { type: 'SET_NUMBER', payload: num });
                    content.innerHTML = `<div class="waiting-box">
                        <div class="spinner"></div>
                        <p>Number locked in! Waiting for opponent...</p>
                    </div>`;
                };
                break;

            case 'PLAYING':
                const isMyTurn = this.state.turn === this.myId;
                const activeRange = this.getRange(this.state.selectedMode);
                const mySecret = this.state.numbers[this.myId];
                status.innerText = isMyTurn ? "YOUR TURN" : "WAITING...";
                
                content.innerHTML = `
                    <div class="game-play-area chat-mode ${isMyTurn ? 'my-turn-active' : 'opp-turn-active'}">
                        <div class="chat-container" id="chat-timeline">
                            <div class="chat-header">
                                <div class="mode-info">
                                    <span>Mode: ${this.state.selectedMode}</span>
                                    <span>Range: ${activeRange.min}-${activeRange.max}</span>
                                </div>
                                <div class="my-number-box animate-pop">
                                    <small>Your Number</small>
                                    <strong>${mySecret}</strong>
                                </div>
                            </div>
                            <div id="bubbles-area" class="bubbles-area">
                                <!-- Guesses appear here -->
                            </div>
                        </div>
                        
                        <div class="input-section-container chat-input-bar">
                            <div class="input-section ${isMyTurn ? '' : 'disabled-turn'}">
                                <input type="number" id="guess-input" autofocus 
                                    min="${activeRange.min}" max="${activeRange.max}"
                                    placeholder="Enter guess (${activeRange.min}-${activeRange.max})..." 
                                    ${isMyTurn ? '' : 'disabled'}>
                                <button id="btn-send-guess" ${isMyTurn ? '' : 'disabled'}>
                                    <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                                </button>
                            </div>
                            ${!isMyTurn ? '<div class="turn-overlay chat-overlay">Opponent is choosing...</div>' : ''}
                        </div>
                    </div>
                `;
                this.renderHistory();
                
                if (isMyTurn) {
                    const input = document.getElementById('guess-input');
                    const btn = document.getElementById('btn-send-guess');
                    
                    const submit = () => {
                        const guess = parseInt(input.value);
                        if (isNaN(guess)) return;
                        
                        if (guess < activeRange.min || guess > activeRange.max) {
                            UI.showToast(`Guess must be between ${activeRange.min} and ${activeRange.max}`, 'error');
                            input.classList.add('shake');
                            setTimeout(() => input.classList.remove('shake'), 500);
                            return;
                        }

                        this.socket.emit('game_event', { type: 'SUBMIT_GUESS', payload: guess });
                        btn.disabled = true;
                        input.disabled = true;
                    };

                    btn.onclick = submit;
                    input.onkeypress = (e) => { if (e.key === 'Enter') submit(); };
                    input.focus();
                }
                break;

            case 'FINISHED':
                const won = this.state.winner === this.myId;
                content.innerHTML = `
                    <div class="win-screen animate-fade">
                        <div class="result-icon">${won ? '🏆' : '💀'}</div>
                        <h2 class="${won ? 'text-glow-green' : 'text-glow-red'}">${won ? 'VICTORY!' : 'DEFEAT'}</h2>
                        <p>${won ? 'Brilliant! You guessed it.' : 'The opponent was faster. Try again!'}</p>
                        <div class="reveal-box">
                            Opponent's number was: <strong>${this.state.numbers[Object.keys(this.state.numbers).find(id => id !== this.myId)]}</strong>
                        </div>
                        <button class="retry-btn" onclick="location.reload()">Back to Lobby</button>
                    </div>
                `;
                status.innerText = "GAME OVER";
                break;
        }
    }

    renderHistory() {
        const area = document.getElementById('bubbles-area');
        if (!area) return;

        const timeline = this.state.timeline || [];
        if (timeline.length === 0) {
            area.innerHTML = '<div class="chat-hint">Make your first guess!</div>';
            return;
        }

        area.innerHTML = timeline.map(item => {
            const isMe = item.playerId === this.myId;
            return `
                <div class="message-row ${isMe ? 'msg-me' : 'msg-opp'}">
                    <div class="bubble animate-pop">
                        <div class="bubble-val">${item.guess}</div>
                        <div class="bubble-res ${item.result}">${item.result.toUpperCase()}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        area.scrollTop = area.scrollHeight;
    }

    onUpdate(data) {
        switch (data.type) {
            case 'MODE_SELECTED':
                this.state.playerModes[data.playerId] = data.mode;
                if (this.state.status === 'MODE_SELECTION') {
                    this.updateUI();
                }
                break;
            case 'START_NUMBER_SELECTION':
                this.state.status = 'NUMBER_SELECTION';
                this.state.selectedMode = data.mode;
                this.updateUI();
                break;
            case 'START_PLAYING':
                this.state.status = 'PLAYING';
                this.state.turn = data.turn;
                if (!this.state.numbers) this.state.numbers = {};
                this.state.numbers[this.myId] = data.myNumber;
                this.state.timeline = [];
                this.updateUI();
                break;
            case 'GUESS_RESULT':
                this.state.timeline = data.timeline;
                this.state.turn = data.nextTurn;
                this.updateUI();
                break;
            case 'TURN_SKIPPED':
                this.state.turn = data.nextTurn;
                this.updateUI();
                break;
            case 'GAME_OVER':
                this.state.status = 'FINISHED';
                this.state.winner = data.winner;
                this.state.timeline = data.timeline;
                this.state.numbers = data.allNumbers; // Reveal all numbers
                this.updateUI();
                break;
        }
    }

    onTimer(timeLeft) {
        const timerEl = document.getElementById('gn-timer');
        if (timerEl) {
            timerEl.innerText = timeLeft;
            if (timeLeft <= 3) timerEl.style.color = 'var(--accent-red)';
            else timerEl.style.color = 'white';
        }
    }

    getRange(mode) {
        switch (mode) {
            case 'EASY': return { min: 1, max: 100 };
            case 'MEDIUM': return { min: 1, max: 500 };
            case 'HARD': return { min: 1, max: 1000 };
            default: return { min: 1, max: 100 };
        }
    }
}
