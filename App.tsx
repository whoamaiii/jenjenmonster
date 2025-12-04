import React, { useState, useEffect, useRef } from 'react';
import PackOpener from './components/PackOpener';
import BlockGame from './components/BlockGame';
import Collection from './components/Collection';
import Navigation from './components/Navigation';
import { ViewState, MonsterCard } from './types';
import { playSoftClick, playSwitchSound, playSuccessSound, playMagicalSparkle, playPopSound, resumeAudioContext, musicManager } from './utils/audio';
import { storageService } from './services/storageService';
import { MELD_REWARDS } from './constants';

// XP Curve Configuration - Optimized for gratification
const BASE_XP = 200; 
const XP_GROWTH = 1.4;

const getXpForNextLevel = (level: number) => {
  return Math.floor(BASE_XP * Math.pow(level, XP_GROWTH));
};

const DAILY_REWARDS = [50, 100, 150, 200, 250, 300, 500];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('GAME');
  const [coins, setCoins] = useState<number>(300);
  const [level, setLevel] = useState<number>(1);
  const [currentXP, setCurrentXP] = useState<number>(0);
  const [inventory, setInventory] = useState<MonsterCard[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Music State
  const [isMusicMuted, setIsMusicMuted] = useState(false);

  // Level Up State
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpData, setLevelUpData] = useState({ oldLevel: 1, newLevel: 1, reward: 0 });
  
  // Daily Reward State (Advent Calendar)
  const [dailyReward, setDailyReward] = useState<{ available: boolean, streak: number, rewardDay: number } | null>(null);
  
  // Intro Gift State
  const [showIntroGift, setShowIntroGift] = useState(true);
  const [isUnwrapping, setIsUnwrapping] = useState(false);

  // Love Letter State
  const [showLoveLetter, setShowLoveLetter] = useState(false);

  // UI Animation State
  const [xpChanged, setXpChanged] = useState(false);
  const prevXpRef = useRef(0);

  // Global Audio Context Resume on Interaction & Music Init
  useEffect(() => {
    const handleInteraction = () => {
      resumeAudioContext();
      musicManager.init(); // Start the background loop sequence
      
      // Remove listeners after first interaction
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  // Initialize Music Settings
  useEffect(() => {
    const muted = storageService.loadMusicMuted();
    setIsMusicMuted(muted);
    musicManager.setMute(muted);
  }, []);

  // Load data on mount
  useEffect(() => {
    const initData = async () => {
        // Load Synchronous Data
        const savedCoins = storageService.loadCoins();
        setCoins(savedCoins);
        
        const stats = storageService.loadPlayerStats();
        setLevel(stats.level);
        setCurrentXP(stats.xp);
        
        // Load Asynchronous Data (Heavy Images)
        const cards = await storageService.loadInventory();
        setInventory(cards);

        // Logic: If claimed before OR have cards, skip gift.
        const giftClaimed = storageService.loadIntroGiftClaimed();
        if (giftClaimed || cards.length > 0) {
            setShowIntroGift(false);
        }

        setIsLoaded(true);
    };
    
    initData();
  }, []);

  // Daily Reward Check (Advent Logic)
  useEffect(() => {
      if (!isLoaded || showIntroGift) return; // Don't check daily reward during intro
      
      const { lastClaimDate, streak } = storageService.loadDailyReward();
      const now = new Date();
      const lastClaim = new Date(lastClaimDate);
      
      // Reset hours to compare dates only
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const lastClaimStart = new Date(lastClaim.getFullYear(), lastClaim.getMonth(), lastClaim.getDate()).getTime();
      
      // If last claim was before today
      if (lastClaimStart < todayStart) {
          const oneDay = 24 * 60 * 60 * 1000;
          // Check if yesterday (allow variance for timezone weirdness, basically if diff is < 48 hours)
          const isYesterday = (todayStart - lastClaimStart) <= oneDay;
          
          let currentStreak = isYesterday ? streak : streak; // For Advent Calendar, we don't break the streak easily, we just advance the door
          
          if (currentStreak >= 24) currentStreak = 0; // Reset after Christmas
          
          setDailyReward({
              available: true,
              streak: currentStreak,
              rewardDay: currentStreak % 7 // Map to weekly reward pool cycling
          });
      }
  }, [isLoaded, showIntroGift]);

  // Save data on change
  useEffect(() => {
    if (isLoaded) {
        storageService.saveCoins(coins);
        storageService.savePlayerStats(level, currentXP);
    }
  }, [coins, level, currentXP, isLoaded]);

  // XP Animation trigger
  useEffect(() => {
      if (currentXP > prevXpRef.current) {
          setXpChanged(true);
          const t = setTimeout(() => setXpChanged(false), 500);
          return () => clearTimeout(t);
      }
      prevXpRef.current = currentXP;
  }, [currentXP]);

  const toggleMusic = () => {
      const newState = !isMusicMuted;
      setIsMusicMuted(newState);
      musicManager.setMute(newState);
      storageService.saveMusicMuted(newState);
      if (newState) playSoftClick(); // Feedback when turning off
      else playMagicalSparkle(); // Feedback when turning on
  };

  const addCoins = (amount: number) => {
    setCoins(prev => prev + amount);
  };

  const deductCoins = (amount: number): boolean => {
    if (coins >= amount) {
      setCoins(prev => prev - amount);
      return true;
    }
    return false;
  };

  const handleGainXP = (amount: number) => {
    let newXP = currentXP + amount;
    let newLevel = level;
    let leveledUp = false;
    let totalReward = 0;

    // Check for level up(s)
    let tempLevel = newLevel;
    let tempXP = newXP;
    
    while (tempXP >= getXpForNextLevel(tempLevel)) {
      tempXP -= getXpForNextLevel(tempLevel);
      tempLevel++;
      leveledUp = true;
      const reward = tempLevel * 50 + 100;
      totalReward += reward;
    }

    if (leveledUp) {
      addCoins(totalReward);
      setLevelUpData({ oldLevel: level, newLevel: tempLevel, reward: totalReward });
      setLevel(tempLevel);
      setCurrentXP(tempXP);
      setShowLevelUp(true);
      playMagicalSparkle();
    } else {
        setCurrentXP(tempXP);
    }
  };

  const handleClaimDailyReward = () => {
      if (!dailyReward || !dailyReward.available) return;
      
      const rewardAmount = DAILY_REWARDS[dailyReward.rewardDay];
      const newStreak = dailyReward.streak + 1;
      
      playSuccessSound();
      addCoins(rewardAmount);
      if (dailyReward.rewardDay === 6) {
          handleGainXP(200);
      }
      
      storageService.saveDailyReward(Date.now(), newStreak);
      setDailyReward(null); 
  };
  
  const handleUnwrapGift = () => {
      setIsUnwrapping(true);
      playSuccessSound();
      storageService.saveIntroGiftClaimed(true);
      
      // Add a massive starter bonus
      setTimeout(() => {
          addCoins(1000); 
          setShowIntroGift(false);
          playMagicalSparkle();
      }, 2000);
  };

  const addToCollection = (newCards: MonsterCard[]) => {
    setInventory(prev => [...newCards, ...prev]);
    // BULK SAVE: Use optimized bulk save logic
    storageService.saveCards(newCards);
    handleGainXP(150); 
  };

  const handleUpdateCardState = (cardId: string) => {
     // Mark the image as 'stored' in the main state to prevent re-fetching/saving loop
     setInventory(prev => prev.map(c => 
         c.id === cardId ? { ...c, imageUrl: 'stored' } : c
     ));
  };

  const handleMeldCards = (cardToMeld: MonsterCard) => {
    const allCopies = inventory.filter(c => c.name === cardToMeld.name);
    if (allCopies.length <= 1) return;
  
    const bestCard = allCopies.sort((a, b) => {
        if (a.isShiny && !b.isShiny) return -1;
        if (!a.isShiny && b.isShiny) return 1;
        if (a.imageUrl && !b.imageUrl) return -1;
        if (!a.imageUrl && b.imageUrl) return 1;
        return 0; 
    })[0];
  
    const copiesToRemove = allCopies.filter(c => c.id !== bestCard.id);
    if (copiesToRemove.length === 0) return;
  
    let totalCoins = 0;
    let totalXP = 0;
    
    copiesToRemove.forEach(c => {
        const reward = MELD_REWARDS[c.rarity] || MELD_REWARDS['Common'];
        totalCoins += reward.coins;
        totalXP += reward.xp;
    });

    // BULK DELETE for performance
    const idsToRemove = copiesToRemove.map(c => c.id);
    storageService.deleteCards(idsToRemove);
  
    setInventory(prev => prev.filter(c => !idsToRemove.includes(c.id)));
    addCoins(totalCoins);
    handleGainXP(totalXP);
    playMagicalSparkle();
  };

  const handleNavChange = (view: ViewState) => {
    playSwitchSound();
    setCurrentView(view);
  };

  const xpNeeded = getXpForNextLevel(level);
  const xpPercentage = Math.min(100, (currentXP / xpNeeded) * 100);

  // --- RENDER ---

  if (showIntroGift && isLoaded) {
      return (
          <div className="fixed inset-0 bg-[#0f0c29] flex flex-col items-center justify-center z-[100] overflow-hidden">
             {/* Snow Background (CSS Driven) */}
             <div className="absolute inset-0 pointer-events-none">
                 {[...Array(30)].map((_, i) => (
                    <div key={i} className="snowflake" style={{
                        left: Math.random() * 100 + 'vw',
                        animationDuration: (Math.random() * 5 + 5) + 's',
                        animationDelay: (Math.random() * 5) + 's',
                        opacity: Math.random() * 0.5 + 0.3
                    }}></div>
                 ))}
             </div>
             
             <div className={`relative transition-all duration-1000 ${isUnwrapping ? 'scale-[3] opacity-0' : 'scale-100 opacity-100'}`}>
                 <h1 className="text-white font-magic text-3xl mb-8 text-center animate-pulse">Til Jenny ❤️</h1>
                 <button 
                    onClick={handleUnwrapGift}
                    className="group relative w-48 h-48 focus:outline-none"
                 >
                     <div className="absolute inset-0 bg-gradient-to-br from-red-600 to-red-800 rounded-3xl shadow-[0_0_50px_rgba(220,38,38,0.5)] flex items-center justify-center transform transition-transform group-hover:scale-105 group-active:scale-95 animate-bounce-subtle">
                         {/* Ribbon */}
                         <div className="absolute inset-x-0 top-1/2 h-8 bg-yellow-400/90 -translate-y-1/2 shadow-sm"></div>
                         <div className="absolute inset-y-0 left-1/2 w-8 bg-yellow-400/90 -translate-x-1/2 shadow-sm"></div>
                         <div className="text-6xl z-10 filter drop-shadow-lg">🎁</div>
                     </div>
                     <p className="absolute -bottom-12 w-full text-center text-white/80 font-cute font-bold tracking-widest text-sm">TRYKK FOR Å ÅPNE</p>
                 </button>
             </div>
          </div>
      )
  }

  return (
    <div className="antialiased h-full w-full flex flex-col relative font-body text-white select-none overflow-hidden">
      {/* Background is constant */}
      <div className="absolute inset-0 bg-[conic-gradient(at_top_left,_var(--tw-gradient-stops))] from-slate-900 via-purple-950 to-slate-900 z-0"></div>
      <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-pink-500/30 via-indigo-500/30 to-transparent z-0 pointer-events-none"></div>
      
      {/* Top Bar - Compact for Mobile */}
      <div className="absolute top-0 left-0 right-0 h-[calc(var(--sat)+3.5rem)] z-50 flex flex-col justify-end px-3 pb-2 bg-gradient-to-b from-black/90 via-black/70 to-transparent pointer-events-none">
        
        <div className="flex items-end justify-between w-full pointer-events-auto max-w-3xl mx-auto gap-2">
            
            {/* Left: Level & XP */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* Level Hexagon */}
                <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center filter drop-shadow-[0_0_8px_rgba(236,72,153,0.5)] transition-transform active:scale-95 cursor-pointer" onClick={() => setShowLevelUp(true)}>
                    <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 clip-hexagon"></div>
                    <div className="absolute inset-[2px] bg-slate-900 clip-hexagon flex items-center justify-center">
                         <span className="text-white font-black font-magic text-base leading-none">{level}</span>
                    </div>
                </div>
                
                {/* XP Bar Container */}
                <div className="flex flex-col flex-1 max-w-[180px]">
                    <div className="flex justify-between items-end mb-0.5 px-1">
                        <span className="text-white/80 font-cute text-[9px] font-bold uppercase tracking-wider truncate mr-2">
                           Lvl {level}
                        </span>
                        <span className="text-[8px] font-mono font-bold text-blue-200 opacity-80 whitespace-nowrap">{currentXP}/{xpNeeded}</span>
                    </div>
                    
                    <div className="relative w-full h-2 bg-black/60 rounded-full overflow-hidden border border-white/10 shadow-inner group">
                        <div className="absolute inset-0 bg-white/5 animate-pulse"></div>
                        <div 
                            className={`absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-300 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(34,211,238,0.5)] ${xpChanged ? 'brightness-125' : ''}`}
                            style={{ width: `${xpPercentage}%` }}
                        >
                             <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg] animate-[shimmer_2s_infinite]"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Coins and Controls */}
            <div className="flex items-center gap-2">
                 {/* Music Toggle */}
                 <button 
                    onClick={toggleMusic}
                    className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all active:scale-95 ${isMusicMuted ? 'bg-white/5 border-white/10 text-white/40' : 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.4)]'}`}
                 >
                     {isMusicMuted ? '🔇' : '🎵'}
                 </button>

                 {/* Gift Letter Button */}
                 <button 
                    onClick={() => { playPopSound(); setShowLoveLetter(true); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/20 border border-red-500/50 text-red-300 animate-bounce-subtle active:scale-90"
                 >
                     ❤️
                 </button>

                 <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-xl px-3 py-1 rounded-full border border-white/10 shadow-lg shrink-0">
                    <span className="text-base animate-bounce-subtle filter drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]">🪙</span>
                    <span className="font-mono font-bold text-amber-300 text-sm tracking-tight">{coins}</span>
                 </div>
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-y-auto overflow-x-hidden z-10 pb-32 pt-[calc(var(--sat)+3.5rem)] no-scrollbar">
        {/* We keep all views mounted to preserve state (game progress, preloaded packs) */}
        
        <div className={`w-full h-full transition-opacity duration-300 ${currentView === 'GAME' ? 'opacity-100 pointer-events-auto relative z-10' : 'opacity-0 pointer-events-none absolute inset-0 z-0'}`}>
           <BlockGame 
             onGameOver={(score) => {
                 const coinsEarned = Math.floor(score / 10);
                 addCoins(coinsEarned);
                 handleGainXP(score);
             }} 
             isActive={currentView === 'GAME'} 
             coins={coins}
             deductCoins={deductCoins}
             level={level}
             currentXP={currentXP}
             xpNeeded={xpNeeded}
           />
        </div>
        
        <div className={`w-full h-full transition-opacity duration-300 ${currentView === 'SHOP' ? 'opacity-100 pointer-events-auto relative z-10' : 'opacity-0 pointer-events-none absolute inset-0 z-0'}`}>
             <PackOpener 
               coins={coins} 
               deductCoins={deductCoins} 
               onCardsRevealed={addToCollection}
               onImageSaved={handleUpdateCardState}
             />
        </div>

        <div className={`w-full h-full transition-opacity duration-300 ${currentView === 'COLLECTION' ? 'opacity-100 pointer-events-auto relative z-10' : 'opacity-0 pointer-events-none absolute inset-0 z-0'}`}>
             <Collection 
                cards={inventory} 
                onMeld={handleMeldCards}
                onImageSaved={handleUpdateCardState}
                isActive={currentView === 'COLLECTION'}
             />
        </div>
      </main>

      {/* Bottom Navigation */}
      <Navigation currentView={currentView} onChange={handleNavChange} />

      {/* Julekalender (Daily Reward) Modal */}
      {dailyReward && dailyReward.available && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in p-4">
               <div className="relative w-full max-w-sm bg-slate-900/80 border-4 border-red-800 rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col items-center animate-modal-zoom">
                   {/* Background Decor */}
                   <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-red-900/40 to-transparent"></div>
                   
                   <h2 className="relative text-3xl font-magic font-bold text-center mb-1 text-green-300 drop-shadow-md">Julekalender</h2>
                   <p className="relative text-white/60 text-xs font-cute mb-6">En ny gave hver dag i desember!</p>
                   
                   {/* Advent Door Reveal */}
                   <div className="relative w-48 h-48 mb-6 group cursor-pointer" onClick={handleClaimDailyReward}>
                       {/* The Door (Closed) */}
                       <div className="absolute inset-0 bg-gradient-to-br from-red-700 to-red-900 rounded-2xl border-2 border-dashed border-yellow-500 shadow-2xl flex items-center justify-center transform transition-transform group-hover:scale-105 group-active:scale-95 z-20">
                            <div className="absolute top-2 left-2 text-[10px] text-yellow-500 font-bold uppercase border border-yellow-500 px-2 rounded-full">Dagens Luke</div>
                            <span className="text-6xl font-magic font-bold text-yellow-100 drop-shadow-lg">{dailyReward.streak + 1}</span>
                            <div className="absolute bottom-4 text-xs font-cute text-white/50">Trykk for å åpne</div>
                       </div>
                       
                       {/* Glow behind */}
                       <div className="absolute -inset-4 bg-yellow-400/20 blur-xl rounded-full z-0 animate-pulse"></div>
                   </div>

                   <button 
                     onClick={handleClaimDailyReward}
                     className="relative w-full py-4 bg-gradient-to-r from-green-600 to-green-800 rounded-xl font-bold text-white shadow-lg shadow-green-900/30 active:scale-95 transition-transform"
                   >
                       ÅPNE LUKE {dailyReward.streak + 1}
                   </button>
               </div>
          </div>
      )}

      {/* Love Letter Modal */}
      {showLoveLetter && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
            onClick={() => { playSoftClick(); setShowLoveLetter(false); }}
          >
              <div 
                className="bg-[#fff1f2] text-slate-900 p-8 rounded-lg max-w-sm shadow-2xl rotate-1 relative border-8 border-double border-red-200"
                onClick={(e) => e.stopPropagation()}
              >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-red-400/20 rotate-[-2deg]"></div>
                  
                  <h2 className="font-magic text-2xl font-bold text-red-500 mb-4">Hei Jenny! ❤️</h2>
                  <p className="font-cute text-sm leading-relaxed mb-4 text-slate-700">
                      God jul, kjæreste! 
                      <br/><br/>
                      Jeg har laget dette spillet som en liten julekalender til deg. Hver dag i desember kan du åpne en ny "luke" (spille litt), få mynter og samle på søte julemonstre.
                      <br/><br/>
                      Håper du liker det!
                  </p>
                  <p className="font-magic font-bold text-right text-red-400">
                      Klem fra Kjæresten din x
                  </p>
                  
                  <button 
                    onClick={() => { playSoftClick(); setShowLoveLetter(false); }}
                    className="mt-6 w-full py-2 bg-red-400 text-white font-bold rounded hover:bg-red-500 transition-colors font-cute text-xs uppercase tracking-widest"
                  >
                      Lukk Brev
                  </button>
              </div>
          </div>
      )}

      {/* Level Up Modal */}
      {showLevelUp && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-fade-in overflow-hidden p-4">
             {/* ... Level Up Modal Content (Same as before) ... */}
             <div className="absolute inset-0 pointer-events-none overflow-hidden">
                 {[...Array(30)].map((_, i) => (
                    <div 
                        key={i} 
                        className="absolute w-2 h-2 rounded-full animate-fall"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `-5%`,
                            backgroundColor: ['#fff', '#a7f3d0', '#fecaca', '#fde047'][Math.floor(Math.random() * 4)], // Pastels for snow
                            animationDuration: `${2 + Math.random() * 3}s`,
                            animationDelay: `${Math.random() * 2}s`
                        }}
                    ></div>
                 ))}
             </div>

             <div className="relative w-full max-w-sm p-6 flex flex-col items-center text-center animate-modal-zoom">
                 
                 <div className="absolute inset-0 pointer-events-none z-0">
                     <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[250%] h-[250%] bg-[conic-gradient(from_0deg,transparent,rgba(236,72,153,0.2),transparent)] animate-[spin_8s_linear_infinite]"></div>
                 </div>

                 <div className="relative z-10">
                     <div className="mb-4 inline-block px-6 py-1.5 rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 backdrop-blur-md">
                        <span className="text-yellow-300 font-bold font-cute uppercase tracking-widest text-sm">Gratulerer!</span>
                     </div>
                     
                     <h2 className="text-5xl font-magic font-bold text-transparent bg-clip-text bg-gradient-to-b from-white via-pink-200 to-pink-400 drop-shadow-[0_0_25px_rgba(236,72,153,0.8)] mb-6 animate-bounce">
                         LEVEL UP!
                     </h2>
                     
                     <div className="relative h-28 w-full flex items-center justify-center gap-4 my-2">
                         <div className="opacity-40 scale-75 blur-[1px] text-5xl font-black text-white font-magic">{levelUpData.oldLevel}</div>
                         <div className="text-pink-400 text-3xl animate-pulse">➜</div>
                         
                         <div className="relative scale-110 z-10">
                            <div className="absolute inset-0 bg-pink-500 blur-2xl opacity-50 animate-pulse"></div>
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <div className="absolute inset-0 bg-gradient-to-br from-pink-500 to-purple-600 clip-hexagon shadow-2xl"></div>
                                <div className="absolute inset-[3px] bg-slate-900 clip-hexagon flex items-center justify-center">
                                    <span className="text-6xl font-black font-magic text-white drop-shadow-lg">{levelUpData.newLevel}</span>
                                </div>
                            </div>
                         </div>
                     </div>
                     
                     <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)] transform rotate-1 mt-8 w-full">
                         <p className="text-pink-200 font-cute font-bold uppercase tracking-widest text-xs mb-2">Belønning</p>
                         <div className="flex items-center justify-center gap-3">
                             <span className="text-4xl filter drop-shadow-md">🪙</span>
                             <span className="text-4xl font-mono font-bold text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">+{levelUpData.reward}</span>
                         </div>
                     </div>

                     <button 
                        onClick={() => { playSoftClick(); setShowLevelUp(false); }}
                        className="mt-8 w-full bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white font-bold py-4 px-8 rounded-2xl shadow-[0_0_30px_rgba(236,72,153,0.5)] active:scale-95 transition-all font-cute tracking-[0.2em] text-lg ring-2 ring-white/20"
                     >
                        FORTSETT
                     </button>
                 </div>
             </div>
          </div>
      )}
      
      <style>{`
        .clip-hexagon {
            clip-path: polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%);
        }
        @keyframes fall {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        .animate-fall {
            animation-name: fall;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
        }
        .mask-gradient-sides {
            mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
            -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
        }
      `}</style>
    </div>
  );
};

export default App;