require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs'); // Module pour lire les fichiers
const path = require('path');

// --- CONFIGURATION ---
const MONGO_URI = process.env.MONGO_URI;

const CardSchema = new mongoose.Schema({
  text: String,
  type: { type: String, enum: ['black', 'white'] },
  createdAt: { type: Date, default: Date.now }
});
const Card = mongoose.model('Card', CardSchema);

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connecté à MongoDB.');
    
    // 1. Lire le fichier JSON
    const cardsPath = path.join(__dirname, 'cards.json');
    const cardsData = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));
    
    console.log(`📂 Fichier lu : ${cardsData.length} cartes trouvées.`);

    // 2. Nettoyer la base (Optionnel : commente cette ligne si tu veux AJOUTER sans effacer)
    await Card.deleteMany({});
    console.log('🗑️ Base de données vidée (repart à zéro).');

    // 3. Insérer les cartes
    await Card.insertMany(cardsData);
    console.log(`✨ SUCCÈS : ${cardsData.length} cartes importées dans la base !`);
    
    process.exit();
  })
  .catch(err => {
    console.error("❌ Erreur:", err);
    process.exit(1);
  });