import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { GridCell, Shape, ShapeLayout, FloatingText, Particle, PowerUpType, SavedGameSession } from '../types';
import { playMagicalSparkle, playHoverSound, playHardClick, playSoftClick, playPopSound, playErrorSound, playSuccessSound } from '../utils/audio';
import { storageService } from '../services/storageService';

const GRID_SIZE = 8;
// Christmas Palette: Santa Red, Pine Green, Gold, Ice Blue, Royal Purple
const COLORS = [
  '#ef4444', // Red
  '#15803d', // Green
  '#eab308', // Gold
  '#3b82f6', // Ice Blue
  '#a855f7'  // Purple
];

const JULE_WORDS = [
    "GOD JUL!", "HO HO HO!", "NISSEFAR!", "JULEBRUS!", 
    "PEPPERKAKE!", "MARSIPAN!", "RIBBE!", "PINNEKJØTT!", 
    "MANDEL!", "GLØGG!", "JULERIBBE!", "SNØMANN!"
];

// Expanded Shape Library
const SHAPES_TEMPLATES: { layout: ShapeLayout, id: string, difficulty: 'EASY' | 'MEDIUM' | 'HARD' }[] = [
  { id: '1x1', layout: [[1]], difficulty: 'EASY' },
  { id: '1x2', layout: [[1, 1]], difficulty: 'EASY' },
  { id: '2x1', layout: [[1], [1]], difficulty: 'EASY' },
  { id: '2x2', layout: [[1, 1], [1, 1]], difficulty: 'EASY' },
  { id: 'Diag2', layout: [[1,0],[0,1]], difficulty: 'EASY' },
  
  { id: '1x3', layout: [[1, 1, 1]], difficulty: 'MEDIUM' },
  { id: '3x1', layout: [[1], [1], [1]], difficulty: 'MEDIUM' },
  { id: 'L', layout: [[1, 0], [1, 0], [1, 1]], difficulty: 'MEDIUM' },
  { id: 'L_inv', layout: [[0, 1], [0, 1], [1, 1]], difficulty: 'MEDIUM' },
  { id: 'T', layout: [[1, 1, 1], [0, 1, 0]], difficulty: 'MEDIUM' },
  { id: 'T_inv', layout: [[0, 1, 0], [1, 1, 1]], difficulty: 'MEDIUM' },
  { id: 'Z', layout: [[1, 1, 0], [0, 1, 1]], difficulty: 'MEDIUM' },
  { id: 'S', layout: [[0, 1, 1], [1, 1, 0]], difficulty: 'MEDIUM' },
  { id: 'Diag3', layout: [[1,0,0],[0,1,0],[0,0,1]], difficulty: 'MEDIUM' },

  { id: '3x3_L', layout: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], difficulty: 'HARD' },
  { id: 'Plus', layout: [[0, 1, 0], [1, 1, 1], [0, 1, 0]], difficulty: 'HARD' },
  { id: 'U', layout: [[1, 0, 1], [1, 1, 1]], difficulty: 'HARD' },
  { id: 'BigL', layout: [[1,0,0],[1,0,0],[1,1,1]], difficulty: 'HARD' }
];

const POWER_UP_COSTS: Record<PowerUpType, number> = {
    BOMB: 100,
    LINE: 80,
    COLOR: 120,
    SINGLE: 50,
    REFRESH: 25
};

// Helper: Rotate Matrix 90deg Clockwise
const rotateLayout = (layout: ShapeLayout): ShapeLayout => {
  const rows = layout.length;
  const cols = layout[0].length;
  const newLayout: number[][] = Array(cols).fill(0).map(() => Array(rows).fill(0));
  
  for(let r=0; r<rows; r++) {
    for(let c=0; c<cols; c++) {
      newLayout[c][rows - 1 - r] = layout[r][c];
    }
  }
  return newLayout;
};

// --- MEMOIZED COMPONENTS (Optimization) ---
interface GridProps {
  grid: GridCell[][];
  onHover: (r: number, c: number) => void;
  onClick: (r: number, c: number) => void;
  getCellStatus: (r: number, c: number, hoveredCell: {r: number, c: number} | null) => string;
  selectedShape: Shape | null;
  hoveredCell: {r: number, c: number} | null;
  activePowerUp: PowerUpType | null;
}

const MemoizedGrid = memo(({ grid, onHover, onClick, getCellStatus, selectedShape, hoveredCell, activePowerUp }: GridProps) => {
    return (
        <div className="grid grid-cols-8 gap-1 w-full h-full relative z-10">
          {grid.map((row, r) => (
            row.map((cell, c) => {
              const status = getCellStatus(r, c, hoveredCell);
              let style: React.CSSProperties = {};
              if (status === 'filled' && cell) style = { backgroundColor: cell };
              else if (status === 'ghost-valid' && selectedShape) style = { backgroundColor: selectedShape.color };
              else if (status === 'ghost-invalid') style = { backgroundColor: 'rgba(239, 68, 68, 0.4)' };
              else if (status === 'powerup-target') style = { backgroundColor: '#fff', animation: 'pulse 0.5s cubic-bezier(0.4, 0, 0.6, 1) infinite', zIndex: 25 };

              return (
                <div
                  key={`${r}-${c}`}
                  onMouseEnter={() => onHover(r, c)}
                  onClick={() => onClick(r, c)}
                  className={`
                    w-full h-full rounded-[4px] sm:rounded-md transition-all duration-150 flex items-center justify-center
                    ${status === 'filled' ? 'gem-block-3d' : ''}
                    ${status === 'empty' ? 'cyber-cell-empty' : ''}
                    ${status === 'ghost-valid' ? 'gem-block-3d gem-ghost' : ''}
                    ${status === 'ghost-invalid' ? 'rounded-lg border border-red-500/50' : ''}
                    ${status === 'clearing' ? 'bg-white animate-flash z-30' : ''}
                  `}
                  style={style}
                >
                   {(status === 'filled') && <div className="gem-block-3d-inner"></div>}
                   {status === 'clearing' && <div className="absolute inset-0 bg-white z-40 animate-crumble rounded-[4px]"></div>}
                </div>
              )
            })
          ))}
        </div>
    );
});

interface GameProps {
  onGameOver: (score: number) => void;
  isActive: boolean;
  coins: number;
  deductCoins: (amount: number) => boolean;
  level: number;
  currentXP: number;
  xpNeeded: number;
}

const BlockGame: React.FC<GameProps> = ({ onGameOver, isActive, coins, deductCoins, level, currentXP, xpNeeded }) => {
  const [grid, setGrid] = useState<GridCell[][]>(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [holdShape, setHoldShape] = useState<Shape | null>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [selectedShapeIdx, setSelectedShapeIdx] = useState<number | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isSessionLoaded, setIsSessionLoaded] = useState(false);
  
  // Animated Stats for Game Over
  const [earnedCoins, setEarnedCoins] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [displayCoins, setDisplayCoins] = useState(0);
  const [displayXP, setDisplayXP] = useState(0);
  const [gameOverPhase, setGameOverPhase] = useState(0); // 0: None, 1: Title, 2: Score, 3: XP, 4: Coins, 5: Done
  
  // Power Ups State
  const [powerUps, setPowerUps] = useState<Record<PowerUpType, number>>({
    BOMB: 1,
    LINE: 1,
    COLOR: 1,
    SINGLE: 1,
    REFRESH: 1
  });
  const [powerUpsLoaded, setPowerUpsLoaded] = useState(false);

  const [activePowerUp, setActivePowerUp] = useState<PowerUpType | null>(null);
  const [rescueMode, setRescueMode] = useState(false);

  // Game "Juice" State
  const [hoveredCell, setHoveredCell] = useState<{r: number, c: number} | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [clearingRows, setClearingRows] = useState<number[]>([]);
  const [clearingCols, setClearingCols] = useState<number[]>([]);
  const [shakeType, setShakeType] = useState<'none' | 'light' | 'heavy'>('none');
  const [comboCount, setComboCount] = useState(0);
  const [streakCount, setStreakCount] = useState(0);
  
  const floatingTextIdRef = useRef(0);
  const floatingTextTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameOverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Track Game Round to prevent stale Game Over checks after reset
  const gameRoundRef = useRef(0);
  
  // Ref for generating unique IDs correctly across renders/resets
  const shapeCounterRef = useRef(0);

  // --- STARTUP LOGIC ---
  const generateShapes = useCallback(() => {
    const newShapes: Shape[] = [];
    const shuffledColors = [...COLORS].sort(() => 0.5 - Math.random());
    
    // Categorize shapes
    const single = SHAPES_TEMPLATES.find(s => s.id === '1x1')!;
    const small = SHAPES_TEMPLATES.filter(s => ['1x2', '2x1', 'Diag2'].includes(s.id));
    const medium = SHAPES_TEMPLATES.filter(s => (s.difficulty === 'MEDIUM' || s.id === '2x2'));
    const hard = SHAPES_TEMPLATES.filter(s => s.difficulty === 'HARD');

    // Slot 1: Challenge
    const pool1 = Math.random() < 0.35 ? hard : medium;
    const s1 = pool1[Math.floor(Math.random() * pool1.length)];

    // Slot 2: Connector
    const pool2 = Math.random() < 0.5 ? medium : small;
    const s2 = pool2[Math.floor(Math.random() * pool2.length)];

    // Slot 3: Safety
    const probSingle = s1.difficulty === 'HARD' ? 0.7 : 0.4;
    const s3 = Math.random() < probSingle ? single : small[Math.floor(Math.random() * small.length)];

    const templates = [s1, s2, s3];
    const shuffledTemplates = templates
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);

    shuffledTemplates.forEach((template, i) => {
        // More robust ID generation using counter + timestamp + random
        shapeCounterRef.current += 1;
        const uniqueId = `shape-${Date.now()}-${shapeCounterRef.current}-${i}-${Math.random().toString(36).slice(2, 7)}`;
        newShapes.push({ 
            ...template, 
            id: uniqueId, 
            color: shuffledColors[i % shuffledColors.length] 
        });
    });

    setShapes(newShapes);
  }, []);

  useEffect(() => {
    const init = async () => {
        setHighScore(storageService.loadHighScore());
        
        const savedPU = await storageService.loadPowerUps();
        if (savedPU) setPowerUps(savedPU);
        setPowerUpsLoaded(true);

        const session = await storageService.loadGameSession();
        if (session && !session.isGameOver && (session.score > 0 || session.shapes.length > 0)) {
            setGrid(session.grid);
            setShapes(session.shapes);
            setHoldShape(session.holdShape);
            setScore(session.score);
            setComboCount(session.comboCount);
            setStreakCount(session.streakCount);
            setRescueMode(session.rescueMode);
            setIsGameOver(session.isGameOver);
        } else {
            generateShapes();
        }
        setIsSessionLoaded(true);
    };
    init();
  }, [generateShapes]);

  // --- AUTO SAVE LOGIC ---
  const gameStateRef = useRef({ grid, shapes, holdShape, score, comboCount, streakCount, rescueMode, isGameOver, isSessionLoaded });
  useEffect(() => {
      gameStateRef.current = { grid, shapes, holdShape, score, comboCount, streakCount, rescueMode, isGameOver, isSessionLoaded };
  }, [grid, shapes, holdShape, score, comboCount, streakCount, rescueMode, isGameOver, isSessionLoaded]);

  const saveState = useCallback(() => {
      const state = gameStateRef.current;
      if (!state.isSessionLoaded) return;
      
      if (state.isGameOver) {
          storageService.clearGameSession();
          return;
      }
      // Save full session state
      storageService.saveGameSession({
          grid: state.grid,
          shapes: state.shapes,
          holdShape: state.holdShape,
          score: state.score,
          comboCount: state.comboCount,
          streakCount: state.streakCount,
          rescueMode: state.rescueMode,
          isGameOver: state.isGameOver
      });
  }, []);

  // Periodic Save (30s) and Visibility Change
  useEffect(() => {
      const interval = setInterval(saveState, 30000); 

      const handleVisibilityChange = () => {
          if (document.visibilityState === 'hidden') {
              saveState();
          }
      };
      const handleBlur = () => {
          saveState();
      }
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleBlur);
      window.addEventListener('beforeunload', handleBlur);

      return () => {
          clearInterval(interval);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('blur', handleBlur);
          window.removeEventListener('beforeunload', handleBlur);
      };
  }, [saveState]);

  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      storageService.saveHighScore(score);
    }
  }, [score, highScore]);
  
  useEffect(() => {
      if (powerUpsLoaded) {
          storageService.savePowerUps(powerUps);
      }
  }, [powerUps, powerUpsLoaded]);

  // Check for Game Over immediately when shapes change
  useEffect(() => {
      if (shapes.length > 0 && !isGameOver && !rescueMode && isSessionLoaded && isActive) {
          checkGameOver(grid, shapes);
      }
      // CRITICAL: We include 'grid' to ensure the closure isn't stale when grid updates happen simultaneously with shape updates (e.g. after clear)
      // Added 'isActive' to prevent checks when game is not visible
  }, [shapes, isGameOver, rescueMode, isSessionLoaded, grid, isActive]); 

  // Game Over Sequence Manager
  useEffect(() => {
    if (isGameOver) {
        // Start Sequence
        setGameOverPhase(1); // Title
        
        const t1 = setTimeout(() => setGameOverPhase(2), 600); // Score Count
        const t2 = setTimeout(() => setGameOverPhase(3), 1800); // XP
        const t3 = setTimeout(() => setGameOverPhase(4), 3000); // Coins
        const t4 = setTimeout(() => setGameOverPhase(5), 4200); // Buttons
        
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    } else {
        setGameOverPhase(0);
        setDisplayScore(0);
        setDisplayCoins(0);
        setDisplayXP(0);
    }
  }, [isGameOver]);

  // Counting Effects based on Phase
  useEffect(() => {
    if (!isGameOver) return;

    // Helper for smooth counting
    const countUp = (start: number, end: number, setFn: (val: number) => void, duration: number) => {
        if (start >= end) { setFn(end); return; }
        const startTime = performance.now();
        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quart
            const ease = 1 - Math.pow(1 - progress, 4);
            setFn(Math.floor(start + (end - start) * ease));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    };

    if (gameOverPhase === 2 && score > 0 && displayScore === 0) {
         playMagicalSparkle();
         countUp(0, score, setDisplayScore, 1000);
    }
    
    if (gameOverPhase === 3 && score > 0 && displayXP === 0) {
         playSuccessSound();
         countUp(0, score, setDisplayXP, 1000);
    }
    
    if (gameOverPhase === 4 && earnedCoins > 0 && displayCoins === 0) {
         playPopSound();
         countUp(0, earnedCoins, setDisplayCoins, 1000);
    }

  }, [gameOverPhase, isGameOver, score, earnedCoins, displayScore, displayXP, displayCoins]);

  const resetGame = () => {
    playSoftClick();
    gameRoundRef.current += 1; // Invalidate any pending game over checks
    if (gameOverTimeoutRef.current) {
        clearTimeout(gameOverTimeoutRef.current);
        gameOverTimeoutRef.current = null;
    }
    storageService.clearGameSession(); // Clear storage on reset
    setGrid(Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)));
    setScore(0);
    setEarnedCoins(0);
    setDisplayScore(0);
    setDisplayCoins(0);
    setDisplayXP(0);
    setGameOverPhase(0);
    setIsGameOver(false);
    setRescueMode(false);
    setComboCount(0);
    setStreakCount(0);
    generateShapes();
    setSelectedShapeIdx(null);
    setHoldShape(null);
    setClearingRows([]);
    setClearingCols([]);
    setParticles([]);
    setShakeType('none');
    setActivePowerUp(null); // Clear any stuck power-up state
  };

  useEffect(() => {
    // Only reset if session is loaded AND we truly have empty shapes in active game,
    // AND it's not just a momentary empty state (e.g. valid game over or just cleared).
    // If score is 0 and no shapes, it's likely a fresh start needed.
    // Also check holdShape to prevent false reset when user holds their last shape.
    if (isSessionLoaded && isActive && shapes.length === 0 && score === 0 && !isGameOver && !holdShape) {
      resetGame();
    }
  }, [isActive, shapes.length, isSessionLoaded, score, isGameOver, holdShape]);

  useEffect(() => {
    const interval = setInterval(() => {
        setParticles(prev => {
            if (prev.length === 0) return prev;
            const now = Date.now();
            const filtered = prev.filter(p => p.createdAt ? (now - p.createdAt < 1000) : false);
            return filtered.length !== prev.length ? filtered : prev;
        });
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Cleanup all timeouts on unmount to prevent memory leaks and state updates on unmounted component
  useEffect(() => {
    return () => {
      // Clear floating text timeouts
      floatingTextTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      floatingTextTimeoutsRef.current.clear();
      // Clear game over timeout
      if (gameOverTimeoutRef.current) {
        clearTimeout(gameOverTimeoutRef.current);
        gameOverTimeoutRef.current = null;
      }
      // Clear shake timeout
      if (shakeTimeoutRef.current) {
        clearTimeout(shakeTimeoutRef.current);
        shakeTimeoutRef.current = null;
      }
    };
  }, []);

  const triggerShake = (type: 'light' | 'heavy') => {
     setShakeType(type);
     if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current);
     shakeTimeoutRef.current = setTimeout(() => {
         setShakeType('none');
     }, type === 'heavy' ? 500 : 300);
  };

  const addFloatingText = (x: number, y: number, text: string, color: string, scale = 1) => {
    const id = floatingTextIdRef.current++;
    setFloatingTexts(prev => [...prev, { id, x, y, text, color, scale }]);
    const timeoutId = setTimeout(() => {
      setFloatingTexts(prev => prev.filter(ft => ft.id !== id));
      floatingTextTimeoutsRef.current.delete(timeoutId);
    }, 1200);
    floatingTextTimeoutsRef.current.add(timeoutId);
  };

  const spawnParticles = (coords: {r: number, c: number, color: string}[]) => {
    const newParticles: Particle[] = [];
    const now = Date.now();
    coords.forEach(({r, c, color}) => {
        const particleCount = 6; 
        for(let i=0; i<particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const velocity = Math.random() * 80 + 40; 
            const tx = Math.cos(angle) * velocity;
            const ty = Math.sin(angle) * velocity;
            newParticles.push({
                id: `${now}-${r}-${c}-${i}-${Math.random()}`,
                r, c, color,
                createdAt: now,
                style: {
                    '--tx': `${tx}px`,
                    '--ty': `${ty}px`,
                    width: Math.random() * 6 + 4 + 'px',
                    height: Math.random() * 6 + 4 + 'px',
                } as React.CSSProperties
            });
        }
    });
    setParticles(prev => {
        const next = [...prev, ...newParticles];
        if (next.length > 100) return next.slice(next.length - 100);
        return next;
    });
  };

  const getPowerUpAffectedCells = useCallback((r: number, c: number, type: PowerUpType): {r: number, c: number}[] => {
    const affected: {r: number, c: number}[] = [];
    if (type === 'BOMB') {
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const nr = r + i;
                const nc = c + j;
                if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) affected.push({ r: nr, c: nc });
            }
        }
    } else if (type === 'LINE') {
        for (let i = 0; i < GRID_SIZE; i++) {
            affected.push({ r, c: i });
            affected.push({ r: i, c });
        }
    } else if (type === 'COLOR') {
        const targetColor = grid[r][c];
        if (targetColor) {
            for (let i = 0; i < GRID_SIZE; i++) {
                for (let j = 0; j < GRID_SIZE; j++) {
                    if (grid[i][j] === targetColor) affected.push({ r: i, c: j });
                }
            }
        }
    } else if (type === 'SINGLE') {
        affected.push({ r, c });
    }
    return affected;
  }, [grid]);

  const activateRefresh = (fromPurchase = false) => {
      if (fromPurchase || powerUps.REFRESH > 0) {
          playMagicalSparkle();
          if (!fromPurchase) {
             setPowerUps(prev => ({...prev, REFRESH: prev.REFRESH - 1}));
          }
          generateShapes();
          addFloatingText(3, 3, "NY GAVE!", '#fff', 1.2);
          setSelectedShapeIdx(null);
          setRescueMode(false);
      }
  };

  const handlePowerUpClick = (type: PowerUpType) => {
      let currentCount = powerUps[type];

      if (currentCount <= 0) {
          const cost = POWER_UP_COSTS[type];
          if (deductCoins(cost)) {
              playSuccessSound();
              addFloatingText(3, 4, "Kjøpt!", '#fbbf24', 1);
              
              if (type === 'REFRESH') {
                  activateRefresh(true);
                  return;
              }
              
              setPowerUps(prev => ({...prev, [type]: prev[type] + 1}));
              setActivePowerUp(type);
              setSelectedShapeIdx(null);
          } else {
              playErrorSound();
              triggerShake('light');
              addFloatingText(3, 4, "Ikke nok mynter!", '#ef4444', 0.8);
          }
          return;
      }

      if (type === 'REFRESH') {
          activateRefresh(false);
          return;
      }

      playHardClick();
      setActivePowerUp(activePowerUp === type ? null : type);
      setSelectedShapeIdx(null);
  };

  const executePowerUp = useCallback((r: number, c: number) => {
    if (!activePowerUp || activePowerUp === 'REFRESH') return;
    if (activePowerUp === 'COLOR' && !grid[r][c]) { triggerShake('light'); return; }
    if (activePowerUp === 'SINGLE' && !grid[r][c]) { triggerShake('light'); return; }

    const cells = getPowerUpAffectedCells(r, c, activePowerUp);
    if (cells.length === 0) return;

    playMagicalSparkle();
    triggerShake(activePowerUp === 'SINGLE' ? 'light' : 'heavy');

    let clearedCount = 0;
    const particlesToSpawn: {r: number, c: number, color: string}[] = [];
    const newGrid = grid.map(row => [...row]);

    cells.forEach(({r: tr, c: tc}) => {
        if (newGrid[tr][tc]) {
            particlesToSpawn.push({ r: tr, c: tc, color: newGrid[tr][tc]! });
            newGrid[tr][tc] = null;
            clearedCount++;
        }
    });

    spawnParticles(particlesToSpawn);
    if (activePowerUp === 'SINGLE') addFloatingText(c, r, `POFF!`, '#FBBF24', 1);
    else addFloatingText(c, r, `BOOM!`, '#FBBF24', 1.5);

    setScore(prev => prev + (clearedCount * 20));
    setGrid(newGrid);
    setPowerUps(prev => ({...prev, [activePowerUp]: prev[activePowerUp] - 1}));
    setActivePowerUp(null);
    if (rescueMode) setRescueMode(false);
  }, [activePowerUp, grid, getPowerUpAffectedCells, rescueMode]);

  const handleRotateShape = () => {
    if (selectedShapeIdx === null) return;
    playSoftClick();
    const newShapes = [...shapes];
    newShapes[selectedShapeIdx].layout = rotateLayout(newShapes[selectedShapeIdx].layout);
    setShapes(newShapes);
  };

  const handleHoldShape = () => {
    if (selectedShapeIdx === null) {
        if (holdShape) { playErrorSound(); triggerShake('light'); addFloatingText(0, 7, "Velg brikke først!", '#fff', 0.8); }
        return;
    }
    playPopSound();
    const shapeToHold = shapes[selectedShapeIdx];
    let newShapes = [...shapes];
    if (holdShape) {
        newShapes[selectedShapeIdx] = holdShape;
        setHoldShape(shapeToHold);
    } else {
        setHoldShape(shapeToHold);
        newShapes = newShapes.filter((_, i) => i !== selectedShapeIdx);
    }
    setShapes(newShapes);
    setSelectedShapeIdx(null);
    if (newShapes.length === 0) setTimeout(generateShapes, 300);
  };

  const canPlaceShape = useCallback((r: number, c: number, shape: Shape, currentGrid: GridCell[][]): boolean => {
    for (let i = 0; i < shape.layout.length; i++) {
      for (let j = 0; j < shape.layout[i].length; j++) {
        if (shape.layout[i][j] === 1) {
          const nr = r + i;
          const nc = c + j;
          if (nr < 0 || nc < 0 || nr >= GRID_SIZE || nc >= GRID_SIZE || currentGrid[nr][nc] !== null) return false;
        }
      }
    }
    return true;
  }, []);

  const handleGridHover = useCallback((r: number, c: number) => setHoveredCell({ r, c }), []);

  const handleGridClick = useCallback((r: number, c: number) => {
    if (isGameOver && !rescueMode) return;
    if (activePowerUp) { executePowerUp(r, c); return; }
    if (selectedShapeIdx === null) return;

    const shape = shapes[selectedShapeIdx];
    if (canPlaceShape(r, c, shape, grid)) {
      playHardClick(); // Placement Thud
      const newGrid = grid.map(row => [...row]);
      let placedCount = 0;
      for (let i = 0; i < shape.layout.length; i++) {
        for (let j = 0; j < shape.layout[i].length; j++) {
          if (shape.layout[i][j] === 1) {
            const nr = r + i;
            const nc = c + j;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                newGrid[nr][nc] = shape.color;
                placedCount++;
            }
          }
        }
      }

      const linesToClearRow: number[] = [];
      const linesToClearCol: number[] = [];
      for (let i = 0; i < GRID_SIZE; i++) { if (newGrid[i].every(cell => cell !== null)) linesToClearRow.push(i); }
      for (let j = 0; j < GRID_SIZE; j++) { if (newGrid.every(row => row[j] !== null)) linesToClearCol.push(j); }
      const totalLines = linesToClearRow.length + linesToClearCol.length;
      
      let points = placedCount;
      if (totalLines > 0) {
        const newCombo = comboCount + 1;
        setComboCount(newCombo);
        const newStreak = streakCount + 1;
        setStreakCount(newStreak);

        // INCREASED SCORE PER LINE TO IMPROVE COIN PROGRESSION
        let linePoints = totalLines * 150; 
        const multiLineMultiplier = totalLines > 3 ? 3 : (totalLines > 1 ? totalLines * 0.8 : 1);
        const comboMultiplier = 1 + (newCombo * 0.2);
        const streakMultiplier = 1 + (newStreak * 0.1);

        const totalBonus = Math.floor(linePoints * multiLineMultiplier * comboMultiplier * streakMultiplier);
        points += totalBonus;
        
        playMagicalSparkle();
        triggerShake(totalLines > 1 ? 'heavy' : 'light');
        
        if (totalLines >= 3 || newCombo >= 4 || newStreak >= 5) {
             const types: PowerUpType[] = ['BOMB', 'LINE', 'COLOR', 'SINGLE', 'REFRESH'];
             const rewardType = types[Math.floor(Math.random() * types.length)];
             setPowerUps(prev => ({...prev, [rewardType]: prev[rewardType] + 1}));
             setTimeout(() => addFloatingText(c, r, `GAVE: ${rewardType}!`, '#FFF', 1.5), 600);
        }

        const particlesToSpawn: {r: number, c: number, color: string}[] = [];
        linesToClearRow.forEach(ri => { for(let ci=0; ci<GRID_SIZE; ci++) if(newGrid[ri][ci]) particlesToSpawn.push({r: ri, c: ci, color: newGrid[ri][ci]!}); });
        linesToClearCol.forEach(ci => { for(let ri=0; ri<GRID_SIZE; ri++) if(newGrid[ri][ci]) particlesToSpawn.push({r: ri, c: ci, color: newGrid[ri][ci]!}); });
        spawnParticles(particlesToSpawn);

        const randomJuleWord = JULE_WORDS[Math.floor(Math.random() * JULE_WORDS.length)];
        addFloatingText(c, r, randomJuleWord, '#fbbf24', totalLines > 1 ? 1.5 : 1.2);
        
        setClearingRows(linesToClearRow);
        setClearingCols(linesToClearCol);

        // CRITICAL FIX: Calculate remaining shapes and set state BEFORE setTimeout
        // This prevents race conditions where the closure captures stale state
        const remainingShapes = shapes.filter((_, i) => i !== selectedShapeIdx);
        const needsNewShapes = remainingShapes.length === 0;

        // Update shapes state immediately to prevent race condition
        setShapes(remainingShapes);
        setScore(prev => prev + points);
        setSelectedShapeIdx(null);

        setTimeout(() => {
             const finalGrid = newGrid.map(row => [...row]);
             linesToClearRow.forEach(ri => { for(let ci=0; ci<GRID_SIZE; ci++) finalGrid[ri][ci] = null; });
             linesToClearCol.forEach(ci => { for(let ri=0; ri<GRID_SIZE; ri++) finalGrid[ri][ci] = null; });
             setGrid(finalGrid);
             setClearingRows([]);
             setClearingCols([]);
             // Generate new shapes BEFORE checking game over if needed
             if (needsNewShapes) {
                 generateShapes();
             }
             // Note: Game over check is now handled by useEffect watching shapes/grid changes
        }, 400);

        // Early return since we already updated state above
        return;
      } else {
        if (streakCount > 0) addFloatingText(c, r, "Streak Brutt!", '#94a3b8', 0.8);
        setStreakCount(0);
        setComboCount(0);
        addFloatingText(c, r, `+${points}`, '#ffffff', 0.8);
        setGrid(newGrid);
        const remainingShapes = shapes.filter((_, i) => i !== selectedShapeIdx);

        // Update state before any async operations
        setShapes(remainingShapes);
        setScore(prev => prev + points);
        setSelectedShapeIdx(null);

        if (remainingShapes.length === 0) {
            // Generate shapes immediately instead of delayed check
            setTimeout(generateShapes, 300);
        }
        // Note: Game over check handled by useEffect
        return;
      }
    } else {
        playErrorSound();
        triggerShake('light');
    }
  }, [isGameOver, rescueMode, activePowerUp, selectedShapeIdx, shapes, grid, canPlaceShape, comboCount, streakCount, executePowerUp, generateShapes]);

  const checkGameOver = (currentGrid: GridCell[][], currentShapes: Shape[]) => {
      // Clear any existing timeout to prevent double triggers
      if (gameOverTimeoutRef.current) clearTimeout(gameOverTimeoutRef.current);
      
      const currentRound = gameRoundRef.current;

      gameOverTimeoutRef.current = setTimeout(() => {
             if (isGameOver) return; // Prevent late trigger
             if (gameRoundRef.current !== currentRound) return; // Prevent triggering if reset happened
             if (currentShapes.length === 0) return;

             const canFitShapeWithRotation = (shape: Shape, grid: GridCell[][]) => {
                 let tempLayout = shape.layout;
                 for(let i=0; i<4; i++) {
                     const tempShape = {...shape, layout: tempLayout};
                     if(canPlaceShapeAnywhere(tempShape, grid)) return true;
                     tempLayout = rotateLayout(tempLayout);
                 }
                 return false;
             };

             const canPlaceShapeAnywhere = (shape: Shape, currentGrid: GridCell[][]) => {
                for(let rr=0; rr<GRID_SIZE; rr++) {
                    for(let cc=0; cc<GRID_SIZE; cc++) {
                        if (canPlaceShape(rr, cc, shape, currentGrid)) return true;
                    }
                }
                return false;
             };

             // OPTIMIZED: Use Array.some() for early exit when a valid move is found
             const canMove = currentShapes.some(s => canFitShapeWithRotation(s, currentGrid))
                          || (holdShape ? canFitShapeWithRotation(holdShape, currentGrid) : false);

             if(!canMove) {
                 const hasPowerUps = Object.values(powerUps).some((val: number) => val > 0);
                 const canBuy = Object.values(POWER_UP_COSTS).some((cost: number) => coins >= cost);
                 if (hasPowerUps || canBuy) {
                     setRescueMode(true);
                     triggerShake('heavy');
                     playErrorSound();
                     addFloatingText(3, 3, "STUCK! KJØP GAVE!", '#F87171', 1.5);
                 } else {
                     storageService.clearGameSession(); 
                     const earned = Math.floor(score / 10);
                     setEarnedCoins(earned);
                     setIsGameOver(true);
                     onGameOver(score);
                     
                     // Confetti Explosion
                     const confettiColors = ['#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff'];
                     const newParticles = [];
                     const now = Date.now();
                     for(let i=0; i<50; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const velocity = Math.random() * 200 + 100;
                        newParticles.push({
                            id: `gameover-${i}-${now}`,
                            r: 4, c: 4, // Centerish
                            color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
                            createdAt: now,
                            style: {
                                '--tx': `${Math.cos(angle) * velocity}px`,
                                '--ty': `${Math.sin(angle) * velocity}px`,
                                width: Math.random() * 8 + 4 + 'px',
                                height: Math.random() * 8 + 4 + 'px',
                                borderRadius: '50%'
                            } as React.CSSProperties
                        });
                     }
                     setParticles(prev => [...prev, ...newParticles]);
                 }
             } else {
                 setRescueMode(false);
             }
        }, 500);
  };

  // Optimized: hoveredCell passed as parameter to reduce function recreation on every hover
  const getCellStatus = useCallback((r: number, c: number, currentHoveredCell: {r: number, c: number} | null) => {
     if (clearingRows.includes(r) || clearingCols.includes(c)) return 'clearing';
     if (activePowerUp && activePowerUp !== 'REFRESH' && currentHoveredCell) {
        const affected = getPowerUpAffectedCells(currentHoveredCell.r, currentHoveredCell.c, activePowerUp);
        const isAffected = affected.some(p => p.r === r && p.c === c);
        if (isAffected) {
            if ((activePowerUp === 'COLOR' || activePowerUp === 'SINGLE') && !grid[currentHoveredCell.r][currentHoveredCell.c]) return 'empty';
            return 'powerup-target';
        }
     }
     if (selectedShapeIdx !== null && currentHoveredCell && !isGameOver) {
        const shape = shapes[selectedShapeIdx];
        const { r: hr, c: hc } = currentHoveredCell;
        const rDiff = r - hr;
        const cDiff = c - hc;
        // Check against actual row length for irregular shapes (e.g., L-shapes)
        if (rDiff >= 0 && rDiff < shape.layout.length && cDiff >= 0 && cDiff < shape.layout[rDiff].length) {
            if (shape.layout[rDiff][cDiff] === 1) {
                const valid = canPlaceShape(hr, hc, shape, grid);
                return valid ? 'ghost-valid' : 'ghost-invalid';
            }
        }
     }
     return grid[r][c] ? 'filled' : 'empty';
  }, [clearingRows, clearingCols, activePowerUp, selectedShapeIdx, isGameOver, shapes, grid, canPlaceShape, getPowerUpAffectedCells]);

  return (
    <div className={`w-full h-full flex flex-col items-center justify-start ${shakeType === 'light' ? 'animate-shake' : ''} ${shakeType === 'heavy' ? 'animate-shake-heavy' : ''}`}>
      
      <div className="flex w-full max-w-[95vw] sm:max-w-[400px] px-2 mb-1 justify-between items-end z-10 shrink-0">
          <div className="glass-panel rounded-xl px-3 py-1.5 flex flex-col min-w-[90px] border border-white/10 shadow-lg">
              <span className="text-white/40 text-[9px] font-bold uppercase tracking-wider font-cute">Rekord</span>
              <span className="text-white/80 font-mono font-bold text-base leading-none">{highScore}</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
             {comboCount > 1 && <div className="animate-pop-in mb-1 bg-pink-500/20 px-3 py-0.5 rounded-full border border-pink-500/50"><span className="text-[10px] font-bold text-pink-200">KOMBO x{comboCount}</span></div>}
             {streakCount > 2 && <div className="animate-pop-in bg-orange-500/20 px-3 py-0.5 rounded-full border border-orange-500/50"><span className="text-[10px] font-bold text-orange-200">STREAK {streakCount}</span></div>}
          </div>
          <div className="bg-black/40 backdrop-blur-md rounded-xl px-4 py-1.5 border border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.15)] flex flex-col items-end min-w-[100px]">
              <span className="text-pink-300 text-[9px] font-bold uppercase tracking-wider font-cute">Score</span>
              <span className="text-white font-magic font-bold text-2xl leading-none neon-text-pink">{score}</span>
          </div>
      </div>

      <div 
        className={`
            cyber-grid-container w-full max-w-[95vw] sm:max-w-[400px] aspect-square p-2 mb-2 shrink-0
            ${rescueMode ? 'border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : ''}
        `}
        style={{ touchAction: 'none' }}
        onMouseLeave={() => setHoveredCell(null)}
      >
        <div className="cyber-grid-bg"></div>
        
        <MemoizedGrid 
            grid={grid} 
            onHover={handleGridHover} 
            onClick={handleGridClick} 
            getCellStatus={getCellStatus}
            selectedShape={selectedShapeIdx !== null ? shapes[selectedShapeIdx] : null}
            hoveredCell={hoveredCell}
            activePowerUp={activePowerUp}
        />
        
        <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
            {particles.map((p) => (
                <div key={p.id} className="particle" style={{ left: `calc(${p.c * 12.5}% + 50%)`, top: `calc(${p.r * 12.5}% + 50%)`, backgroundColor: p.color, ...p.style }} />
            ))}
            {floatingTexts.map((ft) => (
                <div key={ft.id} className="absolute animate-float-magical font-magic font-bold z-[100] pointer-events-none"
                    style={{ 
                        left: `calc(${ft.x * 12.5}% + 6.25%)`, 
                        top: `calc(${ft.y * 12.5}% - 10px)`, 
                        color: ft.color, 
                        fontSize: `${16 * (ft.scale || 1)}px` 
                    }}>
                    <span className="text-magical-glow">{ft.text}</span>
                </div>
            ))}
        </div>
      </div>

      <div className="w-full max-w-[95vw] sm:max-w-[400px] flex flex-col gap-2 z-10 shrink-0">
        
        <div className="flex justify-between bg-black/30 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-lg">
            {[
                { type: 'BOMB' as PowerUpType, icon: '💣' },
                { type: 'LINE' as PowerUpType, icon: '⚡' },
                { type: 'COLOR' as PowerUpType, icon: '🌈' },
                { type: 'SINGLE' as PowerUpType, icon: '🔨' },
                { type: 'REFRESH' as PowerUpType, icon: '🔄' }
            ].map(pu => {
                const count = powerUps[pu.type];
                const isActive = activePowerUp === pu.type;
                const cost = POWER_UP_COSTS[pu.type];
                return (
                    <button key={pu.type} onClick={(e) => { e.stopPropagation(); handlePowerUpClick(pu.type); }}
                        className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all ${isActive ? 'bg-gradient-to-br from-yellow-400 to-orange-500 scale-105 z-10' : count > 0 ? 'bg-white/5 hover:bg-white/10' : 'bg-white/5 opacity-60'}`}>
                        <span className="text-lg filter drop-shadow-md">{pu.icon}</span>
                        {count > 0 ? ( <span className="absolute -top-1.5 -right-1.5 bg-pink-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-black">{count}</span> ) 
                        : ( <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold text-amber-300 bg-black/60 px-1 rounded-full">{cost}</div> )}
                    </button>
                )
            })}
        </div>
        
        {rescueMode && (
          <div className="text-red-300 text-xs font-bold font-cute animate-bounce bg-red-900/40 px-4 py-1.5 text-center rounded-full border border-red-500/50">
              ⚠ INGEN TREKK! KJØP GAVE?
          </div>
        )}

        <div className="flex items-center gap-2 h-20 px-1">
            {!isGameOver && (
                <button onClick={(e) => { e.stopPropagation(); handleHoldShape(); }}
                    className={`relative w-16 h-16 rounded-xl border-2 border-dashed border-white/20 bg-black/20 flex items-center justify-center transition-all shrink-0 ${selectedShapeIdx !== null ? 'border-pink-500/50 bg-pink-500/10' : ''}`}>
                    {holdShape ? (
                        <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${holdShape.layout[0].length}, 1fr)` }}>
                            {holdShape.layout.map((row, i) => row.map((val, j) => (<div key={`${i}-${j}`} className={`w-2.5 h-2.5 ${val ? '' : 'invisible'}`} style={{ backgroundColor: val ? holdShape.color : 'transparent' }} />)))}
                        </div>
                    ) : ( <span className="text-xl opacity-30">📥</span> )}
                </button>
            )}

            {!isGameOver && (
                 <button onClick={(e) => {e.stopPropagation(); handleRotateShape();}}
                   className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center border border-white/10 active:scale-90 transition-all shrink-0">
                    <span className="text-white/70 text-xs">↻</span>
                 </button>
            )}

            <div className="flex-1 flex justify-center gap-2 overflow-hidden h-full items-center">
                {!isGameOver && shapes.map((shape, idx) => (
                <button key={shape.id} onClick={(e) => { e.stopPropagation(); if (selectedShapeIdx === idx) { handleRotateShape(); } else { playPopSound(); setSelectedShapeIdx(idx); setActivePowerUp(null); }}}
                    className={`dock-shape-wrapper relative p-1.5 rounded-xl cursor-pointer group flex items-center justify-center min-w-[50px] min-h-[50px] ${selectedShapeIdx === idx ? 'selected' : ''}`}>
                    <div className="grid gap-0.5 pointer-events-none" style={{ gridTemplateColumns: `repeat(${shape.layout[0].length}, 1fr)` }}>
                    {shape.layout.map((row, i) => row.map((val, j) => (<div key={`${i}-${j}`} className={`w-3 h-3 transition-all ${val ? 'shape-preview-block' : 'invisible'}`} style={{ backgroundColor: val ? shape.color : 'transparent' }}></div>)))}
                    </div>
                </button>
                ))}
            </div>
        </div>
      </div>

      {isGameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-modal-zoom">
            <div className="bg-slate-900/90 border border-white/20 p-6 rounded-3xl shadow-2xl w-full max-w-xs text-center relative overflow-hidden transition-all duration-500">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-pink-500/20 via-transparent to-transparent"></div>
                <div className="relative z-10 flex flex-col gap-4">
                    
                    {/* Phase 1: Title */}
                    <div className={`transition-all duration-700 ${gameOverPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <div className="text-6xl mb-2 animate-bounce">🎅</div>
                        <h3 className="text-3xl font-bold font-magic text-transparent bg-clip-text bg-gradient-to-br from-red-400 to-green-300">God Jul!</h3>
                    </div>
                    
                    {/* Phase 2: Score */}
                    <div className={`bg-white/5 rounded-xl p-3 border border-white/5 transition-all duration-700 delay-100 ${gameOverPhase >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                        <p className="text-white/50 text-[10px] uppercase tracking-widest font-bold mb-1">Total Score</p>
                        <p className="text-3xl font-bold text-white neon-text-pink">{displayScore}</p>
                    </div>

                    {/* Phase 3: XP Bar */}
                    <div className={`bg-blue-900/20 rounded-xl p-3 border border-blue-500/20 text-left relative overflow-hidden transition-all duration-700 delay-200 ${gameOverPhase >= 3 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
                         <div className="flex justify-between items-center mb-1">
                             <span className="text-blue-200 text-[10px] font-bold uppercase">Level {level}</span>
                             <span className="text-blue-300 text-[10px] font-bold">+{displayXP} XP</span>
                         </div>
                         <div className="h-3 w-full bg-black/40 rounded-full relative overflow-hidden">
                             {/* Animate bar relative to xpNeeded, ensuring we show progress */}
                             <div 
                                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-cyan-400 transition-all duration-1000 ease-out"
                                style={{ width: `${Math.min(100, ((currentXP) / xpNeeded) * 100)}%` }}
                             ></div>
                         </div>
                    </div>
                    
                    {/* Phase 4: Coins */}
                    <div className={`bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl p-3 flex items-center justify-between border border-amber-500/20 transition-all duration-700 delay-300 ${gameOverPhase >= 4 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
                        <div className="flex items-center gap-2">
                            <span className="text-2xl">🪙</span>
                            <span className="text-xs text-amber-200 uppercase font-bold tracking-wider">Tjent</span>
                        </div>
                        <span className="text-amber-300 font-bold font-mono text-2xl drop-shadow-md">+{displayCoins}</span>
                    </div>
                    
                    {/* Phase 5: Buttons */}
                    <div className={`transition-all duration-700 delay-500 ${gameOverPhase >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <button onClick={resetGame}
                            className="w-full bg-gradient-to-r from-red-500 to-green-600 hover:from-red-400 hover:to-green-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-[0_0_20px_rgba(236,72,153,0.3)] transform transition hover:scale-105 active:scale-95 font-cute tracking-wide">
                            Spill Igjen
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default BlockGame;