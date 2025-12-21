require('dotenv').config(); // Charge le fichier .env si on est en local
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// SÉCURITÉ : On récupère le lien depuis l'environnement (Render ou .env)
// Si la variable n'existe pas, on met une chaine vide (ça plantera proprement au lieu de fuiter)
const MONGO_URI = process.env.MONGO_URI;

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] } // "*" autorise toutes les connexions
});

// --- 1. CONFIGURATION MONGODB ---
const CardSchema = new mongoose.Schema({
  text: String,
  type: { type: String, enum: ['black', 'white'] },
  createdAt: { type: Date, default: Date.now }
});
const Card = mongoose.model('Card', CardSchema);

// Mémoire du serveur (synchronisée avec la BDD)
let BLACK_DECK = [];
let WHITE_DECK = [];

// Connexion et chargement initial
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connecté à MongoDB Atlas');
    const blackCardsDB = await Card.find({ type: 'black' });
    const whiteCardsDB = await Card.find({ type: 'white' });
    BLACK_DECK = blackCardsDB.map(c => c.text);
    WHITE_DECK = whiteCardsDB.map(c => c.text);
    console.log(`🃏 CHARGEMENT : ${BLACK_DECK.length} Questions / ${WHITE_DECK.length} Réponses`);
  })
  .catch(err => console.error("❌ Erreur MongoDB:", err));


// --- 2. LOGIQUE DU JEU ---
const rooms = {}; 

const drawCards = (count) => {
  const hand = [];
  if (WHITE_DECK.length === 0) return ["Deck vide ! Ajoute des cartes."];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * WHITE_DECK.length);
    hand.push(WHITE_DECK[randomIndex]);
  }
  return hand;
};

const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

io.on('connection', (socket) => {
  
  // --- NOUVEAU : CRÉER UNE CARTE ---
  socket.on('create_custom_card', async ({ text, type }) => {
    try {
      // 1. Sauvegarde BDD
      const newCard = new Card({ text, type });
      await newCard.save();

      // 2. Ajout Mémoire (Immédiat)
      if (type === 'black') BLACK_DECK.push(text);
      else WHITE_DECK.push(text);

      console.log(`✨ Nouvelle carte : [${type}] ${text}`);
      socket.emit('card_saved_success');
    } catch (err) {
      console.error("Erreur save:", err);
    }
  });

  // Gestion Salle
  socket.on('create_room', (username) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      players: [{ id: socket.id, username, score: 0, isHost: true, hand: [] }],
      gameState: 'LOBBY', 
      currentBlackCard: null,
      judgeId: null,
      playedCards: [] 
    };
    socket.join(roomId);
    socket.emit('room_created', roomId);
    io.to(roomId).emit('update_players', rooms[roomId].players);
  });

  socket.on('join_room', ({ roomId, username }) => {
    if (rooms[roomId]) {
      rooms[roomId].players.push({ id: socket.id, username, score: 0, isHost: false, hand: [] });
      socket.join(roomId);
      io.to(roomId).emit('update_players', rooms[roomId].players);
    }
  });

  // Jeu
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
      io.to(roomId).emit('start_voting', shuffleArray(room.playedCards));
    }
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

      setTimeout(() => {
        startNewRound(roomId, room, winnerId);
      }, 4000); 
    }
  });

  const startNewRound = (roomId, room, newJudgeId) => {
    if (BLACK_DECK.length === 0) return;

    room.gameState = 'PLAYING';
    room.playedCards = [];
    room.currentBlackCard = BLACK_DECK[Math.floor(Math.random() * BLACK_DECK.length)];
    room.judgeId = newJudgeId;

    room.players.forEach(player => {
      const needed = 7 - player.hand.length;
      if (needed > 0) player.hand.push(...drawCards(needed));
    });

    io.to(roomId).emit('game_started', {
      blackCard: room.currentBlackCard,
      judgeId: room.judgeId,
      players: room.players 
    });
    io.to(roomId).emit('update_players', room.players);
  };
});

const PORT = process.env.PORT || 3001; // Render va nous donner un port spécial
server.listen(PORT, () => {
  console.log(`🚀 SERVEUR LANCÉ SUR LE PORT ${PORT}`);
});