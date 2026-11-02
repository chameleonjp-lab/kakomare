export interface ShareResult {
  success: boolean;
  method: 'x' | 'native' | 'clipboard' | 'manual' | 'failed' | 'cancelled';
}

export class ShareService {
  public getShareUrl(): string {
    return 'https://chameleonjp-lab.github.io/kakomare/';
  }

  public async share(_title: string, text: string): Promise<ShareResult> {
    const url = this.getShareUrl();
    const intent = new URL('https://x.com/intent/post');
    intent.searchParams.set('text', `${text}\n${url}`);
    try {
      const popup = window.open(intent.href, '_blank');
      if (popup) {
        popup.opener = null;
        return { success: true, method: 'x' };
      }
    } catch { /* Fall through to copying. */ }
    try {
      if (!navigator.clipboard) throw new Error('クリップボードが使えません。');
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return { success: true, method: 'clipboard' };
    } catch {
      return { success: false, method: 'manual' };
    }
  }
}
