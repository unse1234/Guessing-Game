import { randomInt } from 'node:crypto';

const words = [
  'Elephant',
  'Giraffe',
  'Penguin',
  'Dolphin',
  'Rabbit',
  'Butterfly',
  'Lion',
  'Turtle',
  'Owl',
  'Whale',
  'Apple',
  'Banana',
  'Pizza',
  'Carrot',
  'Sandwich',
  'Popcorn',
  'Strawberry',
  'Pancake',
  'Watermelon',
  'Cupcake',
  'Umbrella',
  'Backpack',
  'Pencil',
  'Clock',
  'Scissors',
  'Candle',
  'Glasses',
  'Key',
  'Balloon',
  'Bookshelf',
  'Laptop',
  'Camera',
  'Computer',
  'Keyboard',
  'Robot',
  'Headphones',
  'Microphone',
  'Television',
  'Flashlight',
  'Calculator',
  'Bridge',
  'Mountain',
  'House',
  'Beach',
  'Castle',
  'Lighthouse',
  'Library',
  'Waterfall',
  'Volcano',
  'Playground',
  'Bicycle',
  'Airplane',
  'Train',
  'Boat',
  'Bus',
  'Helicopter',
  'Scooter',
  'Spaceship',
  'Truck',
  'Submarine',
] as const;

const candidateWords = words.map((word) => word.toLowerCase());

export function publicGuessText(original: string, normalized: string) {
  // Apply the same rule to every candidate. Only an exact correct guess scores.
  return candidateWords.some(
    (word) => word !== normalized && normalized.includes(word),
  )
    ? '…'
    : original;
}

export function pickWordOptions(
  used: ReadonlySet<string>,
): readonly [string, string, string] {
  const available = words.filter((word) => !used.has(word));
  const pool = available.length >= 3 ? available : [...words];
  const [first] = pool.splice(randomInt(pool.length), 1);
  const [second] = pool.splice(randomInt(pool.length), 1);
  return [first, second, pool[randomInt(pool.length)]];
}
