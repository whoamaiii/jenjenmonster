/**
 * Game Configuration
 * Centralized constants for game balancing and settings.
 * Modify these values to tweak game behavior without diving into component code.
 */

// =============================================================================
// XP & Leveling System
// =============================================================================

export const XP_CONFIG = {
  /** Base XP required to level up from level 1 */
  BASE_XP: 200,
  /** Growth factor for XP curve (higher = steeper curve) */
  GROWTH_FACTOR: 1.4,
  /** XP gained per pack opened */
  XP_PER_PACK: 150,
} as const;

/**
 * Calculate XP required for next level
 */
export const getXpForNextLevel = (level: number): number => {
  return Math.floor(XP_CONFIG.BASE_XP * Math.pow(level, XP_CONFIG.GROWTH_FACTOR));
};

// =============================================================================
// Economy & Rewards
// =============================================================================

export const ECONOMY_CONFIG = {
  /** Starting coins for new players */
  STARTING_COINS: 300,
  /** Cost to buy a card pack */
  PACK_COST: 100,
  /** Coins earned per score point in block game (score / DIVISOR) */
  SCORE_TO_COINS_DIVISOR: 10,
  /** Bonus coins per level up (level * MULTIPLIER + BASE) */
  LEVEL_UP_COIN_MULTIPLIER: 50,
  LEVEL_UP_COIN_BASE: 100,
  /** Intro gift coins */
  INTRO_GIFT_COINS: 1000,
} as const;

export const DAILY_REWARDS = [50, 100, 150, 200, 250, 300, 500] as const;

// =============================================================================
// Block Game Settings
// =============================================================================

export const BLOCK_GAME_CONFIG = {
  /** Grid dimensions (NxN) */
  GRID_SIZE: 8,
  /** Points per block placed */
  POINTS_PER_BLOCK: 1,
  /** Points per line cleared */
  POINTS_PER_LINE: 150,
  /** Delay before clearing animation (ms) */
  CLEAR_ANIMATION_DELAY: 400,
  /** Delay before game over check (ms) */
  GAME_OVER_CHECK_DELAY: 500,
  /** Auto-save interval (ms) */
  AUTO_SAVE_INTERVAL: 30000,
  /** Shape generation delay after clearing all (ms) */
  SHAPE_GENERATION_DELAY: 300,
} as const;

export const POWER_UP_COSTS = {
  BOMB: 100,
  LINE: 80,
  COLOR: 120,
  SINGLE: 50,
  REFRESH: 25,
} as const;

// =============================================================================
// Image Settings
// =============================================================================

export const IMAGE_CONFIG = {
  /** Max width for compressed card images */
  MAX_WIDTH: 512,
  /** JPEG quality for compression (0-1) */
  JPEG_QUALITY: 0.75,
  /** Debounce delay for image loading (ms) */
  LOAD_DEBOUNCE: 100,
  /** Hysteresis delay for image unloading (ms) */
  UNLOAD_DEBOUNCE: 2000,
} as const;

// =============================================================================
// Animation Timings
// =============================================================================

export const ANIMATION_CONFIG = {
  /** Stagger delay between shiny card burst animations (ms) */
  SHINY_BURST_STAGGER: 200,
  /** Duration of shiny burst effect (ms) */
  SHINY_BURST_DURATION: 2000,
  /** Game over phase transition delays (ms) */
  GAME_OVER_PHASES: {
    TITLE_DELAY: 0,
    SCORE_DELAY: 600,
    XP_DELAY: 1800,
    COINS_DELAY: 3000,
    BUTTONS_DELAY: 4200,
  },
  /** Score counting animation duration (ms) */
  SCORE_COUNT_DURATION: 1000,
} as const;

// =============================================================================
// Particle Effects
// =============================================================================

export const PARTICLE_CONFIG = {
  /** Number of particles per cell clear */
  PARTICLES_PER_CELL: 6,
  /** Max particles in pool (performance limit) */
  MAX_PARTICLES: 100,
  /** Particle lifetime (ms) */
  PARTICLE_LIFETIME: 1000,
  /** Confetti particle count for game over */
  GAME_OVER_CONFETTI_COUNT: 50,
} as const;

// =============================================================================
// Card Generation
// =============================================================================

export const CARD_GENERATION_CONFIG = {
  /** Chance for non-mythical cards to be shiny */
  SHINY_CHANCE: 0.15,
  /** Mythical cards are always shiny */
  MYTHICAL_ALWAYS_SHINY: true,
} as const;
