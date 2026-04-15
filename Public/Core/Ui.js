export default class UI {
    static showRoomScreen(title) {
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('room-screen').classList.remove('hidden');
        document.getElementById('game-title').innerText = title;
    }

    static showWaitingRoom(roomId, players) {
        document.getElementById('room-setup').classList.add('hidden');
        document.getElementById('waiting-room').classList.remove('hidden');
        document.getElementById('display-room-code').innerText = roomId;
        this.updatePlayers(players);
    }

    static updatePlayers(players) {
        const list = document.getElementById('players-list');
        list.innerHTML = players.map(p => `
            <div class="player-item">
                <span class="player-avatar">👤</span>
                <span class="player-name">${p.name}</span>
                ${p.id === io().id ? '<span class="you-badge">(You)</span>' : ''}
            </div>
        `).join('');
    }

    static showStatus(text) {
        document.getElementById('room-status-text').innerText = text;
    }

    static showGameContainer() {
        document.getElementById('room-screen').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');
    }

    static showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.innerText = message;
        toast.className = `toast toast-${type} animate-fade`;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3000);
    }
}
