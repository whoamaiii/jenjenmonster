import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { MonsterCard, AppState, Rarity } from '../types';
import { generateBoosterPack, generateCardArt } from '../services/geminiService';
import { RARITY_COLORS, RARITY_TRANSLATIONS } from '../constants';
import CardComponent from './CardComponent';
import { playHoverSound, playMagicalSparkle, playCardWhoosh, playErrorSound, playSuccessSound, playSoftClick } from '../utils/audio';
import { ECONOMY_CONFIG } from '../config/gameConfig';

interface PackOpenerProps {
  coins: number;
  deductCoins: (amount: number) => boolean;
  onCardsRevealed: (cards: MonsterCard[]) => void;
  onImageSaved?: (id: string) => void;
}

const PACK_COST = ECONOMY_CONFIG.PACK_COST;

const PackOpener: React.FC<PackOpenerProps> = ({ coins, deductCoins, onCardsRevealed, onImageSaved }) => {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [cards, setCards] = useState<MonsterCard[]>([]);
  const [error, setError] = useState<string>('');
  const [cardsVisible, setCardsVisible] = useState(false);
  
  // Preloading State
  const [preloadedPack, setPreloadedPack] = useState<MonsterCard[] | null>(null);
  const isLoadingNextPackRef = useRef(false);
  const isMounted = useRef(true);
  
  // Cache for optimistically generated images to prevent loss during state updates
  // We use a Ref because state updates are async and can clash during the fast animation sequence
  const generatedImagesCache = useRef<Record<string, string>>({});
  
  // Timer Refs for Cleanup
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioTimerRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Optimization: Memoize sparkles to prevent re-calculations during render loop
  const sparkleCount = 20;
  const sparkles = useMemo(() => Array.from({ length: sparkleCount }).map((_, i) => ({
      id: i,
      tx: (Math.random() - 0.5) * 400, // Wide spread
      ty: (Math.random() - 0.5) * 400,
      delay: Math.random() * 1.2,
      color: ['#FFD700', '#FFA500', '#FFFFFF', '#00FFFF'][Math.floor(Math.random() * 4)],
      size: Math.random() * 6 + 3
  })), []);

  // Cleanup timers on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
        isMounted.current = false;
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        audioTimerRefs.current.forEach(timer => clearTimeout(timer));
        audioTimerRefs.current = [];
    };
  }, []);

  // Start preloading when component mounts (User enters shop)
  useEffect(() => {
    if (!preloadedPack && !isLoadingNextPackRef.current) {
      loadNextPack();
    }
  }, [preloadedPack]);

  const loadNextPack = async () => {
    isLoadingNextPackRef.current = true;
    try {
      const newPack = await generateBoosterPack();
      if (isMounted.current) {
          setPreloadedPack(newPack);
      }
      isLoadingNextPackRef.current = false;
    } catch (e) {
      console.error("Failed to preload pack", e);
      isLoadingNextPackRef.current = false;
    }
  };

  useEffect(() => {
    if (appState === 'REVEALED') {
      // Clear previous audio timers
      audioTimerRefs.current.forEach(timer => clearTimeout(timer));
      audioTimerRefs.current = [];

      // Sync sound effects with the new visual stagger (150ms per card)
      // Note: We use the cards array from the closure when appState changes to REVEALED.
      // Subsequent updates to 'cards' (like images loading) won't re-trigger this effect.
      cards.forEach((_, index) => {
        const timer = setTimeout(() => playCardWhoosh(), 100 + (index * 150));
        audioTimerRefs.current.push(timer);
      });
      
      const visTimer = setTimeout(() => setCardsVisible(true), 100);
      audioTimerRefs.current.push(visTimer);
    } else {
      setCardsVisible(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]); // Only trigger on appState change, NOT on cards update

  const openPack = useCallback(async () => {
    if (!deductCoins(PACK_COST)) {
      playErrorSound(); 
      setError('Du trenger flere mynter! Spill litt mer.');
      return;
    }

    playSuccessSound();
    setAppState('OPENING');
    setError('');
    setCards([]);
    setCardsVisible(false);
    playMagicalSparkle();
    
    // Reset cache for new pack
    generatedImagesCache.current = {};

    // Function to handle the actual reveal after delay
    const finalizeReveal = (packCards: MonsterCard[]) => {
        if (!isMounted.current) return;
        
        // Merge with any optimistically generated images in the cache
        // This is CRITICAL because the state update in startOptimisticGeneration might not have persisted
        // if this runs immediately after.
        const cardsWithImages = packCards.map(card => {
            if (generatedImagesCache.current[card.id]) {
                return { ...card, imageUrl: generatedImagesCache.current[card.id] };
            }
            return card;
        });
        
        setCards(cardsWithImages);
        setAppState('REVEALED');
        onCardsRevealed(cardsWithImages);
    };

    // Optimistic Generation Logic
    const startOptimisticGeneration = (packCards: MonsterCard[]) => {
        if (packCards.length > 0) {
            const firstCard = packCards[0];
            generateCardArt(firstCard.visualPrompt, firstCard.name, firstCard.type, firstCard.rarity)
                .then(base64 => {
                    if(base64 && isMounted.current) {
                        generatedImagesCache.current[firstCard.id] = base64;
                        
                        // We optimistically update state if the user is already viewing cards.
                        // If they are still in 'OPENING' animation, we rely on finalizeReveal to pick it up from cache later.
                        setCards(prev => {
                            // If cards are already revealed (length > 0), update the live card.
                            // If length is 0, it means we are still in OPENING state, so we do NOT update state yet.
                            // finalizeReveal will grab the image from generatedImagesCache.
                            if (prev.length === 0) return prev; 
                            return prev.map(c => c.id === firstCard.id ? { ...c, imageUrl: base64 } : c);
                        });
                    }
                })
                .catch(err => console.log("Optimistic gen failed", err));
        }
    };

    // If we have a preloaded pack (text data), use it to reduce waiting time
    if (preloadedPack) {
       const packToUse = [...preloadedPack];
       setPreloadedPack(null); // Clear early so next can load
       
       // Start generating the first image IMMEDIATELY while animation plays
       startOptimisticGeneration(packToUse);

       // Reduced waiting time to 1.5s for a snappier feel
       revealTimerRef.current = setTimeout(() => {
           finalizeReveal(packToUse);
       }, 2500); 
    } else {
        // Fallback if clicked before preload finished
        try {
            const generatedCards = await generateBoosterPack();
            if (!isMounted.current) return;
            startOptimisticGeneration(generatedCards);
            finalizeReveal(generatedCards);
        } catch (e) {
            if (!isMounted.current) return;
            setError('Kunne ikke hente monstrene. Prøv igjen, Jenny!');
            setAppState('IDLE');
        }
    }
  }, [deductCoins, onCardsRevealed, preloadedPack]);

  const reset = () => {
    playSoftClick();
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    audioTimerRefs.current.forEach(timer => clearTimeout(timer));
    generatedImagesCache.current = {}; // Clean up cache
    setAppState('IDLE');
    setCards([]);
    setCardsVisible(false);
    // loadNextPack will be triggered by the useEffect because preloadedPack is null
  };

  const rarityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach(card => {
      counts[card.rarity] = (counts[card.rarity] || 0) + 1;
    });
    return counts;
  }, [cards]);

  const rarityOrder = [Rarity.Common, Rarity.Uncommon, Rarity.Rare, Rarity.Legendary, Rarity.Mythical];

  return (
    <div className="w-full min-h-full flex flex-col items-center justify-center relative pb-40">
      
      {/* Header */}
      {appState === 'IDLE' && (
        <header className="relative z-10 mb-8 text-center animate-fade-in px-4 mt-4">
          <h2 className="text-green-300 text-xs font-cute font-bold tracking-[0.2em] uppercase mb-2">Julebutikk</h2>
          <h1 className="text-4xl md:text-5xl font-magic font-bold text-white drop-shadow-lg text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-white to-green-400">
            Åpne Julegave
          </h1>
          <p className="text-white/60 text-sm mt-2 font-cute">Pris: {PACK_COST} Mynter</p>
        </header>
      )}

      {/* Main Content */}
        {appState === 'IDLE' && (
          <div className="flex flex-col items-center animate-fade-in w-full">
            <div className="relative group">
                <button 
                onClick={openPack}
                onMouseEnter={playHoverSound}
                className={`group relative w-64 h-20 rounded-xl border-2 overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 ${coins >= PACK_COST ? 'bg-red-700 border-yellow-400 shadow-[0_0_30px_rgba(220,38,38,0.5)]' : 'bg-gray-800/50 border-gray-700 grayscale opacity-50'}`}
                >
                {/* Ribbon Design */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-4 bg-yellow-400/90 shadow-sm"></div>
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-4 bg-yellow-400/90 shadow-sm"></div>
                
                <div className={`liquid-shine ${coins < PACK_COST ? 'hidden' : ''}`}></div>
                <span className="relative z-10 flex items-center justify-center gap-3 text-lg font-cute font-bold text-white tracking-wide drop-shadow-md">
                    <span className="text-3xl">🎁</span> 
                    {coins >= PACK_COST ? 'KJØP GAVE' : 'IKKE NOK MYNTER'}
                </span>
                </button>
                
                {/* Preload Indicator (Debug or fun UI) */}
                {preloadedPack && (
                    <div className="absolute -right-2 -top-2 w-4 h-4 bg-green-400 rounded-full shadow-[0_0_10px_rgba(74,222,128,0.8)] animate-pulse" title="Pack Ready"></div>
                )}
            </div>

            {error && <p className="mt-4 text-pink-300 text-sm font-cute bg-black/30 px-4 py-2 rounded-full backdrop-blur-md animate-bounce">{error}</p>}
            
            <div className="mt-12 grid grid-cols-2 gap-8 opacity-50 text-center">
                 <div className="flex flex-col items-center gap-2">
                     <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-700 flex items-center justify-center text-xl shadow-lg border border-green-300">🎄</div>
                     <span className="text-xs font-cute text-green-200">Nisse-Garantert</span>
                 </div>
                 <div className="flex flex-col items-center gap-2">
                     <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-xl shadow-lg border border-red-300">🕯️</div>
                     <span className="text-xs font-cute text-red-200">Nye Kort</span>
                 </div>
            </div>
          </div>
        )}

        {appState === 'OPENING' && (
          <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm">
            <div className="relative w-48 h-48 flex items-center justify-center">
                 
                 {/* Magical Aura - Pulsing Rings */}
                 <div className="absolute inset-0 rounded-full border-4 border-yellow-400/20 animate-pulse-ring"></div>
                 <div className="absolute inset-0 rounded-full border-2 border-pink-400/30 animate-pulse-ring" style={{ animationDelay: '0.5s' }}></div>
                 
                 {/* Rotating Light Rays */}
                 <div className="absolute inset-[-50%] bg-[conic-gradient(from_0deg,transparent,rgba(255,215,0,0.1),transparent)] animate-[spin_4s_linear_infinite]"></div>
                 <div className="absolute inset-[-50%] bg-[conic-gradient(from_180deg,transparent,rgba(255,255,255,0.1),transparent)] animate-[spin_6s_linear_infinite_reverse]"></div>

                 {/* Particle Emitter */}
                 {sparkles.map(s => (
                   <div key={s.id} className="sparkle-particle" style={{
                       '--tx': `${s.tx}px`,
                       '--ty': `${s.ty}px`,
                       animationDelay: `${s.delay}s`,
                       backgroundColor: s.color,
                       width: `${s.size}px`,
                       height: `${s.size}px`,
                       boxShadow: `0 0 ${s.size}px ${s.color}`
                   } as React.CSSProperties} />
                 ))}

                 {/* The Shaking Box */}
                 <div className="relative w-40 h-40 animate-shake-pack perspective-1000 z-10">
                     <div className="w-full h-full bg-gradient-to-br from-red-600 to-red-800 rounded-2xl border-4 border-yellow-400 shadow-[0_0_50px_rgba(220,38,38,0.8)] flex items-center justify-center relative overflow-hidden">
                        {/* Shimmer on Box */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg] animate-shimmer"></div>
                        
                        {/* Ribbon */}
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-6 bg-yellow-400 shadow-sm"></div>
                        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-6 bg-yellow-400 shadow-sm"></div>
                        
                        {/* Center Icon */}
                        <div className="text-6xl z-10 animate-bounce filter drop-shadow-md">🎁</div>
                     </div>
                 </div>

            </div>
            
            <p className="mt-12 text-xl text-white/80 font-cute font-bold tracking-widest uppercase animate-pulse drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
               Tryller frem...
            </p>
          </div>
        )}

        {appState === 'REVEALED' && (
          <div className="w-full flex flex-col items-center px-4">
            
            {/* Cards Horizontal Scroll / Stack on mobile */}
            <div className="w-full overflow-x-auto snap-x snap-mandatory flex gap-4 px-4 pb-8 perspective-1000 no-scrollbar justify-start md:justify-center">
              {cards.map((card, index) => (
                <div key={card.id} className="snap-center shrink-0">
                    <CardComponent 
                        card={card} 
                        index={index} 
                        isRevealed={cardsVisible}
                        onImageSaved={onImageSaved}
                    />
                </div>
              ))}
            </div>

            {/* Controls */}
            <div className="flex flex-col items-center gap-4 w-full max-w-md mt-4 mb-24">
              
              {/* Stats */}
              <div className="flex items-center justify-center gap-2 flex-wrap bg-slate-900/60 backdrop-blur-xl rounded-2xl p-2 border border-white/10 shadow-xl">
                {rarityOrder.map(rarity => {
                  const count = rarityCounts[rarity];
                  if (!count) return null;
                  return (
                     <div key={rarity} className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5">
                       <span className="text-white font-bold font-cute text-xs">{count}</span>
                       <span className={`text-[9px] font-bold uppercase tracking-wider ${RARITY_COLORS[rarity]}`}>
                         {RARITY_TRANSLATIONS[rarity]}
                       </span>
                     </div>
                  );
                })}
              </div>

              {/* Buttons */}
              <div className="flex gap-4 w-full justify-center">
                <button 
                  onClick={openPack}
                  className="flex-1 max-w-[140px] py-3 bg-gradient-to-r from-red-600 to-green-600 rounded-full font-cute font-bold text-white text-sm shadow-lg shadow-red-500/30 active:scale-95 border border-white/20"
                >
                   En Til! ({PACK_COST})
                </button>
                <button 
                  onClick={reset}
                  className="flex-1 max-w-[140px] py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-white text-sm rounded-full font-cute font-bold active:scale-95"
                >
                  Ferdig
                </button>
              </div>
            </div>

          </div>
        )}
    </div>
  );
};

export default PackOpener;