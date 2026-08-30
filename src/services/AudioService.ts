export class AudioService {
  private context: AudioContext | null = null;
  private lastPlayed = new Map<string, number>();
  private volume = 0.7;

  public setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value / 100));
  }

  public async start(): Promise<void> {
    try {
      if (!this.context) this.context = new AudioContext();
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      // Audio is optional. A rejected AudioContext must not stop the game.
    }
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
}
