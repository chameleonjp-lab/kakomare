export interface ShareResult {
  success: boolean;
  method: 'native' | 'clipboard' | 'manual' | 'failed';
}

export class ShareService {
  public async share(title: string, text: string): Promise<ShareResult> {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return { success: true, method: 'native' };
      }
    } catch {
      // The user may close the native share sheet. Continue to a copy fallback.
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return { success: true, method: 'clipboard' };
    } catch {
      return { success: false, method: 'manual' };
    }
  }
}
