# CLAUDE.md - JenJen Monsters

## Project Overview

JenJen Monsters is a Christmas-themed trading card game built as a personalized gift app for "Jenny". The app combines a block puzzle game with AI-generated collectible monster cards featuring Norwegian Christmas themes (Nisser, trolls, holiday food).

**Language**: UI text is in Norwegian; AI image prompts are in English.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 6
- **Styling**: Tailwind CSS (loaded via CDN in `index.html`)
- **AI Integration**: Google Gemini AI (`@google/genai`) for card text generation and image generation
- **Storage**: IndexedDB for cards/images, localStorage for player stats/preferences
- **Audio**: Web Audio API (custom synthesizer, no external audio files)

## Quick Start

```bash
npm install
# Set GEMINI_API_KEY in .env.local
npm run dev      # Start dev server on port 3000
npm run build    # Production build
npm run preview  # Preview production build
```

## Project Structure

```
/
├── App.tsx              # Main app component, state management, navigation
├── index.tsx            # React entry point
├── index.html           # HTML template with Tailwind + custom CSS animations
├── types.ts             # TypeScript interfaces and enums
├── constants.ts         # Element/rarity colors, icons, meld rewards
├── vite.config.ts       # Vite configuration, API key injection
├── tsconfig.json        # TypeScript configuration
│
├── components/
│   ├── BlockGame.tsx    # Block puzzle mini-game (8x8 grid, Tetris-like)
│   ├── PackOpener.tsx   # Card pack opening experience with animations
│   ├── CardComponent.tsx# Individual card display with holo effects, image loading
│   ├── Collection.tsx   # Card collection viewer with filters, virtual scrolling
│   └── Navigation.tsx   # Bottom navigation bar
│
├── services/
│   ├── geminiService.ts # AI card generation and image generation
│   └── storageService.ts# IndexedDB + localStorage persistence layer
│
└── utils/
    └── audio.ts         # Web Audio synthesizer for SFX and background music
```

## Key Components

### App.tsx (Main Controller)
- Manages global state: coins, level, XP, inventory
- Handles view switching (GAME, SHOP, COLLECTION)
- Daily reward advent calendar system
- Level-up progression with XP curve
- Intro gift flow for new users

### BlockGame.tsx
- 8x8 grid block puzzle game
- Shape placement with rotation
- Line clearing with combo/streak system
- Power-ups: BOMB, LINE, COLOR, SINGLE, REFRESH
- Auto-save game session to IndexedDB
- Rescue mode when stuck (buy power-ups)

### PackOpener.tsx
- Purchase and open card packs (100 coins)
- Preloads next pack for instant opening
- Optimistic image generation during animation
- Staggered card reveal animations

### CardComponent.tsx
- 3D flip card with holographic effects
- Lazy image loading from IndexedDB
- Image generation on-demand via Gemini
- Memory optimization (blob URL management, virtual unloading)
- In-card image editing feature

### Collection.tsx
- Virtual scrolling for large collections
- Filter by element type, rarity, favorites, "new"
- Sort options (newest, rarity, name)
- Saved layout presets
- Card melding (combine duplicates for rewards)

## Services

### geminiService.ts
- `generateBoosterPack()`: Creates 5 cards with Norwegian Christmas themes
  - Uses structured JSON output from Gemini 2.5 Flash
  - Slot structure: 3 common/uncommon, 1 rare, 1 hit card
- `generateCardArt()`: Generates card images via Gemini 3 Pro Image
  - Style: "Cute 3D Isometric Render" (Blender-like)
  - Type/rarity-specific visual modifiers
- `editCardArt()`: Image editing using existing card image + prompt

### storageService.ts
- **IndexedDB** (`JenJenMonstersDB`):
  - `user_cards` store: Card data with compressed images
  - `game_state` store: Power-ups, game session
- **localStorage**: Coins, high score, player level/XP, favorites, daily rewards, music preference
- Image compression before storage (512px, JPEG 75%)
- Optimized inventory loading (images replaced with "stored" placeholder)

## Type System

```typescript
// Core card structure
interface MonsterCard {
  id: string;
  name: string;
  type: ElementType;      // Fire, Water, Grass, Electric, Psychic, Dark, Dragon, Steel, Fairy
  hp: number;
  rarity: Rarity;         // Common, Uncommon, Rare, Legendary, Mythical
  flavorText: string;
  moves: Move[];
  visualPrompt: string;   // English prompt for image generation
  imageUrl?: string;      // Base64 or "stored" (lazy-loaded from DB)
  isShiny?: boolean;
}

// App views
type ViewState = 'GAME' | 'SHOP' | 'COLLECTION';
```

## Code Conventions

### State Management
- Local React state with `useState`/`useEffect`
- No external state library
- Refs (`useRef`) for mutable values that shouldn't trigger re-renders
- `useMemo`/`useCallback` for performance optimization

### Styling
- Tailwind utility classes
- Custom CSS animations defined in `index.html`
- CSS custom properties for dynamic values (`--holo-x`, `--holo-y`)
- Mobile-first responsive design

### Performance Patterns
- Intersection Observer for lazy loading
- Virtual scrolling in Collection
- Blob URL management with cleanup
- Debounced scroll handlers
- `requestAnimationFrame` for smooth animations
- Direct DOM manipulation for mouse-tracking effects (not React state)

### Audio
- All sounds synthesized via Web Audio API
- `resumeAudioContext()` on first user interaction
- `musicManager` for background melody loop
- Sound functions: `playSoftClick`, `playHardClick`, `playPopSound`, `playSuccessSound`, `playErrorSound`, `playMagicalSparkle`

## Environment Variables

```bash
# .env.local
GEMINI_API_KEY=your_api_key_here
```

The API key is injected via Vite's `define` as `process.env.API_KEY`.

## Important Notes for AI Assistants

1. **Language**: All user-facing text is in Norwegian. AI image prompts must be in English.

2. **Card ID Format**: `card-{timestamp}-{index}-{random}` - timestamp is used for "new" badge logic.

3. **Image Handling**:
   - New cards have base64 `imageUrl`
   - Stored cards have `imageUrl: "stored"` (lazy-load from DB)
   - Memory optimization: images unloaded when off-screen

4. **Game Progression**:
   - XP curve: `BASE_XP * level^1.4` (BASE_XP = 200)
   - Level rewards: `level * 50 + 100` coins
   - Pack cost: 100 coins

5. **CSS Classes to Know**:
   - `glass-panel`: Frosted glass effect
   - `gem-block-3d`: 3D block styling
   - `shiny-active`: Enables shiny card effects
   - `holo-rare/legendary/mythical`: Holographic overlays

6. **Safe Area**: Uses CSS `env(safe-area-inset-*)` for mobile notches.

7. **No Tests**: This project has no test suite currently.

8. **No Linting Config**: No ESLint or Prettier configuration files.

## Common Tasks

### Adding a New Power-Up
1. Add to `PowerUpType` in `types.ts`
2. Add cost to `POWER_UP_COSTS` in `BlockGame.tsx`
3. Implement in `getPowerUpAffectedCells()` and `executePowerUp()`
4. Add UI button in the power-up bar

### Adding a New Element Type
1. Add to `ElementType` enum in `types.ts`
2. Add color mapping in `ELEMENT_COLORS` in `constants.ts`
3. Add icon in `ELEMENT_ICONS` in `constants.ts`
4. Add style modifiers in `geminiService.ts` for image generation

### Modifying Card Generation
- Edit system prompt in `geminiService.ts` > `generateBoosterPack()`
- Modify `responseSchema` for structured output changes
- Fallback cards are defined at the end of the function

### Changing Game Mechanics
- XP curve: Modify `BASE_XP` and `XP_GROWTH` in `App.tsx`
- Daily rewards: Modify `DAILY_REWARDS` array in `App.tsx`
- Meld rewards: Modify `MELD_REWARDS` in `constants.ts`
