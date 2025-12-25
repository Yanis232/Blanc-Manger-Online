import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL);

const JOKER_TEXT = "🃏 JOKER (Écris ta connerie)";

const OFFICIAL_PACKS = [
    { id: 'trash', name: '🔞 Trash' },
    { id: 'soft', name: '🟢 Famille / Soft' },
    { id: 'custom', name: '✨ Personnalisé / Import' }
];

const AVAILABLE_TAGS = [
    { id: 'trash', emoji: '🔞', label: 'Trash' },
    { id: 'soft', emoji: '🟢', label: 'Soft' }
];

const playSound = (soundName) => {
    const audio = new Audio(`/sounds/${soundName}`);
    audio.volume = 0.4;
    audio.play().catch(e => console.log("Son bloqué"));
};

const speak = (text) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    const voices = window.speechSynthesis.getVoices();
    const googleVoice = voices.find(v => v.name.includes("Google") && v.lang.includes("fr"));
    if (googleVoice) utterance.voice = googleVoice;
    utterance.pitch = 1.8; utterance.rate = 1.1;  
    window.speechSynthesis.speak(utterance);
};

// --- COMPOSANTS UI ---
const ChatOverlay = ({ isOpen, setIsOpen, unreadCount, messages, username, chatInput, setChatInput, onSend, chatRef }) => {
    return (
        <>
            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setIsOpen(!isOpen)} className="fixed bottom-24 right-4 md:bottom-4 md:right-4 bg-blue-600 hover:bg-blue-500 text-white p-3 md:p-4 rounded-full shadow-2xl z-[100]">💬 {unreadCount > 0 && (<span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center border-2 border-gray-900 animate-pulse">{unreadCount}</span>)}</motion.button>
            <AnimatePresence>
            {isOpen && (
                <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.9 }} className="fixed bottom-36 right-4 left-4 md:left-auto md:bottom-20 md:right-4 md:w-80 h-64 md:h-96 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl flex flex-col z-[100] overflow-hidden">
                    <div className="bg-gray-700 p-3 font-bold border-b border-gray-600 flex justify-between items-center"><span>Tchat</span><button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">✕</button></div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-900/50">
                        {messages.length === 0 && <p className="text-gray-500 text-center text-sm italic mt-4">La salle est calme...</p>}
                        {messages.map((msg, idx) => (<motion.div initial={{ opacity: 0, x: msg.username === username ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} key={idx} className={`text-sm ${msg.username === username ? 'text-right' : 'text-left'}`}><span className="block text-xs text-gray-400 mb-0.5">{msg.username}</span><span className={`inline-block px-3 py-1.5 rounded-lg ${msg.username === username ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>{msg.text}</span></motion.div>))}
                        <div ref={chatRef} />
                    </div>
                    <form onSubmit={onSend} className="p-2 bg-gray-800 border-t border-gray-600 flex gap-2"><input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="..." className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" autoFocus /><button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm font-bold">Env.</button></form>
                </motion.div>
            )}
            </AnimatePresence>
        </>
    );
};

const CardBrowserModal = ({ isOpen, onClose, onImport, searchResults, onSearch }) => {
    const [activeTab, setActiveTab] = useState('black'); const [query, setQuery] = useState(""); const [selectedCards, setSelectedCards] = useState([]);
    useEffect(() => { if (isOpen) { onSearch("", activeTab); setQuery(""); } }, [isOpen, activeTab]);
    const handleTyping = (e) => { setQuery(e.target.value); onSearch(e.target.value, activeTab); };
    const toggleCard = (card) => { if (selectedCards.some(c => c._id === card._id)) { setSelectedCards(prev => prev.filter(c => c._id !== card._id)); } else { setSelectedCards(prev => [...prev, card]); } };
    const handleImport = () => { onImport(selectedCards, activeTab); setSelectedCards([]); onClose(); };
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-2 md:p-4 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-gray-800 w-full max-w-4xl h-[90vh] md:h-[80vh] rounded-xl shadow-2xl border border-gray-600 flex flex-col overflow-hidden">
                <div className="p-3 md:p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center"><h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">🔍 Explorateur</h2><button onClick={onClose} className="text-gray-400 hover:text-white text-xl font-bold">✕</button></div>
                <div className="p-3 md:p-4 bg-gray-800 border-b border-gray-700 flex flex-col md:flex-row gap-4"><div className="flex bg-gray-900 rounded p-1"><button onClick={() => { setActiveTab('black'); setSelectedCards([]); }} className={`flex-1 md:flex-none px-4 py-2 rounded text-sm font-bold transition ${activeTab === 'black' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>Questions</button><button onClick={() => { setActiveTab('white'); setSelectedCards([]); }} className={`flex-1 md:flex-none px-4 py-2 rounded text-sm font-bold transition ${activeTab === 'white' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}>Réponses</button></div><input className="flex-1 bg-gray-900 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" placeholder="Filtrer..." value={query} onChange={handleTyping} /></div>
                <div className="flex-1 overflow-y-auto p-2 md:p-4 bg-gray-900/50"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">{searchResults.map((card) => { const isSelected = selectedCards.some(c => c._id === card._id); return (<div key={card._id} onClick={() => toggleCard(card)} className={`p-3 md:p-4 rounded cursor-pointer border-2 transition relative ${isSelected ? 'bg-blue-900/40 border-blue-500' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}>{isSelected && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">✓</div>}<p className={`text-sm font-medium ${card.type === 'black' ? 'text-white' : 'text-gray-300'}`}>{card.text}</p></div>); })}</div></div>
                <div className="p-3 md:p-4 bg-gray-900 border-t border-gray-700 flex justify-between items-center"><span className="text-gray-400 text-sm">{selectedCards.length} sel.</span><button onClick={handleImport} disabled={selectedCards.length === 0} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 md:px-6 md:py-3 rounded font-bold transition shadow-lg text-sm md:text-base">IMPORTER</button></div>
            </motion.div>
        </div>
    );
};

function App() {
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isInRoom, setIsInRoom] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [players, setPlayers] = useState([]);
  const [myHand, setMyHand] = useState([]);
  const [blackCard, setBlackCard] = useState({ text: "", pick: 1 });
  const [judgeId, setJudgeId] = useState("");
  const [localIsHost, setLocalIsHost] = useState(false); 
  const [hasPlayed, setHasPlayed] = useState(false);
  const [gameState, setGameState] = useState('LOBBY'); 
  const [tableCards, setTableCards] = useState([]); 
  const [winnerInfo, setWinnerInfo] = useState(null); 
  const [grandWinner, setGrandWinner] = useState(null); 
  const [roomSettings, setRoomSettings] = useState({ scoreLimit: 10, timerDuration: 45, packs: ['soft'] });
  const [timer, setTimer] = useState(null);
  
  // 🔥 ETAT PAUSE
  const [isPaused, setIsPaused] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatEndRef = useRef(null);

  const [selectedCards, setSelectedCards] = useState([]); 
  const [showJokerModal, setShowJokerModal] = useState(false);
  const [jokerInput, setJokerInput] = useState("");
  const [importPackCode, setImportPackCode] = useState("");
  const [showCreator, setShowCreator] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [newPackName, setNewPackName] = useState("");
  const [createdPackCode, setCreatedPackCode] = useState(null);
  const [editPackId, setEditPackId] = useState("");
  const [loadingPack, setLoadingPack] = useState(false);
  const [blackCardsList, setBlackCardsList] = useState([]);
  const [whiteCardsList, setWhiteCardsList] = useState([]);
  const [inputBlack, setInputBlack] = useState("");
  const [inputWhite, setInputWhite] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdmin, setShowAdmin] = useState(false); 
  const [adminCards, setAdminCards] = useState([]); 
  const [adminPacks, setAdminPacks] = useState([]); 
  const [adminNewText, setAdminNewText] = useState(""); 
  const [adminNewType, setAdminNewType] = useState("white"); 

  useEffect(() => {
    // 🔥 RECONNEXION INTELLIGENTE (Fix pour le clic bloqué)
    socket.on('connect', () => {
        console.log("Connecté ! Vérification de la session...");
        if (roomCode && username) {
            console.log("Tentative de reconnexion au serveur...");
            socket.emit("join_room", { roomId: roomCode, username });
        }
    });

    socket.on("room_created", (roomId) => { setRoomCode(roomId); setIsInRoom(true); setLocalIsHost(true); });
    socket.on("error_join", (message) => { alert(message); setIsInRoom(false); });
    socket.on("update_players", (currentPlayers) => { setPlayers(currentPlayers); const me = currentPlayers.find(p => p.id === socket.id); if (me) setLocalIsHost(me.isHost); });

    socket.on("game_started", (data) => { 
        setGameStarted(true); setGameState('PLAYING'); setWinnerInfo(null); setGrandWinner(null);
        let bCard = data.blackCard;
        if (!bCard || typeof bCard === 'string') bCard = { text: bCard || "Chargement...", pick: 1 };
        setBlackCard(bCard); setJudgeId(data.judgeId); setHasPlayed(false); setTableCards([]); setSelectedCards([]); setPlayers(data.players); 
        const me = data.players.find(p => p.id === socket.id); if (me) setMyHand(me.hand); 
        playSound('draw.mp3');
    });

    socket.on("start_voting", (cardsOnTable) => { setGameState('JUDGING'); setTableCards(cardsOnTable); setTimer(null); });
    socket.on("round_winner", (info) => { setWinnerInfo(info); playSound('win.mp3'); });
    socket.on("game_over", (data) => { setGrandWinner(data); setWinnerInfo(null); playSound('win.mp3'); speak(`Victoire de ${data.winnerName}`); });
    socket.on("settings_updated", (settings) => { setRoomSettings(settings); });
    socket.on("timer_update", (timeLeft) => { setTimer(timeLeft); });
    socket.on("timer_stop", () => { setTimer(null); });
    socket.on("force_played", ({ playedCards, newHand }) => { setMyHand(newHand); setHasPlayed(true); setShowJokerModal(false); setSelectedCards([]); alert(`⏰ TEMPS ÉCOULÉ !`); });
    socket.on("you_are_kicked", () => { alert("Tu as été exclu !"); window.location.reload(); });
    socket.on("return_to_lobby", (updatedPlayers) => { setGameState('LOBBY'); setGameStarted(false); setWinnerInfo(null); setGrandWinner(null); setTableCards([]); setMyHand([]); setHasPlayed(false); setPlayers(updatedPlayers); setTimer(null); setSelectedCards([]); });
    socket.on("receive_chat_message", (msg) => { setChatMessages(prev => [...prev, msg]); });
    
    // Listeners Pause
    socket.on("game_paused_state", (state) => { setIsPaused(state); });

    socket.on("custom_pack_saved", ({ packId, packName, count, isUpdate }) => { setCreatedPackCode(packId); const msg = isUpdate ? `✅ Paquet "${packName}" mis à jour !` : `✅ Paquet "${packName}" créé !`; alert(`${msg}\nCode : ${packId} (${count} cartes)`); });
    socket.on("pack_data_for_edit", ({ packId, packName, blackCards, whiteCards }) => { setEditPackId(packId); setNewPackName(packName || ""); setBlackCardsList(blackCards); setWhiteCardsList(whiteCards); setLoadingPack(false); alert(`Paquet "${packName}" chargé !`); });
    socket.on("search_results", (results) => { setSearchResults(results); });
    socket.on("error_msg", (msg) => { alert(msg); setLoadingPack(false); });
    socket.on("notification", (msg) => { console.log(msg); });
    socket.on("admin_receive_cards", (cards) => setAdminCards(cards));
    socket.on("admin_receive_packs", (packs) => setAdminPacks(packs));
    socket.on("admin_action_success", (msg) => { alert(msg); setAdminNewText(""); });

    return () => {
      socket.off("room_created"); socket.off("update_players"); socket.off("error_join");
      socket.off("game_started"); socket.off("start_voting"); socket.off("round_winner");
      socket.off("return_to_lobby"); socket.off("you_are_kicked"); socket.off("game_over"); 
      socket.off("settings_updated"); socket.off("timer_update"); socket.off("timer_stop"); 
      socket.off("force_played"); socket.off("receive_chat_message");
      socket.off("custom_pack_saved"); socket.off("pack_data_for_edit"); socket.off("search_results"); socket.off("error_msg"); socket.off("notification");
      socket.off("admin_receive_cards"); socket.off("admin_receive_packs"); socket.off("admin_action_success");
      socket.off("game_paused_state");
    };
  }, [roomCode, username]); // Dépendances importantes pour la reconnexion

  useEffect(() => {
    if (winnerInfo || grandWinner) {
      const colors = grandWinner ? ['#ffffff', '#ff0000', '#00ff00', '#0000ff'] : ['#FFD700', '#FFA500', '#FF4500'];
      const duration = grandWinner ? 5000 : 2000;
      const end = Date.now() + duration;
      (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    }
  }, [winnerInfo, grandWinner]);

  useEffect(() => {
      if (winnerInfo) {
          setTimeout(() => {
              let sentence = blackCard.text;
              winnerInfo.winningCards.forEach(ans => { sentence = sentence.replace(/_{3,}/, ` ${ans.replace(/\.$/, "")} `); });
              if (!sentence.includes(winnerInfo.winningCards[0]?.replace(/\.$/, ""))) sentence += " " + winnerInfo.winningCards.join(" et ");
              speak(`${winnerInfo.winnerName} gagne ! ${sentence}`);
          }, 500);
      }
  }, [winnerInfo, blackCard]); 

  useEffect(() => { if (isChatOpen) { setUnreadCount(0); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "auto" }), 50); } }, [isChatOpen, chatMessages]);
  useEffect(() => { if (!isChatOpen && chatMessages.length > 0) setUnreadCount(prev => prev + 1); }, [chatMessages]);

  const toggleAdmin = () => { if (showAdmin) setShowAdmin(false); else if (prompt("Mot de passe Admin ?") === "admin") { setShowAdmin(true); socket.emit('admin_fetch_cards'); socket.emit('admin_fetch_packs'); } else alert("Accès refusé."); };
  const adminAddCard = () => { if (adminNewText.trim()) socket.emit('admin_add_card', { text: adminNewText, type: adminNewType }); };
  const adminDeleteCard = (id) => { if (confirm("Supprimer ?")) socket.emit('admin_delete_card', id); };
  const adminDeletePack = (id) => { if (confirm(`⚠️ DANGER: Supprimer TOUTES les cartes du pack ${id} ?`)) socket.emit('admin_delete_pack', id); };
  
  const amIHost = localIsHost || players.find(p => p.id === socket.id)?.isHost;
  const createRoom = () => { if (username.trim()) socket.emit("create_room", username); };
  const joinRoom = () => { if (username.trim() && roomCode.trim()) { socket.emit("join_room", { roomId: roomCode, username }); setIsInRoom(true); }};
  const startGame = () => { socket.emit("start_game", roomCode); };
  const kickPlayer = (playerId, playerName) => { if (confirm(`Exclure ${playerName} ?`)) socket.emit('kick_player', { roomId: roomCode, playerId }); };
  const voteCard = (firstCardText) => { playSound('pop.mp3'); socket.emit('judge_vote', { roomId: roomCode, winningCardFirstText: firstCardText }); };
  const resetGame = () => { if (confirm("⚠️ Reset Partie ?")) socket.emit('reset_game', roomCode); };
  const addBot = () => { socket.emit('add_bot', roomCode); };
  const removeBot = () => { socket.emit('remove_bot', roomCode); };
  // 🔥 ACTION PAUSE
  const togglePause = () => { socket.emit('toggle_pause', roomCode); };
  
  const updateSettings = (key, value) => { const newSettings = { ...roomSettings, [key]: value }; setRoomSettings(newSettings); socket.emit('update_settings', { roomId: roomCode, settings: newSettings }); };
  const togglePack = (packId) => { if (!amIHost) return; let currentPacks = roomSettings.packs || []; if (currentPacks.includes(packId)) { if (currentPacks.length > 1) currentPacks = currentPacks.filter(p => p !== packId); } else { currentPacks = [...currentPacks, packId]; } updateSettings('packs', currentPacks); };
  const triggerNextRound = () => { socket.emit('trigger_next_round', roomCode); };
  const sendChatMessage = (e) => { e.preventDefault(); if (chatInput.trim()) { socket.emit('send_chat_message', { roomId: roomCode, message: chatInput }); setChatInput(""); } };
  const handleCardClick = (cardText) => { playSound('pop.mp3'); if (cardText === JOKER_TEXT) { setJokerInput(""); setShowJokerModal(true); return; } toggleSelection(cardText, cardText); };
  const toggleSelection = (textToSend, original) => { const pickNeeded = blackCard.pick || 1; const existingIndex = selectedCards.findIndex(c => c.original === original); if (existingIndex > -1) { const newSelection = [...selectedCards]; newSelection.splice(existingIndex, 1); setSelectedCards(newSelection); } else if (selectedCards.length < pickNeeded) { const newSelection = [...selectedCards, { text: textToSend, original: original }]; setSelectedCards(newSelection); if (pickNeeded === 1) { confirmPlay(newSelection); } } };
  const confirmPlay = (cardsToPlay = selectedCards) => { const texts = cardsToPlay.map(c => c.text); const originals = cardsToPlay.map(c => c.original); socket.emit('play_card', { roomId: roomCode, cardTexts: texts, originalTexts: originals }); let newHand = [...myHand]; originals.forEach(ori => { const idx = newHand.indexOf(ori); if (idx > -1) newHand.splice(idx, 1); }); setMyHand(newHand); setHasPlayed(true); setSelectedCards([]); playSound('draw.mp3'); };
  const submitJoker = () => { if (jokerInput.trim()) { toggleSelection(jokerInput, JOKER_TEXT); setShowJokerModal(false); } };
  const chatProps = { isOpen: isChatOpen, setIsOpen: setIsChatOpen, unreadCount, messages: chatMessages, username, chatInput, setChatInput, onSend: sendChatMessage, chatRef: chatEndRef };

  // --- LOGIQUE CREATEUR ---
  const addCardToList = (type, text) => { if (!text.trim()) return; const newCard = { text: text.trim(), tags: [] }; if (type === 'black') { if (blackCardsList.some(c => c.text.toLowerCase() === text.trim().toLowerCase())) return alert("Existe déjà !"); setBlackCardsList(prev => [...prev, newCard]); setInputBlack(""); } else { if (whiteCardsList.some(c => c.text.toLowerCase() === text.trim().toLowerCase())) return alert("Existe déjà !"); setWhiteCardsList(prev => [...prev, newCard]); setInputWhite(""); } };
  const toggleTagOnCard = (type, index, tagId) => { if (type === 'black') { const newList = [...blackCardsList]; const card = newList[index]; if (card.tags.includes(tagId)) card.tags = card.tags.filter(t => t !== tagId); else card.tags = [...card.tags, tagId]; setBlackCardsList(newList); } else { const newList = [...whiteCardsList]; const card = newList[index]; if (card.tags.includes(tagId)) card.tags = card.tags.filter(t => t !== tagId); else card.tags = [...card.tags, tagId]; setWhiteCardsList(newList); } };
  const removeCardFromList = (type, index) => { if (type === 'black') setBlackCardsList(prev => prev.filter((_, i) => i !== index)); else setWhiteCardsList(prev => prev.filter((_, i) => i !== index)); };
  const saveCustomPack = () => { if(newPackName && (blackCardsList.length > 0 || whiteCardsList.length > 0)) { socket.emit('create_custom_pack', { packId: editPackId || null, packName: newPackName, blackCards: blackCardsList, whiteCards: whiteCardsList }); } else { alert("Donne un nom et au moins une carte !"); } };
  const loadPackForEdit = () => { if (!editPackId.trim()) return; setLoadingPack(true); socket.emit('fetch_pack_for_edit', editPackId.trim()); };
  const performServerSearch = (query, type) => { socket.emit('search_existing_cards', { query, type }); };
  const handleSearch = (e) => { const val = e.target.value; setSearchQuery(val); if(val.length >= 2) performServerSearch(val, 'all'); else setSearchResults([]); };
  const addFromSearch = (card) => { const newCard = { text: card.text, tags: card.tags || [] }; if(card.type === 'black') { if (blackCardsList.some(c => c.text.toLowerCase() === newCard.text.toLowerCase())) return alert("Déjà ajouté !"); setBlackCardsList(prev => [...prev, newCard]); } else { if (whiteCardsList.some(c => c.text.toLowerCase() === newCard.text.toLowerCase())) return alert("Déjà ajouté !"); setWhiteCardsList(prev => [...prev, newCard]); } setSearchQuery(""); setSearchResults([]); };
  const handleBrowserImport = (cards, type) => { const newCards = cards.map(c => ({ text: c.text, tags: c.tags || [] })); if(type === 'black') { const filtered = newCards.filter(nc => !blackCardsList.some(ex => ex.text === nc.text)); setBlackCardsList(prev => [...prev, ...filtered]); } else { const filtered = newCards.filter(nc => !whiteCardsList.some(ex => ex.text === nc.text)); setWhiteCardsList(prev => [...prev, ...filtered]); } };
  const importCustomPack = () => { if(importPackCode.trim()) { socket.emit('load_custom_pack', { roomId: roomCode, packId: importPackCode.trim() }); setImportPackCode(""); } };

  if(showCreator) {
      return (
          <div className="min-h-screen bg-gray-900 text-white p-4 md:p-8 font-sans">
              <CardBrowserModal isOpen={showBrowser} onClose={() => setShowBrowser(false)} onImport={handleBrowserImport} searchResults={searchResults} onSearch={performServerSearch} />
              <button onClick={() => { setShowCreator(false); setCreatedPackCode(null); setEditPackId(""); setBlackCardsList([]); setWhiteCardsList([]); setNewPackName(""); }} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded mb-6 transition">⬅️ Retour</button>
              <h1 className="text-3xl font-bold mb-6 text-yellow-400 flex items-center gap-2">🏗️ Créateur de Paquet</h1>
              <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700 max-w-6xl mx-auto">
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center mb-6 bg-black/20 p-4 rounded border border-gray-700">
                      <div className="flex gap-2 items-center w-full md:w-auto"><span className="text-sm font-bold text-blue-300 whitespace-nowrap">Modifier :</span><input className="bg-gray-900 border border-blue-500 rounded px-3 py-2 text-white text-sm w-32 md:w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Code (PACK-X)" value={editPackId} onChange={e => setEditPackId(e.target.value)} /><button onClick={loadPackForEdit} disabled={loadingPack} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-bold transition">{loadingPack ? '...' : 'Charger'}</button></div>
                      <button onClick={() => setShowBrowser(true)} className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded font-bold shadow-lg flex items-center justify-center gap-2 transition transform hover:scale-105">🔍 Ouvrir l'Explorateur de Cartes</button>
                  </div>
                  {createdPackCode ? (
                      <div className="text-center p-10 bg-green-900/30 border border-green-500 rounded animate-card-pop"><h2 className="text-3xl font-bold text-green-400 mb-2">Paquet sauvegardé ! 🎉</h2><p className="mb-4 text-gray-300">Partage ce code avec tes amis pour jouer :</p><div className="bg-black p-6 rounded-lg text-4xl font-mono select-all cursor-pointer border-2 border-green-500 inline-block text-white shadow-[0_0_20px_rgba(34,197,94,0.4)]">{createdPackCode}</div><br/><button onClick={() => { setCreatedPackCode(null); }} className="mt-8 text-sm underline text-gray-400 hover:text-white">Continuer à modifier ce paquet</button></div>
                  ) : (
                      <>
                          <div className="mb-6"><label className="block text-sm font-bold mb-2 text-gray-300">Nom du paquet</label><input className="w-full bg-gray-900 border border-gray-600 p-3 rounded text-white text-lg focus:border-purple-500 focus:outline-none" value={newPackName} onChange={(e) => setNewPackName(e.target.value)} placeholder="Ex: Mes blagues nulles" /></div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div className="flex flex-col h-[500px]">
                                  <div className="flex justify-between items-end mb-2"><label className="block text-sm font-bold text-white bg-black px-3 py-1 rounded-t border-t border-l border-r border-gray-700">Questions (Noires) <span className="text-yellow-500 ml-1">{blackCardsList.length}</span></label></div>
                                  <div className="flex gap-2 mb-2"><input className="flex-1 bg-gray-900 border border-gray-600 p-2 rounded text-white text-sm" value={inputBlack} onChange={(e) => setInputBlack(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCardToList('black', inputBlack)} placeholder="Tape ta question..." /><button onClick={() => addCardToList('black', inputBlack)} className="bg-gray-700 hover:bg-gray-600 px-3 rounded text-white font-bold">+</button></div>
                                  <div className="flex-1 bg-black border border-gray-700 rounded p-2 overflow-y-auto space-y-2">
                                      {blackCardsList.length === 0 && <p className="text-gray-600 text-center text-sm mt-10">Aucune question...</p>}
                                      {blackCardsList.map((card, idx) => (
                                          <div key={idx} className="bg-gray-900 p-3 rounded border border-gray-800 flex flex-col gap-2 group hover:border-gray-500 transition">
                                              <div className="flex justify-between items-start"><span className="text-sm text-white">{card.text}</span><button onClick={() => removeCardFromList('black', idx)} className="text-red-500 opacity-50 group-hover:opacity-100 hover:text-red-400 ml-2">🗑️</button></div>
                                              <div className="flex gap-2">{AVAILABLE_TAGS.map(tag => (<button key={tag.id} onClick={() => toggleTagOnCard('black', idx, tag.id)} className={`text-xs px-2 py-0.5 rounded border ${card.tags.includes(tag.id) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'}`} title={tag.label}>{tag.emoji}</button>))}</div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                              <div className="flex flex-col h-[500px]">
                                  <div className="flex justify-between items-end mb-2"><label className="block text-sm font-bold text-black bg-white px-3 py-1 rounded-t border-t border-l border-r border-gray-300">Réponses (Blanches) <span className="text-purple-600 ml-1">{whiteCardsList.length}</span></label></div>
                                  <div className="flex gap-2 mb-2"><input className="flex-1 bg-gray-100 border border-gray-300 p-2 rounded text-black text-sm" value={inputWhite} onChange={(e) => setInputWhite(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCardToList('white', inputWhite)} placeholder="Tape ta réponse..." /><button onClick={() => addCardToList('white', inputWhite)} className="bg-gray-200 hover:bg-gray-300 px-3 rounded text-black font-bold border border-gray-400">+</button></div>
                                  <div className="flex-1 bg-gray-100 border border-gray-300 rounded p-2 overflow-y-auto space-y-2">
                                      {whiteCardsList.length === 0 && <p className="text-gray-400 text-center text-sm mt-10">Aucune réponse...</p>}
                                      {whiteCardsList.map((card, idx) => (
                                          <div key={idx} className="bg-white p-3 rounded shadow-sm border border-gray-200 flex flex-col gap-2 group hover:border-gray-400 transition">
                                              <div className="flex justify-between items-start"><span className="text-sm text-gray-900 font-medium">{card.text}</span><button onClick={() => removeCardFromList('white', idx)} className="text-red-500 opacity-50 group-hover:opacity-100 hover:text-red-400 ml-2">✕</button></div>
                                              <div className="flex gap-2">{AVAILABLE_TAGS.map(tag => (<button key={tag.id} onClick={() => toggleTagOnCard('white', idx, tag.id)} className={`text-xs px-2 py-0.5 rounded border ${card.tags.includes(tag.id) ? 'bg-purple-600 border-purple-500 text-white' : 'bg-transparent border-gray-300 text-gray-400 hover:border-gray-400'}`} title={tag.label}>{tag.emoji}</button>))}</div>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          </div>
                          <button onClick={saveCustomPack} className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-4 mt-8 rounded font-bold text-xl shadow-lg transition transform hover:scale-[1.01]">{editPackId ? 'METTRE À JOUR LE PAQUET 💾' : 'CRÉER LE PAQUET 💾'}</button>
                      </>
                  )}
              </div>
          </div>
      );
  }

  if (showAdmin) { 
      const questions = adminCards.filter(c => c.type === 'black'); const answers = adminCards.filter(c => c.type === 'white'); 
      return (<div className="min-h-screen bg-gray-900 text-white p-6 font-sans"><div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4"><h1 className="text-3xl font-bold text-red-500">🛠️ Admin</h1><button onClick={() => setShowAdmin(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">Quitter</button></div><div className="bg-gray-800 p-6 rounded-lg mb-8 shadow-lg border border-gray-700"><h2 className="text-xl font-bold mb-4 text-blue-400">📦 Packs Personnalisés</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-4">{adminPacks.length === 0 && <p className="text-gray-500">Aucun pack custom trouvé.</p>}{adminPacks.map(pack => (<div key={pack.id} className="bg-gray-700 p-4 rounded flex justify-between items-center"><div><p className="font-bold text-yellow-400">{pack.name || "Sans nom"}</p><p className="text-xs text-gray-400 font-mono">{pack.id} • {pack.count} cartes</p></div><button onClick={() => adminDeletePack(pack.id)} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs font-bold">SUPPRIMER</button></div>))}</div></div><div className="bg-gray-800 p-6 rounded-lg mb-8 shadow-lg border border-gray-700"><h2 className="text-xl font-bold mb-4">Ajouter une carte (Pack Main)</h2><div className="flex gap-4 mb-4"><button onClick={() => setAdminNewType('black')} className={`flex-1 py-2 rounded font-bold transition ${adminNewType === 'black' ? 'bg-black text-white border-2 border-white' : 'bg-gray-700 text-gray-400'}`}>Question (Noire)</button><button onClick={() => setAdminNewType('white')} className={`flex-1 py-2 rounded font-bold transition ${adminNewType === 'white' ? 'bg-white text-black border-2 border-transparent' : 'bg-gray-700 text-gray-400'}`}>Réponse (Blanche)</button></div><textarea value={adminNewText} onChange={(e) => setAdminNewText(e.target.value)} placeholder={adminNewType === 'black' ? "Ex: ____ et ____." : "Ex: Une loutre"} className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 mb-4 focus:border-red-500 outline-none" rows="2" /><button onClick={adminAddCard} className="w-full bg-green-600 hover:bg-green-500 py-3 rounded font-bold text-lg">AJOUTER</button></div><div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="bg-black border border-gray-700 rounded-lg p-4 h-[600px] flex flex-col"><h3 className="text-xl font-bold mb-4 text-center border-b border-gray-800 pb-2 text-white">Questions (Dernières)</h3><div className="overflow-y-auto flex-1 space-y-2 pr-2">{questions.map(card => (<div key={card._id} className="bg-gray-900 p-3 rounded border border-gray-700 flex justify-between items-center group hover:border-gray-500"><span className="text-sm">{card.text} {card.pick > 1 && <span className="text-yellow-400 font-bold ml-2">(x{card.pick})</span>}</span><button onClick={() => adminDeleteCard(card._id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition px-2">🗑️</button></div>))}</div></div><div className="bg-white text-black border border-gray-400 rounded-lg p-4 h-[600px] flex flex-col"><h3 className="text-xl font-bold mb-4 text-center border-b border-gray-300 pb-2 text-gray-900">Réponses (Dernières)</h3><div className="overflow-y-auto flex-1 space-y-2 pr-2">{answers.map(card => (<div key={card._id} className="bg-gray-100 p-3 rounded shadow-sm flex justify-between items-center group border border-gray-200 hover:border-gray-400"><span className="text-sm font-medium">{card.text}</span><button onClick={() => adminDeleteCard(card._id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition px-2 font-bold">✕</button></div>))}</div></div></div></div>); 
  }

  if (grandWinner) { return (<div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10 overflow-hidden relative"><ChatOverlay {...chatProps} /><motion.h1 initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }} className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-700 mb-8 text-center">CHAMPION !</motion.h1><motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="bg-gray-800 border-4 border-yellow-500 rounded-full w-64 h-64 flex items-center justify-center shadow-[0_0_50px_rgba(255,215,0,0.6)] mb-8"><span className="text-5xl font-bold">{grandWinner.winnerName}</span></motion.div><p className="text-2xl text-gray-300">Score : {grandWinner.score}</p>{amIHost && (<button onClick={resetGame} className="mt-12 bg-white text-black font-bold py-4 px-8 rounded-full hover:scale-110 transition shadow-lg">👑 Rejouer</button>)}</div>); }
  if (winnerInfo) { return (<div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-10 relative"><ChatOverlay {...chatProps} />{amIHost && (<div className="absolute top-4 left-4 z-50"><button onClick={resetGame} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow border border-red-400 opacity-80 hover:opacity-100 transition">⚠️ Reset</button></div>)}<motion.h1 initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-4xl md:text-6xl font-bold text-yellow-400 mb-8 drop-shadow-lg text-center">🏆 {winnerInfo.winnerName} GAGNE !</motion.h1><motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1, rotate: 1 }} transition={{ type: "spring", stiffness: 200 }} className="bg-white text-black p-8 rounded-2xl shadow-2xl max-w-3xl border-4 border-black mb-12"><p className="text-2xl md:text-3xl font-black text-center leading-relaxed">{blackCard.text.split(/_{3,}/).map((part, index, array) => (<span key={index}>{part}{index < array.length - 1 && winnerInfo.winningCards[index] && (<span className="text-purple-700 underline decoration-4 decoration-yellow-400 mx-2">{winnerInfo.winningCards[index].replace(/\.$/, "")}</span>)}</span>))}</p></motion.div>{amIHost ? (<motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={triggerNextRound} className="bg-green-500 hover:bg-green-600 text-white font-black py-4 px-8 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.6)] text-2xl border-4 border-white">MANCHE SUIVANTE ➡️</motion.button>) : (<div className="text-gray-400 animate-pulse text-lg text-center">L'hôte va lancer la prochaine manche...</div>)}</div>); }
  if (gameStarted) { const amIJudge = socket.id === judgeId; const pickAmount = blackCard.pick || 1; let instructionText = "À toi de jouer :"; let instructionClass = "text-gray-400"; if (!amIJudge && pickAmount > 1) { if (selectedCards.length === 0) { instructionText = "1️⃣ Choisis ta PREMIÈRE carte"; instructionClass = "text-yellow-400 font-bold animate-pulse"; } else if (selectedCards.length < pickAmount) { instructionText = "2️⃣ Choisis ta DEUXIÈME carte"; instructionClass = "text-blue-400 font-bold animate-pulse"; } else { instructionText = "✅ Tout est bon ? Valide !"; instructionClass = "text-green-400 font-bold"; } } return (<div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 relative"><ChatOverlay {...chatProps} />{showJokerModal && (<div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white text-black p-6 rounded-xl w-full max-w-sm shadow-2xl animate-card-pop"><h3 className="text-2xl font-bold mb-4 text-center">🃏 JOKER</h3><textarea autoFocus className="w-full bg-gray-100 p-4 rounded border-2 border-purple-500 text-lg font-bold mb-4 focus:outline-none" rows="3" placeholder="..." value={jokerInput} onChange={(e) => setJokerInput(e.target.value)} /><div className="flex gap-2"><button onClick={() => setShowJokerModal(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 py-3 rounded font-bold">Annuler</button><button onClick={submitJoker} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded font-bold shadow-lg">VALIDER</button></div></div></div>)} {amIHost && (
    <div className="absolute top-2 left-2 md:top-4 md:left-4 z-50">
        <div className="flex flex-col gap-1.5 md:gap-2">
            <button 
                onClick={resetGame} 
                className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-[10px] md:text-xs px-2 md:px-3 py-1 rounded shadow border border-red-400 opacity-50 hover:opacity-100 transition touch-manipulation"
            >
                ⚠️ Reset
            </button>
            <button 
                onClick={togglePause} 
                className={`${isPaused ? 'bg-green-600 hover:bg-green-500' : 'bg-yellow-600 hover:bg-yellow-500'} text-white text-[10px] md:text-xs px-2 md:px-3 py-1 rounded shadow border opacity-80 hover:opacity-100 transition touch-manipulation`}
            >
                {isPaused ? '▶️ Reprendre' : '⏸️ Pause'}
            </button>
        </div>
    </div>
)}{isPaused && (
    <div className="absolute inset-0 z-[200] bg-black/70 flex flex-col items-center justify-center backdrop-blur-sm gap-6">
        <h2 className="text-6xl font-black text-yellow-400 animate-pulse tracking-widest border-4 border-yellow-400 p-8 rounded-xl rotate-[-5deg]">PAUSE</h2>
        {amIHost && (
            <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={togglePause}
                className="bg-green-600 hover:bg-green-500 text-white font-bold px-8 py-4 rounded-full shadow-2xl border-4 border-white text-xl z-[210]"
            >
                ▶️ REPRENDRE
            </motion.button>
        )}
        {!amIHost && (
            <p className="text-gray-300 text-lg animate-pulse">L'hôte va reprendre la partie...</p>
        )}
    </div>
)}
<div className="w-full flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-2 px-2 md:px-4 pt-4">
    {/* Code salle + Timer */}
    <div className="flex items-center gap-3 w-full md:w-auto justify-between">
        <h2 className="text-lg md:text-xl font-bold">Salle: {roomCode}</h2>
        {timer !== null && gameState === 'PLAYING' && (
            <div className={`text-2xl md:text-4xl font-black font-mono px-3 md:px-4 py-1 md:py-2 rounded shadow-lg animate-pulse ${timer <= 10 ? 'bg-red-600 text-white' : 'bg-gray-800 text-yellow-400'}`}>
                {timer}s
            </div>
        )}
    </div>
    
    {/* Liste des joueurs */}
    <div className="flex flex-col items-end bg-gray-800 p-2 md:p-3 rounded-lg shadow-md border border-gray-700 w-full md:w-auto">
        {players.map(p => (
            <motion.div 
                initial={{ x: 20, opacity: 0 }} 
                animate={{ x: 0, opacity: 1 }} 
                key={p.id} 
                className={`flex items-center justify-end gap-2 md:gap-3 text-xs md:text-sm mb-1.5 md:mb-2 last:mb-0 ${p.id === judgeId ? 'text-yellow-400 font-bold' : 'text-white'}`}
            >
                {amIHost && p.id !== socket.id && (
                    <button 
                        onClick={() => kickPlayer(p.id, p.username)} 
                        className="text-red-500 hover:text-red-400 font-bold px-1 touch-manipulation"
                    >
                        ❌
                    </button>
                )}
                <div className="text-right leading-tight">
                    <div className="font-semibold">
                        {p.username} {p.id === judgeId && "👑"} {p.isBot && "🤖"}
                    </div>
                    <div className="text-[10px] md:text-xs opacity-70">
                        {p.score}/{roomSettings.scoreLimit} pts
                    </div>
                </div>
                <img 
                    src={`https://api.dicebear.com/7.x/fun-emoji/svg?seed=${p.username}`} 
                    alt="Avatar" 
                    className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-200 border-2 border-white/20 shadow-sm" 
                />
            </motion.div>
        ))}
    </div>
</div><div className="flex flex-col items-center justify-center flex-grow w-full max-w-6xl mb-4"><motion.div 
    key={blackCard.text} 
    initial={{ scale: 0.8, opacity: 0 }} 
    animate={{ scale: 1, opacity: 1 }} 
    transition={{ type: "spring" }} 
    className="bg-black border-2 border-white text-white p-4 md:p-6 rounded-xl w-56 h-72 md:w-64 md:h-80 flex items-center justify-center text-center shadow-2xl mb-6 md:mb-8 relative"
>
    <p className="text-lg md:text-xl font-bold">{blackCard.text}</p>
    {pickAmount > 1 && (
        <div className="absolute bottom-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">
            PICK {pickAmount}
        </div>
    )}
</motion.div>{gameState === 'JUDGING' && (
    <div className="w-full px-2 md:px-0">
        <h3 className="text-center text-xl md:text-2xl mb-4 md:mb-6 text-yellow-400 font-bold animate-pulse">
            {amIJudge ? "👑 CHOISIS LE MEILLEUR COMBO !" : "Le juge réfléchit..."}
        </h3>
        <div className="flex flex-wrap justify-center gap-2 md:gap-4">
            <AnimatePresence>
                {tableCards.map((cardEntry, idx) => (
                    <motion.div 
                        key={idx} 
                        initial={{ y: 50, opacity: 0 }} 
                        animate={{ y: 0, opacity: 1 }} 
                        transition={{ delay: idx * 0.1 }} 
                        whileHover={amIJudge ? { scale: 1.05, y: -10 } : {}} 
                        whileTap={amIJudge ? { scale: 0.95 } : {}}
                        onClick={() => amIJudge ? voteCard(cardEntry.texts[0]) : null} 
                        className={`flex gap-1 p-1.5 md:p-2 rounded-xl transition ${amIJudge ? 'cursor-pointer hover:bg-yellow-100/20 active:bg-yellow-100/30 touch-manipulation' : ''}`}
                    >
                        {cardEntry.texts.map((txt, i) => (
                            <div 
                                key={i} 
                                className="bg-white text-black p-3 md:p-4 rounded-lg w-32 h-48 md:w-40 md:h-56 shadow-lg flex items-center justify-center text-center text-xs md:text-sm font-bold border border-gray-300"
                            >
                                <p>{txt}</p>
                            </div>
                        ))}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    </div>
)}</div>{!amIJudge && gameState === 'PLAYING' && (<div className="w-full max-w-full overflow-hidden mt-auto">{hasPlayed ? ( <div className="text-center py-8 bg-gray-800 rounded-t-xl opacity-75 animate-pulse"><p className="text-xl text-gray-300">Cartes posées ! ⏳</p></div> ) : (<><div className="flex flex-col items-center px-4 mb-2"><h3 className={`text-lg mb-2 ${instructionClass}`}>{instructionText}</h3>{pickAmount > 1 && selectedCards.length === pickAmount && (<motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={() => confirmPlay()} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-8 rounded-full shadow-lg mb-2">ENVOYER LES RÉPONSES 🚀</motion.button>)}</div><div className="w-full relative z-10">
    {/* Flèches de navigation mobile */}
    {myHand.length > 3 && (
        <>
            <button
                onClick={() => {
                    const container = document.getElementById('cards-container');
                    container.scrollBy({ left: -200, behavior: 'smooth' });
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-purple-600/90 hover:bg-purple-500 text-white w-12 h-12 rounded-full shadow-2xl flex items-center justify-center border-2 border-white/30 backdrop-blur-sm md:hidden"
            >
                ◀
            </button>
            <button
                onClick={() => {
                    const container = document.getElementById('cards-container');
                    container.scrollBy({ left: 200, behavior: 'smooth' });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 bg-purple-600/90 hover:bg-purple-500 text-white w-12 h-12 rounded-full shadow-2xl flex items-center justify-center border-2 border-white/30 backdrop-blur-sm md:hidden"
            >
                ▶
            </button>
        </>
    )}
    
    <motion.div 
        id="cards-container"
        layout 
        className="flex overflow-x-auto gap-4 px-4 pb-6 pt-16 items-end w-full touch-pan-x snap-x scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    ><AnimatePresence>{myHand.map((card, index) => { const selectionIndex = selectedCards.findIndex(c => c.original === card || (card === JOKER_TEXT && c.original === JOKER_TEXT)); const isSelected = selectionIndex > -1; return (<motion.div key={`${card}-${index}`} layout initial={{ y: 100, opacity: 0 }} animate={{ y: isSelected ? -40 : 0, opacity: 1 }} exit={{ y: -200, opacity: 0, scale: 0.5 }} whileHover={{ y: -20, scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleCardClick(card)} className={`snap-center flex-shrink-0 p-4 rounded-lg w-40 h-56 md:w-48 md:h-64 shadow-lg cursor-pointer border-4 relative transition-colors duration-200 ${card === JOKER_TEXT ? 'bg-purple-600 text-white' : 'bg-white text-gray-900'} ${isSelected ? 'border-blue-500' : 'border-transparent hover:border-purple-300'} `}>{isSelected && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -top-4 -right-4 bg-blue-500 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white z-20 text-xl">{selectionIndex + 1}</motion.div>}<p className="font-bold text-lg select-none">{card}</p></motion.div>) })}</AnimatePresence><div className="w-4 flex-shrink-0"></div></motion.div></div></>)}</div>)}{amIJudge && gameState === 'PLAYING' && (<div className="mt-auto mb-10 bg-gray-800 px-8 py-4 rounded-full animate-pulse border border-gray-600">Attends que tes sujets fassent leur choix... 🤴</div>)}</div>); }

  // LOBBY AVEC IMPORTATEUR ET MODES
  if (isInRoom) { 
      return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-10">
          <ChatOverlay {...chatProps} />
          <h1 className="text-4xl font-bold mb-8 text-yellow-500">Salle : {roomCode}</h1>
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md border border-gray-700">
              {amIHost ? (
              <div className="mb-6 bg-gray-700 p-4 rounded border border-gray-600">
                  <h3 className="font-bold text-yellow-400 mb-3 border-b border-gray-600 pb-1">⚙️ Paramètres</h3>
                  
                  {/* Scores et Temps */}
                  <div className="flex justify-between items-center mb-3">
                      <label>Points pour gagner :</label>
                      <input type="number" value={roomSettings.scoreLimit} onChange={(e) => updateSettings('scoreLimit', parseInt(e.target.value))} className="w-16 bg-gray-900 border border-gray-500 rounded px-2 py-1 text-center font-bold" min="1" max="50" />
                  </div>
                  <div className="flex justify-between items-center mb-3">
                      <label>Temps par tour (s) :</label>
                      <input type="number" value={roomSettings.timerDuration} onChange={(e) => updateSettings('timerDuration', parseInt(e.target.value))} className="w-16 bg-gray-900 border border-gray-500 rounded px-2 py-1 text-center font-bold" min="0" max="120" placeholder="0" />
                  </div>

                  {/* 🔥 GESTION DES BOTS */}
                  <div className="flex justify-between items-center mb-3 pt-2 border-t border-gray-600">
                      <label>Robots 🤖 :</label>
                      <div className="flex gap-2">
                          <button onClick={removeBot} className="bg-red-600 hover:bg-red-500 w-8 h-8 rounded-full font-bold text-white flex items-center justify-center border-2 border-red-800 shadow">-</button>
                          <button onClick={addBot} className="bg-green-600 hover:bg-green-500 w-8 h-8 rounded-full font-bold text-white flex items-center justify-center border-2 border-green-800 shadow">+</button>
                      </div>
                  </div>
                  
                  {/* SÉLECTEUR DE PACKS */}
                  <div className="mt-2 border-t border-gray-600 pt-2">
                      <h4 className="text-sm font-bold text-gray-300 mb-2">Modes de Jeu :</h4>
                      <div className="flex flex-col gap-2 mb-4">
                          {OFFICIAL_PACKS.map(pack => (
                              <label key={pack.id} className={`flex items-center p-2 rounded cursor-pointer transition ${roomSettings.packs?.includes(pack.id) ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-600'}`}>
                                  <input type="checkbox" className="hidden" checked={roomSettings.packs?.includes(pack.id) || false} onChange={() => togglePack(pack.id)} />
                                  <span className="mr-2">{roomSettings.packs?.includes(pack.id) ? '✅' : '⬜'}</span>
                                  <span className="text-xs font-bold">{pack.name}</span>
                              </label>
                          ))}
                      </div>
                      
                      {/* IMPORTATION */}
                      <AnimatePresence>
                          {roomSettings.packs?.includes('custom') && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                  <div className="bg-black/20 p-3 rounded border border-purple-500/30">
                                      <h4 className="text-xs font-bold text-purple-300 mb-2">Importer un paquet via Code :</h4>
                                      <div className="flex gap-2">
                                          <input type="text" value={importPackCode} onChange={(e) => setImportPackCode(e.target.value)} placeholder="Ex: PACK-X92" className="w-full bg-gray-900 border border-gray-500 rounded px-2 py-1 text-sm uppercase focus:border-purple-500 outline-none" />
                                          <button onClick={importCustomPack} className="bg-purple-600 hover:bg-purple-500 px-3 py-1 rounded text-sm font-bold">⬇️</button>
                                      </div>
                                      <div className="mt-2 text-xs text-green-400 min-h-[1rem]">
                                          {roomSettings.packs?.filter(id => id.startsWith('PACK-')).length > 0 && "✅ Chargés : " + roomSettings.packs.filter(id => id.startsWith('PACK-')).join(', ')}
                                      </div>
                                  </div>
                              </motion.div>
                          )}
                      </AnimatePresence>
                  </div>
              </div>
              ) : (
                  // VUE JOUEUR
                  <div className="mb-6 text-center text-sm text-gray-400 bg-gray-700 p-4 rounded">
                      <p>🎯 Objectif : {roomSettings.scoreLimit} points</p>
                      <p>⏱️ Temps : {roomSettings.timerDuration > 0 ? roomSettings.timerDuration + 's' : 'Infini'}</p>
                      <div className="mt-2 pt-2 border-t border-gray-600">
                          <p className="font-bold text-gray-300">Modes actifs :</p>
                          <p className="text-purple-400">
                              {roomSettings.packs?.map(pid => {
                                  const official = OFFICIAL_PACKS.find(p => p.id === pid);
                                  return official ? official.name : pid;
                              }).join(', ') || 'Aucun'}
                          </p>
                      </div>
                  </div>
              )}
              
              <h2 className="text-xl mb-4 border-b border-gray-700 pb-2">Joueurs prêts :</h2>
              <ul className="space-y-3 mb-8">
                  {players.map((player) => (
                      <li key={player.id} className="flex items-center justify-between bg-gray-700 p-3 rounded">
                          <div className="flex items-center gap-3">
                              <img src={`https://api.dicebear.com/7.x/fun-emoji/svg?seed=${player.username}`} alt="avatar" className="w-10 h-10 rounded-full bg-gray-300"/>
                              <span className="font-bold">{player.username}</span>
                              {player.isBot && <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded ml-2">BOT</span>}
                          </div>
                          <div className="flex items-center gap-2">{player.isHost && <span className="text-xs bg-yellow-600 px-2 py-1 rounded font-bold text-black">Hôte</span>}{amIHost && player.id !== socket.id && (<button onClick={() => kickPlayer(player.id, player.username)} className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded font-bold">❌</button>)}</div>
                      </li>
                  ))}
              </ul>
              {amIHost ? (<button onClick={startGame} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded font-bold text-xl shadow-[0_0_15px_rgba(34,197,94,0.5)] transition transform hover:scale-105">LANCER LA PARTIE 🚀</button>) : (<div className="text-center p-4 bg-gray-700/50 rounded animate-pulse text-gray-300">L'hôte va lancer la partie...</div>)}
          </div>
      </div>
      ); 
  }

  return (<div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative"><button onClick={toggleAdmin} className="absolute top-4 right-4 text-gray-700 hover:text-gray-500 text-xs font-mono">Admin</button><div className="max-w-md w-full space-y-8 text-center"><h1 className="text-5xl font-extrabold text-white tracking-tighter drop-shadow-lg">BLANC <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">MANGER</span> ONLINE</h1><div className="bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 space-y-6"><div><label className="block text-left text-sm font-medium text-gray-400 mb-1">Ton Pseudo</label><input type="text" placeholder="Ex: Michel Le Rigolo" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none transition text-white" onChange={(e) => setUsername(e.target.value)} /></div><div className="grid grid-cols-2 gap-4"><button onClick={createRoom} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold transition transform hover:scale-105 shadow-lg">Créer une salle</button><div className="col-span-2 mt-4 pt-4 border-t border-gray-700"><p className="text-sm text-gray-400 mb-2">Ou rejoindre une partie :</p><div className="flex gap-2"><input type="text" placeholder="Code" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg uppercase text-center font-mono" onChange={(e) => setRoomCode(e.target.value)} /><button onClick={joinRoom} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-semibold shadow-md">GO</button></div></div></div><button onClick={() => setShowCreator(true)} className="text-sm text-purple-400 hover:text-purple-300 underline mt-4">🎨 Créer un paquet de cartes</button></div></div></div>);
}

export default App;