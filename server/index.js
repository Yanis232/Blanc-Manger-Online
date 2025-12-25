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

const OFFICIAL_PACKS = [
    { id: 'trash', name: '🔞 Trash', default: false },
    { id: 'soft', name: '🟢 Famille / Soft', default: true }
];

const BOT_NAMES = ["R2D2", "Terminator", "Wall-E", "ChatG Pété", "Optimus Prime", "Marvin", "Glados", "Cortana"];

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
                .filter(c => c.tags && c.tags.length > 0) // On garde seulement les cartes avec tags
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

// --- FONCTIONS DE JEU ---

function startNewRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.timerInterval) clearInterval(room.timerInterval);
    if (room.blackDeck.length === 0) { io.to(roomId).emit('game_over', { winnerName: "La Pioche (Vide)", score: 0 }); return; }
    
    room.gameState = 'PLAYING';
    room.playedCards = [];
    room.isPaused = false; 
    io.to(roomId).emit('game_paused_state', false);

    room.currentBlackCard = room.blackDeck.pop();
    if (!room.judgeId && room.players.length > 0) room.judgeId = room.players[0].id;

    room.players.forEach(player => {
        const cardsNeeded = 12 - player.hand.length;
        if (cardsNeeded > 0) {
            const drawnCards = room.whiteDeck.splice(0, cardsNeeded);
            player.hand.push(...drawnCards);
        }
    });
    
    let timeLeft = room.settings.timerDuration;
    if (timeLeft > 0) {
        io.to(roomId).emit('timer_update', timeLeft);
        room.timerInterval = setInterval(() => {
            if (room.isPaused) return; 

            timeLeft--;
            io.to(roomId).emit('timer_update', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(room.timerInterval);
                forceRandomPlay(roomId);
            }
        }, 1000);
    } else {
        io.to(roomId).emit('timer_stop');
    }

    io.to(roomId).emit('game_started', { blackCard: room.currentBlackCard, judgeId: room.judgeId, players: room.players });
    io.to(roomId).emit('update_players', room.players);

    handleBotPlays(roomId);
}

function checkRoundEnd(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const playersToPlay = room.players.filter(p => p.id !== room.judgeId).length;
    
    // On vérifie >= au cas où
    if (room.playedCards.length >= playersToPlay && playersToPlay > 0) {
        if (room.timerInterval) clearInterval(room.timerInterval);
        room.gameState = 'JUDGING';
        io.to(roomId).emit('timer_stop');
        io.to(roomId).emit('start_voting', shuffleDeck(room.playedCards));
        handleBotJudge(roomId);
    }
}

function forceRandomPlay(roomId) {
    const room = rooms[roomId];
    if (!room || room.gameState !== 'PLAYING') return;
    const judgeId = room.judgeId;
    const pickAmount = room.currentBlackCard.pick || 1;
    
    room.players.forEach(player => {
        if (player.id !== judgeId) {
            const hasPlayed = room.playedCards.some(c => c.playerId === player.id);
            // Si le joueur a des cartes et n'a pas joué
            if (!hasPlayed && player.hand.length >= pickAmount) {
                const selectedCards = [];
                for(let i=0; i<pickAmount; i++) {
                    let card = player.hand[0]; 
                    if (card === JOKER_CARD_TEXT) card = "🃏 JOKER (Trop lent...)";
                    selectedCards.push(card);
                    player.hand.splice(0, 1);
                }
                room.playedCards.push({ playerId: player.id, texts: selectedCards });
                if (!player.isBot) io.to(player.id).emit('force_played', { playedCards: selectedCards, newHand: player.hand });
            }
        }
    });
    checkRoundEnd(roomId);
}

function processVote(roomId, winningCardFirstText) {
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
            room.judgeId = winnerId;
            io.to(roomId).emit('round_winner', { winnerName: winner ? winner.username : "Inconnu", winningCards: winnerEntry.texts });
        }
    }
}

function handleBotPlays(roomId) {
    const room = rooms[roomId];
    if (!room || room.gameState !== 'PLAYING') return;
    const pickAmount = room.currentBlackCard.pick || 1;

    room.players.forEach(player => {
        if (player.isBot && player.id !== room.judgeId) {
            const hasPlayed = room.playedCards.some(c => c.playerId === player.id);
            if (!hasPlayed && player.hand.length >= pickAmount) {
                const delay = Math.random() * 5000 + 2000;
                setTimeout(() => {
                    if(room.gameState !== 'PLAYING' || room.isPaused) return;
                    const selectedCards = [];
                    for(let i=0; i<pickAmount; i++) {
                        const idx = Math.floor(Math.random() * player.hand.length);
                        selectedCards.push(player.hand[idx]);
                        player.hand.splice(idx, 1);
                    }
                    room.playedCards.push({ playerId: player.id, texts: selectedCards });
                    io.to(roomId).emit('update_players', room.players);
                    checkRoundEnd(roomId);
                }, delay);
            }
        }
    });
}

function handleBotJudge(roomId) {
    const room = rooms[roomId];
    if (!room || room.gameState !== 'JUDGING') return;
    const judge = room.players.find(p => p.id === room.judgeId);
    
    if (judge && judge.isBot) {
        setTimeout(() => {
            if (room.playedCards.length === 0) return;
            const randomWinnerIndex = Math.floor(Math.random() * room.playedCards.length);
            const winnerEntry = room.playedCards[randomWinnerIndex];
            processVote(roomId, winnerEntry.texts[0]);
        }, 15000); 
    }
}

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  socket.on('create_room', (username) => {
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    rooms[roomId] = {
      players: [{ id: socket.id, username, score: 0, isHost: true, hand: [], isBot: false }],
      gameState: 'LOBBY', currentBlackCard: { text: "En attente...", pick: 1 }, judgeId: null,
      playedCards: [], whiteDeck: [], blackDeck: [], customPacks: [],
      settings: { scoreLimit: 10, timerDuration: 45, packs: ['soft'] },
      timerInterval: null, isPaused: false
    };
    socket.join(roomId); 
    socket.emit('room_created', roomId); 
    io.to(roomId).emit('update_players', rooms[roomId].players); 
    socket.emit('settings_updated', rooms[roomId].settings);
  });

  socket.on('add_bot', (roomId) => {
      const room = rooms[roomId]; if (!room) return;
      const usedNames = room.players.map(p => p.username);
      const availableNames = BOT_NAMES.filter(n => !usedNames.includes(n));
      const botName = availableNames.length > 0 ? availableNames[Math.floor(Math.random() * availableNames.length)] : `Bot-${Math.floor(Math.random()*1000)}`;
      room.players.push({ id: `bot-${Date.now()}`, username: botName, score: 0, hand: [], isHost: false, isBot: true });
      io.to(roomId).emit('update_players', room.players);
  });

  socket.on('remove_bot', (roomId) => {
      const room = rooms[roomId]; if (!room) return;
      const lastBotIndex = room.players.map(p => p.isBot).lastIndexOf(true);
      if (lastBotIndex !== -1) { room.players.splice(lastBotIndex, 1); io.to(roomId).emit('update_players', room.players); }
  });

  socket.on('toggle_pause', (roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      room.isPaused = !room.isPaused;
      io.to(roomId).emit('game_paused_state', room.isPaused);
  });

  socket.on('start_game', (roomId) => {
    const room = rooms[roomId]; if (!room) return;
    const activeModes = room.settings.packs || ['soft'];

    let finalBlacks = [];
    let finalWhites = [];

    // 🔥 LOGIQUE MODIFIÉE : Si "main" (Classique) est actif, on prend TOUT.
    // Filtrer selon les tags sélectionnés (Trash et/ou Soft)
    finalBlacks = MASTER_BLACK_DECK.filter(c => c.tags.some(t => activeModes.includes(t)));
    finalWhites = MASTER_WHITE_DECK.filter(c => c.tags.some(t => activeModes.includes(t)));

    // Sécurité si les filtres sont trop restrictifs
    if (finalBlacks.length === 0) finalBlacks = MASTER_BLACK_DECK; 
    if (finalWhites.length === 0) finalWhites = MASTER_WHITE_DECK;

    const whiteTexts = finalWhites.map(c => c.text);
    // On ajoute environ 5% de Jokers
    const jokerCount = Math.max(5, Math.floor(whiteTexts.length * 0.05)); 
    const jokers = Array(jokerCount).fill(JOKER_CARD_TEXT);
    
    room.blackDeck = shuffleDeck(finalBlacks); 
    room.whiteDeck = shuffleDeck([...whiteTexts, ...jokers]);
    
    console.log(`🚀 Start ${roomId} | ${room.blackDeck.length} Q / ${room.whiteDeck.length} R`);
    startNewRound(roomId);
  });

  socket.on('play_card', ({ roomId, cardTexts, originalTexts }) => { 
      const room = rooms[roomId]; if (!room) return; 
      room.playedCards.push({ playerId: socket.id, texts: cardTexts }); 
      const player = room.players.find(p => p.id === socket.id); 
      if (player) { 
          const cardsToRemove = originalTexts || cardTexts; 
          cardsToRemove.forEach(txt => { const idx = player.hand.indexOf(txt); if (idx > -1) player.hand.splice(idx, 1); }); 
      } 
      checkRoundEnd(roomId); 
  });

  socket.on('judge_vote', ({ roomId, winningCardFirstText }) => { const room = rooms[roomId]; if (!room) return; processVote(roomId, winningCardFirstText); });
  socket.on('trigger_next_round', (roomId) => { const room = rooms[roomId]; if (!room) return; startNewRound(roomId); });
  socket.on('reset_game', (roomId) => { const room = rooms[roomId]; if (!room) return; if (room.timerInterval) clearInterval(room.timerInterval); room.gameState = 'LOBBY'; room.currentBlackCard = null; room.playedCards = []; room.judgeId = null; room.players.forEach(p => { p.score = 0; p.hand = []; }); io.to(roomId).emit('return_to_lobby', room.players); });
  socket.on('update_settings', ({ roomId, settings }) => { const room = rooms[roomId]; if (room) { room.settings = settings; io.to(roomId).emit('settings_updated', room.settings); } });
  
  socket.on("join_room", (data) => {
    const { roomId, username } = data; if (!rooms[roomId]) { socket.emit("error_join", "Salle inexistante !"); return; }
    const existingPlayer = rooms[roomId].players.find(p => p.username === username);
    
    // RECONNEXION
    if (existingPlayer) { 
        existingPlayer.id = socket.id; 
        socket.join(roomId); 
        io.to(roomId).emit("update_players", rooms[roomId].players); 
        socket.emit('settings_updated', rooms[roomId].settings); 
        socket.emit('game_paused_state', rooms[roomId].isPaused);
        if (rooms[roomId].gameState !== 'LOBBY') { 
            socket.emit("game_started", { blackCard: rooms[roomId].currentBlackCard, judgeId: rooms[roomId].judgeId, players: rooms[roomId].players }); 
            if (rooms[roomId].gameState === 'JUDGING') { socket.emit("start_voting", rooms[roomId].playedCards); } 
        } 
        return; 
    }

    // 🔥 FIX IMPORTANT : NOUVEAU JOUEUR REJOINT UNE PARTIE EN COURS
    const newPlayer = { id: socket.id, username, score: 0, hand: [], isHost: false, isBot: false }; 
    
    // Si la partie a déjà commencé, on lui donne des cartes TOUT DE SUITE !
    if (rooms[roomId].gameState !== 'LOBBY') {
        const cardsNeeded = 10;
        if (rooms[roomId].whiteDeck.length >= cardsNeeded) {
            newPlayer.hand = rooms[roomId].whiteDeck.splice(0, cardsNeeded);
        }
    }
    
    rooms[roomId].players.push(newPlayer); 
    socket.join(roomId); 
    io.to(roomId).emit("update_players", rooms[roomId].players); 
    socket.emit('settings_updated', rooms[roomId].settings); 
    
    if (rooms[roomId].gameState !== 'LOBBY') { 
        // On lui envoie l'état du jeu pour qu'il puisse jouer
        socket.emit("game_started", { blackCard: rooms[roomId].currentBlackCard, judgeId: rooms[roomId].judgeId, players: rooms[roomId].players }); 
        if (rooms[roomId].gameState === 'JUDGING') { socket.emit("start_voting", rooms[roomId].playedCards); } 
    }
  });

  socket.on('send_chat_message', ({ roomId, message }) => { const room = rooms[roomId]; if (!room) return; const player = room.players.find(p => p.id === socket.id); if (player) io.to(roomId).emit('receive_chat_message', { username: player.username, text: message }); });
  socket.on('kick_player', ({ roomId, playerId }) => { const room = rooms[roomId]; if (!room) return; room.players = room.players.filter(p => p.id !== playerId); io.to(playerId).emit('you_are_kicked'); io.to(roomId).emit('update_players', room.players); });
  
  socket.on('create_custom_pack', async ({ packId, packName, blackCards, whiteCards }) => { try { const finalPackId = packId || `PACK-${Math.random().toString(36).substring(2, 6).toUpperCase()}`; if (blackCards.length === 0 && whiteCards.length === 0) { socket.emit('error_msg', "Vide !"); return; } await Pack.findOneAndUpdate({ _id: finalPackId }, { name: packName, updatedAt: new Date() }, { upsert: true, new: true }); await Card.deleteMany({ pack: finalPackId }); const cardsToInsert = []; blackCards.forEach(item => { if(item.text.trim()) cardsToInsert.push({ text: item.text.trim(), type: 'black', pick: countHoles(item.text), pack: finalPackId, tags: item.tags || [] }); }); whiteCards.forEach(item => { if(item.text.trim()) cardsToInsert.push({ text: item.text.trim(), type: 'white', pick: 1, pack: finalPackId, tags: item.tags || [] }); }); await Card.insertMany(cardsToInsert); socket.emit('custom_pack_saved', { packId: finalPackId, packName, count: cardsToInsert.length, isUpdate: !!packId }); } catch (e) { socket.emit('error_msg', "Erreur save."); } });
  socket.on('fetch_pack_for_edit', async (packId) => { try { const packInfo = await Pack.findById(packId); if (!packInfo) { socket.emit('error_msg', "Code introuvable !"); return; } const cards = await Card.find({ pack: packId }); const blacks = cards.filter(c => c.type === 'black').map(c => ({ text: c.text, tags: c.tags || [] })); const whites = cards.filter(c => c.type === 'white').map(c => ({ text: c.text, tags: c.tags || [] })); socket.emit('pack_data_for_edit', { packId: packInfo._id, packName: packInfo.name, blackCards: blacks, whiteCards: whites }); } catch (e) { socket.emit('error_msg', "Erreur récup."); } });
  socket.on('load_custom_pack', async ({ roomId, packId }) => { const room = rooms[roomId]; if (!room) return; try { const packMeta = await Pack.findById(packId); const cards = await Card.find({ pack: packId }); if (cards.length === 0) { socket.emit('error_msg', "Paquet vide !"); return; } const blacks = cards.filter(c => c.type === 'black').map(c => ({ text: c.text, pick: c.pick, pack: packId, tags: c.tags || [] })); const whites = cards.filter(c => c.type === 'white').map(c => ({ text: c.text, pack: packId, tags: c.tags || [] })); const packName = packMeta ? `📦 ${packMeta.name}` : `📦 Pack ${packId}`; room.customPacks.push({ id: packId, name: packName, blackCards: blacks, whiteCards: whites }); const currentPacks = room.settings.packs || []; if (!currentPacks.includes(packId)) room.settings.packs = [...currentPacks, packId]; io.to(roomId).emit('settings_updated', room.settings); io.to(roomId).emit('notification', `${packName} chargé !`); } catch (e) {} });
  socket.on('search_existing_cards', async ({ query, type }) => { try { const filter = { pack: 'main' }; if (type && type !== 'all') filter.type = type; if (query && query.length > 0) filter.text = { $regex: query, $options: 'i' }; const results = await Card.find(filter).sort({ createdAt: -1 }).limit(50); socket.emit('search_results', results); } catch (e) {} });
  socket.on('admin_fetch_cards', async () => { try { const allCards = await Card.find().sort({ createdAt: -1 }).limit(200); socket.emit('admin_receive_cards', allCards); } catch (e) {} });
  socket.on('admin_fetch_packs', async () => { try { const packs = await Pack.find().sort({ updatedAt: -1 }); const packDetails = []; for (const p of packs) { const count = await Card.countDocuments({ pack: p._id }); packDetails.push({ id: p._id, name: p.name, count }); } socket.emit('admin_receive_packs', packDetails); } catch (e) {} });
  socket.on('admin_delete_pack', async (packId) => { try { await Card.deleteMany({ pack: packId }); await Pack.findByIdAndDelete(packId); socket.emit('admin_action_success', `Pack ${packId} supprimé.`); } catch (e) {} });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log(`🚀 SERVEUR LANCÉ SUR LE PORT ${PORT}`); });