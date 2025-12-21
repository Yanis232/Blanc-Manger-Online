import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import confetti from 'canvas-confetti';

const BACKEND_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL);

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

  // --- ADMIN DASHBOARD STATES ---
  const [showAdmin, setShowAdmin] = useState(false); // Mode admin activé ?
  const [adminCards, setAdminCards] = useState([]); // Liste des cartes
  const [adminNewText, setAdminNewText] = useState(""); // Texte nouvelle carte
  const [adminNewType, setAdminNewType] = useState("white"); // Type nouvelle carte

  // --- USE EFFECT ---
  useEffect(() => {
    socket.on("room_created", (roomId) => { setRoomCode(roomId); setIsInRoom(true); setLocalIsHost(true); });
    socket.on("update_players", (currentPlayers) => { setPlayers(currentPlayers); const me = currentPlayers.find(p => p.id === socket.id); if (me) setLocalIsHost(me.isHost); });
    socket.on("error_join", (message) => { alert(message); setIsInRoom(false); });
    socket.on("game_started", (data) => { setGameStarted(true); setGameState('PLAYING'); setWinnerInfo(null); setBlackCard(data.blackCard); setJudgeId(data.judgeId); setHasPlayed(false); setTableCards([]); setPlayers(data.players); const me = data.players.find(p => p.id === socket.id); if (me) { setMyHand(me.hand); setLocalIsHost(me.isHost); } });
    socket.on("start_voting", (cardsOnTable) => { setGameState('JUDGING'); setTableCards(cardsOnTable); });
    socket.on("round_winner", setWinnerInfo);
    socket.on("you_are_kicked", () => { alert("Tu as été exclu de la partie !"); window.location.reload(); });
    socket.on("return_to_lobby", (updatedPlayers) => { setGameState('LOBBY'); setGameStarted(false); setWinnerInfo(null); setTableCards([]); setMyHand([]); setHasPlayed(false); setPlayers(updatedPlayers); const me = updatedPlayers.find(p => p.id === socket.id); if (me) setLocalIsHost(me.isHost); });

    // --- ECOUTEURS ADMIN ---
    socket.on("admin_receive_cards", (cards) => { setAdminCards(cards); });
    socket.on("admin_action_success", (msg) => { alert(msg); setAdminNewText(""); });

    return () => {
      socket.off("room_created"); socket.off("update_players"); socket.off("error_join");
      socket.off("game_started"); socket.off("start_voting"); socket.off("round_winner");
      socket.off("return_to_lobby"); socket.off("you_are_kicked");
      socket.off("admin_receive_cards"); socket.off("admin_action_success");
    };
  }, []);

  // --- CONFETTIS ---
  useEffect(() => {
    if (winnerInfo) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#FFD700', '#FFA500', '#FF4500'], zIndex: 9999, disableForReducedMotion: true });
    }
  }, [winnerInfo]);

  // --- LOGIQUE ADMIN ---
  const toggleAdmin = () => {
    if (showAdmin) {
        setShowAdmin(false);
    } else {
        const password = prompt("Mot de passe Admin ?");
        if (password === "admin") { // 🔒 Change le mot de passe ici
            setShowAdmin(true);
            socket.emit('admin_fetch_cards'); // On demande les cartes dès qu'on se connecte
        } else {
            alert("Accès refusé.");
        }
    }
  };

  const adminAddCard = () => {
    if (adminNewText.trim()) {
        socket.emit('admin_add_card', { text: adminNewText, type: adminNewType });
    }
  };

  const adminDeleteCard = (id) => {
    if (confirm("Supprimer définitivement cette carte ?")) {
        socket.emit('admin_delete_card', id);
    }
  };

  // --- LOGIQUE JEU ---
  const amIHost = localIsHost || players.find(p => p.id === socket.id)?.isHost;
  const createRoom = () => { if (username.trim()) socket.emit("create_room", username); };
  const joinRoom = () => { if (username.trim() && roomCode.trim()) { socket.emit("join_room", { roomId: roomCode, username }); setIsInRoom(true); }};
  const startGame = () => { socket.emit("start_game", roomCode); };
  const kickPlayer = (playerId, playerName) => { if (confirm(`Veux-tu vraiment exclure ${playerName} ?`)) { socket.emit('kick_player', { roomId: roomCode, playerId }); }};
  const playCard = (cardText) => { socket.emit('play_card', { roomId: roomCode, cardText }); setMyHand(myHand.filter(c => c !== cardText)); setHasPlayed(true); };
  const voteCard = (cardText) => { socket.emit('judge_vote', { roomId: roomCode, winningCardText: cardText }); };
  const resetGame = () => { if (confirm("⚠️ ATTENTION : Cela va annuler la partie en cours. Continuer ?")) { socket.emit('reset_game', roomCode); }};

  // --------------------------------------------------------------------------------
  // --- VUE : ADMIN DASHBOARD (Superposé au reste) ---
  if (showAdmin) {
    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 font-sans">
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                <h1 className="text-3xl font-bold text-red-500">🛠️ Admin Dashboard</h1>
                <button onClick={() => setShowAdmin(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded">Quitter</button>
            </div>

            {/* FORMULAIRE AJOUT */}
            <div className="bg-gray-800 p-6 rounded-lg mb-8 shadow-lg border border-gray-700">
                <h2 className="text-xl font-bold mb-4">Ajouter une carte</h2>
                <div className="flex gap-4 mb-4">
                    <button onClick={() => setAdminNewType('white')} className={`flex-1 py-2 rounded font-bold ${adminNewType === 'white' ? 'bg-white text-black' : 'bg-gray-700 text-gray-400'}`}>Réponse (Blanche)</button>
                    <button onClick={() => setAdminNewType('black')} className={`flex-1 py-2 rounded font-bold ${adminNewType === 'black' ? 'bg-black text-white border border-white' : 'bg-gray-700 text-gray-400'}`}>Question (Noire)</button>
                </div>
                <textarea 
                    value={adminNewText} 
                    onChange={(e) => setAdminNewText(e.target.value)}
                    placeholder={adminNewType === 'black' ? "Ex: Je n'aime pas _____." : "Ex: Une loutre unijambiste"}
                    className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 mb-4 focus:border-red-500 outline-none"
                    rows="2"
                />
                <button onClick={adminAddCard} className="w-full bg-green-600 hover:bg-green-500 py-3 rounded font-bold text-lg">AJOUTER LA CARTE (+)</button>
            </div>

            {/* LISTES DES CARTES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* COLONNE NOIRE */}
                <div className="bg-black border border-gray-700 rounded-lg p-4 h-[600px] flex flex-col">
                    <h3 className="text-xl font-bold mb-4 text-center border-b border-gray-800 pb-2">Questions ({adminCards.filter(c => c.type === 'black').length})</h3>
                    <div className="overflow-y-auto flex-1 space-y-2 pr-2">
                        {adminCards.filter(c => c.type === 'black').map(card => (
                            <div key={card._id} className="bg-gray-900 p-3 rounded border border-gray-700 flex justify-between items-center group">
                                <span className="text-sm">{card.text}</span>
                                <button onClick={() => adminDeleteCard(card._id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition px-2">🗑️</button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* COLONNE BLANCHE */}
                <div className="bg-gray-200 text-black border border-gray-400 rounded-lg p-4 h-[600px] flex flex-col">
                    <h3 className="text-xl font-bold mb-4 text-center border-b border-gray-300 pb-2">Réponses ({adminCards.filter(c => c.type === 'white').length})</h3>
                    <div className="overflow-y-auto flex-1 space-y-2 pr-2">
                        {adminCards.filter(c => c.type === 'white').map(card => (
                            <div key={card._id} className="bg-white p-3 rounded shadow-sm flex justify-between items-center group border border-gray-100">
                                <span className="text-sm font-medium">{card.text}</span>
                                <button onClick={() => adminDeleteCard(card._id)} className="text-red-500 opacity-0 group-hover:opacity-100 transition px-2 font-bold">✕</button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
  }

  // --- VUE : JEU NORMAL (Reste inchangé ou presque) ---
  if (winnerInfo) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-10 animate-bounce relative">
          {amIHost && (<div className="absolute top-4 left-4 z-50"><button onClick={resetGame} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow border border-red-400 opacity-80 hover:opacity-100 transition">⚠️ Reset Partie</button></div>)}
          <h1 className="text-6xl font-bold text-yellow-400 mb-4">🏆 {winnerInfo.winnerName} GAGNE !</h1>
          <p className="text-2xl">Avec la réponse :</p>
          <div className="bg-white text-black p-6 rounded-lg mt-4 text-xl font-bold rotate-2 shadow-2xl transform scale-110">{winnerInfo.winningCard}</div>
          <p className="mt-10 text-gray-400 animate-pulse">Prochaine manche dans quelques secondes...</p>
      </div>
    );
  }

  if (gameStarted) {
    const amIJudge = socket.id === judgeId;
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 relative">
        {amIHost && (<div className="absolute top-4 left-4 z-50"><button onClick={resetGame} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow border border-red-400 opacity-50 hover:opacity-100 transition" title="Remettre la partie à zéro">⚠️ Reset Partie</button></div>)}
        <div className="w-full flex justify-between items-start mb-6 px-4 pt-8">
          <h2 className="text-xl font-bold">Salle: {roomCode}</h2>
          <div className="flex flex-col items-end bg-gray-800 p-2 rounded">
              {players.map(p => (
                  <div key={p.id} className={`flex items-center justify-end gap-2 text-sm ${p.id === judgeId ? 'text-yellow-400 font-bold' : 'text-white'}`}>
                      {amIHost && p.id !== socket.id && (<button onClick={() => kickPlayer(p.id, p.username)} className="text-red-500 hover:text-red-400 font-bold px-1">❌</button>)}
                      {p.username} : {p.score} pts {p.id === judgeId && "👑"}
                  </div>
              ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center flex-grow w-full max-w-6xl mb-4">
            <div className="bg-black border-2 border-white text-white p-6 rounded-xl w-64 h-80 flex items-center justify-center text-center shadow-2xl mb-8 hover:scale-105 transition">
                <p className="text-xl font-bold">{blackCard}</p>
            </div>
            {gameState === 'JUDGING' && (
                <div className="w-full">
                    <h3 className="text-center text-2xl mb-6 text-yellow-400 font-bold animate-pulse">{amIJudge ? "👑 CLIQUE SUR LA GAGNANTE !" : "Le juge réfléchit..."}</h3>
                    <div className="flex flex-wrap justify-center gap-4">
                        {tableCards.map((card, idx) => (
                            <div key={idx} onClick={() => amIJudge ? voteCard(card.text) : null} className={`animate-card-pop bg-white text-black p-4 rounded-lg w-48 h-64 shadow-lg flex items-center justify-center text-center transition transform duration-200 ${amIJudge ? 'cursor-pointer hover:scale-110 hover:bg-yellow-100 hover:z-10' : 'opacity-90'}`} style={{ animationDelay: `${idx * 0.1}s` }}>
                                <p className="font-bold">{card.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
        {!amIJudge && gameState === 'PLAYING' && (
            <div className="w-full max-w-full overflow-hidden mt-auto">
            {hasPlayed ? (
                 <div className="text-center py-8 bg-gray-800 rounded-t-xl opacity-75 animate-pulse"><p className="text-xl text-gray-300">Carte posée ! ⏳</p></div>
            ) : (
                <>
                    <h3 className="text-gray-400 mb-2 ml-4 animate-bounce">À toi de jouer :</h3>
                    <div className="w-full relative z-10">
                        <div className="flex overflow-x-auto gap-4 px-4 pb-6 pt-16 items-end w-full touch-pan-x snap-x">
                            {myHand.map((card, index) => (
                            <div key={index} onClick={() => playCard(card)} className="snap-center animate-card-pop flex-shrink-0 bg-white text-gray-900 p-4 rounded-lg w-48 h-64 shadow-lg cursor-pointer transition transform hover:-translate-y-12 hover:rotate-1 border-2 border-transparent hover:border-purple-500" style={{ animationDelay: `${index * 0.1}s` }}>
                                <p className="font-bold text-lg select-none">{card}</p>
                            </div>
                            ))}
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

  // --- VUE : LOBBY & ACCUEIL ---
  if (isInRoom) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-10">
        <h1 className="text-4xl font-bold mb-8 text-yellow-500">Salle : {roomCode}</h1>
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md border border-gray-700">
          <h2 className="text-xl mb-4 border-b border-gray-700 pb-2">Joueurs prêts :</h2>
          <ul className="space-y-2 mb-8">
            {players.map((player) => (
              <li key={player.id} className="flex items-center justify-between bg-gray-700 p-3 rounded">
                <span>{player.username}</span>
                <div className="flex items-center gap-2">
                    {player.isHost && <span className="text-xs bg-yellow-600 px-2 py-1 rounded font-bold text-black">Hôte</span>}
                    {amIHost && player.id !== socket.id && (<button onClick={() => kickPlayer(player.id, player.username)} className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded font-bold" title="Exclure">❌</button>)}
                </div>
              </li>
            ))}
          </ul>
          {amIHost ? (<button onClick={startGame} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded font-bold text-xl shadow-[0_0_15px_rgba(34,197,94,0.5)] transition transform hover:scale-105">LANCER LA PARTIE 🚀</button>) : (<div className="text-center p-4 bg-gray-700/50 rounded animate-pulse text-gray-300">L'hôte va lancer la partie...</div>)}
        </div>
      </div>
    );
  }

  // --- ACCUEIL ---
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 relative">
      
      {/* BOUTON SECRET ADMIN (En haut à droite) */}
      <button onClick={toggleAdmin} className="absolute top-4 right-4 text-gray-700 hover:text-gray-500 text-xs font-mono">
        Admin
      </button>

      <div className="max-w-md w-full space-y-8 text-center">
        <h1 className="text-5xl font-extrabold text-white tracking-tighter drop-shadow-lg">
          BLANC <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">MANGER</span> ONLINE
        </h1>

        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 space-y-6">
          <div>
            <label className="block text-left text-sm font-medium text-gray-400 mb-1">Ton Pseudo</label>
            <input type="text" placeholder="Ex: Michel Le Rigolo" className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none transition text-white" onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={createRoom} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold transition transform hover:scale-105 shadow-lg">Créer une salle</button>
            <div className="col-span-2 mt-4 pt-4 border-t border-gray-700">
              <p className="text-sm text-gray-400 mb-2">Ou rejoindre une partie :</p>
              <div className="flex gap-2">
                <input type="text" placeholder="Code (ex: A1B2)" className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none uppercase tracking-widest text-center font-mono" onChange={(e) => setRoomCode(e.target.value)} />
                <button onClick={joinRoom} className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-semibold transition shadow-md">GO</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;