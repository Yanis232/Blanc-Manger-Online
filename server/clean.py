import json

# Charge ton fichier
with open('cards.json', 'r', encoding='utf-8') as f:
    cards = json.load(f)

# Nettoie les tags
for card in cards:
    if 'tags' in card:
        # Si contient "trash" ou "politic" → Trash
        if any(tag in ['trash', 'politic'] for tag in card['tags']):
            card['tags'] = ['trash']
        # Sinon → Soft
        else:
            card['tags'] = ['soft']
    else:
        card['tags'] = ['soft']

# Sauvegarde
with open('cards_clean.json', 'w', encoding='utf-8') as f:
    json.dump(cards, f, ensure_ascii=False, indent=2)

print(f"✅ {len(cards)} cartes nettoyées !")