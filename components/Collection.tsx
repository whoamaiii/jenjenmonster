import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MonsterCard, Rarity, ElementType, SortOption, SavedLayout, FilterOption } from '../types';
import CardComponent from './CardComponent';
import { RARITY_COLORS, RARITY_TRANSLATIONS, MELD_REWARDS, ELEMENT_ICONS } from '../constants';
import { playSoftClick, playPopSound, playSwitchSound, playSuccessSound } from '../utils/audio';
import { storageService } from '../services/storageService';

interface CollectionProps {
  cards: MonsterCard[];
  onMeld: (card: MonsterCard) => void;
  onImageSaved?: (id: string) => void;
  isActive: boolean;
}

const RARITY_WEIGHTS: Record<Rarity, number> = {
  [Rarity.Mythical]: 5,
  [Rarity.Legendary]: 4,
  [Rarity.Rare]: 3,
  [Rarity.Uncommon]: 2,
  [Rarity.Common]: 1
};

const Collection: React.FC<CollectionProps> = ({ cards, onMeld, onImageSaved, isActive }) => {
  const [selectedCard, setSelectedCard] = useState<MonsterCard | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>('NEWEST');
  const [activeFilter, setActiveFilter] = useState<FilterOption>('ALL');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  // Layout State
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>([]);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState('');
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  
  // Virtual Scroll State
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0); // Height of the viewport
  const [containerWidth, setContainerWidth] = useState(0);
  
  const [lastViewedTime, setLastViewedTime] = useState<number>(() => storageService.loadLastViewedTime());

  // Logic to clear "New" badges when user LEAVES the collection
  useEffect(() => {
    if (!isActive) {
        const now = Date.now();
        storageService.saveLastViewedTime(now);
        setLastViewedTime(now);
    }
  }, [isActive]);

  // Virtual Scroll: Attach listener to the main scrollable container
  useEffect(() => {
      const scrollContainer = document.querySelector('[data-scroll-container]') as HTMLElement | null;
      if (!scrollContainer) return;

      const handleScroll = () => {
          requestAnimationFrame(() => {
              setScrollTop(scrollContainer.scrollTop);
          });
      };

      // Initial measurement
      setScrollTop(scrollContainer.scrollTop);
      setContainerHeight(scrollContainer.clientHeight);

      const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
              setContainerHeight(entry.contentRect.height);
          }
      });
      resizeObserver.observe(scrollContainer);

      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
          scrollContainer.removeEventListener('scroll', handleScroll);
          resizeObserver.disconnect();
      };
  }, []);

  // Measure Grid Container Width for responsive calculations
  useEffect(() => {
      if (!gridContainerRef.current) return;
      const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
              setContainerWidth(entry.contentRect.width);
          }
      });
      observer.observe(gridContainerRef.current);
      return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const favs = storageService.loadFavorites();
    setFavorites(new Set(favs));
    
    // Load layouts
    const layouts = storageService.loadCollectionLayouts();
    setSavedLayouts(layouts);
  }, []);

  useEffect(() => {
    storageService.saveFavorites(Array.from(favorites));
  }, [favorites]);
  
  useEffect(() => {
      return () => {
          storageService.saveLastViewedTime(Date.now());
      }
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (layoutMenuRef.current && !layoutMenuRef.current.contains(event.target as Node)) {
        setShowLayoutMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFavorite = (e: React.MouseEvent, cardName: string) => {
    e.stopPropagation();
    e.preventDefault();
    playPopSound();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(cardName)) {
        next.delete(cardName);
      } else {
        next.add(cardName);
      }
      return next;
    });
  };

  const handleFilterChange = (type: FilterOption) => {
      playSwitchSound();
      setActiveFilter(type);
      // Reset scroll to top
      const scrollContainer = document.querySelector('[data-scroll-container]');
      if (scrollContainer) scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Layout Handlers ---
  const handleSaveLayout = () => {
    if(!newLayoutName.trim()) return;
    playSuccessSound();
    const newLayout: SavedLayout = {
        id: Date.now().toString(),
        name: newLayoutName,
        filter: activeFilter,
        sort: sortOption
    };
    const updated = [...savedLayouts, newLayout];
    setSavedLayouts(updated);
    storageService.saveCollectionLayouts(updated);
    setNewLayoutName('');
  };

  const handleLoadLayout = (layout: SavedLayout) => {
    playSwitchSound();
    setActiveFilter(layout.filter);
    setSortOption(layout.sort);
    setShowLayoutMenu(false);
  };

  const handleDeleteLayout = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playSoftClick();
    const updated = savedLayouts.filter(l => l.id !== id);
    setSavedLayouts(updated);
    storageService.saveCollectionLayouts(updated);
  };

  const getFilterLabel = (filter: string) => {
    if (filter === 'ALL') return 'Alle';
    if (filter === 'NEW') return 'Nye';
    if (filter === 'FAVORITES') return 'Favoritter';
    if (Object.values(Rarity).includes(filter as Rarity)) return RARITY_TRANSLATIONS[filter as Rarity];
    return filter;
  };

  // Group duplicates and identify new cards
  const groupedCards = useMemo(() => {
    const groups = new Map<string, { card: MonsterCard, count: number, latestTimestamp: number, isNew: boolean }>();
    
    cards.forEach(card => {
      const parts = card.id.split('-');
      const timestamp = parts.length >= 2 ? parseInt(parts[1]) : 0;
      const isNew = timestamp > lastViewedTime;

      if (groups.has(card.name)) {
        const entry = groups.get(card.name)!;
        entry.count++;
        
        if (timestamp > entry.latestTimestamp) {
            entry.latestTimestamp = timestamp;
        }
        if (isNew) entry.isNew = true;
        
        if (card.isShiny && !entry.card.isShiny) {
          entry.card = card;
        } else if (card.isShiny === entry.card.isShiny && !entry.card.imageUrl && card.imageUrl) {
          entry.card = card;
        }
      } else {
        groups.set(card.name, { card, count: 1, latestTimestamp: timestamp, isNew });
      }
    });

    return Array.from(groups.values());
  }, [cards, lastViewedTime]);
  
  const sortedCards = useMemo(() => {
      let filtered = groupedCards;
      
      if (activeFilter === 'FAVORITES') {
          filtered = groupedCards.filter(g => favorites.has(g.card.name));
      } else if (activeFilter === 'NEW') {
          filtered = groupedCards.filter(g => g.isNew);
      } else if (Object.values(Rarity).includes(activeFilter as Rarity)) {
          filtered = groupedCards.filter(g => g.card.rarity === activeFilter);
      } else if (activeFilter !== 'ALL') {
          filtered = groupedCards.filter(g => g.card.type === activeFilter);
      }

      return [...filtered].sort((a, b) => {
          if (sortOption === 'FAVORITES') {
             const isFavA = favorites.has(a.card.name);
             const isFavB = favorites.has(b.card.name);
             if (isFavA && !isFavB) return -1;
             if (!isFavA && isFavB) return 1;
             return b.latestTimestamp - a.latestTimestamp; 
          }

          switch (sortOption) {
              case 'NEWEST': return b.latestTimestamp - a.latestTimestamp;
              case 'OLDEST': return a.latestTimestamp - b.latestTimestamp;
              case 'NAME_ASC': return a.card.name.localeCompare(b.card.name, 'no');
              case 'NAME_DESC': return b.card.name.localeCompare(a.card.name, 'no');
              case 'RARITY_DESC': return RARITY_WEIGHTS[b.card.rarity] - RARITY_WEIGHTS[a.card.rarity];
              case 'RARITY_ASC': return RARITY_WEIGHTS[a.card.rarity] - RARITY_WEIGHTS[b.card.rarity];
              default: return 0;
          }
      });
  }, [groupedCards, sortOption, favorites, activeFilter]);

  const selectedGroup = useMemo(() => {
    if (!selectedCard) return null;
    return groupedCards.find(g => g.card.name === selectedCard.name);
  }, [selectedCard, groupedCards]);

  const getRarityBorderColor = (rarity: Rarity) => {
    switch (rarity) {
      case Rarity.Common: return 'border-slate-600/50 group-hover:border-slate-400';
      case Rarity.Uncommon: return 'border-emerald-500/30 group-hover:border-emerald-400';
      case Rarity.Rare: return 'border-blue-500/40 group-hover:border-blue-400';
      case Rarity.Legendary: return 'border-amber-500/50 group-hover:border-amber-300';
      case Rarity.Mythical: return 'border-fuchsia-500/50 group-hover:border-fuchsia-300';
      default: return 'border-white/10';
    }
  };

  const getRarityGlow = (rarity: Rarity) => {
    switch (rarity) {
      case Rarity.Legendary: return 'shadow-[0_0_15px_rgba(245,158,11,0.15)] hover:shadow-[0_0_25px_rgba(245,158,11,0.3)]';
      case Rarity.Mythical: return 'shadow-[0_0_15px_rgba(217,70,239,0.15)] hover:shadow-[0_0_25px_rgba(217,70,239,0.3)]';
      default: return 'hover:shadow-lg';
    }
  };

  const handleMeldClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (selectedCard) {
          playSuccessSound();
          onMeld(selectedCard);
      }
  };

  // --- VIRTUAL SCROLL LOGIC ---
  const virtualData = useMemo(() => {
      if (containerWidth === 0) return { items: [], paddingTop: 0, paddingBottom: 0 };

      // Determine Grid Metrics based on current width (matches CSS classes)
      let cols = 2; // grid-cols-2
      let gap = 16; // gap-4 (1rem = 16px)

      if (window.innerWidth >= 1024) { // lg
          cols = 4;
          gap = 24; // gap-6
      } else if (window.innerWidth >= 768) { // md
          cols = 3;
          gap = 24;
      } else if (window.innerWidth >= 640) { // sm
          gap = 24;
      }

      const totalGapWidth = gap * (cols - 1);
      const singleCardWidth = (containerWidth - totalGapWidth) / cols;
      const singleCardHeight = (singleCardWidth * 1.5); // Aspect ratio 2/3
      
      const rowHeight = singleCardHeight + gap;
      
      const totalRows = Math.ceil(sortedCards.length / cols);
      
      // Calculate Scroll Window
      // Adjust for the offset of the grid container relative to the scroll container
      // (This is an estimation, usually header + filters ~ 200px)
      const containerOffset = gridContainerRef.current?.offsetTop || 180; 
      
      const scrollY = Math.max(0, scrollTop - containerOffset);
      const buffer = 2; // Number of rows to render outside viewport

      let startRow = Math.floor(scrollY / rowHeight) - buffer;
      startRow = Math.max(0, startRow);

      let endRow = Math.ceil((scrollY + containerHeight) / rowHeight) + buffer;
      endRow = Math.min(totalRows, endRow);

      const startIndex = startRow * cols;
      const endIndex = endRow * cols;

      const visibleItems = sortedCards.slice(startIndex, endIndex);
      
      const paddingTop = startRow * rowHeight;
      const paddingBottom = (totalRows - endRow) * rowHeight;

      return { items: visibleItems, paddingTop, paddingBottom };

  }, [sortedCards, scrollTop, containerWidth, containerHeight]);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-60">
        <span className="text-6xl mb-4">🕸️</span>
        <h3 className="font-cute font-bold text-xl text-white mb-2">Tomt her...</h3>
        <p className="text-sm text-white/60">Spill Blokk-Sprell for å tjene mynter og kjøpe din første pakke!</p>
      </div>
    );
  }

  return (
    <div className="w-full px-4 pb-24 pt-2 max-w-7xl mx-auto">
      
      {/* Controls Container */}
      <div className="flex flex-col gap-4 mb-6">
          
          {/* Header Stats */}
          <div className="flex justify-between items-center bg-black/20 p-3 rounded-2xl backdrop-blur-md border border-white/5 relative z-40">
                <div className="flex items-center gap-3">
                    <div className="bg-white/10 p-2 rounded-lg">
                        <span className="text-xl">📚</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white font-cute">Din Samling</span>
                        <span className="text-xs font-cute text-white/50">
                            {sortedCards.length} / {groupedCards.length} Vist
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Saved Layouts Menu */}
                    <div className="relative" ref={layoutMenuRef}>
                      <button 
                        onClick={() => { playSoftClick(); setShowLayoutMenu(!showLayoutMenu); }}
                        className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl transition-colors border border-white/10"
                        title="Lagrede Visninger"
                      >
                         <span className="text-lg">💾</span>
                      </button>
                      
                      {showLayoutMenu && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900 border border-white/20 rounded-xl p-4 shadow-2xl z-50 animate-fade-in flex flex-col gap-3">
                            <div>
                                <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Lagre nåværende</h4>
                                <div className="flex gap-2">
                                  <input 
                                    type="text" 
                                    value={newLayoutName}
                                    onChange={(e) => setNewLayoutName(e.target.value)}
                                    placeholder="Navn (f.eks 'Mine Røde')"
                                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-pink-400"
                                  />
                                  <button onClick={handleSaveLayout} className="bg-pink-600 hover:bg-pink-500 px-3 rounded-lg text-white font-bold text-xs">OK</button>
                                </div>
                            </div>
                            
                            <div className="border-t border-white/10 my-1"></div>
                            
                            <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider mb-2">Mine Visninger</h4>
                                {savedLayouts.length === 0 ? (
                                  <p className="text-[10px] text-white/30 italic">Ingen lagrede visninger.</p>
                                ) : (
                                  <div className="flex flex-col gap-1.5">
                                    {savedLayouts.map(layout => (
                                      <div key={layout.id} className="flex items-center justify-between bg-white/5 p-2 rounded-lg group hover:bg-white/10 transition-colors">
                                        <button onClick={() => handleLoadLayout(layout)} className="text-left flex-1">
                                          <div className="text-xs font-bold text-pink-200">{layout.name}</div>
                                          <div className="text-[9px] text-white/40">
                                            {getFilterLabel(layout.filter as string)} • {layout.sort}
                                          </div>
                                        </button>
                                        <button onClick={(e) => handleDeleteLayout(layout.id, e)} className="text-white/20 hover:text-red-400 p-1">✕</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </div>
                        </div>
                      )}
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative">
                        <select 
                        value={sortOption} 
                        onChange={(e) => { playSoftClick(); setSortOption(e.target.value as SortOption); }}
                        className="appearance-none bg-slate-900/80 border border-white/10 text-white font-cute text-xs font-bold rounded-xl pl-4 pr-10 py-2 focus:outline-none focus:bg-slate-800 focus:border-pink-500/50 transition-all cursor-pointer shadow-inner"
                        >
                            <option value="NEWEST">Nyeste</option>
                            <option value="OLDEST">Eldste</option>
                            <option value="FAVORITES">Favoritter</option>
                            <option value="RARITY_DESC">Sjeldenhet (Mytisk ➜ Vanlig)</option>
                            <option value="RARITY_ASC">Sjeldenhet (Vanlig ➜ Mytisk)</option>
                            <option value="NAME_ASC">Navn (A-Å)</option>
                            <option value="NAME_DESC">Navn (Å-A)</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50 text-[10px]">▼</div>
                    </div>
                </div>
          </div>

          {/* Filter Bar */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar w-full mask-gradient-sides">
              <button
                  onClick={() => handleFilterChange('ALL')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-cute whitespace-nowrap transition-all ${activeFilter === 'ALL' ? 'bg-pink-500 border-pink-400 text-white shadow-[0_0_10px_rgba(236,72,153,0.4)]' : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/10'}`}
              >
                  <span>🌈</span> Alle
              </button>
              
              <button
                  onClick={() => handleFilterChange('NEW')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-cute whitespace-nowrap transition-all ${activeFilter === 'NEW' ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_10px_rgba(8,145,178,0.4)]' : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/10'}`}
              >
                  <span>✨</span> Nye
              </button>
              
              <button
                  onClick={() => handleFilterChange('FAVORITES')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-cute whitespace-nowrap transition-all ${activeFilter === 'FAVORITES' ? 'bg-yellow-500 border-yellow-400 text-white shadow-[0_0_10px_rgba(234,179,8,0.4)]' : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/10'}`}
              >
                  <span>❤️</span> Favoritter
              </button>

              {/* Rarity Filters */}
              {Object.values(Rarity).map((rarity) => (
                  <button
                      key={rarity}
                      onClick={() => handleFilterChange(rarity)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-cute whitespace-nowrap transition-all ${activeFilter === rarity ? 'bg-purple-600 border-purple-400 text-white shadow-[0_0_10px_rgba(147,51,234,0.4)]' : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/10'}`}
                  >
                      <span>{RARITY_TRANSLATIONS[rarity]}</span>
                  </button>
              ))}

              {/* Type Filters */}
              {Object.values(ElementType).map((type) => (
                  <button
                      key={type}
                      onClick={() => handleFilterChange(type)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold font-cute whitespace-nowrap transition-all ${activeFilter === type ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_10px_rgba(79,70,229,0.4)]' : 'bg-black/30 border-white/10 text-white/60 hover:bg-white/10'}`}
                  >
                      <span>{ELEMENT_ICONS[type]}</span> {type}
                  </button>
              ))}
          </div>
      </div>

      {/* Responsive Grid Layout with Virtual Scrolling */}
      <div 
        ref={gridContainerRef} 
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 animate-fade-in"
      >
        {/* Top Spacer */}
        {virtualData.paddingTop > 0 && <div style={{ height: virtualData.paddingTop, gridColumn: '1 / -1' }}></div>}
        
        {virtualData.items.map(({ card, count, isNew }) => {
          const isFav = favorites.has(card.name);
          const rarityBorder = getRarityBorderColor(card.rarity);
          const rarityGlow = getRarityGlow(card.rarity);
          
          let containerClasses = `relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer group transition-all duration-300 ease-out hover:-translate-y-1 ${rarityBorder} border-2 ${rarityGlow} bg-slate-900/50 `;
          
          if (isFav) {
            containerClasses += "ring-2 ring-yellow-400 ring-offset-2 ring-offset-black/50 ";
          }

          return (
            <div 
              key={card.id}
              className={containerClasses}
              onClick={() => { playPopSound(); setSelectedCard(card); }}
            >
              {/* New Badge - Floating */}
              {isNew && (
                 <div className="absolute top-2 left-2 z-30 animate-bounce-subtle">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75 animate-ping"></span>
                    <span className="relative inline-flex px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 border border-white/20 shadow-lg items-center">
                        <span className="text-[9px] font-bold text-white tracking-wider">NY!</span>
                    </span>
                 </div>
              )}

              {/* Shiny Overlay */}
              {card.isShiny && (
                <>
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-20 mix-blend-overlay"></div>
                    <div className="absolute top-0 right-0 p-2 z-20 opacity-80">
                        <span className="text-lg filter drop-shadow-[0_0_5px_rgba(255,255,0,0.8)]">✨</span>
                    </div>
                </>
              )}

              {/* Controls (Favorite + Count) */}
              <div className="absolute top-2 right-2 z-30 flex flex-col items-end gap-2">
                  {/* Favorite Toggle */}
                  <button 
                    onClick={(e) => toggleFavorite(e, card.name)}
                    className={`w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-md transition-all duration-200 active:scale-90 shadow-lg border border-white/5 ${isFav ? 'bg-black/60 text-yellow-400' : 'bg-black/30 text-white/30 hover:text-white hover:bg-black/50'}`}
                  >
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`w-4 h-4 ${isFav ? 'drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]' : ''}`}>
                        {isFav ? (
                             <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                        ) : (
                             <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" fillOpacity="0.2" />
                        )}
                     </svg>
                  </button>

                  {/* Count Badge */}
                  {count > 1 && (
                    <div className="flex items-center justify-center bg-slate-800/80 backdrop-blur-sm text-white text-[10px] font-bold h-6 min-w-[24px] px-1.5 rounded-full border border-white/10 shadow-lg">
                       <span className="text-white/60 mr-0.5">x</span>{count}
                    </div>
                  )}
              </div>

              {/* Card Image */}
              <div className="absolute inset-0 bg-slate-800">
                  <CardComponent 
                      card={card} 
                      index={0} 
                      isRevealed={true} 
                      onImageSaved={onImageSaved}
                      className="w-full h-full"
                  />
                 {/* Vignette Overlay */}
                 <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80 pointer-events-none"></div>
              </div>
              
              {/* Card Info - Always visible at bottom */}
              <div className="absolute bottom-0 inset-x-0 p-3 flex flex-col gap-0.5 z-20 pointer-events-none">
                 <div className="flex items-center justify-between">
                     <span className={`text-[9px] uppercase tracking-widest font-bold ${RARITY_COLORS[card.rarity]}`}>
                        {RARITY_TRANSLATIONS[card.rarity]}
                     </span>
                     <span className="text-[14px]">{ELEMENT_ICONS[card.type]}</span>
                 </div>
                 <h3 className="text-white font-cute font-bold text-sm leading-tight truncate drop-shadow-md group-hover:text-pink-200 transition-colors">
                    {card.name}
                 </h3>
              </div>

            </div>
          );
        })}

        {/* Bottom Spacer */}
        {virtualData.paddingBottom > 0 && <div style={{ height: virtualData.paddingBottom, gridColumn: '1 / -1' }}></div>}
      </div>
      
      {/* Modal - Detailed View */}
      {selectedCard && (
         <div 
           className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-fade-in overflow-y-auto" 
           onClick={(e) => { 
             e.stopPropagation(); 
             playSoftClick();
             setSelectedCard(null); 
           }}
         >
            {/* Wrapper for layout */}
            <div className="relative w-full max-w-4xl flex flex-col md:flex-row items-center md:items-start justify-center gap-6 py-4 md:py-8 pointer-events-auto animate-modal-zoom" onClick={(e) => e.stopPropagation()}>
               
               {/* Close Button */}
               <button 
                 className="fixed md:absolute top-4 right-4 md:-top-6 md:-right-6 w-10 h-10 z-[60] rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 backdrop-blur-md border border-white/10 transition-transform hover:scale-110 active:scale-95"
                 onClick={() => { playSoftClick(); setSelectedCard(null); }}
               >
                 ✕
               </button>

               {/* Card */}
               <div className="shrink-0 transform transition-transform hover:scale-105 duration-500 z-10">
                    <CardComponent 
                      card={selectedCard} 
                      index={0} 
                      isRevealed={true} 
                      startFlipped={true} 
                      onImageSaved={onImageSaved}
                    />
               </div>
               
               {/* Details Panel - Mobile Optimized */}
               <div className="w-full max-w-sm xs:max-w-md bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 animate-slide-up">
                    
                    {/* Collection Info Header */}
                    <div className="flex justify-between items-center text-[11px] text-white/50 font-cute border-b border-white/5 pb-2">
                        <span>Funnet: {new Date(parseInt(selectedCard.id.split('-')[1])).toLocaleDateString('no-NO')}</span>
                        <div className="flex items-center gap-2">
                             <span>Eier: <span className="text-white font-bold">{selectedGroup?.count || 1}</span></span>
                        </div>
                    </div>

                    {/* Stats Compact */}
                    <div className="grid grid-cols-2 gap-3">
                         <div className="bg-white/5 rounded-xl p-2.5 border border-white/5 flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-pink-300 font-bold">HP</span>
                            <span className="text-lg font-mono text-white font-bold">{selectedCard.hp}</span>
                        </div>
                         <div className="bg-white/5 rounded-xl p-2.5 border border-white/5 flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-blue-300 font-bold">Trekk</span>
                            <span className="text-lg font-mono text-white font-bold">{selectedCard.moves.length}</span>
                        </div>
                    </div>

                    {/* Lore Box */}
                    <div className="bg-black/30 rounded-xl p-4 border border-white/5 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-pink-500 to-purple-500"></div>
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">Historie</h3>
                        <p className="text-sm text-white/90 italic font-body leading-relaxed">
                            "{selectedCard.flavorText}"
                        </p>
                    </div>

                    {/* Meld Section */}
                    {selectedGroup && selectedGroup.count > 1 && (
                        <div className="bg-gradient-to-br from-purple-900/40 to-pink-900/40 rounded-xl p-3 border border-purple-500/30">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-xs text-white">Fusjoner Duplikater ({selectedGroup.count - 1})</span>
                                <div className="text-[10px] flex gap-2 opacity-80">
                                    <span className="text-amber-300">+{ (MELD_REWARDS[selectedCard.rarity]?.coins || 10) * (selectedGroup.count - 1)} 🪙</span>
                                    <span className="text-blue-300">+{ (MELD_REWARDS[selectedCard.rarity]?.xp || 20) * (selectedGroup.count - 1)} XP</span>
                                </div>
                            </div>
                            <button 
                                onClick={handleMeldClick}
                                className="w-full py-2 bg-white text-purple-900 font-bold rounded-lg shadow-lg hover:bg-purple-50 active:scale-95 transition-all font-cute text-xs uppercase tracking-widest"
                            >
                                ✨ Start Fusjonering
                            </button>
                        </div>
                    )}
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default Collection;