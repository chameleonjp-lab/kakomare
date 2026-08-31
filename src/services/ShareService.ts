export interface ShareResult {
  success: boolean;
  method: 'native' | 'clipboard' | 'manual' | 'failed' | 'cancelled';
}

export class ShareService {
  public getShareUrl(): string {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  public async share(title: string, text: string): Promise<ShareResult> {
    const url = this.getShareUrl();
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return { success: true, method: 'native' };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { success: false, method: 'cancelled' };
      if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return { success: false, method: 'cancelled' };
    }
    try {
      if (!navigator.clipboard) throw new Error('クリップボードが使えません。');
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return { success: true, method: 'clipboard' };
    } catch {
      return { success: false, method: 'manual' };
    }
  }
}
