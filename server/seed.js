// 1. On charge la librairie qui lit le fichier .env
require('dotenv').config(); 

const mongoose = require('mongoose');

// 2. On récupère le lien sécurisé (plus de mot de passe en dur ici !)
const MONGO_URI = process.env.MONGO_URI;

// Définition simple des cartes
const CardSchema = new mongoose.Schema({
  text: String,
  type: { type: String, enum: ['black', 'white'] }, // 'black' pour question, 'white' pour réponse
  pack: { type: String, default: 'Base' }
});

const Card = mongoose.model('Card', CardSchema);

const BLACK_DECK = [
  "Pour mon repas de mariage, j'ai prévu ____.",
  "Chérie, j'ai rétréci ____ !",
  "Le nouveau parfum de Dior : Essence de ____.",
  "C'est quoi cette odeur ? C'est ____.",
  "En 2025, la fin du monde sera causée par ____.",
  "Mon super-pouvoir inutile, c'est ____.",
  "La seule chose qui m'excite plus que l'argent, c'est ____."
];

const WHITE_DECK = [
  "Une grand-mère en bikini", "Un poney sous stéroïdes", "La calvitie de mon oncle",
  "Un tacos 3 viandes", "Emmanuel Macron", "Mes choix de vie douteux",
  "Un enfant qui pleure", "Une chaussette sale", "L'historique internet de ton père",
  "Un vegan agressif", "Une explosion nucléaire", "Le patriarcat",
  "300g de jambon", "Un date Tinder gênant", "Ma dignité",
  "Un massage des pieds", "Une attaque de zombies", "Le coronavirus",
  "Une MST surprise", "Du gluten", "Un slip kangourou", "Un influenceur Dubaï",
  "La chatte à la voisine", "Une dictature bienveillante"
];

const seedDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connecté à MongoDB');

    // On vide la base pour éviter les doublons si on relance le script
    await Card.deleteMany({});
    console.log('🗑️ Anciennes cartes supprimées');

    // On prépare les nouvelles cartes
    const blackCards = BLACK_DECK.map(text => ({ text, type: 'black' }));
    const whiteCards = WHITE_DECK.map(text => ({ text, type: 'white' }));

    // On insère tout
    await Card.insertMany([...blackCards, ...whiteCards]);
    console.log(`🎉 Ajouté : ${blackCards.length} cartes noires et ${whiteCards.length} cartes blanches.`);

    mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
};

seedDB();