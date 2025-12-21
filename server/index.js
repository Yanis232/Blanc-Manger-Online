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

let MASTER_BLACK_DECK = [];
let MASTER_WHITE_DECK = [];
const JOKER_CARD_TEXT = "🃏 JOKER (Écris ta connerie)";

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
  
  // ADMIN DASHBOARD (Code inchangé)
  socket.on('admin_fetch_cards', async () => { try { const allCards = await Card.find().sort({ createdAt: -1 }); socket.emit('admin_receive_cards', allCards); } catch (e) { console.error(e); } });
  socket.on('admin_add_card', async ({ text, type }) => { try { const newCard = new Card({ text, type }); await newCard.save(); if (type === 'black') MASTER_BLACK_DECK.push(text); else MASTER_WHITE_DECK.push(text); const allCards = await Card.find().sort({ createdAt: -1 }); socket.emit('admin_receive_cards', allCards); socket.emit('admin_action_success', "Carte ajoutée !"); } catch (e) { console.error(e); } });
  socket.on('admin_delete_card', async (cardId) => { try { const deletedCard = await Card.findByIdAndDelete(cardId); if (deletedCard) { if (deletedCard.type === 'black') MASTER_BLACK_DECK = MASTER_BLACK_DECK.filter(t => t !== deletedCard.text); else MASTER_WHITE_DECK = MASTER_WHITE_DECK.filter(t => t !== deletedCard.text); const allCards = await Card.find().sort({ createdAt: -1 }); socket.emit('admin_receive_cards', allCards); } } catch (e) { console.error(e); } });

  socket.on('create_room', (username) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    // Jokers
    const deckWithJokers = [...MASTER_WHITE_DECK, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT, JOKER_CARD_TEXT];
    
    rooms[roomId] = {
      players: [{ id: socket.id, username, score: 0, isHost: true, hand: [] }],
      gameState: 'LOBBY', 
      currentBlackCard: null,
      judgeId: null,
      playedCards: [],
      whiteDeck: shuffleDeck(deckWithJokers), 
      blackDeck: shuffleDeck(MASTER_BLACK_DECK),
      // 🔥 NOUVEAU : PARAMÈTRES PAR DÉFAUT
      settings: {
          scoreLimit: 10,      // Score pour gagner
          timerDuration: 45    // Temps en secondes (0 = infini)
      },
      timerInterval: null // Pour stocker le compte à rebours
    };

    socket.join(roomId);
    socket.emit('room_created', roomId);
    io.to(roomId).emit('update_players', rooms[roomId].players);
    // On envoie les settings initiaux
    socket.emit('settings_updated', rooms[roomId].settings);
  });

  // 🔥 NOUVEAU : MISE À JOUR DES PARAMÈTRES PAR L'HÔTE
  socket.on('update_settings', ({ roomId, settings }) => {
      const room = rooms[roomId];
      if (!room) return;
      // Seul l'hôte peut modifier
      if (room.players[0].id === socket.id) {
          room.settings = settings;
          io.to(roomId).emit('settings_updated', room.settings);
      }
  });

  socket.on("join_room", (data) => {
    const { roomId, username } = data;
    if (!rooms[roomId]) { socket.emit("error_join", "Salle inexistante !"); return; }
    if (rooms[roomId].players.some(p => p.username === username)) { socket.emit("error_join", "Pseudo déjà pris !"); return; }

    const newPlayer = { id: socket.id, username, score: 0, hand: [], isHost: false };
    rooms[roomId].players.push(newPlayer);
    socket.join(roomId);

    io.to(roomId).emit("update_players", rooms[roomId].players);
    // On envoie les settings au nouveau venu
    socket.emit('settings_updated', rooms[roomId].settings);

    if (rooms[roomId].gameState !== 'LOBBY') {
        socket.emit("game_started", { blackCard: rooms[roomId].currentBlackCard, judgeId: rooms[roomId].judgeId, players: rooms[roomId].players });
        socket.emit("start_voting", rooms[roomId].playedCards);
    }
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    startNewRound(roomId, room, room.players[0].id); 
  });

  socket.on('play_card', ({ roomId, cardText, originalText }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.playedCards.push({ playerId: socket.id, text: cardText });
    
    // Retrait de la main
    const textToRemove = originalText || cardText;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
        const cardIndex = player.hand.indexOf(textToRemove);
        if (cardIndex > -1) player.hand.splice(cardIndex, 1);
    }

    checkRoundEnd(roomId, room);
  });

  // Vérifie si tout le monde a joué
  const checkRoundEnd = (roomId, room) => {
      if (room.playedCards.length === room.players.length - 1) {
          // Tout le monde a joué, on arrête le chrono
          if (room.timerInterval) clearInterval(room.timerInterval);
          
          room.gameState = 'JUDGING';
          io.to(roomId).emit('timer_stop'); // On dit au front d'arrêter d'afficher le temps
          io.to(roomId).emit('start_voting', shuffleDeck(room.playedCards));
      }
  };

  // 🔥 FONCTION : FORCE LE JEU ALÉATOIRE (QUAND LE TEMPS EST ÉCOULÉ)
  const forceRandomPlay = (roomId, room) => {
      if (room.gameState !== 'PLAYING') return;

      const judgeId = room.judgeId;
      
      // On regarde chaque joueur qui n'est PAS juge
      room.players.forEach(player => {
          if (player.id !== judgeId) {
              // A-t-il déjà joué ?
              const hasPlayed = room.playedCards.some(c => c.playerId === player.id);
              
              if (!hasPlayed && player.hand.length > 0) {
                  // Il dort ! On prend une carte au hasard
                  const randomIndex = Math.floor(Math.random() * player.hand.length);
                  let randomCard = player.hand[randomIndex];
                  let originalText = null;

                  // Si le hasard tombe sur un Joker, on met un texte par défaut
                  if (randomCard === JOKER_CARD_TEXT) {
                      originalText = JOKER_CARD_TEXT;
                      randomCard = "🃏 JOKER (J'ai été trop lent...)";
                  }

                  // On joue pour lui
                  room.playedCards.push({ playerId: player.id, text: randomCard });
                  // On retire de sa main
                  player.hand.splice(randomIndex, 1);
                  
                  // On prévient le joueur qu'il a "joué" de force (pour mettre à jour son UI)
                  io.to(player.id).emit('force_played', { playedCard: randomCard, newHand: player.hand });
              }
          }
      });

      // Maintenant que tout le monde a "joué", on lance le vote
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

  socket.on('judge_vote', ({ roomId, winningCardText }) => {
    const room = rooms[roomId];
    if (!room) return;
    const winnerEntry = room.playedCards.find(c => c.text === winningCardText);
    const winnerId = winnerEntry ? winnerEntry.playerId : null;
    
    if (winnerId) {
      const winner = room.players.find(p => p.id === winnerId);
      if (winner) winner.score += 1;

      // 🔥 VÉRIFICATION DU SCORE MAX
      if (winner && winner.score >= room.settings.scoreLimit) {
          // VICTOIRE FINALE
          io.to(roomId).emit('game_over', { 
              winnerName: winner.username, 
              score: winner.score 
          });
          // On ne relance pas de round, on attend le reset manuel
      } else {
          // VICTOIRE DE MANCHE CLASSIQUE
          io.to(roomId).emit('round_winner', { winnerName: winner ? winner.username : "Inconnu", winningCard: winningCardText });
          setTimeout(() => { startNewRound(roomId, room, winnerId); }, 4000); 
      }
    }
  });

  const startNewRound = (roomId, room, newJudgeId) => {
    // Nettoyage ancien timer
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

    // 🔥 GESTION DU TIMER
    let timeLeft = room.settings.timerDuration;
    
    // Si le temps est > 0, on lance le compte à rebours
    if (timeLeft > 0) {
        io.to(roomId).emit('timer_update', timeLeft); // Init
        
        room.timerInterval = setInterval(() => {
            timeLeft--;
            io.to(roomId).emit('timer_update', timeLeft);
            
            if (timeLeft <= 0) {
                clearInterval(room.timerInterval);
                forceRandomPlay(roomId, room); // ⚠️ Temps écoulé !
            }
        }, 1000);
    } else {
        // Si timer = 0 (infini), on dit au front de cacher le chrono
        io.to(roomId).emit('timer_stop');
    }

    io.to(roomId).emit('game_started', { blackCard: room.currentBlackCard, judgeId: room.judgeId, players: room.players });
    io.to(roomId).emit('update_players', room.players);
  };
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log(`🚀 SERVEUR LANCÉ SUR LE PORT ${PORT}`); });