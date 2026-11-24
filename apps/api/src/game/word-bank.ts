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

export function pickWordOptions(): readonly [string, string, string] {
  const first = randomInt(words.length);
  const second = (first + randomInt(1, words.length)) % words.length;
  let third: number;
  do {
    third = randomInt(words.length);
  } while (third === first || third === second);

  return [words[first], words[second], words[third]];
}
