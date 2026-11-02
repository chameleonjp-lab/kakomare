export interface ShareResult {
  success: boolean;
  method: 'x' | 'native' | 'clipboard' | 'manual' | 'failed' | 'cancelled';
}

export class ShareService {
  public getShareUrl(): string {
    return 'https://chameleonjp-lab.github.io/kakomare/';
  }

  public getShareText(text: string): string {
    return `${text}\n#カコマレ #ゲーム制作\n${this.getShareUrl()}`;
  }

  public async share(_title: string, text: string): Promise<ShareResult> {
    const shareText = this.getShareText(text);
    const intent = new URL('https://x.com/intent/post');
    intent.searchParams.set('text', shareText);
    try {
      const popup = window.open(intent.href, '_blank');
      if (popup) {
        popup.opener = null;
        return { success: true, method: 'x' };
      }
    } catch { /* Fall through to copying. */ }
    try {
      if (!navigator.clipboard) throw new Error('クリップボードが使えません。');
      await navigator.clipboard.writeText(shareText);
      return { success: true, method: 'clipboard' };
    } catch {
      return { success: false, method: 'manual' };
    }
  }
}
