import type { CSSProperties } from 'react';

export enum ElementType {
  Fire = 'Fire',
  Water = 'Water',
  Grass = 'Grass',
  Electric = 'Electric',
  Psychic = 'Psychic',
  Dark = 'Dark',
  Dragon = 'Dragon',
  Steel = 'Steel',
  Fairy = 'Fairy'
}

export enum Rarity {
  Common = 'Common',
  Uncommon = 'Uncommon',
  Rare = 'Rare',
  Legendary = 'Legendary',
  Mythical = 'Mythical'
}

export interface Move {
  name: string;
  damage: string;
  cost: number;
  description: string;
}

export interface MonsterCard {
  id: string;
  name: string;
  type: ElementType;
  hp: number;
  rarity: Rarity;
  flavorText: string;
  moves: Move[];
  visualPrompt: string;
  imageUrl?: string; // If generated. Can be "stored" to indicate it exists in DB but not in memory.
  isShiny?: boolean; // Distinct from rarity, adds special visual effect
}

export type AppState = 'IDLE' | 'OPENING' | 'REVEALED';

export type ViewState = 'GAME' | 'SHOP' | 'COLLECTION';

// Game Types
export type BlockColor = string;
export type GridCell = BlockColor | null;
export type ShapeLayout = number[][]; // 2D array 0/1
export type PowerUpType = 'BOMB' | 'LINE' | 'COLOR' | 'SINGLE' | 'REFRESH';

export interface Shape {
  id: string;
  layout: ShapeLayout;
  color: string;
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  scale?: number;
}

export interface Particle {
  id: string;
  r: number;
  c: number;
  color: string;
  style: CSSProperties;
  createdAt?: number;
}

export interface SavedGameSession {
  grid: GridCell[][];
  shapes: Shape[];
  holdShape: Shape | null;
  score: number;
  comboCount: number;
  streakCount: number;
  rescueMode: boolean;
  isGameOver: boolean;
}

// Collection Layout Types
export type SortOption = 'NEWEST' | 'OLDEST' | 'RARITY_DESC' | 'RARITY_ASC' | 'NAME_ASC' | 'NAME_DESC' | 'FAVORITES';
export type FilterOption = ElementType | Rarity | 'ALL' | 'FAVORITES' | 'NEW';

export interface SavedLayout {
  id: string;
  name: string;
  filter: FilterOption;
  sort: SortOption;
}