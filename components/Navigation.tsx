import React from 'react';
import { ViewState } from '../types';

interface NavProps {
  currentView: ViewState;
  onChange: (view: ViewState) => void;
}

const Navigation: React.FC<NavProps> = ({ currentView, onChange }) => {
  
  const getIcon = (view: ViewState): string => {
    switch(view) {
      case 'GAME': return '🎮';
      case 'SHOP': return '🛍️';
      case 'COLLECTION': return '📒';
      default: return '❓';
    }
  };

  const getLabel = (view: ViewState): string => {
    switch(view) {
      case 'GAME': return 'Spill';
      case 'SHOP': return 'Butikk';
      case 'COLLECTION': return 'Samling';
      default: return view;
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-6 flex justify-center pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 pointer-events-none">
      <div className="glass-panel flex items-center gap-2 p-2 rounded-full shadow-2xl bg-black/40 pointer-events-auto backdrop-blur-xl border border-white/10">
        {(['GAME', 'SHOP', 'COLLECTION'] as ViewState[]).map((view) => {
          const isActive = currentView === view;
          return (
            <button
              key={view}
              onClick={() => onChange(view)}
              className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-full transition-all duration-300 ${isActive ? 'bg-white/10' : 'opacity-60 hover:opacity-100'}`}
            >
              <span className={`text-2xl transition-transform duration-300 ${isActive ? 'scale-110 -translate-y-1' : ''}`}>
                {getIcon(view)}
              </span>
              <span className={`text-[9px] font-cute font-bold uppercase mt-0.5 transition-opacity duration-300 ${isActive ? 'text-white opacity-100' : 'opacity-0 absolute bottom-0'}`}>
                {getLabel(view)}
              </span>
              {isActive && (
                <div className="absolute -bottom-1 w-1 h-1 rounded-full bg-pink-400 shadow-[0_0_5px_rgba(244,114,182,1)]"></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Navigation;
