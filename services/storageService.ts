
import { MonsterCard, PowerUpType, SavedGameSession, SavedLayout } from '../types';

const DB_NAME = 'JenJenMonstersDB';
const DB_VERSION = 2; 
const CARD_STORE_NAME = 'user_cards'; 
const GAME_STORE_NAME = 'game_state'; 

// Singleton DB Instance to prevent connection leaks
let dbInstance: IDBDatabase | null = null;
let dbConnectionPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  // Return existing instance if ready
  if (dbInstance) return Promise.resolve(dbInstance);
  
  // Return existing promise if connecting
  if (dbConnectionPromise) return dbConnectionPromise;

  dbConnectionPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB not supported"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
        console.error("IndexedDB Open Error:", request.error);
        dbConnectionPromise = null;
        reject(request.error);
    };
    
    request.onsuccess = () => {
        const db = request.result;
        dbInstance = db;
        
        // Handle connection closing unexpectedly (e.g. app backgrounded for long time)
        db.onclose = () => {
            console.warn("IndexedDB connection closed");
            dbInstance = null;
            dbConnectionPromise = null;
        };

        db.onversionchange = () => {
            db.close();
            dbInstance = null;
            dbConnectionPromise = null;
        };

        resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(CARD_STORE_NAME)) {
        db.createObjectStore(CARD_STORE_NAME, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(GAME_STORE_NAME)) {
        db.createObjectStore(GAME_STORE_NAME);
      }
    };
  });

  return dbConnectionPromise;
};

// --- IMAGE COMPRESSION HELPER ---
const compressImage = async (base64Str: string): Promise<string> => {
  // Only compress if it's a valid base64 image string
  if (!base64Str || !base64Str.startsWith('data:image')) return base64Str;

  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    
    img.onload = () => {
      // 512px is sufficient for mobile cards (retina ~250px logical width)
      const maxWidth = 512; 
      const quality = 0.75; // Balance between quality and storage size
      
      let width = img.width;
      let height = img.height;
      
      // Scale down if too large
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Fill white background to handle transparency if converting PNG to JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        // Convert to JPEG for better compression
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      } else {
        // Fallback if context fails
        resolve(base64Str);
      }
      
      // Cleanup to help GC
      img.onload = null;
      img.onerror = null;
      img.src = "";
    };
    
    img.onerror = () => {
        console.warn("Image load failed during compression, saving original.");
        img.onload = null;
        img.onerror = null;
        resolve(base64Str);
    };
  });
};

export const storageService = {
  // --- CARD MANAGEMENT (Granular) ---

  async saveCard(card: MonsterCard) {
    try {
      const db = await getDB();
      
      // Clone card to avoid mutating the UI state directly
      const cardToSave = { ...card };
      
      // Compress image before saving if it exists, is not a placeholder, and looks like an image
      if (cardToSave.imageUrl && cardToSave.imageUrl !== 'stored' && cardToSave.imageUrl.startsWith('data:image')) {
          try {
             cardToSave.imageUrl = await compressImage(cardToSave.imageUrl);
          } catch(e) {
             console.warn("Compression failed, saving original", e);
          }
      }

      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CARD_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CARD_STORE_NAME);
        const request = store.put(cardToSave);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error("Failed to save individual card:", e);
    }
  },

  async saveCards(cards: MonsterCard[]) {
    try {
      const db = await getDB();

      // Process compression for all cards in parallel
      const compressedCards = await Promise.all(cards.map(async (card) => {
          const cardToSave = { ...card };
          if (cardToSave.imageUrl && cardToSave.imageUrl !== 'stored' && cardToSave.imageUrl.startsWith('data:image')) {
              try {
                  cardToSave.imageUrl = await compressImage(cardToSave.imageUrl);
              } catch (e) { /* ignore error and save original */ }
          }
          return cardToSave;
      }));

      return new Promise<void>((resolve, reject) => {
        try {
            const tx = db.transaction(CARD_STORE_NAME, 'readwrite');
            const store = tx.objectStore(CARD_STORE_NAME);
            
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);

            compressedCards.forEach(card => store.put(card));
        } catch(txError) {
             // Retry logic could go here, or just reject
             reject(txError);
        }
      });
    } catch (e) {
      console.error("Failed to save multiple cards:", e);
    }
  },

  async deleteCard(cardId: string) {
    try {
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CARD_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CARD_STORE_NAME);
        const request = store.delete(cardId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error("Failed to delete card:", e);
    }
  },

  async deleteCards(cardIds: string[]) {
    try {
      const db = await getDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CARD_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CARD_STORE_NAME);
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        
        cardIds.forEach(id => store.delete(id));
      });
    } catch (e) {
      console.error("Failed to delete cards:", e);
    }
  },

  // Optimized load: Returns Metadata ONLY. Images are replaced with "stored" placeholder.
  async loadInventory(): Promise<MonsterCard[]> {
    try {
      const db = await getDB();
      return new Promise<MonsterCard[]>((resolve, reject) => {
        const tx = db.transaction(CARD_STORE_NAME, 'readonly');
        const store = tx.objectStore(CARD_STORE_NAME);
        const request = store.openCursor();
        const cards: MonsterCard[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            const card = cursor.value as MonsterCard;
            // MEMORY OPTIMIZATION: Do not load the base64 string into main memory array.
            // We strip it out and leave a flag.
            const lightweightCard = { ...card };
            if (lightweightCard.imageUrl && lightweightCard.imageUrl.length > 100) {
                lightweightCard.imageUrl = "stored"; 
            }
            cards.push(lightweightCard);
            cursor.continue();
          } else {
            resolve(cards);
          }
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error("Failed to load inventory:", e);
      return [];
    }
  },

  // Fetch full card (with image) by ID
  async getCard(id: string): Promise<MonsterCard | undefined> {
    try {
      const db = await getDB();
      return new Promise<MonsterCard | undefined>((resolve, reject) => {
        const tx = db.transaction(CARD_STORE_NAME, 'readonly');
        const store = tx.objectStore(CARD_STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error(`Failed to get card ${id}:`, e);
      return undefined;
    }
  },

  // --- GAME STATE ---

  async savePowerUps(powerUps: Record<PowerUpType, number>) {
    try {
        const db = await getDB();
        const tx = db.transaction(GAME_STORE_NAME, 'readwrite');
        tx.objectStore(GAME_STORE_NAME).put(powerUps, 'powerups');
    } catch(e) { console.error("Error saving powerups", e); }
  },

  async loadPowerUps(): Promise<Record<PowerUpType, number> | null> {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(GAME_STORE_NAME, 'readonly');
            const req = tx.objectStore(GAME_STORE_NAME).get('powerups');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
  },

  async saveGameSession(session: SavedGameSession) {
    try {
        const db = await getDB();
        const tx = db.transaction(GAME_STORE_NAME, 'readwrite');
        tx.objectStore(GAME_STORE_NAME).put(session, 'current_session');
    } catch(e) { console.error("Error saving session", e); }
  },

  async loadGameSession(): Promise<SavedGameSession | null> {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(GAME_STORE_NAME, 'readonly');
            const req = tx.objectStore(GAME_STORE_NAME).get('current_session');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch { return null; }
  },

  async clearGameSession() {
      try {
          const db = await getDB();
          const tx = db.transaction(GAME_STORE_NAME, 'readwrite');
          tx.objectStore(GAME_STORE_NAME).delete('current_session');
      } catch(e) { console.error("Error clearing session", e); }
  },

  // --- LOCAL STORAGE HELPERS ---

  saveCoins(amount: number) {
    localStorage.setItem('jenjen_coins', amount.toString());
  },

  loadCoins(): number {
    const saved = localStorage.getItem('jenjen_coins');
    return saved ? parseInt(saved, 10) : 300; 
  },

  saveHighScore(score: number) {
    localStorage.setItem('jenjen_highscore', score.toString());
  },

  loadHighScore(): number {
    const saved = localStorage.getItem('jenjen_highscore');
    return saved ? parseInt(saved, 10) : 0;
  },

  saveFavorites(ids: string[]) {
    localStorage.setItem('jenjen_favorites', JSON.stringify(ids));
  },

  loadFavorites(): string[] {
    try {
      const saved = localStorage.getItem('jenjen_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  },

  saveLastViewedTime(timestamp: number) {
    localStorage.setItem('jenjen_last_viewed', timestamp.toString());
  },

  loadLastViewedTime(): number {
    const saved = localStorage.getItem('jenjen_last_viewed');
    return saved ? parseInt(saved, 10) : 0;
  },

  savePlayerStats(level: number, xp: number) {
    localStorage.setItem('jenjen_level', level.toString());
    localStorage.setItem('jenjen_xp', xp.toString());
  },

  loadPlayerStats(): { level: number, xp: number } {
    const level = parseInt(localStorage.getItem('jenjen_level') || '1', 10);
    const xp = parseInt(localStorage.getItem('jenjen_xp') || '0', 10);
    return { level, xp };
  },

  saveDailyReward(lastClaimDate: number, streak: number) {
    localStorage.setItem('jenjen_daily_reward', JSON.stringify({ lastClaimDate, streak }));
  },

  loadDailyReward(): { lastClaimDate: number, streak: number } {
    try {
      const saved = localStorage.getItem('jenjen_daily_reward');
      return saved ? JSON.parse(saved) : { lastClaimDate: 0, streak: 0 };
    } catch { return { lastClaimDate: 0, streak: 0 }; }
  },

  // --- MUSIC PREFERENCE ---
  saveMusicMuted(isMuted: boolean) {
    localStorage.setItem('jenjen_music_muted', JSON.stringify(isMuted));
  },

  loadMusicMuted(): boolean {
    const saved = localStorage.getItem('jenjen_music_muted');
    return saved ? JSON.parse(saved) : false; // Default is NOT muted (Music On)
  },

  // --- INTRO GIFT STATUS ---
  saveIntroGiftClaimed(claimed: boolean) {
    localStorage.setItem('jenjen_intro_gift', JSON.stringify(claimed));
  },

  loadIntroGiftClaimed(): boolean {
    const saved = localStorage.getItem('jenjen_intro_gift');
    return saved ? JSON.parse(saved) : false;
  },

  // --- COLLECTION LAYOUTS ---

  saveCollectionLayouts(layouts: SavedLayout[]) {
    localStorage.setItem('jenjen_collection_layouts', JSON.stringify(layouts));
  },

  loadCollectionLayouts(): SavedLayout[] {
    try {
      const saved = localStorage.getItem('jenjen_collection_layouts');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }
};
