require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- 1. MONGODB ---
const CardSchema = new mongoose.Schema({
  text: String,
  type: { type: String, enum: ['black', 'white'] },
  createdAt: { type: Date, default: Date.now }
});
const Card = mongoose.model('Card', CardSchema);

// "MASTER DECKS"
let MASTER_BLACK_DECK = [];
let MASTER_WHITE_DECK = [];

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connecté à MongoDB Atlas');
    const blackCardsDB = await Card.find({ type: 'black' });
    const whiteCardsDB = await Card.find({ type: 'white' });
    MASTER_BLACK_DECK = blackCardsDB.map(c => c.text);
    MASTER_WHITE_DECK = whiteCardsDB.map(c => c.text);
    console.log(`🃏 CHARGEMENT MASTER : ${MASTER_BLACK_DECK.length} Questions / ${MASTER_WHITE_DECK.length} Réponses`);
  })
  .catch(err => console.error("❌ Erreur MongoDB:", err));

// --- 2. LOGIQUE DU JEU ---
const rooms = {}; 

const shuffleDeck = (deck) => {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
};

io.on('connection', (socket) => {
  
  // --- 👮‍♂️ ZONE ADMIN DASHBOARD ---

  // 1. Envoyer toutes les cartes à l'admin
  socket.on('admin_fetch_cards', async () => {
    try {
        const allCards = await Card.find().sort({ createdAt: -1 }); // Les plus récentes en premier
        socket.emit('admin_receive_cards', allCards);
    } catch (e) { console.error(e); }
  });

  // 2. Ajouter une carte depuis le dashboard
  socket.on('admin_add_card', async ({ text, type }) => {
    try {
        const newCard = new Card({ text, type });
        await newCard.save();

        // Mise à jour immédiate des Masters (pour les futures parties)
        if (type === 'black') MASTER_BLACK_DECK.push(text);
        else MASTER_WHITE_DECK.push(text);

        // On renvoie la liste mise à jour à l'admin
        const allCards = await Card.find().sort({ createdAt: -1 });
        socket.emit('admin_receive_cards', allCards);
        socket.emit('admin_action_success', "Carte ajoutée !");
    } catch (e) { console.error(e); }
  });

  // 3. Supprimer une carte
  socket.on('admin_delete_card', async (cardId) => {
    try {
        const deletedCard = await Card.findByIdAndDelete(cardId);
        if (deletedCard) {
            // On retire aussi du Master Deck en mémoire
            if (deletedCard.type === 'black') {
                MASTER_BLACK_DECK = MASTER_BLACK_DECK.filter(t => t !== deletedCard.text);
            } else {
                MASTER_WHITE_DECK = MASTER_WHITE_DECK.filter(t => t !== deletedCard.text);
            }
            
            const allCards = await Card.find().sort({ createdAt: -1 });
            socket.emit('admin_receive_cards', allCards);
        }
    } catch (e) { console.error(e); }
  });

  // --- FIN ZONE ADMIN ---

  socket.on('create_room', (username) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const roomWhiteDeck = shuffleDeck(MASTER_WHITE_DECK);
    const roomBlackDeck = shuffleDeck(MASTER_BLACK_DECK);

    rooms[roomId] = {
      players: [{ id: socket.id, username, score: 0, isHost: true, hand: [] }],
      gameState: 'LOBBY', 
      currentBlackCard: null,
      judgeId: null,
      playedCards: [],
      whiteDeck: roomWhiteDeck, 
      blackDeck: roomBlackDeck
    };

    socket.join(roomId);
    socket.emit('room_created', roomId);
    io.to(roomId).emit('update_players', rooms[roomId].players);
  });

  socket.on("join_room", (data) => {
    const { roomId, username } = data;
    if (!rooms[roomId]) { socket.emit("error_join", "Salle inexistante !"); return; }
    if (rooms[roomId].players.some(p => p.username === username)) { socket.emit("error_join", "Pseudo déjà pris !"); return; }

    const newPlayer = { id: socket.id, username, score: 0, hand: [], isHost: false };
    rooms[roomId].players.push(newPlayer);
    socket.join(roomId);

    io.to(roomId).emit("update_players", rooms[roomId].players);
    if (rooms[roomId].gameState !== 'LOBBY') {
        socket.emit("game_started", {
            blackCard: rooms[roomId].currentBlackCard,
            judgeId: rooms[roomId].judgeId,
            players: rooms[roomId].players
        });
        socket.emit("start_voting", rooms[roomId].playedCards);
    }
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    startNewRound(roomId, room, room.players[0].id); 
  });

  socket.on('play_card', ({ roomId, cardText }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.playedCards.push({ playerId: socket.id, text: cardText });
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.hand = player.hand.filter(c => c !== cardText);

    if (room.playedCards.length === room.players.length - 1) {
      room.gameState = 'JUDGING';
      io.to(roomId).emit('start_voting', shuffleDeck(room.playedCards));
    }
  });

  socket.on('reset_game', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    room.whiteDeck = shuffleDeck(MASTER_WHITE_DECK);
    room.blackDeck = shuffleDeck(MASTER_BLACK_DECK);
    room.gameState = 'LOBBY';
    room.currentBlackCard = null;
    room.playedCards = [];
    room.judgeId = null;
    room.players.forEach(p => { p.score = 0; p.hand = []; });
    io.to(roomId).emit('return_to_lobby', room.players);
  });

  socket.on('kick_player', ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== playerId);
    io.to(playerId).emit('you_are_kicked');
    io.to(roomId).emit('update_players', room.players);
  });

  socket.on('judge_vote', ({ roomId, winningCardText }) => {
    const room = rooms[roomId];
    if (!room) return;
    const winnerEntry = room.playedCards.find(c => c.text === winningCardText);
    const winnerId = winnerEntry ? winnerEntry.playerId : null;
    if (winnerId) {
      const winner = room.players.find(p => p.id === winnerId);
      if (winner) winner.score += 1;
      io.to(roomId).emit('round_winner', {
        winnerName: winner ? winner.username : "Inconnu",
        winningCard: winningCardText
      });
      setTimeout(() => { startNewRound(roomId, room, winnerId); }, 4000); 
    }
  });

  const startNewRound = (roomId, room, newJudgeId) => {
    if (room.blackDeck.length === 0) room.blackDeck = shuffleDeck(MASTER_BLACK_DECK);
    room.gameState = 'PLAYING';
    room.playedCards = [];
    room.currentBlackCard = room.blackDeck.pop();
    room.judgeId = newJudgeId;
    room.players.forEach(player => {
      const cardsNeeded = 7 - player.hand.length;
      if (cardsNeeded > 0) {
          if (room.whiteDeck.length < cardsNeeded) room.whiteDeck = shuffleDeck(MASTER_WHITE_DECK);
          const drawnCards = room.whiteDeck.splice(0, cardsNeeded);
          player.hand.push(...drawnCards);
      }
    });
    io.to(roomId).emit('game_started', {
      blackCard: room.currentBlackCard,
      judgeId: room.judgeId,
      players: room.players 
    });
    io.to(roomId).emit('update_players', room.players);
  };
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 SERVEUR LANCÉ SUR LE PORT ${PORT}`);
});