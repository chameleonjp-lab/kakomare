import { BOSSES } from '../data/bosses';
import { ENEMIES } from '../data/enemies';
import { enemyDefeatCue, type EnemyDefeatAudioCue } from '../types/content';

export type AudioCue =
  | 'button'
  | 'countdown'
  | 'shot'
  | 'heavy'
  | 'defeat'
  | 'upgrade'
  | 'damage'
  | 'warning'
  | 'boss'
  | 'victory'
  | 'start'
  | 'pause'
  | 'resume'
  | EnemyDefeatAudioCue;

interface CueProfile {
  frequency: number;
  duration: number;
  wave: OscillatorType;
  endFrequency?: number;
}

const CUE_PROFILES: Record<Exclude<AudioCue, EnemyDefeatAudioCue>, CueProfile> = {
  button: { frequency: 520, duration: 0.045, wave: 'sine' },
  countdown: { frequency: 330, duration: 0.09, wave: 'triangle' },
  shot: { frequency: 620, duration: 0.035, wave: 'square' },
  heavy: { frequency: 170, duration: 0.14, wave: 'sawtooth' },
  defeat: { frequency: 110, duration: 0.3, wave: 'sawtooth' },
  upgrade: { frequency: 740, duration: 0.14, wave: 'triangle' },
  damage: { frequency: 120, duration: 0.16, wave: 'sawtooth' },
  warning: { frequency: 260, duration: 0.12, wave: 'square' },
  boss: { frequency: 95, duration: 0.28, wave: 'sawtooth' },
  victory: { frequency: 880, duration: 0.24, wave: 'triangle' },
  start: { frequency: 440, duration: 0.12, wave: 'triangle' },
  pause: { frequency: 200, duration: 0.08, wave: 'sine' },
  resume: { frequency: 500, duration: 0.08, wave: 'triangle' },
};

/** Each enemy family has a short signature made from its own pitch, movement,
 * and material impression. The sounds are generated locally so no asset load
 * can delay a battle or fail on a slow mobile connection. */
const DEFEAT_CUE_PROFILES: Record<EnemyDefeatAudioCue, CueProfile> = {
  'defeat:shard': { frequency: 210, endFrequency: 120, duration: 0.11, wave: 'square' },
  'defeat:runner': { frequency: 460, endFrequency: 280, duration: 0.08, wave: 'triangle' },
  'defeat:shell': { frequency: 95, endFrequency: 48, duration: 0.22, wave: 'sawtooth' },
  'defeat:lattice': { frequency: 330, endFrequency: 170, duration: 0.16, wave: 'square' },
  'defeat:spore': { frequency: 250, endFrequency: 90, duration: 0.18, wave: 'sine' },
  'defeat:marker': { frequency: 700, endFrequency: 420, duration: 0.14, wave: 'triangle' },
  'defeat:dropper': { frequency: 380, endFrequency: 140, duration: 0.17, wave: 'sawtooth' },
  'defeat:phase': { frequency: 820, endFrequency: 250, duration: 0.2, wave: 'sine' },
  'defeat:charger': { frequency: 170, endFrequency: 65, duration: 0.18, wave: 'sawtooth' },
  'defeat:guard': { frequency: 130, endFrequency: 58, duration: 0.24, wave: 'square' },
  'defeat:repair': { frequency: 520, endFrequency: 920, duration: 0.16, wave: 'sine' },
  'defeat:factory': { frequency: 190, endFrequency: 75, duration: 0.28, wave: 'square' },
  'defeat:crown': { frequency: 75, endFrequency: 42, duration: 0.42, wave: 'sawtooth' },
  'defeat:designer': { frequency: 140, endFrequency: 75, duration: 0.35, wave: 'square' },
  'defeat:echo': { frequency: 260, endFrequency: 110, duration: 0.38, wave: 'triangle' },
  'defeat:gate': { frequency: 100, endFrequency: 38, duration: 0.45, wave: 'sawtooth' },
  'defeat:weaver': { frequency: 360, endFrequency: 150, duration: 0.4, wave: 'triangle' },
  'defeat:reactor': { frequency: 65, endFrequency: 28, duration: 0.5, wave: 'sawtooth' },
};

function isEnemyDefeatCue(cue: AudioCue): cue is EnemyDefeatAudioCue {
  return cue.startsWith('defeat:');
}

function defeatCueForStatus(message: string): AudioCue | null {
  for (const definition of [...Object.values(ENEMIES), ...Object.values(BOSSES)]) {
    if (message.includes(definition.name)) return enemyDefeatCue(definition.id);
  }
  return null;
}

/** Map the short status messages used by the battle scene to distinct cues. */
export function audioCueForStatus(message: string): AudioCue {
  if (message.includes('ダメージ') || message.includes('被害')) return 'damage';
  if (message.includes('強化') || message.includes('取得しました')) return 'upgrade';
  if (message.includes('撃破')) return defeatCueForStatus(message) ?? 'defeat';
  if (message.includes('出現')) return 'boss';
  if (message.includes('予告') || message.includes('集中波') || message.includes('準備')) return 'warning';
  if (message.includes('発射') || message.includes('着弾')) return 'shot';
  if (message.includes('ボス') || message.includes('回転冠') || message.includes('設計者') || message.includes('反響核')) return 'boss';
  if (message.includes('戦闘開始')) return 'start';
  if (message.includes('一時停止')) return 'pause';
  if (message.includes('戦闘再開')) return 'resume';
  return 'button';
}

export class AudioService {
  private context: AudioContext | null = null;
  private lastPlayed = new Map<string, number>();
  private volume = 0.7;
  private musicVolume = 0.35;
  private musicOscillator: OscillatorNode | null = null;
  private musicHarmony: OscillatorNode | null = null;
  private musicLfo: OscillatorNode | null = null;
  private musicLfoGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  public setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value / 100));
  }

  public setMusicVolume(value: number): void {
    this.musicVolume = Math.max(0, Math.min(1, value / 100));
    this.updateMusicGain();
    if (this.musicVolume > 0 && this.context) this.ensureMusic();
  }

  public async start(): Promise<void> {
    try {
      if (this.context?.state === 'closed') {
        this.stop();
        this.context = null;
      }
      if (!this.context) this.context = new AudioContext();
      if (this.context.state === 'suspended') await this.context.resume();
      this.ensureMusic();
    } catch {
      // Audio is optional. A rejected AudioContext must not stop the game.
    }
  }

  public stop(): void {
    this.stopNode(this.musicOscillator);
    this.stopNode(this.musicHarmony);
    this.stopNode(this.musicLfo);
    try { this.musicOscillator?.disconnect(); } catch { /* The context may already be closed. */ }
    try { this.musicHarmony?.disconnect(); } catch { /* The context may already be closed. */ }
    try { this.musicLfo?.disconnect(); } catch { /* The context may already be closed. */ }
    try { this.musicGain?.disconnect(); } catch { /* The context may already be closed. */ }
    try { this.musicLfoGain?.disconnect(); } catch { /* The context may already be closed. */ }
    this.musicOscillator = null;
    this.musicHarmony = null;
    this.musicLfo = null;
    this.musicLfoGain = null;
    this.musicGain = null;
  }

  public tone(kind: string, frequency: number, duration = 0.08): void {
    this.playTone(kind, frequency, duration, kind === 'danger' ? 'sawtooth' : 'sine');
  }

  public cue(cue: AudioCue): void {
    const profile = isEnemyDefeatCue(cue) ? DEFEAT_CUE_PROFILES[cue] : CUE_PROFILES[cue];
    this.playTone(cue, profile.frequency, profile.duration, profile.wave, profile.endFrequency);
  }

  private playTone(key: string, frequency: number, duration: number, wave: OscillatorType, endFrequency = frequency): void {
    const now = performance.now();
    const previous = this.lastPlayed.get(key) ?? -Infinity;
    if (now - previous < 65 || !this.context || this.volume <= 0) return;
    this.lastPlayed.set(key, now);
    try {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(Math.max(1, frequency), this.context.currentTime);
      if (endFrequency !== frequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), this.context.currentTime + duration);
      }
      gain.gain.setValueAtTime(0.0001, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, this.volume * 0.08), this.context.currentTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration + 0.02);
    } catch {
      // Some browsers can lose the audio context while the page is hidden.
    }
  }

  private ensureMusic(): void {
    if (!this.context || this.musicVolume <= 0 || this.musicOscillator) return;
    try {
      const oscillator = this.context.createOscillator();
      const harmony = this.context.createOscillator();
      const lfo = this.context.createOscillator();
      const lfoGain = this.context.createGain();
      const gain = this.context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 110;
      harmony.type = 'sine';
      harmony.frequency.value = 165;
      lfo.type = 'sine';
      lfo.frequency.value = 0.08;
      lfoGain.gain.value = 2.5;
      gain.gain.setValueAtTime(0.0001, this.context.currentTime);
      oscillator.connect(gain);
      harmony.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(oscillator.frequency);
      lfoGain.connect(harmony.frequency);
      gain.connect(this.context.destination);
      oscillator.start();
      harmony.start();
      lfo.start();
      this.musicOscillator = oscillator;
      this.musicHarmony = harmony;
      this.musicLfo = lfo;
      this.musicLfoGain = lfoGain;
      this.musicGain = gain;
      this.updateMusicGain();
    } catch {
      // Generated music is optional and must never block play.
    }
  }

  private updateMusicGain(): void {
    if (!this.context || !this.musicGain) return;
    try {
      this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.018, this.context.currentTime, 0.04);
    } catch {
      // Ignore a context that was closed by the browser.
    }
  }

  private stopNode(node: OscillatorNode | null): void {
    if (!node) return;
    try { node.stop(); } catch { /* The oscillator may already have ended while the page was hidden. */ }
  }
}
