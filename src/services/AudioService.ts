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
    const now = performance.now();
    const previous = this.lastPlayed.get(kind) ?? -Infinity;
    if (now - previous < 65 || !this.context || this.volume <= 0) return;
    this.lastPlayed.set(kind, now);
    try {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = kind === 'danger' ? 'sawtooth' : 'sine';
      oscillator.frequency.value = frequency;
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
