import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MonsterCard, ElementType, Rarity } from '../types';
import { ELEMENT_ICONS, RARITY_COLORS, RARITY_TRANSLATIONS } from '../constants';
import { generateCardArt, editCardArt } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { playFlipSound } from '../utils/audio';

// GLOBAL SET to track which cards are currently generating image to prevent duplicates
// across different component instances (e.g. PackOpener vs Collection)
const generatingCardIds = new Set<string>();

interface CardProps {
  card: MonsterCard;
  index: number;
  isRevealed: boolean;
  preloadedImageUrl?: string; 
  startFlipped?: boolean; 
  onImageSaved?: (id: string) => void;
  className?: string; // Allow overriding dimensions
}

// Helper to avoid polluting global scope
const base64ToBlob = (base64: string): Blob | null => {
  try {
    const arr = base64.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  } catch (e) {
    console.error("Blob conversion failed", e);
    return null;
  }
};

const getPlaceholderColor = (type: ElementType) => {
    switch(type) {
        case ElementType.Fire: return '#7f1d1d'; // red-900
        case ElementType.Water: return '#1e3a8a'; // blue-900
        case ElementType.Grass: return '#14532d'; // green-900
        case ElementType.Electric: return '#854d0e'; // yellow-800
        case ElementType.Psychic: return '#6b21a8'; // purple-800
        case ElementType.Dark: return '#1e293b'; // slate-800
        case ElementType.Dragon: return '#5b21b6'; // violet-800
        case ElementType.Steel: return '#475569'; // slate-600
        case ElementType.Fairy: return '#9d174d'; // pink-800
        default: return '#1e293b';
    }
};

const CardComponent: React.FC<CardProps> = ({ card, index, isRevealed, preloadedImageUrl, startFlipped = false, onImageSaved, className }) => {
  const [isFlipped, setIsFlipped] = useState(startFlipped);
  const [generatedImageBlobUrl, setGeneratedImageBlobUrl] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(preloadedImageUrl ? 'success' : 'idle');
  const [isImgRendered, setIsImgRendered] = useState(false); // Track if <img> tag has finished painting
  const [editPrompt, setEditPrompt] = useState('');
  const [showEditConfirmation, setShowEditConfirmation] = useState(false);
  
  const cardRef = useRef<HTMLDivElement>(null);
  const cardInnerRef = useRef<HTMLDivElement>(null); // Ref for direct transform manipulation
  const [isVisible, setIsVisible] = useState(false);
  const [showBurst, setShowBurst] = useState(false);

  // --- MEMORY OPTIMIZATION: Blob URL Management ---
  // We use a Ref to track the current URL because cleanup functions in useEffect capture stale closures.
  const blobUrlRef = useRef<string | null>(null);
  // Store the actual base64 data to support editing (since we convert to Blob for display)
  const base64Ref = useRef<string | null>(null);

  const updateImageFromBase64 = useCallback((base64: string) => {
    // Store original for editing features
    base64Ref.current = base64;
    
    const blob = base64ToBlob(base64);
    if (blob) {
      const url = URL.createObjectURL(blob);
      
      // Immediate cleanup of old URL if exists
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      
      blobUrlRef.current = url;
      setGeneratedImageBlobUrl(url);
      setIsImgRendered(false); // Reset rendering state for new image
      return url;
    }
    return null;
  }, []);

  // Strict Cleanup on Unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []); 

  // Lazy Loading & Virtual Unloading Observer
  // Optimizes memory for iPhone by unloading images when they scroll far off-screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '100px' } // Tighter buffer for mobile memory optimization
    );
    
    if (cardRef.current) {
      observer.observe(cardRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (preloadedImageUrl) {
        // If preloaded is passed (from pack opening), it might be base64. Convert it.
        updateImageFromBase64(preloadedImageUrl);
        setImageStatus('success');
    }
  }, [preloadedImageUrl, updateImageFromBase64]);

  useEffect(() => {
    if (startFlipped) setIsFlipped(true);
  }, [startFlipped]);

  // Memoize particle configuration to improve performance and prevent re-calc on render
  const burstConfig = useMemo(() => {
      if (!card.isShiny) return null;
      return {
          rays: Array.from({ length: 12 }, (_, i) => ({ 
              rot: i * 30 
          })),
          dots: Array.from({ length: 20 }, () => ({
              tx: (Math.random() - 0.5) * 250,
              ty: (Math.random() - 0.5) * 250,
              color: ['#FFD700', '#FF69B4', '#00FFFF', '#FFF'][Math.floor(Math.random()*4)],
              delay: Math.random() * 0.2
          }))
      };
  }, [card.isShiny]);

  useEffect(() => {
    if (isRevealed && card.isShiny && !startFlipped) {
      // Stagger burst animation based on index to prevent lag when revealing multiple shiny cards
      const delay = index * 200;
      
      const startTimer = setTimeout(() => {
          setShowBurst(true);
      }, delay);

      const endTimer = setTimeout(() => {
          setShowBurst(false);
      }, delay + 2000);

      return () => {
          clearTimeout(startTimer);
          clearTimeout(endTimer);
      };
    } else {
      setShowBurst(false);
      return undefined;
    }
  }, [isRevealed, card.isShiny, startFlipped, index]);

  // Main Image Logic: Load from DB OR Generate
  // Added debouncing to prevent thrashing during fast scrolls
  useEffect(() => {
    let mounted = true;
    let loadDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    let unloadDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    
    const loadOrGenerate = async () => {
      // Logic for unloading when off-screen to save RAM
      if (!isVisible) {
          // Unload if:
          // 1. It is 'stored' (we can fetch it back later)
          // 2. OR it is a prop-based base64 (we can generate blob from prop later)
          // Basically always unload if we have a blob generated.
          if (generatedImageBlobUrl) {
             if (blobUrlRef.current) {
                 URL.revokeObjectURL(blobUrlRef.current);
                 blobUrlRef.current = null;
             }
             setGeneratedImageBlobUrl(null);
             
             // FREE HEAP MEMORY:
             // Clear the heavy base64 string from the ref.
             // When visible again, loadOrGenerate will re-fetch from DB or Props.
             base64Ref.current = null;

             setIsImgRendered(false);
             setImageStatus('idle'); // Reset to idle so it re-fetches when visible
          }
          return;
      }

      // If visible but already loaded, do nothing
      if (generatedImageBlobUrl) return;

      // Case 1: Image is already "stored" in DB (Lazy Load)
      if (card.imageUrl === 'stored') {
          setImageStatus('loading');
          try {
            const fullCard = await storageService.getCard(card.id);
            // Check mounted AND visible to prevent setting state on fast scroll-by
            if (mounted && isVisible && fullCard && fullCard.imageUrl && fullCard.imageUrl !== 'stored') {
                updateImageFromBase64(fullCard.imageUrl);
                setImageStatus('success');
            } else if (mounted && isVisible) {
                // Fallback if stored image is corrupt/missing
                generate();
            }
          } catch(e) {
            if (mounted) setImageStatus('error');
          }
          return;
      }

      // Case 2: Image needs generation (and not preloaded)
      if (!preloadedImageUrl && !card.imageUrl) {
          // CHECK DB FIRST before generating!
          try {
              const storedCard = await storageService.getCard(card.id);
              if (mounted && isVisible && storedCard && storedCard.imageUrl && storedCard.imageUrl !== 'stored') {
                  updateImageFromBase64(storedCard.imageUrl);
                  setImageStatus('success');
                  if (onImageSaved) onImageSaved(card.id);
                  return;
              }
          } catch (e) { /* ignore and generate */ }

          // Check global generation set to prevent duplicates
          if (generatingCardIds.has(card.id)) return;

          generate();
      } else if (card.imageUrl && card.imageUrl !== 'stored') {
          // If pure base64 passed in prop (rare, newly opened cards)
          // We load it into Blob for display, and unload it when offscreen to save GPU texture memory
          updateImageFromBase64(card.imageUrl);
          setImageStatus('success');
      }
    };

    const generate = async () => {
      if (generatingCardIds.has(card.id)) return;
      generatingCardIds.add(card.id);

      setImageStatus('loading');
      try {
        const base64 = await generateCardArt(card.visualPrompt, card.name, card.type, card.rarity);
        if (mounted && isVisible) {
          if (base64) {
            updateImageFromBase64(base64);
            setImageStatus('success');
            // Persist the generated image!
            const updatedCard = { ...card, imageUrl: base64 };
            await storageService.saveCard(updatedCard);
            if (onImageSaved) onImageSaved(card.id);
          } else {
            setImageStatus('error');
          }
        }
      } catch (e) {
        if (mounted) setImageStatus('error');
        console.error(e);
      } finally {
        generatingCardIds.delete(card.id);
      }
    };

    if (isVisible) {
        // Clear any pending unload timer immediately
        clearTimeout(unloadDebounceTimer);
        
        // Short debounce for loading to ensure we don't start requests for fast scrolling items
        loadDebounceTimer = setTimeout(() => {
            loadOrGenerate();
        }, 100); 
    } else {
        // Clear load timer
        clearTimeout(loadDebounceTimer);
        
        // Hysteresis for unloading: Delay unloading by 2s to allow scrolling back
        // This prevents flickering and CPU thrashing (base64 decode) during active browsing
        unloadDebounceTimer = setTimeout(() => {
            loadOrGenerate();
        }, 2000);
    }
    
    return () => { 
        mounted = false; 
        clearTimeout(loadDebounceTimer);
        clearTimeout(unloadDebounceTimer);
    };
  }, [card, isVisible, generatedImageBlobUrl, preloadedImageUrl, onImageSaved, updateImageFromBase64]);

  const handleFlip = () => {
    if (isRevealed) {
      playFlipSound();
      setIsFlipped(!isFlipped);
    }
  };

  const handleRetryGeneration = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setImageStatus('loading');
    try {
      const base64 = await generateCardArt(card.visualPrompt, card.name, card.type, card.rarity);
      if (base64) {
        updateImageFromBase64(base64);
        setImageStatus('success');
        const updatedCard = { ...card, imageUrl: base64 };
        await storageService.saveCard(updatedCard);
        if (onImageSaved) onImageSaved(card.id);
      } else {
        setImageStatus('error');
      }
    } catch (err) {
      console.error(err);
      setImageStatus('error');
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (imageStatus === 'loading' || !generatedImageBlobUrl || !editPrompt.trim()) return;
    setShowEditConfirmation(true);
  };

  const confirmEditArt = async () => {
    setShowEditConfirmation(false);
    setImageStatus('loading');
    try {
      // Use local base64 ref if available, otherwise try fetch
      let sourceBase64 = base64Ref.current;
      
      if (!sourceBase64) {
          // Fallback if unloaded or missing from ref:
          // 1. Check if prop has it (new card)
          if (card.imageUrl && card.imageUrl.startsWith('data:image')) {
              sourceBase64 = card.imageUrl;
          } else {
              // 2. Try fetching from DB
             try {
                 const fullCard = await storageService.getCard(card.id);
                 if (fullCard && fullCard.imageUrl && fullCard.imageUrl !== 'stored') {
                     sourceBase64 = fullCard.imageUrl;
                 }
             } catch(e) {}
          }
      }
      
      if (!sourceBase64) throw new Error("Source image missing for edit");
      
      const base64 = await editCardArt(sourceBase64, editPrompt);
      if (base64) {
        updateImageFromBase64(base64);
        setEditPrompt('');
        setImageStatus('success');
        const updatedCard = { ...card, imageUrl: base64 };
        await storageService.saveCard(updatedCard);
        if (onImageSaved) onImageSaved(card.id);
      }
    } catch (err) {
      console.error(err);
      setImageStatus('success'); // Revert to previous image on failure
    }
  };

  const cancelEdit = () => {
    setShowEditConfirmation(false);
  };

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // --- PERFORMANCE OPTIMIZATION: Direct DOM Manipulation for Tilt ---
  // Using React State for 60fps mouse movement kills performance on mobile.
  // We use Refs to update the style directly.
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Disable on touch devices to improve scroll performance
    if (window.matchMedia('(hover: none)').matches) return;
    
    if (!isFlipped || !cardRef.current || !cardInnerRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Calculate tilt
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const rotateXVal = ((mouseY - centerY) / centerY) * -10; // Max 10 deg
    const rotateYVal = ((mouseX - centerX) / centerX) * 10;
    
    // Apply transforms directly without triggering React Render
    cardInnerRef.current.style.transform = `rotateY(180deg) rotateX(${rotateXVal}deg) rotateY(${rotateYVal}deg)`;
    cardRef.current.style.setProperty('--holo-x', `${x}%`);
    cardRef.current.style.setProperty('--holo-y', `${y}%`);
  };

  const handleMouseLeave = () => {
     if (!cardRef.current || !cardInnerRef.current) return;
     cardRef.current.style.setProperty('--holo-x', `50%`);
     cardRef.current.style.setProperty('--holo-y', `50%`);
     
     // Reset tilt directly
     cardInnerRef.current.style.transform = isFlipped ? `rotateY(180deg)` : `rotateY(0deg)`;
  };
  
  // Effect to handle flip state changes via prop/state
  useEffect(() => {
      if (cardInnerRef.current) {
          cardInnerRef.current.style.transform = isFlipped ? `rotateY(180deg)` : `rotateY(0deg)`;
      }
  }, [isFlipped]);

  const getHoloClass = (rarity: Rarity) => {
    switch (rarity) {
      case Rarity.Rare: return 'holo-rare';
      case Rarity.Legendary: return 'holo-legendary';
      case Rarity.Mythical: return 'holo-mythical';
      default: return null;
    }
  };

  const getRarityGradient = (rarity: Rarity) => {
    switch (rarity) {
      case Rarity.Common: return 'bg-gradient-to-b from-transparent to-black/20';
      case Rarity.Uncommon: return 'bg-gradient-to-br from-emerald-400/10 to-emerald-900/30';
      case Rarity.Rare: return 'bg-gradient-to-br from-blue-400/20 to-blue-900/40';
      case Rarity.Legendary: return 'bg-gradient-to-br from-amber-300/20 to-amber-900/50';
      case Rarity.Mythical: return 'bg-gradient-to-br from-fuchsia-400/30 to-purple-900/60';
      default: return '';
    }
  };

  const holoClass = getHoloClass(card.rarity);
  const rarityGradient = getRarityGradient(card.rarity);
  
  // Glass effect background for card face - consistent across all element types
  // Note: Element-specific styling is applied via the type-* classes from ELEMENT_COLORS
  const cardFaceGlassStyle = 'bg-white/5 backdrop-blur-md border-white/10';

  const translatedRarity = RARITY_TRANSLATIONS[card.rarity] || card.rarity;

  // Use passed className or default to responsive size
  // Mobile: 280px wide, 390px tall. Tablet/Desktop: 288px (w-72) wide, 420px tall.
  const containerClass = className || "w-[280px] h-[390px] xs:w-72 xs:h-[420px]";

  return (
    <div 
      ref={cardRef}
      className={`group relative ${containerClass} cursor-pointer perspective-1000 transition-all duration-1000 ease-spring ${isRevealed ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-24 scale-50 rotate-12'}`}
      style={{ transitionDelay: `${index * 150}ms` }} 
      onClick={handleFlip}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div 
        ref={cardInnerRef}
        className={`w-full h-full relative transform-style-3d transition-transform duration-700`}
        style={{ transform: startFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        
        {/* --- CARD BACK --- */}
        <div className="absolute w-full h-full backface-hidden rounded-3xl border-[6px] border-[#3b0764] overflow-hidden shadow-2xl card-back-premium">
            <div className="absolute inset-0 card-back-pattern opacity-20"></div>
            <div className="absolute inset-0 opacity-30 mix-blend-overlay">
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] animate-[spin_30s_linear_infinite] bg-[conic-gradient(from_0deg,transparent,rgba(192,38,211,0.1),transparent)]"></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-40 h-40 flex items-center justify-center">
                    <div className="absolute inset-[-10px] rounded-full bg-purple-500/20 blur-xl"></div>
                    <div className="absolute inset-0 rounded-full p-[2px] card-logo-ring-outer mask-image-gradient">
                        <div className="w-full h-full bg-[#1e1b4b] rounded-full"></div>
                    </div>
                    <div className="absolute inset-[4px] rounded-full bg-gradient-to-br from-[#4c1d95] to-[#0f172a] border border-white/10 flex items-center justify-center shadow-inner">
                        <div className="text-center z-10">
                            <div className="text-4xl font-magic font-bold text-transparent bg-clip-text bg-gradient-to-br from-pink-300 via-purple-200 to-indigo-300 drop-shadow-sm tracking-tight">
                                JM
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="absolute top-8 w-full text-center">
                 <div className="inline-block px-4 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/5">
                    <span className="text-[10px] font-cute font-bold text-pink-200/80 tracking-[0.3em] uppercase">Monster</span>
                 </div>
            </div>
            <div className="absolute bottom-8 w-full text-center">
                 <div className="inline-block px-4 py-1 rounded-full bg-black/30 backdrop-blur-sm border border-white/5">
                    <span className="text-[10px] font-cute font-bold text-pink-200/80 tracking-[0.3em] uppercase">Butikk</span>
                 </div>
            </div>
        </div>

        {/* --- CARD FRONT --- */}
        <div className={`absolute w-full h-full backface-hidden rotate-y-180 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden border border-white/20 text-white flex flex-col ${cardFaceGlassStyle} ${card.isShiny ? 'shiny-active' : ''}`}>
            
            {/* Background Layers */}
            <div className="absolute inset-0 bg-slate-900/80 z-0"></div>
            <div className={`absolute inset-0 z-0 ${rarityGradient}`}></div>
            {holoClass && <div className={`holo-overlay ${holoClass}`}></div>}
            
            <div className="holo-glimmer"></div>
            
            {card.isShiny && (
              <>
                <div className="shiny-glitter"></div>
                <div className="shiny-rainbow-gradient"></div>
                {showBurst && burstConfig && (
                  <div className="shiny-particle-burst">
                    {burstConfig.rays.map((ray, i) => (
                      <div key={`ray-${i}`} className="particle-ray" style={{ '--rot': `${ray.rot}deg` } as any} />
                    ))}
                    {burstConfig.dots.map((dot, i) => (
                       <div key={`dot-${i}`} className="particle-dot" style={{ 
                         '--tx': `${dot.tx}px`, 
                         '--ty': `${dot.ty}px`,
                         '--dot-color': dot.color,
                         animationDelay: `${dot.delay}s`
                       } as any} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Header */}
            <div className="relative z-10 px-3 xs:px-4 py-2 xs:py-3 flex justify-between items-center bg-gradient-to-b from-black/40 to-transparent shrink-0">
                <div>
                     <div className="flex items-center gap-2 mb-0.5">
                       <span className={`text-[9px] xs:text-[10px] font-bold uppercase tracking-widest ${RARITY_COLORS[card.rarity]}`}>{translatedRarity}</span>
                       {card.isShiny && (
                         <span className="flex items-center gap-1 bg-white/20 px-1.5 py-0.5 rounded text-[9px] font-bold text-yellow-200 animate-pulse shadow-[0_0_10px_rgba(255,215,0,0.5)]">
                           SHINY ✨
                         </span>
                       )}
                     </div>
                     <h3 className="font-cute font-bold text-base xs:text-lg leading-none tracking-wide text-white drop-shadow-sm max-w-[170px] xs:max-w-[200px] truncate">{card.name}</h3>
                </div>
                <div className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-lg backdrop-blur-sm border border-white/5">
                    <span className="text-base xs:text-lg font-bold font-mono text-pink-300">{card.hp}</span>
                    <span className="text-[10px] xs:text-sm font-bold text-white/50">HP</span>
                    <span className="text-base xs:text-lg drop-shadow-glow">{ELEMENT_ICONS[card.type]}</span>
                </div>
            </div>

            {/* Image Container */}
            <div className="relative z-10 mx-3 h-36 xs:h-40 rounded-2xl overflow-hidden shadow-inner border border-white/10 group bg-black/20 shrink-0">
               
               {generatedImageBlobUrl && (
                 <img 
                  src={generatedImageBlobUrl} 
                  alt={card.name} 
                  loading="lazy"
                  decoding="async"
                  onLoad={() => setIsImgRendered(true)}
                  className={`w-full h-full object-cover transition-all duration-700 ${isImgRendered ? 'scale-100 opacity-100 blur-0' : 'scale-110 opacity-0 blur-xl'}`} 
                 />
               )}

               {/* Placeholder State (Visible when loading or img not yet rendered) */}
               {(!generatedImageBlobUrl || !isImgRendered) && (
                 <div className="absolute inset-0 z-20 overflow-hidden bg-slate-900">
                    {/* Dynamic Base Gradient */}
                    <div 
                        className="absolute inset-0 opacity-80"
                        style={{
                            background: `linear-gradient(135deg, ${getPlaceholderColor(card.type)} 0%, #0f172a 100%)`,
                        }}
                    ></div>
                    
                    {/* Enhanced Shimmer Effect */}
                    <div 
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg]"
                        style={{ animation: 'shimmer 1.5s infinite linear' }}
                    ></div>

                    {/* Loading State Content */}
                    {imageStatus === 'loading' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {/* Magical Backdrop */}
                            <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/20 via-purple-900/10 to-slate-900/40 animate-pulse mix-blend-overlay"></div>
                            
                            {/* Rotating Energy Vortex */}
                            <div className="absolute inset-[-50%] opacity-30 animate-[spin_3s_linear_infinite]">
                                <div className="w-full h-full bg-[conic-gradient(from_0deg,transparent,rgba(236,72,153,0.4),transparent)]"></div>
                            </div>
                            <div className="absolute inset-[-50%] opacity-20" style={{ animation: 'spin 5s linear infinite reverse' }}>
                                <div className="w-full h-full bg-[conic-gradient(from_180deg,transparent,rgba(56,189,248,0.4),transparent)]"></div>
                            </div>

                            {/* Central Summoning Icon */}
                            <div className="relative z-10 flex flex-col items-center gap-3">
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-full border-2 border-pink-400/30 border-t-pink-400 animate-spin"></div>
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-8 h-8 rounded-full bg-pink-500/20 blur-md animate-pulse"></div>
                                        <span className="text-sm filter drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]">✨</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-center">
                                    <span className="text-[10px] font-cute font-bold text-pink-200 uppercase tracking-widest animate-pulse text-magical-glow">
                                        Tryller frem...
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>
               )}

               {imageStatus === 'error' && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-900/50 backdrop-blur-sm z-30">
                    <span className="text-pink-300 text-xs mb-2 font-cute">Oops! Bildet ble borte.</span>
                    <button onClick={handleRetryGeneration} className="text-[10px] bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition">Prøv igjen</button>
                 </div>
               )}

               {/* Edit Overlay */}
               {generatedImageBlobUrl && isImgRendered && !showEditConfirmation && (
                 <div className="absolute bottom-0 inset-x-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-black/60 backdrop-blur-md flex justify-center z-30">
                   <form onSubmit={handleEditSubmit} className="w-full flex gap-2" onClick={handleInputClick}>
                      <input 
                        type="text" 
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder="Legg til nisselue..."
                        className="flex-1 bg-white/10 border border-white/20 text-white text-[10px] px-3 py-1.5 rounded-full focus:outline-none focus:bg-white/20 focus:border-pink-300/50 transition placeholder-white/30 font-cute"
                      />
                   </form>
                 </div>
               )}

               {/* Confirmation Dialog */}
               {showEditConfirmation && (
                <div className="absolute inset-0 z-40 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center animate-fade-in">
                   <div className="mb-4">
                      <span className="text-3xl">🎨</span>
                   </div>
                   <p className="text-white text-sm font-bold font-cute mb-1">Endre bildet?</p>
                   <p className="text-pink-200 text-xs italic mb-4 max-w-full truncate px-2">"{editPrompt}"</p>
                   
                   <div className="flex gap-3 w-full justify-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); confirmEditArt(); }}
                        className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg active:scale-95 transition-transform"
                      >
                        Ja, lag det!
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); cancelEdit(); }}
                        className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-xl border border-white/10 active:scale-95 transition-transform"
                      >
                        Avbryt
                      </button>
                   </div>
                </div>
              )}
            </div>

            {/* Moves & Info */}
            <div className="relative z-10 flex-1 px-4 py-2 xs:py-3 flex flex-col gap-1.5 xs:gap-2 overflow-y-auto custom-scrollbar">
                <div className="space-y-2 xs:space-y-3">
                    {card.moves.map((move, idx) => (
                        <div key={idx} className="group/move">
                            <div className="flex justify-between items-baseline mb-0.5">
                                <span className="font-cute font-bold text-xs xs:text-sm text-white/90 group-hover/move:text-pink-200 transition-colors">{move.name}</span>
                                <span className="font-mono font-bold text-sm xs:text-base text-white/90">{move.damage}</span>
                            </div>
                            <div className="flex gap-1 mb-1" title={`Cost: ${move.cost} Energy`}>
                                {[...Array(move.cost)].map((_, i) => (
                                    <div key={i} className="w-1.5 h-1.5 xs:w-2 xs:h-2 rounded-full bg-gradient-to-tr from-pink-400 to-pink-200 shadow-[0_0_6px_rgba(244,114,182,0.6)] border border-pink-500/30"></div>
                                ))}
                            </div>
                            <p className="text-[10px] xs:text-[11px] text-white/60 leading-snug font-body line-clamp-2">{move.description}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="relative z-10 px-4 py-2 xs:py-3 bg-white/5 border-t border-white/5 backdrop-blur-md text-center shrink-0">
                <p className="text-[9px] xs:text-[10px] text-white/50 italic font-cute leading-relaxed line-clamp-2">"{card.flavorText}"</p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default CardComponent;