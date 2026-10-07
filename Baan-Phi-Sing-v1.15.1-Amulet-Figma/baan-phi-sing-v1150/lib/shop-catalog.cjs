'use strict';

// Server-owned prices. Never accept prices or ownership from a browser.
const CHARACTERS = Object.freeze([
  { key: 'mae-mali', price: 0 },
  { key: 'doctor', price: 0 },
  { key: 'nerd', price: 0 },
  { key: 'mor-tham', price: 0 },
  { key: 'por-krai', price: 250 },
  { key: 'black-shaman', price: 250 },
  { key: 'temple-dog', price: 250 },
  { key: 'stray-cat', price: 250 }
].map(Object.freeze));
const CATEGORIES = Object.freeze([
  Object.freeze({ key: 'characters', label: 'ตัวละคร', available: true }),
  Object.freeze({ key: 'frames', label: 'กรอบรูปโปรไฟล์', available: false }),
  Object.freeze({ key: 'boards', label: 'สกินกระดานเกม', available: false })
]);
function characterPrice(key) {
  return CHARACTERS.find(item => item.key === key)?.price ?? null;
}
function ownedCharacters(purchases = []) {
  const purchased = new Set(purchases);
  return CHARACTERS.filter(item => item.price === 0 || purchased.has(item.key)).map(item => item.key);
}
function canUseCharacter(key, purchases = []) {
  return ownedCharacters(purchases).includes(key);
}
module.exports = { CHARACTERS, CATEGORIES, characterPrice, ownedCharacters, canUseCharacter };
