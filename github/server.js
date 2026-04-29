const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let waitingPlayer = null;

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join_matchmaking', (name) => {
        if (waitingPlayer && waitingPlayer.socket.id !== socket.id) {
            // Match found
            const room = `room_${Date.now()}`;
            socket.join(room);
            waitingPlayer.socket.join(room);

            // Randomize colors (Black goes first in this game)
            const isP1Black = Math.random() > 0.5;
            const p1Color = isP1Black ? 'black' : 'red';
            const p2Color = isP1Black ? 'red' : 'black';

            waitingPlayer.socket.emit('match_found', { color: p1Color, opponentName: name });
            socket.emit('match_found', { color: p2Color, opponentName: waitingPlayer.name });

            console.log(`Match started in ${room} between ${waitingPlayer.name} (${p1Color}) and ${name} (${p2Color})`);
            waitingPlayer = null;
        } else {
            waitingPlayer = { socket, name };
            socket.emit('waiting_for_match');
            console.log('Player waiting:', name);
        }
    });

    socket.on('make_move', (data) => {
        // Broadcast move to the opponent in the same room
        const room = Array.from(socket.rooms).find(r => r.startsWith('room_'));
        if (room) {
            socket.to(room).emit('opponent_moved', data);
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            waitingPlayer = null;
        }
        // Notify opponent if they were in a room
        const room = Array.from(socket.rooms).find(r => r.startsWith('room_'));
        if (room) {
            socket.to(room).emit('opponent_disconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
