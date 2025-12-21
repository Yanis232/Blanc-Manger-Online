require('dotenv').config();
const mongoose = require('mongoose');

// --- CONFIGURATION ---
const MONGO_URI = process.env.MONGO_URI || "mets_ton_lien_mongodb_ici_si_ca_marche_pas";

const CardSchema = new mongoose.Schema({
  text: String,
  type: { type: String, enum: ['black', 'white'] },
  createdAt: { type: Date, default: Date.now }
});
const Card = mongoose.model('Card', CardSchema);

// --- LES CARTES À AJOUTER ---
const blackCards = [
    "La seule chose qui m'excite plus que l'argent, c'est _____.",
    "Pour mon repas de mariage, j'ai prévu _____.",
    "Ce soir, c'est raclette et _____.",
    "Mon super-pouvoir inutile, c'est _____.",
    "Dans ma valise, j'ai oublié _____.",
    "Le secret d'une vie heureuse, c'est _____.",
    "_____ : C'est doux, c'est neuf, ça lave.",
    "Pourquoi j'ai mal aux fesses ?",
    "Qu'est-ce que je cache sous mon lit ?",
    "Le nouveau parfum de Dior : Essence de _____.",
    "Chérie, je suis enceinte. Le père est _____.",
    "Le pire cadeau de Noël : _____.",
    "En guerre, tous les moyens sont bons, même _____.",
    "Le président a déclaré la guerre à _____.",
    "Qu'est-ce qui a ruiné la fête d'anniversaire ?",
    "Avant de mourir, je veux essayer _____."
];

const whiteCards = [
    "Un influenceur à Dubaï",
    "300g de jambon",
    "La calvitie de mon oncle",
    "Un poney sous stéroïdes",
    "L'album de Francky Vincent",
    "Ma dignité",
    "Le petit grégory",
    "Un vegan agressif",
    "Une explosion nucléaire",
    "L'historique internet de ton père",
    "Un tacos 3 viandes",
    "Hitler",
    "Des chaussettes dans des sandales",
    "Une MST surprise",
    "L'odeur du métro parisien",
    "Ma belle-mère",
    "Un suppositoire géant",
    "Le cadavre de mon ex",
    "Une érection incontrôlable",
    "Une grand-mère en bikini",
    "Un enfant qui pleure dans l'avion",
    "Manger ses crottes de nez",
    "Se faire larguer par SMS",
    "Un prêtre un peu trop tactile",
    "Une sodomie accidentelle",
    "Vendre son rein pour un iPhone",
    "Nicolas Sarkozy sur un tabouret",
    "Un pet foireux",
    "La diarrhée du lendemain de cuite",
    "Un sextoy d'occasion",
    "Une gifle de Will Smith",
    "Coucher avec le prof de maths",
    "Une pizza ananas",
    "Faire pipi sous la douche",
    "Un nain de jardin maléfique",
    "Les pieds de Yannick Noah",
    "Un massage thaïlandais avec finition",
    "Une partouze chez les Schtroumpfs",
    "Le périnée de ma tante",
    "Un chaton mignon mais mort",
    "Se réveiller à côté d'un inconnu",
    "L'haleine du matin",
    "Un contrôleur des impôts",
    "Une vidéo de chatons",
    "Le silence gênant dans l'ascenseur"
];

// --- LOGIQUE D'INJECTION ---
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connecté à MongoDB. Nettoyage en cours...');
    
    // 1. On supprime tout pour éviter les doublons dans la BDD
    await Card.deleteMany({});
    console.log('🗑️ Base de données vidée.');

    // 2. On prépare les objets
    const cardsToInsert = [
        ...blackCards.map(text => ({ text, type: 'black' })),
        ...whiteCards.map(text => ({ text, type: 'white' }))
    ];

    // 3. On insère tout
    await Card.insertMany(cardsToInsert);
    console.log(`✨ SUCCÈS : ${cardsToInsert.length} cartes ajoutées !`);
    
    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });