require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI;

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const FORCE_DB_RESET = false;

// Noms pour les robots
const BOT_NAMES = ["R2D2", "Terminator", "Wall-E", "ChatG Pété", "Hal 9000", "Bender", "Optimus Prime", "Marvin", "Glados", "Cortana"];

const OFFICIAL_PACKS = [
    { id: 'main', name: '🍷 Classique', default: true },
    { id: 'trash', name: '🔞 Trash', default: false },
    { id: 'soft', name: '🟢 Famille / Soft', default: false }
];

const PackSchema = new mongoose.Schema({ _id: String, name: String, updatedAt: { type: Date, default: Date.now } });
const Pack = mongoose.model('Pack', PackSchema);

const CardSchema = new mongoose.Schema({
  text: String,
  type: { type: String, enum: ['black', 'white'] },
  pick: { type: Number, default: 1 },
  pack: { type: String, default: 'main' },
  tags: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});
CardSchema.index({ pack: 1 });
const Card = mongoose.model('Card', CardSchema);

const rooms = {}; 
let MASTER_BLACK_DECK = [];
let MASTER_WHITE_DECK = [];
const JOKER_CARD_TEXT = "🃏 JOKER (Écris ta connerie)";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connecté à MongoDB Atlas');
    
    if (FORCE_DB_RESET) {
        console.log('🧹 MISE À JOUR DE LA BDD...');
        try {
            const rawData = fs.readFileSync(path.join(__dirname, 'cards.json'));
            const cardsData = JSON.parse(rawData);
            await Card.deleteMany({ pack: 'main' }); 
            const processedCards = cardsData
                .filter(c => { const tags = c.tags || []; return !tags.includes('geek') && !tags.includes('politic'); })
                .map(c => ({ text: c.text, type: c.type, pick: c.pick || 1, pack: 'main', tags: c.tags && c.tags.length > 0 ? c.tags : ['soft'] }));
            await Card.insertMany(processedCards);
            console.log(`✅ ${processedCards.length} CARTES CHARGÉES !`);
        } catch (e) { console.error("❌ ERREUR JSON:", e.message); }
    }

    const blackCardsDB = await Card.find({ type: 'black', pack: 'main' });
    const whiteCardsDB = await Card.find({ type: 'white', pack: 'main' });

    MASTER_BLACK_DECK = blackCardsDB.map(c => ({ text: c.text, pick: c.pick || 1, pack: c.pack, tags: c.tags || [] }));
    MASTER_WHITE_DECK = whiteCardsDB.map(c => ({ text: c.text, pack: c.pack, tags: c.tags || [] }));

    console.log(`🃏 MASTER CHARGÉ : ${MASTER_BLACK_DECK.length} Noires / ${MASTER_WHITE_DECK.length} Blanches`);
  })
  .catch(err => console.error("❌ Erreur MongoDB:", err));

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
  
  // --- GESTION DES BOTS ---
  socket.on('add_bot', (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      
      // Trouver un nom pas encore utilisé
      const usedNames = room.players.map(p => p.username);
      const availableNames = BOT_NAMES.filter(n => !usedNames.includes(n));
      const botName = availableNames.length > 0 ? availableNames[Math.floor(Math.random() * availableNames.length)] : `Bot-${Math.floor(Math.random()*1000)}`;
      
      const botId = `bot-${Date.now()}`;
      
      room.players.push({
          id: botId,
          username: botName,
          score: 0,
          hand: [],
          isHost: false,
          isBot: true // 🔥 Marqueur important
      });

      io.to(roomId).emit('update_players', room.players);
  });

  socket.on('remove_bot', (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      
      // On retire le dernier bot ajouté
      const lastBotIndex = room.players.map(p => p.isBot).lastIndexOf(true);
      if (lastBotIndex !== -1) {
          room.players.splice(lastBotIndex, 1);
          io.to(roomId).emit('update_players', room.players);
      }
  });

  // FONCTION : FAIRE JOUER LES BOTS
  const handleBotPlays = (roomId, room) => {
      if (room.gameState !== 'PLAYING') return;

      const pickAmount = room.currentBlackCard.pick || 1;
      const judgeId = room.judgeId;

      room.players.forEach(player => {
          if (player.isBot && player.id !== judgeId) {
              // Vérifier si le bot a déjà joué ce tour
              const hasPlayed = room.playedCards.some(c => c.playerId === player.id);
              if (!hasPlayed && player.hand.length >= pickAmount) {
                  
                  // Simulation de délai de réflexion (entre 2 et 8 secondes)
                  const delay = Math.random() * 6000 + 2000;
                  
                  setTimeout(() => {
                      // Vérif si le round est toujours en cours
                      if(room.gameState !== 'PLAYING') return;

                      const selectedCards = [];
                      // Le bot choisit des cartes au hasard dans sa main
                      for(let i=0; i<pickAmount; i++) {
                          const randomIndex = Math.floor(Math.random() * player.hand.length);
                          selectedCards.push(player.hand[randomIndex]);
                          player.hand.splice(randomIndex, 1); // Retire de la main
                      }

                      room.playedCards.push({ playerId: player.id, texts: selectedCards });
                      // Pas besoin d'emit force_played car c'est un bot, mais on check la fin du tour
                      io.to(roomId).emit('update_players', room.players); // Pour que l'admin voie que le bot a joué (optionnel si UI le gère)
                      checkRoundEnd(roomId, room);

                  }, delay);
              }
          }
      });
  };

  // FONCTION : FAIRE VOTER LE JUGE BOT
  const handleBotJudge = (roomId, room) => {
      if (room.gameState !== 'JUDGING') return;
      
      const judge = room.players.find(p => p.id === room.judgeId);
      if (judge && judge.isBot) {
          // Le bot juge réfléchit un peu (5 secondes)
          setTimeout(() => {
              if (room.playedCards.length === 0) return;
              
              // Choix purement aléatoire (c'est souvent le plus drôle avec les bots)
              const randomWinnerIndex = Math.floor(Math.random() * room.playedCards.length);
              const winnerEntry = room.playedCards[randomWinnerIndex];
              
              // On simule l'event de vote
              processVote(roomId, room, winnerEntry.texts[0]);
          }, 5000);
      }
  };

  // --- LOGIQUE STANDARD ---

  socket.on('create_custom_pack', async ({ packId, packName, blackCards, whiteCards }) => {
      try {
          const finalPackId = packId || `PACK-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          if (blackCards.length === 0 && whiteCards.length === 0) { socket.emit('error_msg', "Vide !"); return; }
          await Pack.findOneAndUpdate({ _id: finalPackId }, { name: packName, updatedAt: new Date() }, { upsert: true, new: true });
          await Card.deleteMany({ pack: finalPackId });
          const cardsToInsert = [];
          blackCards.forEach(item => { if(item.text.trim()) cardsToInsert.push({ text: item.text.trim(), type: 'black', pick: countHoles(item.text), pack: finalPackId, tags: item.tags || [] }); });
          whiteCards.forEach(item => { if(item.text.trim()) cardsToInsert.push({ text: item.text.trim(), type: 'white', pick: 1, pack: finalPackId, tags: item.tags || [] }); });
          await Card.insertMany(cardsToInsert);
          socket.emit('custom_pack_saved', { packId: finalPackId, packName, count: cardsToInsert.length, isUpdate: !!packId });
      } catch (e) { socket.emit('error_msg', "Erreur save."); }
  });

  socket.on('fetch_pack_for_edit', async (packId) => {
      try {
          const packInfo = await Pack.findById(packId);
          if (!packInfo) { socket.emit('error_msg', "Code introuvable !"); return; }
          const cards = await Card.find({ pack: packId });
          const blacks = cards.filter(c => c.type === 'black').map(c => ({ text: c.text, tags: c.tags || [] }));
          const whites = cards.filter(c => c.type === 'white').map(c => ({ text: c.text, tags: c.tags || [] }));
          socket.emit('pack_data_for_edit', { packId: packInfo._id, packName: packInfo.name, blackCards: blacks, whiteCards: whites });
      } catch (e) { socket.emit('error_msg', "Erreur récup."); }
  });

  socket.on('search_existing_cards', async ({ query, type }) => {
      try {
          const filter = { pack: 'main' }; 
          if (type && type !== 'all') filter.type = type;
          if (query && query.length > 0) filter.text = { $regex: query, $options: 'i' };
          const results = await Card.find(filter).sort({ createdAt: -1 }).limit(50);
          socket.emit('search_results', results);
      } catch (e) {}
  });

  socket.on('load_custom_pack', async ({ roomId, packId }) => {
      const room = rooms[roomId]; if (!room) return;
      try {
          const packMeta = await Pack.findById(packId);
          const cards = await Card.find({ pack: packId });
          if (cards.length === 0) { socket.emit('error_msg', "Paquet vide !"); return; }
          const blacks = cards.filter(c => c.type === 'black').map(c => ({ text: c.text, pick: c.pick, pack: packId, tags: c.tags || [] }));
          const whites = cards.filter(c => c.type === 'white').map(c => ({ text: c.text, pack: packId, tags: c.tags || [] }));
          const packName = packMeta ? `📦 ${packMeta.name}` : `📦 Pack ${packId}`;
          room.customPacks.push({ id: packId, name: packName, blackCards: blacks, whiteCards: whites });
          const currentPacks = room.settings.packs || [];
          if (!currentPacks.includes(packId)) room.settings.packs = [...currentPacks, packId];
          io.to(roomId).emit('settings_updated', room.settings);
          io.to(roomId).emit('notification', `${packName} chargé !`);
      } catch (e) {}
  });

  socket.on('admin_fetch_cards', async () => { try { const allCards = await Card.find().sort({ createdAt: -1 }).limit(200); socket.emit('admin_receive_cards', allCards); } catch (e) {} });
  socket.on('admin_fetch_packs', async () => { try { const packs = await Pack.find().sort({ updatedAt: -1 }); const packDetails = []; for (const p of packs) { const count = await Card.countDocuments({ pack: p._id }); packDetails.push({ id: p._id, name: p.name, count }); } socket.emit('admin_receive_packs', packDetails); } catch (e) {} });
  socket.on('admin_delete_pack', async (packId) => { try { await Card.deleteMany({ pack: packId }); await Pack.findByIdAndDelete(packId); socket.emit('admin_action_success', `Pack ${packId} supprimé.`); } catch (e) {} });

  socket.on('create_room', (username) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const defaultModes = ['soft']; 
    rooms[roomId] = {
      players: [{ id: socket.id, username, score: 0, isHost: true, hand: [] }],
      gameState: 'LOBBY', currentBlackCard: { text: "En attente...", pick: 1 }, judgeId: null,
      playedCards: [], whiteDeck: [], blackDeck: [], customPacks: [],
      settings: { scoreLimit: 10, timerDuration: 45, packs: defaultModes },
      timerInterval: null, nextJudgeId: null
    };
    socket.join(roomId); socket.emit('room_created', roomId); io.to(roomId).emit('update_players', rooms[roomId].players); socket.emit('settings_updated', rooms[roomId].settings);
  });

  socket.on('update_settings', ({ roomId, settings }) => { const room = rooms[roomId]; if (room && room.players[0].id === socket.id) { room.settings = settings; io.to(roomId).emit('settings_updated', room.settings); } });
  socket.on("join_room", (data) => {
    const { roomId, username } = data; if (!rooms[roomId]) { socket.emit("error_join", "Salle inexistante !"); return; }
    const existingPlayer = rooms[roomId].players.find(p => p.username === username);
    if (existingPlayer) { existingPlayer.id = socket.id; socket.join(roomId); io.to(roomId).emit("update_players", rooms[roomId].players); socket.emit('settings_updated', rooms[roomId].settings); if (rooms[roomId].gameState !== 'LOBBY') { socket.emit("game_started", { blackCard: rooms[roomId].currentBlackCard, judgeId: rooms[roomId].judgeId, players: rooms[roomId].players }); if (rooms[roomId].gameState === 'JUDGING') { socket.emit("start_voting", rooms[roomId].playedCards); } } return; }
    const newPlayer = { id: socket.id, username, score: 0, hand: [], isHost: false }; rooms[roomId].players.push(newPlayer); socket.join(roomId); io.to(roomId).emit("update_players", rooms[roomId].players); socket.emit('settings_updated', rooms[roomId].settings); if (rooms[roomId].gameState !== 'LOBBY') { socket.emit("game_started", { blackCard: rooms[roomId].currentBlackCard, judgeId: rooms[roomId].judgeId, players: rooms[roomId].players }); if (rooms[roomId].gameState === 'JUDGING') { socket.emit("start_voting", rooms[roomId].playedCards); } }
  });
  socket.on('send_chat_message', ({ roomId, message }) => { const room = rooms[roomId]; if (!room) return; const player = room.players.find(p => p.id === socket.id); if (player) io.to(roomId).emit('receive_chat_message', { username: player.username, text: message }); });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId]; if (!room) return;
    const activeModes = room.settings.packs || ['soft'];
    let finalBlacks = MASTER_BLACK_DECK.filter(c => c.tags.some(t => activeModes.includes(t)));
    let finalWhites = MASTER_WHITE_DECK.filter(c => c.tags.some(t => activeModes.includes(t)));
    if (room.customPacks && room.customPacks.length > 0) {
        room.customPacks.forEach(customPack => {
            if (activeModes.includes(customPack.id)) {
                finalBlacks = [...finalBlacks, ...customPack.blackCards];
                finalWhites = [...finalWhites, ...customPack.whiteCards];
            }
        });
    }
    if (finalBlacks.length === 0) finalBlacks = MASTER_BLACK_DECK; 
    if (finalWhites.length === 0) finalWhites = MASTER_WHITE_DECK;
    const whiteTexts = finalWhites.map(c => c.text);
    const jokerCount = Math.max(5, Math.floor(whiteTexts.length * 0.05)); 
    const jokers = Array(jokerCount).fill(JOKER_CARD_TEXT);
    const deckWithJokers = [...whiteTexts, ...jokers];
    room.blackDeck = shuffleDeck(finalBlacks); room.whiteDeck = shuffleDeck(deckWithJokers);
    console.log(`🚀 Start ${roomId} | Modes: ${activeModes.join(', ')} | ${room.blackDeck.length} Q / ${room.whiteDeck.length} R`);
    startNewRound(roomId, room, room.players[0].id); 
  });
  
  socket.on('trigger_next_round', (roomId) => { const room = rooms[roomId]; if (!room) return; const nextJudgeId = room.nextJudgeId || room.players[0].id; startNewRound(roomId, room, nextJudgeId); });
  
  socket.on('play_card', ({ roomId, cardTexts, originalTexts }) => { 
      const room = rooms[roomId]; if (!room) return; 
      room.playedCards.push({ playerId: socket.id, texts: cardTexts }); 
      const player = room.players.find(p => p.id === socket.id); 
      if (player) { 
          const cardsToRemove = originalTexts || cardTexts; 
          cardsToRemove.forEach(txt => { const idx = player.hand.indexOf(txt); if (idx > -1) player.hand.splice(idx, 1); }); 
      } 
      checkRoundEnd(roomId, room); 
  });

  const checkRoundEnd = (roomId, room) => {
      // On compte les joueurs actifs (pas le Juge)
      const playersToPlay = room.players.filter(p => p.id !== room.judgeId).length;
      
      if (room.playedCards.length === playersToPlay) {
          if (room.timerInterval) clearInterval(room.timerInterval);
          room.gameState = 'JUDGING';
          io.to(roomId).emit('timer_stop');
          io.to(roomId).emit('start_voting', shuffleDeck(room.playedCards));
          
          // 🔥 Si le Juge est un BOT, on déclenche son vote
          handleBotJudge(roomId, room);
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
                  // Si c'est un humain, on le notifie
                  if (!player.isBot) io.to(player.id).emit('force_played', { playedCards: selectedCards, newHand: player.hand });
              }
          }
      });
      checkRoundEnd(roomId, room);
  };

  socket.on('reset_game', (roomId) => { const room = rooms[roomId]; if (!room) return; if (room.timerInterval) clearInterval(room.timerInterval); room.gameState = 'LOBBY'; room.currentBlackCard = null; room.playedCards = []; room.judgeId = null; room.players.forEach(p => { p.score = 0; p.hand = []; }); io.to(roomId).emit('return_to_lobby', room.players); });
  socket.on('kick_player', ({ roomId, playerId }) => { const room = rooms[roomId]; if (!room) return; room.players = room.players.filter(p => p.id !== playerId); io.to(playerId).emit('you_are_kicked'); io.to(roomId).emit('update_players', room.players); });
  
  socket.on('judge_vote', ({ roomId, winningCardFirstText }) => { 
      const room = rooms[roomId]; if (!room) return; 
      processVote(roomId, room, winningCardFirstText);
  });

  // Fonction extraite pour que le Bot puisse l'utiliser aussi
  const processVote = (roomId, room, winningCardFirstText) => {
      const winnerEntry = room.playedCards.find(c => c.texts[0] === winningCardFirstText);
      const winnerId = winnerEntry ? winnerEntry.playerId : null;
      if (winnerId) {
          const winner = room.players.find(p => p.id === winnerId);
          if (winner) winner.score += 1;
          if (winner && winner.score >= room.settings.scoreLimit) {
              io.to(roomId).emit('game_over', { winnerName: winner.username, score: winner.score });
          } else {
              room.nextJudgeId = winnerId;
              io.to(roomId).emit('round_winner', { winnerName: winner ? winner.username : "Inconnu", winningCards: winnerEntry.texts });
          }
      }
  };
  
  const startNewRound = (roomId, room, newJudgeId) => {
      if (room.timerInterval) clearInterval(room.timerInterval);
      if (room.blackDeck.length === 0) { io.to(roomId).emit('game_over', { winnerName: "La Pioche (Vide)", score: 0 }); return; }
      room.gameState = 'PLAYING';
      room.playedCards = [];
      room.currentBlackCard = room.blackDeck.pop();
      room.judgeId = newJudgeId;
      
      room.players.forEach(player => {
          const cardsNeeded = 10 - player.hand.length;
          if (cardsNeeded > 0) {
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

      // 🔥 LES BOTS JOUENT ICI
      handleBotPlays(roomId, room);
  };
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log(`🚀 SERVEUR LANCÉ SUR LE PORT ${PORT}`); });