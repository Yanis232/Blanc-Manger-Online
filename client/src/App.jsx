import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import confetti from 'canvas-confetti';

const BACKEND_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL);

const JOKER_TEXT = "🃏 JOKER (Écris ta connerie)";

function App() {
  // Navigation & User
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isInRoom, setIsInRoom] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  
  // Jeu
  const [players, setPlayers] = useState([]);
  const [myHand, setMyHand] = useState([]);
  const [blackCard, setBlackCard] = useState("");
  const [judgeId, setJudgeId] = useState("");
  const [localIsHost, setLocalIsHost] = useState(false); 
  const [hasPlayed, setHasPlayed] = useState(false);
  const [gameState, setGameState] = useState('LOBBY'); 
  const [tableCards, setTableCards] = useState([]); 
  const [winnerInfo, setWinnerInfo] = useState(null); 
  const [grandWinner, setGrandWinner] = useState(null); // 🏆 NOUVEAU

  // --- SETTINGS STATES ---
  const [roomSettings, setRoomSettings] = useState({ scoreLimit: 10, timerDuration: 45 });
  const [timer, setTimer] = useState(null); // Compte à rebours visuel

  // --- JOKER & ADMIN STATES ---
  const [showJokerModal, setShowJokerModal] = useState(false);
  const [jokerInput, setJokerInput] = useState("");
  const [showAdmin, setShowAdmin] = useState(false); 
  const [adminCards, setAdminCards] = useState([]); 
  const [adminNewText, setAdminNewText] = useState(""); 
  const [adminNewType, setAdminNewType] = useState("white"); 

  useEffect(() => {
    socket.on("room_created", (roomId) => { setRoomCode(roomId); setIsInRoom(true); setLocalIsHost(true); });
    socket.on("update_players", (currentPlayers) => { setPlayers(currentPlayers); const me = currentPlayers.find(p => p.id === socket.id); if (me) setLocalIsHost(me.isHost); });
    socket.on("error_join", (message) => { alert(message); setIsInRoom(false); });
    
    // START GAME
    socket.on("game_started", (data) => { 
        setGameStarted(true); setGameState('PLAYING'); 
        setWinnerInfo(null); setGrandWinner(null);
        setBlackCard(data.blackCard); setJudgeId(data.judgeId); 
        setHasPlayed(false); setTableCards([]); setPlayers(data.players); 
        const me = data.players.find(p => p.id === socket.id); 
        if (me) { setMyHand(me.hand); setLocalIsHost(me.isHost); } 
    });

    socket.on("start_voting", (cardsOnTable) => { setGameState('JUDGING'); setTableCards(cardsOnTable); setTimer(null); });
    socket.on("round_winner", setWinnerInfo);
    
    // 🔥 NOUVEAUX ÉCOUTEURS
    socket.on("game_over", (data) => { setGrandWinner(data); setWinnerInfo(null); }); // Fin de partie
    socket.on("settings_updated", (settings) => { setRoomSettings(settings); }); // Synchro options
    socket.on("timer_update", (timeLeft) => { setTimer(timeLeft); }); // Tic tac
    socket.on("timer_stop", () => { setTimer(null); });
    socket.on("force_played", ({ playedCard, newHand }) => {
        // Le serveur a joué pour nous (temps écoulé)
        setMyHand(newHand);
        setHasPlayed(true);
        setShowJokerModal(false);
        alert(`⏰ TEMPS ÉCOULÉ ! Carte jouée auto : ${playedCard}`);
    });

    socket.on("you_are_kicked", () => { alert("Tu as été exclu de la partie !"); window.location.reload(); });
    socket.on("return_to_lobby", (updatedPlayers) => { 
        setGameState('LOBBY'); setGameStarted(false); setWinnerInfo(null); setGrandWinner(null);
        setTableCards([]); setMyHand([]); setHasPlayed(false); setPlayers(updatedPlayers); setTimer(null);
        const me = updatedPlayers.find(p => p.id === socket.id); if (me) setLocalIsHost(me.isHost); 
    });

    // Admin
    socket.on("admin_receive_cards", (cards) => { setAdminCards(cards); });
    socket.on("admin_action_success", (msg) => { alert(msg); setAdminNewText(""); });
    
    return () => {
      socket.off("room_created"); socket.off("update_players"); socket.off("error_join");
      socket.off("game_started"); socket.off("start_voting"); socket.off("round_winner");
      socket.off("return_to_lobby"); socket.off("you_are_kicked");
      socket.off("admin_receive_cards"); socket.off("admin_action_success");
      socket.off("game_over"); socket.off("settings_updated"); socket.off("timer_update"); socket.off("timer_stop"); socket.off("force_played");
    };
  }, []);

  useEffect(() => {
    if (winnerInfo || grandWinner) {
      const colors = grandWinner ? ['#ffffff', '#ff0000', '#00ff00', '#0000ff'] : ['#FFD700', '#FFA500', '#FF4500'];
      const duration = grandWinner ? 5000 : 2000; // Plus de confettis pour le grand gagnant
      const end = Date.now() + duration;
      (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
      }());
    }
  }, [winnerInfo, grandWinner]);

  // --- ACTIONS ---
  const toggleAdmin = () => { if (showAdmin) setShowAdmin(false); else if (prompt("Mot de passe Admin ?") === "admin") { setShowAdmin(true); socket.emit('admin_fetch_cards'); } else alert("Accès refusé."); };
  const adminAddCard = () => { if (adminNewText.trim()) socket.emit('admin_add_card', { text: adminNewText, type: adminNewType }); };
  const adminDeleteCard = (id) => { if (confirm("Supprimer ?")) socket.emit('admin_delete_card', id); };
  
  const amIHost = localIsHost || players.find(p => p.id === socket.id)?.isHost;
  const createRoom = () => { if (username.trim()) socket.emit("create_room", username); };
  const joinRoom = () => { if (username.trim() && roomCode.trim()) { socket.emit("join_room", { roomId: roomCode, username }); setIsInRoom(true); }};
  const startGame = () => { socket.emit("start_game", roomCode); };
  const kickPlayer = (playerId, playerName) => { if (confirm(`Exclure ${playerName} ?`)) socket.emit('kick_player', { roomId: roomCode, playerId }); };
  const voteCard = (cardText) => { socket.emit('judge_vote', { roomId: roomCode, winningCardText: cardText }); };
  const resetGame = () => { if (confirm("⚠️ Reset Partie ?")) socket.emit('reset_game', roomCode); };

  // 🔥 CHANGEMENT DES RÉGLAGES
  const updateSettings = (key, value) => {
      const newSettings = { ...roomSettings, [key]: parseInt(value) };
      // Optimistic update pour l'hôte
      setRoomSettings(newSettings);
      socket.emit('update_settings', { roomId: roomCode, settings: newSettings });
  };

  const handleCardClick = (cardText) => { if (cardText === JOKER_TEXT) { setJokerInput(""); setShowJokerModal(true); } else { playCard(cardText); } };
  const playCard = (textToSend, originalCard = null) => {
    socket.emit('play_card', { roomId: roomCode, cardText: textToSend, originalText: originalCard });
    const cardToRemove = originalCard || textToSend;
    const indexToRemove = myHand.indexOf(cardToRemove);
    if (indexToRemove > -1) { const newHand = [...myHand]; newHand.splice(indexToRemove, 1); setMyHand(newHand); }
    setHasPlayed(true); setShowJokerModal(false);
  };
  const submitJoker = () => { if (jokerInput.trim()) { playCard(jokerInput, JOKER_TEXT); } };

  // --- VUE : ADMIN ---
  if (showAdmin) { /* ... Code admin inchangé (pour économiser la place, garde ton ancien code ici) ... */ return <div className="min-h-screen bg-gray-900 text-white p-6 font-sans"><button onClick={() => setShowAdmin(false)} className="bg-gray-700 px-4 py-2 rounded mb-4">Quitter</button><h1 className="text-3xl font-bold mb-4">Admin Mode</h1><div className="bg-gray-800 p-6 rounded"><p>Formulaire d'ajout ici...</p><div className="flex gap-4 mb-4"><button onClick={() => setAdminNewType('white')} className={`flex-1 py-2 rounded font-bold ${adminNewType === 'white' ? 'bg-white text-black' : 'bg-gray-700 text-gray-400'}`}>Réponse</button><button onClick={() => setAdminNewType('black')} className={`flex-1 py-2 rounded font-bold ${adminNewType === 'black' ? 'bg-black text-white border border-white' : 'bg-gray-700 text-gray-400'}`}>Question</button></div><textarea value={adminNewText} onChange={(e) => setAdminNewText(e.target.value)} className="w-full bg-gray-900 text-white p-3 rounded mb-4" rows="2" /><button onClick={adminAddCard} className="w-full bg-green-600 hover:bg-green-500 py-3 rounded font-bold">AJOUTER</button></div></div>; }

  // --- VUE : GRAND VAINQUEUR (FIN DE PARTIE) ---
  if (grandWinner) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10 overflow-hidden relative">
            <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-700 mb-8 animate-pulse text-center">
                CHAMPION ULTIME !
            </h1>
            <div className="bg-gray-800 border-4 border-yellow-500 rounded-full w-64 h-64 flex items-center justify-center shadow-[0_0_50px_rgba(255,215,0,0.6)] mb-8">
                <span className="text-5xl font-bold">{grandWinner.winnerName}</span>
            </div>
            <p className="text-2xl text-gray-300">A atteint {grandWinner.score} points</p>
            {amIHost && (<button onClick={resetGame} className="mt-12 bg-white text-black font-bold py-4 px-8 rounded-full hover:scale-110 transition shadow-lg">👑 Nouvelle Partie</button>)}
        </div>
      );
  }

  // --- VUE : VICTOIRE MANCHE ---
  if (winnerInfo) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-10 animate-bounce relative">
          {amIHost && (<div className="absolute top-4 left-4 z-50"><button onClick={resetGame} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow border border-red-400 opacity-80 hover:opacity-100 transition">⚠️ Reset</button></div>)}
          <h1 className="text-6xl font-bold text-yellow-400 mb-4">🏆 {winnerInfo.winnerName} GAGNE !</h1>
          <div className="bg-white text-black p-6 rounded-lg mt-4 text-xl font-bold rotate-2 shadow-2xl transform scale-110">{winnerInfo.winningCard}</div>
      </div>
    );
  }

  // --- VUE : PLATEAU ---
  if (gameStarted) {
    const amIJudge = socket.id === judgeId;
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 relative">
        {/* MODAL JOKER */}
        {showJokerModal && (<div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white text-black p-6 rounded-xl w-full max-w-sm shadow-2xl animate-card-pop"><h3 className="text-2xl font-bold mb-4 text-center">🃏 TA CARTE JOKER</h3><textarea autoFocus className="w-full bg-gray-100 p-4 rounded border-2 border-purple-500 text-lg font-bold mb-4 focus:outline-none" rows="3" placeholder="..." value={jokerInput} onChange={(e) => setJokerInput(e.target.value)} /><div className="flex gap-2"><button onClick={() => setShowJokerModal(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 py-3 rounded font-bold">Annuler</button><button onClick={submitJoker} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded font-bold shadow-lg">JOUER 🔥</button></div></div></div>)}

        {amIHost && (<div className="absolute top-4 left-4 z-50"><button onClick={resetGame} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow border border-red-400 opacity-50 hover:opacity-100 transition">⚠️ Reset</button></div>)}
        
        {/* TIMER & HEADER */}
        <div className="w-full flex justify-between items-start mb-2 px-4 pt-4">
          <h2 className="text-xl font-bold">Salle: {roomCode}</h2>
          
          {/* 🔥 AFFICHAGE DU CHRONO 🔥 */}
          {timer !== null && gameState === 'PLAYING' && (
              <div className={`text-4xl font-black font-mono px-4 py-2 rounded shadow-lg animate-pulse ${timer <= 10 ? 'bg-red-600 text-white' : 'bg-gray-800 text-yellow-400'}`}>
                  {timer}s
              </div>
          )}

          <div className="flex flex-col items-end bg-gray-800 p-2 rounded">
              {players.map(p => (
                  <div key={p.id} className={`flex items-center justify-end gap-2 text-sm ${p.id === judgeId ? 'text-yellow-400 font-bold' : 'text-white'}`}>
                      {amIHost && p.id !== socket.id && (<button onClick={() => kickPlayer(p.id, p.username)} className="text-red-500 hover:text-red-400 font-bold px-1">❌</button>)}
                      {p.username} : {p.score}/{roomSettings.scoreLimit} pts {p.id === judgeId && "👑"}
                  </div>
              ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center flex-grow w-full max-w-6xl mb-4">
            <div className="bg-black border-2 border-white text-white p-6 rounded-xl w-64 h-80 flex items-center justify-center text-center shadow-2xl mb-8 hover:scale-105 transition">
                <p className="text-xl font-bold">{blackCard}</p>
            </div>
            {gameState === 'JUDGING' && (<div className="w-full"><h3 className="text-center text-2xl mb-6 text-yellow-400 font-bold animate-pulse">{amIJudge ? "👑 CLIQUE SUR LA GAGNANTE !" : "Le juge réfléchit..."}</h3><div className="flex flex-wrap justify-center gap-4">{tableCards.map((card, idx) => (<div key={idx} onClick={() => amIJudge ? voteCard(card.text) : null} className={`animate-card-pop bg-white text-black p-4 rounded-lg w-48 h-64 shadow-lg flex items-center justify-center text-center transition transform duration-200 ${amIJudge ? 'cursor-pointer hover:scale-110 hover:bg-yellow-100 hover:z-10' : 'opacity-90'}`} style={{ animationDelay: `${idx * 0.1}s` }}><p className="font-bold">{card.text}</p></div>))}</div></div>)}
        </div>

        {!amIJudge && gameState === 'PLAYING' && (
            <div className="w-full max-w-full overflow-hidden mt-auto">
            {hasPlayed ? ( <div className="text-center py-8 bg-gray-800 rounded-t-xl opacity-75 animate-pulse"><p className="text-xl text-gray-300">Carte posée ! ⏳</p></div> ) : (
                <>
                    <h3 className="text-gray-400 mb-2 ml-4 animate-bounce">À toi de jouer :</h3>
                    <div className="w-full relative z-10">
                        <div className="flex overflow-x-auto gap-4 px-4 pb-6 pt-16 items-end w-full touch-pan-x snap-x">
                            {myHand.map((card, index) => ( <div key={index} onClick={() => handleCardClick(card)} className={`snap-center animate-card-pop flex-shrink-0 p-4 rounded-lg w-48 h-64 shadow-lg cursor-pointer transition transform hover:-translate-y-12 hover:rotate-1 border-2 border-transparent ${card === JOKER_TEXT ? 'bg-purple-600 text-white border-yellow-400 hover:border-white' : 'bg-white text-gray-900 hover:border-purple-500'}`} style={{ animationDelay: `${index * 0.1}s` }}><p className="font-bold text-lg select-none">{card}</p></div> ))}
                            <div className="w-4 flex-shrink-0"></div>
                        </div>
                    </div>
                </>
            )}
            </div>
        )}
        {amIJudge && gameState === 'PLAYING' && (<div className="mt-auto mb-10 bg-gray-800 px-8 py-4 rounded-full animate-pulse border border-gray-600">Attends que tes sujets fassent leur choix... 🤴</div>)}
      </div>
    );
  }

  // --- VUE : LOBBY ---
  if (isInRoom) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-10">
        <h1 className="text-4xl font-bold mb-8 text-yellow-500">Salle : {roomCode}</h1>
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md border border-gray-700">
          
          {/* 🔥 CONFIGURATION DE LA PARTIE (HÔTE) 🔥 */}
          {amIHost ? (
            <div className="mb-6 bg-gray-700 p-4 rounded border border-gray-600">
                <h3 className="font-bold text-yellow-400 mb-3 border-b border-gray-600 pb-1">⚙️ Paramètres</h3>
                
                <div className="flex justify-between items-center mb-3">
                    <label>Points pour gagner :</label>
                    <input type="number" value={roomSettings.scoreLimit} onChange={(e) => updateSettings('scoreLimit', e.target.value)} className="w-16 bg-gray-900 border border-gray-500 rounded px-2 py-1 text-center font-bold" min="1" max="50" />
                </div>
                
                <div className="flex justify-between items-center">
                    <label>Temps par tour (sec) :</label>
                    <input type="number" value={roomSettings.timerDuration} onChange={(e) => updateSettings('timerDuration', e.target.value)} className="w-16 bg-gray-900 border border-gray-500 rounded px-2 py-1 text-center font-bold" min="0" max="120" placeholder="0 = infini"/>
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">(0 = Temps illimité)</p>
            </div>
          ) : (
            <div className="mb-6 text-center text-sm text-gray-400 bg-gray-700 p-2 rounded">
                <p>🎯 Objectif : {roomSettings.scoreLimit} points</p>
                <p>⏱️ Temps : {roomSettings.timerDuration > 0 ? roomSettings.timerDuration + 's' : 'Infini'}</p>
            </div>
          )}

          <h2 className="text-xl mb-4 border-b border-gray-700 pb-2">Joueurs prêts :</h2>
          <ul className="space-y-2 mb-8">{players.map((player) => (<li key={player.id} className="flex items-center justify-between bg-gray-700 p-3 rounded"><span>{player.username}</span><div className="flex items-center gap-2">{player.isHost && <span className="text-xs bg-yellow-600 px-2 py-1 rounded font-bold text-black">Hôte</span>}{amIHost && player.id !== socket.id && (<button onClick={() => kickPlayer(player.id, player.username)} className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded font-bold">❌</button>)}</div></li>))}</ul>
          {amIHost ? (<button onClick={startGame} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded font-bold text-xl shadow-[0_0_15px_rgba(34,197,94,0.5)] transition transform hover:scale-105">LANCER LA PARTIE 🚀</button>) : (<div className="text-center p-4 bg-gray-700/50 rounded animate-pulse text-gray-300">L'hôte va lancer la partie...</div>)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative">
      <button onClick={toggleAdmin} className="absolute top-4 right-4 text-gray-700 hover:text-gray-500 text-xs font-mono">Admin</button>
      <div className="max-w-md w-full space-y-8 text-center">
        <h1 className="text-5xl font-extrabold text-white tracking-tighter drop-shadow-lg">BLANC <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">MANGER</span> ONLINE</h1>
        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 space-y-6">
          <div><label className="block text-left text-sm font-medium text-gray-400 mb-1">Ton Pseudo</label><input type="text" placeholder="Ex: Michel Le Rigolo" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none transition text-white" onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4"><button onClick={createRoom} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold transition transform hover:scale-105 shadow-lg">Créer une salle</button><div className="col-span-2 mt-4 pt-4 border-t border-gray-700"><p className="text-sm text-gray-400 mb-2">Ou rejoindre une partie :</p><div className="flex gap-2"><input type="text" placeholder="Code" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg uppercase text-center font-mono" onChange={(e) => setRoomCode(e.target.value)} /><button onClick={joinRoom} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-semibold shadow-md">GO</button></div></div></div>
        </div>
      </div>
    </div>
  );
}

export default App;