

// Simple Web Audio API synthesizer for UI sounds and Background Music

const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
};

export const resumeAudioContext = () => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(console.error);
  }
};

// Helper for consistent synthetic sounds
const playTone = (
  type: OscillatorType, 
  freqStart: number, 
  freqEnd: number, 
  duration: number, 
  vol: number = 0.05, 
  ramp: 'linear' | 'exponential' = 'exponential'
) => {
  try {
    const ctx = getAudioContext();
    // Only resume on interaction events, not hover
    if (ctx.state === 'suspended' && vol > 0.01) ctx.resume().catch(() => {});
    if (ctx.state === 'suspended') return; // Don't force for quiet sounds

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
    if (freqEnd !== freqStart) {
        if (ramp === 'exponential') {
             osc.frequency.exponentialRampToValueAtTime(freqEnd, ctx.currentTime + duration);
        } else {
             osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
        }
    }
    
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    if (ramp === 'exponential') {
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    } else {
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + duration);
    }
    
    osc.start();
    osc.stop(ctx.currentTime + duration);

    // cleanup with safety timeout - errors expected if nodes already disconnected
    const cleanup = () => {
        try {
            osc.disconnect();
            gain.disconnect();
        } catch {
            // Expected: nodes may already be disconnected
        }
    };
    
    osc.onended = cleanup;

    // Backup cleanup in case onended doesn't fire (e.g. tab backgrounded)
    setTimeout(cleanup, (duration * 1000) + 100);

  } catch (e) {
    // Audio errors are expected (e.g., autoplay blocked), log only in dev
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[Audio] playTone error (may be expected):', e);
    }
  }
};

// --- MUSIC MANAGER FOR BACKGROUND LOOP ---

class MusicManager {
  private nextNoteTime: number = 0;
  private timerID: number | undefined;
  private sequenceIndex: number = 0;
  private isPlaying: boolean = false;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  
  // A soft, winter-themed melody (C Major / Am arpeggios)
  // freq: Note frequency, dur: Duration in 16th notes
  private melody = [
    // Bar 1: C Major 7 (C E G B) - Up
    { f: 523.25, d: 2 }, { f: 659.25, d: 2 }, { f: 783.99, d: 2 }, { f: 987.77, d: 10 },
    // Bar 2: A Minor 9 (A C E G) - Up
    { f: 440.00, d: 2 }, { f: 523.25, d: 2 }, { f: 659.25, d: 2 }, { f: 783.99, d: 10 },
    // Bar 3: F Major 7 (F A C E) - Up
    { f: 349.23, d: 2 }, { f: 440.00, d: 2 }, { f: 523.25, d: 2 }, { f: 659.25, d: 10 },
    // Bar 4: G Dominant 7 (G B D F) - Up
    { f: 392.00, d: 2 }, { f: 493.88, d: 2 }, { f: 587.33, d: 2 }, { f: 698.46, d: 10 },
  ];
  
  private tempo = 90; // BPM
  private lookahead = 25.0; // ms
  private scheduleAheadTime = 0.1; // s

  constructor() {
    // Lazy init in start() to respect autoplay
  }

  private nextNote() {
    const secondsPerBeat = 60.0 / this.tempo;
    // We are using 16th notes as base unit for duration in melody array, 
    // but the loop ticks note by note.
    // Actually, simpler: The melody array defines the sequence.
    // We just advance index.
    const currentNote = this.melody[this.sequenceIndex];
    // Duration in seconds = (16th notes count) * (1/4 beat duration)
    // 1 beat = 4 x 16th notes.
    const durationInSeconds = (currentNote.d * 0.25) * secondsPerBeat;
    
    this.nextNoteTime += durationInSeconds;
    
    this.sequenceIndex++;
    if (this.sequenceIndex === this.melody.length) {
      this.sequenceIndex = 0;
    }
  }

  private scheduleNote(noteIndex: number, time: number) {
    if (this.isMuted || !this.masterGain) return;
    
    const ctx = getAudioContext();
    const note = this.melody[noteIndex];
    
    // Create oscillator for the note (Bell-like)
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator(); // Harmony/Overtone
    const gain = ctx.createGain();
    
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);
    
    // Main tone (Sine for pure bell)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(note.f, time);
    
    // Overtone (Triangle for sparkle, slightly detuned)
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(note.f * 2, time);
    osc2.detune.setValueAtTime(5, time); // Detune for chorus effect
    
    // Envelope (Bell shape: Fast attack, long exponential decay)
    // Very quiet volume to be "Background" music
    const volume = 0.03; 
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 2.0); // Long tail
    
    osc.start(time);
    osc.stop(time + 2.5);
    osc2.start(time);
    osc2.stop(time + 2.5);

    // Cleanup - errors expected if nodes already disconnected
    const cleanup = () => {
        try {
            osc.disconnect();
            osc2.disconnect();
            gain.disconnect();
        } catch {
            // Expected: nodes may already be disconnected
        }
    };

    osc.onended = cleanup;
    // Safety cleanup
    setTimeout(cleanup, 3000);
  }

  private scheduler() {
    const ctx = getAudioContext();
    // While there are notes that will need to play before the next interval, 
    // schedule them and advance the pointer.
    while (this.nextNoteTime < ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.sequenceIndex, this.nextNoteTime);
      this.nextNote();
    }
    this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  public init() {
    // Only starts if not already playing
    if (this.isPlaying) return;
    
    const ctx = getAudioContext();
    // Master Gain for fading
    this.masterGain = ctx.createGain();
    this.masterGain.connect(ctx.destination);
    this.masterGain.gain.value = this.isMuted ? 0 : 1;

    this.isPlaying = true;
    this.nextNoteTime = ctx.currentTime + 0.5;
    this.scheduler();
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain) {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      // Smooth fade
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      if (muted) {
        this.masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
      } else {
        this.masterGain.gain.linearRampToValueAtTime(1, now + 1.0);
      }
    }
  }

  public stop() {
    this.isPlaying = false;
    window.clearTimeout(this.timerID);
  }
}

export const musicManager = new MusicManager();

// --- New Sound Palette ---

export const playHoverSound = () => {
  // Very subtle, high tick, barely audible
  playTone('sine', 800, 600, 0.03, 0.005);
};

// Soft, high-pitched click for navigation/tabs/toggles (Standard UI)
export const playSoftClick = () => {
  playTone('sine', 600, 300, 0.05, 0.03); 
};

// Punchier, lower click for primary actions (Buy, Place, Confirm)
export const playHardClick = () => {
  playTone('triangle', 300, 100, 0.08, 0.04);
};

// Bubble pop for selecting items/cards
export const playPopSound = () => {
  playTone('sine', 300, 600, 0.06, 0.04, 'linear');
};

// Swish for switching views or large transitions
export const playSwitchSound = () => {
  playTone('sine', 300, 500, 0.12, 0.03, 'linear');
};

// Success/Coin sound (High double ding)
export const playSuccessSound = () => {
  playTone('sine', 1200, 1200, 0.2, 0.05);
  setTimeout(() => playTone('sine', 1800, 1800, 0.3, 0.03), 80);
};

// Error/Invalid action (Low buzz)
export const playErrorSound = () => {
  playTone('sawtooth', 150, 100, 0.15, 0.03);
};

// Keep original name for backward compatibility, mapped to Soft Click
export const playClickSound = playSoftClick;

// Specific FX
export const playCardWhoosh = () => {
  playTone('sine', 100, 300, 0.15, 0.02, 'linear');
};

export const playFlipSound = () => {
  playTone('triangle', 200, 400, 0.1, 0.02);
};

export const playMagicalSparkle = () => {
    try {
        resumeAudioContext();
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        
        // Major 7th arpeggio
        [523.25, 659.25, 783.99, 987.77, 1046.50].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.02, now + 0.05 + (i*0.08));
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            
            osc.start();
            osc.stop(now + 1.5);
            
            const cleanup = () => {
                try {
                    osc.disconnect();
                    gain.disconnect();
                } catch {
                    // Expected: nodes may already be disconnected
                }
            };

            osc.onended = cleanup;
            setTimeout(cleanup, 2000);
        });
    } catch (e) {
        // Audio errors are expected (e.g., autoplay blocked), log only in dev
        if (process.env.NODE_ENV !== 'production') {
            console.debug('[Audio] playMagicalSparkle error (may be expected):', e);
        }
    }
}
