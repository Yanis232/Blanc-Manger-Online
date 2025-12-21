import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import confetti from 'canvas-confetti';

// En ligne (Vercel), on utilise la variable d'environnement. En local, on garde localhost.
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
  
  // On remplace le state isHost par un calcul direct plus bas pour être sûr
  const [localIsHost, setLocalIsHost] = useState(false); 

  const [hasPlayed, setHasPlayed] = useState(false);
  const [gameState, setGameState] = useState('LOBBY'); 
  const [tableCards, setTableCards] = useState([]); 
  const [winnerInfo, setWinnerInfo] = useState(null); 

  // Créateur de cartes
  const [showCreator, setShowCreator] = useState(false);
  const [newCardText, setNewCardText] = useState("");
  const [newCardType, setNewCardType] = useState("white");

  // --- USE EFFECT (ECOUTEURS SOCKET) ---
  useEffect(() => {
    socket.on("room_created", (roomId) => {
      setRoomCode(roomId);
      setIsInRoom(true);
      setLocalIsHost(true); // Je viens de créer la salle, je suis l'hôte
    });

    socket.on("update_players", (currentPlayers) => {
      setPlayers(currentPlayers);
      // Mise à jour de sécurité du statut d'hôte
      const me = currentPlayers.find(p => p.id === socket.id);
      if (me) setLocalIsHost(me.isHost);
    });

    // Si le serveur refuse l'entrée (pseudo pris ou salle inexistante)
    socket.on("error_join", (message) => {
      alert(message);      // Affiche l'alerte
      setIsInRoom(false);  // Annule l'entrée dans la salle (retour à l'accueil)
    });

    socket.on("game_started", (data) => {
      setGameStarted(true);
      setGameState('PLAYING');
      setWinnerInfo(null);
      setBlackCard(data.blackCard);
      setJudgeId(data.judgeId);
      setHasPlayed(false);
      setTableCards([]);
      
      setPlayers(data.players); 
      const me = data.players.find(p => p.id === socket.id);
      if (me) {
        setMyHand(me.hand);
        setLocalIsHost(me.isHost);
      }
    });

    socket.on("start_voting", (cardsOnTable) => {
        setGameState('JUDGING');
        setTableCards(cardsOnTable);
    });

    socket.on("round_winner", setWinnerInfo);

    socket.on("you_are_kicked", () => {
      alert("Tu as été exclu de la partie par l'hôte ! 😢");
      window.location.reload(); 
    });

    socket.on("return_to_lobby", (updatedPlayers) => {
      setGameState('LOBBY');
      setGameStarted(false);
      setWinnerInfo(null);
      setTableCards([]);
      setMyHand([]);
      setHasPlayed(false);
      setPlayers(updatedPlayers);
      // On re-vérifie qui est l'hôte au retour dans le lobby
      const me = updatedPlayers.find(p => p.id === socket.id);
      if (me) setLocalIsHost(me.isHost);
    });

    // NETTOYAGE DES ECOUTEURS (IMPORTANT)
    return () => {
      socket.off("room_created");
      socket.off("update_players");
      socket.off("error_join");
      socket.off("game_started");
      socket.off("start_voting");
      socket.off("round_winner");
      socket.off("return_to_lobby");
      socket.off("you_are_kicked");
    };
  }, []);

  // --- EFFET VISUEL : CONFETTIS ---
  useEffect(() => {
    if (winnerInfo) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FFD700', '#FFA500', '#FF4500'],
        zIndex: 9999, // <--- LA CLÉ POUR LE MOBILE (Force l'affichage au premier plan)
        disableForReducedMotion: true // Bon pour l'accessibilité mobile
      });
    }
  }, [winnerInfo]);

  // --- CALCUL DE SÉCURITÉ : SUIS-JE L'HÔTE ? ---
  const amIHost = localIsHost || players.find(p => p.id === socket.id)?.isHost;

  // --- ACTIONS DU JEU ---
  const createRoom = () => { if (username.trim()) socket.emit("create_room", username); };
  
  const joinRoom = () => { 
    if (username.trim() && roomCode.trim()) { 
      socket.emit("join_room", { roomId: roomCode, username }); 
      // On met à true, mais si le serveur renvoie "error_join", l'écouteur le remettra à false.
      setIsInRoom(true); 
    }
  };

  // 🔥 LA FONCTION MANQUANTE EST ICI 🔥
  const startGame = () => { 
    socket.emit("start_game", roomCode); 
  };

  const kickPlayer = (playerId, playerName) => {
    if (confirm(`Veux-tu vraiment exclure ${playerName} ?`)) {
      socket.emit('kick_player', { roomId: roomCode, playerId });
    }
  };
  
  const playCard = (cardText) => {
    socket.emit('play_card', { roomId: roomCode, cardText });
    setMyHand(myHand.filter(c => c !== cardText));
    setHasPlayed(true);
  };
  
  const voteCard = (cardText) => {
    socket.emit('judge_vote', { roomId: roomCode, winningCardText: cardText });
  };

  const saveCard = () => {
    if (newCardText.trim()) {
      socket.emit('create_custom_card', { text: newCardText, type: newCardType });
      setNewCardText("");
      alert("Carte ajoutée avec succès !");
    }
  };

  const resetGame = () => {
    if (confirm("⚠️ ATTENTION : Cela va annuler la partie en cours et renvoyer tout le monde au salon. Continuer ?")) {
      socket.emit('reset_game', roomCode);
    }
  };

  // --- VUE : VICTOIRE MANCHE ---
  if (winnerInfo) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-10 animate-bounce relative">
          
          {/* BOUTON ADMIN */}
          {amIHost && (
            <div className="absolute top-4 left-4 z-50">
                <button onClick={resetGame} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow border border-red-400 opacity-80 hover:opacity-100 transition">
                    ⚠️ Reset Partie
                </button>
            </div>
          )}

          <h1 className="text-6xl font-bold text-yellow-400 mb-4">🏆 {winnerInfo.winnerName} GAGNE !</h1>
          <p className="text-2xl">Avec la réponse :</p>
          <div className="bg-white text-black p-6 rounded-lg mt-4 text-xl font-bold rotate-2 shadow-2xl transform scale-110">
              {winnerInfo.winningCard}
          </div>
          <p className="mt-10 text-gray-400 animate-pulse">Prochaine manche dans quelques secondes...</p>
      </div>
    );
  }

  // --- VUE : PLATEAU DE JEU ---
  if (gameStarted) {
    const amIJudge = socket.id === judgeId;

    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 relative">
        
        {/* BOUTON ADMIN (HOTE SEULEMENT) */}
        {amIHost && (
            <div className="absolute top-4 left-4 z-50">
                <button 
                    onClick={resetGame}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded shadow border border-red-400 opacity-50 hover:opacity-100 transition"
                    title="Remettre la partie à zéro"
                >
                    ⚠️ Reset Partie
                </button>
            </div>
        )}

        {/* Header Scores */}
        <div className="w-full flex justify-between items-start mb-6 px-4 pt-8">
          <h2 className="text-xl font-bold">Salle: {roomCode}</h2>
          <div className="flex flex-col items-end bg-gray-800 p-2 rounded">
              {players.map(p => (
                  <div key={p.id} className={`flex items-center justify-end gap-2 text-sm ${p.id === judgeId ? 'text-yellow-400 font-bold' : 'text-white'}`}>
                      {/* Bouton Kick discret */}
                      {amIHost && p.id !== socket.id && (
                          <button onClick={() => kickPlayer(p.id, p.username)} className="text-red-500 hover:text-red-400 font-bold px-1">❌</button>
                      )}
                      
                      {p.username} : {p.score} pts {p.id === judgeId && "👑"}
                  </div>
              ))}
          </div>
        </div>

        {/* Zone Centrale */}
        <div className="flex flex-col items-center justify-center flex-grow w-full max-w-6xl mb-4">
            <div className="bg-black border-2 border-white text-white p-6 rounded-xl w-64 h-80 flex items-center justify-center text-center shadow-2xl mb-8 hover:scale-105 transition">
                <p className="text-xl font-bold">{blackCard}</p>
            </div>

            {/* Vote */}
            {gameState === 'JUDGING' && (
                <div className="w-full">
                    <h3 className="text-center text-2xl mb-6 text-yellow-400 font-bold animate-pulse">
                        {amIJudge ? "👑 CLIQUE SUR LA GAGNANTE !" : "Le juge réfléchit..."}
                    </h3>
                    <div className="flex flex-wrap justify-center gap-4">
                        {tableCards.map((card, idx) => (
                            <div key={idx} onClick={() => amIJudge ? voteCard(card.text) : null}
                                // AJOUT CLASSE ANIMATION + DELAY
                                className={`animate-card-pop bg-white text-black p-4 rounded-lg w-48 h-64 shadow-lg flex items-center justify-center text-center transition transform duration-200
                                ${amIJudge ? 'cursor-pointer hover:scale-110 hover:bg-yellow-100 hover:z-10' : 'opacity-90'}`}
                                style={{ animationDelay: `${idx * 0.1}s` }}
                            >
                                <p className="font-bold">{card.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {/* Main du joueur */}
        {!amIJudge && gameState === 'PLAYING' && (
            <div className="w-full max-w-full overflow-hidden mt-auto">
            {hasPlayed ? (
                 <div className="text-center py-8 bg-gray-800 rounded-t-xl opacity-75 animate-pulse">
                     <p className="text-xl text-gray-300">Carte posée ! ⏳</p>
                 </div>
            ) : (
                <>
                    <h3 className="text-gray-400 mb-2 ml-4 animate-bounce">À toi de jouer :</h3>
                    
                    {/* 👇 CORRECTION SCROLL ET TOUCH 👇 */}
                    <div className="w-full relative z-10">
                        <div className="flex overflow-x-auto gap-4 px-4 pb-6 pt-32 items-end w-full touch-pan-x snap-x">
                            {myHand.map((card, index) => (
                            <div key={index} onClick={() => playCard(card)}
                                // Ajout de 'snap-center' pour le mobile et ajustement du hover
                                className="snap-center animate-card-pop flex-shrink-0 bg-white text-gray-900 p-4 rounded-lg w-48 h-64 shadow-lg cursor-pointer transition transform hover:-translate-y-12 hover:rotate-1 border-2 border-transparent hover:border-purple-500"
                                style={{ animationDelay: `${index * 0.1}s` }}
                            >
                                <p className="font-bold text-lg select-none">{card}</p>
                            </div>
                            ))}
                            {/* Petit espace à la fin pour ne pas coller la dernière carte au bord */}
                            <div className="w-4 flex-shrink-0"></div>
                        </div>
                    </div>
                </>
            )}
            </div>
        )}
        
        {amIJudge && gameState === 'PLAYING' && (
            <div className="mt-auto mb-10 bg-gray-800 px-8 py-4 rounded-full animate-pulse border border-gray-600">
                Attends que tes sujets fassent leur choix... 🤴
            </div>
        )}
      </div>
    );
  }

  // --- VUE : LOBBY ---
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
                    
                    {/* BOUTON KICK (Visible si JE suis l'hôte et que ce n'est pas MOI) */}
                    {amIHost && player.id !== socket.id && (
                        <button 
                          onClick={() => kickPlayer(player.id, player.username)}
                          className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded font-bold"
                          title="Exclure le joueur"
                        >
                          ❌
                        </button>
                    )}
                </div>
              </li>
            ))}
          </ul>
          {amIHost ? (
            <button onClick={startGame} className="w-full py-4 bg-green-600 hover:bg-green-500 rounded font-bold text-xl shadow-[0_0_15px_rgba(34,197,94,0.5)] transition transform hover:scale-105">LANCER LA PARTIE 🚀</button>
          ) : (
            <div className="text-center p-4 bg-gray-700/50 rounded animate-pulse text-gray-300">L'hôte va lancer la partie...</div>
          )}
        </div>
      </div>
    );
  }

  // --- VUE : ACCUEIL ---
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <h1 className="text-5xl font-extrabold text-white tracking-tighter drop-shadow-lg">
          BLANC <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">MANGER</span> ONLINE
        </h1>

        <div className="bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 space-y-6">
          <div>
            <label className="block text-left text-sm font-medium text-gray-400 mb-1">Ton Pseudo</label>
            <input type="text" placeholder="Ex: Michel Le Rigolo"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none transition text-white"
              onChange={(e) => setUsername(e.target.value)}
            />
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

          {/* --- CRÉATEUR DE CARTES --- */}
          <div className="pt-6 border-t border-gray-700">
            <button onClick={() => setShowCreator(!showCreator)} className="text-gray-400 hover:text-white text-sm underline decoration-dotted">
              {showCreator ? "Masquer l'éditeur" : "Ajouter mes propres cartes"}
            </button>

            {showCreator && (
              <div className="mt-4 bg-gray-900 p-4 rounded border border-gray-600 animate-fade-in">
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setNewCardType('white')} className={`flex-1 py-1 rounded text-sm font-bold ${newCardType === 'white' ? 'bg-white text-black' : 'bg-gray-700 text-gray-400'}`}>Réponse</button>
                  <button onClick={() => setNewCardType('black')} className={`flex-1 py-1 rounded text-sm font-bold ${newCardType === 'black' ? 'bg-black text-white border border-white' : 'bg-gray-700 text-gray-400'}`}>Question</button>
                </div>
                <textarea className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm focus:outline-none focus:border-purple-500" rows="2"
                  placeholder={newCardType === 'black' ? "Ex: J'ai perdu mes clés dans ____." : "Ex: Une raclette en été"}
                  value={newCardText} onChange={(e) => setNewCardText(e.target.value)}
                />
                <button onClick={saveCard} className="w-full mt-2 py-1 bg-green-600 hover:bg-green-500 rounded text-sm font-bold">Ajouter au jeu (+1)</button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;