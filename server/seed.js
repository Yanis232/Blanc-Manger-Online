require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI;

// 🔥 CORRECTION ICI : On ajoute 'pick' dans le schéma du script
const CardSchema = new mongoose.Schema({
  text: String,
  type: { type: String, enum: ['black', 'white'] },
  pick: { type: Number, default: 1 }, // <--- C'est ça qui manquait !
  createdAt: { type: Date, default: Date.now }
});
const Card = mongoose.model('Card', CardSchema);

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connecté à MongoDB.');
    
    const cardsPath = path.join(__dirname, 'cards.json');
    const cardsData = JSON.parse(fs.readFileSync(cardsPath, 'utf-8'));
    
    console.log(`📂 Fichier lu : ${cardsData.length} cartes trouvées.`);

    await Card.deleteMany({});
    console.log('🗑️ Base de données vidée.');

    await Card.insertMany(cardsData);
    console.log(`✨ SUCCÈS : ${cardsData.length} cartes importées (avec Pick 2 supporté) !`);
    
    process.exit();
  })
  .catch(err => {
    console.error("❌ Erreur:", err);
    process.exit(1);
  });