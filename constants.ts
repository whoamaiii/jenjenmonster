
import { ElementType, Rarity } from './types';

export const ELEMENT_COLORS: Record<ElementType, string> = {
  [ElementType.Fire]: 'type-fire',
  [ElementType.Water]: 'type-water',
  [ElementType.Grass]: 'type-grass',
  [ElementType.Electric]: 'type-electric',
  [ElementType.Psychic]: 'type-psychic',
  [ElementType.Dark]: 'type-dark',
  [ElementType.Dragon]: 'type-dragon',
  [ElementType.Steel]: 'type-steel',
  [ElementType.Fairy]: 'type-fairy',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  [Rarity.Common]: 'text-slate-300',
  [Rarity.Uncommon]: 'text-emerald-300 drop-shadow-sm',
  [Rarity.Rare]: 'text-sky-300 drop-shadow-md',
  [Rarity.Legendary]: 'text-amber-300 drop-shadow-lg',
  [Rarity.Mythical]: 'text-fuchsia-300 drop-shadow-lg',
};

export const RARITY_TRANSLATIONS: Record<Rarity, string> = {
  [Rarity.Common]: 'Vanlig',
  [Rarity.Uncommon]: 'Uvanlig',
  [Rarity.Rare]: 'Sjelden',
  [Rarity.Legendary]: 'Legendarisk',
  [Rarity.Mythical]: 'Mytisk',
};

export const ELEMENT_ICONS: Record<ElementType, string> = {
  [ElementType.Fire]: '🔥',
  [ElementType.Water]: '💧',
  [ElementType.Grass]: '🌿',
  [ElementType.Electric]: '⚡',
  [ElementType.Psychic]: '🔮',
  [ElementType.Dark]: '🌑',
  [ElementType.Dragon]: '🐉',
  [ElementType.Steel]: '⚙️',
  [ElementType.Fairy]: '✨',
};

export const MELD_REWARDS: Record<Rarity, { coins: number; xp: number }> = {
  [Rarity.Common]: { coins: 15, xp: 25 },
  [Rarity.Uncommon]: { coins: 30, xp: 60 },
  [Rarity.Rare]: { coins: 100, xp: 200 },
  [Rarity.Legendary]: { coins: 500, xp: 1000 },
  [Rarity.Mythical]: { coins: 1500, xp: 2500 },
};
