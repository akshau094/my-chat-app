const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"]
    }
});

// app.use(express.static(path.join(__dirname, 'public')));

// In-memory rooms: code -> { salt: string, participants: Set<socket.id> }
const rooms = new Map();

io.on('connection', (socket) => {
    // Create room with a secret code and a public salt
    socket.on('create-room', ({ code, salt }, ack) => {
        if (!code || !salt) return ack({ ok: false, error: 'Invalid payload' });
        if (rooms.has(code)) return ack({ ok: false, error: 'Room already exists' });

        rooms.set(code, { salt, participants: new Set() });
        socket.join(code);
        rooms.get(code).participants.add(socket.id);
        ack({ ok: true });
        io.to(code).emit('presence', { count: rooms.get(code).participants.size });
    });

    // Join an existing room using the secret code
    socket.on('join-room', ({ code }, ack) => {
        const room = rooms.get(code);
        if (!room) return ack({ ok: false, error: 'Room not found' });

        socket.join(code);
        room.participants.add(socket.id);
        ack({ ok: true, salt: room.salt });
        io.to(code).emit('presence', { count: room.participants.size });
    });

    // Relay encrypted messages (ciphertext only), do not store anything
    socket.on('message', ({ roomCode, ivB64, ciphertextB64 }) => {
        if (!roomCode || !ivB64 || !ciphertextB64) return;
        if (!rooms.has(roomCode)) return;
        // Send to others in the room, not back to the sender
        socket.broadcast.to(roomCode).emit('message', { ivB64, ciphertextB64 });
    });

    // Relay encrypted files (ciphertext only), do not store anything
    // Relay encrypted files (to others only) with normalized keys
    socket.on('file', ({ roomCode, ivB64, ciphertextB64, fileName, fileType, fileSize, filename, mime, size }) => {
        if (!roomCode || !ivB64 || !ciphertextB64) return;
        if (!rooms.has(roomCode)) return;
    
        // Normalize incoming keys
        const name = fileName || filename;
        const type = fileType || mime;
        const sz = fileSize ?? size;
    
        // Basic validation
        if (!name || !type) return;
        if (sz && sz > 10 * 1024 * 1024) return; // demo 10MB limit
    
        // Forward using consistent keys
        socket.broadcast.to(roomCode).emit('file', {
            ivB64,
            ciphertextB64,
            fileName: name,
            fileType: type,
            fileSize: sz
        });
    });

    // NEW: typing indicator relay
    socket.on('typing', ({ roomCode, isTyping }) => {
        if (!roomCode || !rooms.has(roomCode)) return;
        socket.broadcast.to(roomCode).emit('typing', { isTyping: !!isTyping });
    });
    
    socket.on('webrtc-offer', ({ roomCode, sdp }) => {
        if (!roomCode || !rooms.has(roomCode) || !sdp) return;
        socket.broadcast.to(roomCode).emit('webrtc-offer', { sdp });
    });
    
    socket.on('webrtc-answer', ({ roomCode, sdp }) => {
        if (!roomCode || !rooms.has(roomCode) || !sdp) return;
        socket.broadcast.to(roomCode).emit('webrtc-answer', { sdp });
    });
    
    socket.on('webrtc-ice', ({ roomCode, candidate }) => {
        if (!roomCode || !rooms.has(roomCode) || !candidate) return;
        socket.broadcast.to(roomCode).emit('webrtc-ice', { candidate });
    });
    
    socket.on('call-end', ({ roomCode }) => {
        if (!roomCode || !rooms.has(roomCode)) return;
        socket.broadcast.to(roomCode).emit('call-end');
    });
    
    socket.on('media-state', ({ roomCode, audioOn, videoOn }) => {
        if (!roomCode || !rooms.has(roomCode)) return;
        socket.broadcast.to(roomCode).emit('media-state', { audioOn: !!audioOn, videoOn: !!videoOn });
    });

    // Handle logout: leave rooms and clean up
    socket.on('logout', ({ code }) => {
        if (!code) return;
        const room = rooms.get(code);
        if (!room) return;

        socket.leave(code);
        room.participants.delete(socket.id);
        if (room.participants.size === 0) {
            rooms.delete(code);
        } else {
            io.to(code).emit('presence', { count: room.participants.size });
        }
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
        for (const [code, room] of rooms.entries()) {
            if (room.participants.has(socket.id)) {
                room.participants.delete(socket.id);
                if (room.participants.size === 0) {
                    rooms.delete(code);
                } else {
                    io.to(code).emit('presence', { count: room.participants.size });
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Socket.io server running on port ${PORT}`);
});
