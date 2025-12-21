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
  pick: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
});
const Card = mongoose.model('Card', CardSchema);

let MASTER_BLACK_DECK = [];
let MASTER_WHITE_DECK = [];
const JOKER_CARD_TEXT = "🃏 JOKER (Écris ta connerie)";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connecté à MongoDB Atlas');
    const blackCardsDB = await Card.find({ type: 'black' });
    const whiteCardsDB = await Card.find({ type: 'white' });
    MASTER_BLACK_DECK = blackCardsDB.map(c => ({ text: c.text, pick: c.pick || 1 }));
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

const countHoles = (text) => { return (text.match(/____/g) || []).length || 1; };

io.on('connection', (socket) => {
  
  // ADMIN
  socket.on('admin_fetch_cards', async () => { try { const allCards = await Card.find().sort({ createdAt: -1 }); socket.emit('admin_receive_cards', allCards); } catch (e) { console.error(e); } });
  socket.on('admin_add_card', async ({ text, type }) => { try { const pick = type === 'black' ? countHoles(text) : 1; const newCard = new Card({ text, type, pick }); await newCard.save(); if (type === 'black') MASTER_BLACK_DECK.push({ text, pick }); else MASTER_WHITE_DECK.push(text); const allCards = await Card.find().sort({ createdAt: -1 }); socket.emit('admin_receive_cards', allCards); socket.emit('admin_action_success', "Carte ajoutée !"); } catch (e) { console.error(e); } });
  socket.on('admin_delete_card', async (cardId) => { try { const deletedCard = await Card.findByIdAndDelete(cardId); if (deletedCard) { if (deletedCard.type === 'black') MASTER_BLACK_DECK = MASTER_BLACK_DECK.filter(c => c.text !== deletedCard.text); else MASTER_WHITE_DECK = MASTER_WHITE_DECK.filter(t => t !== deletedCard.text); const allCards = await Card.find().sort({ createdAt: -1 }); socket.emit('admin_receive_cards', allCards); } } catch (e) { console.error(e); } });

  // ROOM
  socket.on('create_room', (username) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const deckWithJokers = [...MASTER_WHITE_DECK, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT];
    
    rooms[roomId] = {
      players: [{ id: socket.id, username, score: 0, isHost: true, hand: [] }],
      gameState: 'LOBBY', 
      currentBlackCard: { text: "En attente...", pick: 1 }, 
      judgeId: null,
      playedCards: [],
      whiteDeck: shuffleDeck(deckWithJokers), 
      blackDeck: shuffleDeck(MASTER_BLACK_DECK),
      settings: { scoreLimit: 10, timerDuration: 45 },
      timerInterval: null
    };

    socket.join(roomId);
    socket.emit('room_created', roomId);
    io.to(roomId).emit('update_players', rooms[roomId].players);
    socket.emit('settings_updated', rooms[roomId].settings);
  });

  socket.on('update_settings', ({ roomId, settings }) => {
      const room = rooms[roomId];
      if (room && room.players[0].id === socket.id) { room.settings = settings; io.to(roomId).emit('settings_updated', room.settings); }
  });

  // 🔥 C'EST ICI QUE LA MAGIE DE LA RECONNEXION OPÈRE 🔥
  socket.on("join_room", (data) => {
    const { roomId, username } = data;
    if (!rooms[roomId]) { socket.emit("error_join", "Salle inexistante !"); return; }
    
    // On cherche si le joueur existe déjà
    const existingPlayer = rooms[roomId].players.find(p => p.username === username);

    if (existingPlayer) {
        // --- CAS RECONNEXION ---
        console.log(`♻️ RECONNEXION de ${username} dans la salle ${roomId}`);
        
        // 1. On met à jour son socket ID (car c'est une nouvelle connexion technique)
        existingPlayer.id = socket.id;
        socket.join(roomId);

        // 2. On prévient tout le monde (pour mettre à jour l'icone hote par exemple)
        io.to(roomId).emit("update_players", rooms[roomId].players);
        socket.emit('settings_updated', rooms[roomId].settings);

        // 3. S'il revient en plein milieu d'une partie, on lui renvoie TOUT
        if (rooms[roomId].gameState !== 'LOBBY') {
            socket.emit("game_started", { 
                blackCard: rooms[roomId].currentBlackCard, 
                judgeId: rooms[roomId].judgeId, 
                players: rooms[roomId].players // Sa main est dedans, il la retrouvera !
            });
            
            // Si on était en phase de vote, on lui renvoie aussi les cartes sur la table
            if (rooms[roomId].gameState === 'JUDGING') {
                socket.emit("start_voting", rooms[roomId].playedCards);
            }
        }
        return; // On arrête là, pas besoin de créer un nouveau joueur
    }

    // --- CAS NOUVEAU JOUEUR ---
    const newPlayer = { id: socket.id, username, score: 0, hand: [], isHost: false };
    rooms[roomId].players.push(newPlayer);
    socket.join(roomId);

    io.to(roomId).emit("update_players", rooms[roomId].players);
    socket.emit('settings_updated', rooms[roomId].settings);

    if (rooms[roomId].gameState !== 'LOBBY') {
        socket.emit("game_started", { blackCard: rooms[roomId].currentBlackCard, judgeId: rooms[roomId].judgeId, players: rooms[roomId].players });
        if (rooms[roomId].gameState === 'JUDGING') {
            socket.emit("start_voting", rooms[roomId].playedCards);
        }
    }
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    startNewRound(roomId, room, room.players[0].id); 
  });
  
  socket.on('trigger_next_round', (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      const nextJudgeId = room.nextJudgeId || room.players[0].id;
      startNewRound(roomId, room, nextJudgeId);
  });

  socket.on('play_card', ({ roomId, cardTexts, originalTexts }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.playedCards.push({ playerId: socket.id, texts: cardTexts });
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
        const cardsToRemove = originalTexts || cardTexts;
        cardsToRemove.forEach(txt => {
            const idx = player.hand.indexOf(txt);
            if (idx > -1) player.hand.splice(idx, 1);
        });
    }

    checkRoundEnd(roomId, room);
  });

  const checkRoundEnd = (roomId, room) => {
      if (room.playedCards.length === room.players.length - 1) {
          if (room.timerInterval) clearInterval(room.timerInterval);
          room.gameState = 'JUDGING';
          io.to(roomId).emit('timer_stop');
          io.to(roomId).emit('start_voting', shuffleDeck(room.playedCards));
      }
  };

  const forceRandomPlay = (roomId, room) => {
      if (room.gameState !== 'PLAYING') return;
      const judgeId = room.judgeId;
      const pickAmount = room.currentBlackCard.pick || 1;

      room.players.forEach(player => {
          if (player.id !== judgeId) {
              const hasPlayed = room.playedCards.some(c => c.playerId === player.id);
              if (!hasPlayed && player.hand.length >= pickAmount) {
                  const selectedCards = [];
                  for(let i=0; i<pickAmount; i++) {
                      let card = player.hand[0]; 
                      if (card === JOKER_CARD_TEXT) card = "🃏 JOKER (Trop lent...)";
                      selectedCards.push(card);
                      player.hand.splice(0, 1);
                  }
                  room.playedCards.push({ playerId: player.id, texts: selectedCards });
                  io.to(player.id).emit('force_played', { playedCards: selectedCards, newHand: player.hand });
              }
          }
      });
      checkRoundEnd(roomId, room);
  };

  socket.on('reset_game', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.timerInterval) clearInterval(room.timerInterval);
    const deckWithJokers = [...MASTER_WHITE_DECK, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT];
    room.whiteDeck = shuffleDeck(deckWithJokers);
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

  socket.on('judge_vote', ({ roomId, winningCardFirstText }) => {
    const room = rooms[roomId];
    if (!room) return;
    const winnerEntry = room.playedCards.find(c => c.texts[0] === winningCardFirstText);
    const winnerId = winnerEntry ? winnerEntry.playerId : null;
    
    if (winnerId) {
      const winner = room.players.find(p => p.id === winnerId);
      if (winner) winner.score += 1;
      
      if (winner && winner.score >= room.settings.scoreLimit) {
          io.to(roomId).emit('game_over', { winnerName: winner.username, score: winner.score });
      } else {
          room.nextJudgeId = winnerId;
          io.to(roomId).emit('round_winner', { 
              winnerName: winner ? winner.username : "Inconnu", 
              winningCards: winnerEntry.texts 
          });
      }
    }
  });

  const startNewRound = (roomId, room, newJudgeId) => {
    if (room.timerInterval) clearInterval(room.timerInterval);
    if (room.blackDeck.length === 0) room.blackDeck = shuffleDeck(MASTER_BLACK_DECK);
    
    room.gameState = 'PLAYING';
    room.playedCards = [];
    room.currentBlackCard = room.blackDeck.pop();
    room.judgeId = newJudgeId;

    room.players.forEach(player => {
      const cardsNeeded = 10 - player.hand.length;
      if (cardsNeeded > 0) {
          if (room.whiteDeck.length < cardsNeeded) room.whiteDeck = shuffleDeck([...MASTER_WHITE_DECK, JOKER_CARD_TEXT, JOKER_CARD_TEXT]);
          const drawnCards = room.whiteDeck.splice(0, cardsNeeded);
          player.hand.push(...drawnCards);
      }
    });

    let timeLeft = room.settings.timerDuration;
    if (timeLeft > 0) {
        io.to(roomId).emit('timer_update', timeLeft);
        room.timerInterval = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('timer_update', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(room.timerInterval);
                forceRandomPlay(roomId, room);
            }
        }, 1000);
    } else {
        io.to(roomId).emit('timer_stop');
    }

    io.to(roomId).emit('game_started', { blackCard: room.currentBlackCard, judgeId: room.judgeId, players: room.players });
    io.to(roomId).emit('update_players', room.players);
  };
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log(`🚀 SERVEUR LANCÉ SUR LE PORT ${PORT}`); });