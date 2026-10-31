import { afterEach, expect, it, vi } from 'vitest';
import { ShareService } from '../../src/services/ShareService';
afterEach(() => vi.unstubAllGlobals());
it('opens X with a canonical URL and preserves exact punctuation', async () => {
  let opened = '';
  vi.stubGlobal('window', {location:{href:'http://localhost/?debug=true'},open(url:string){opened=url;return {opener:null}}});
  const service=new ShareService();
  expect(service.getShareUrl()).toBe('https://chameleonjp-lab.github.io/kakomare/');
  expect(await service.share('title','今回123点 & #')).toEqual({success:true,method:'x'});
  expect(new URL(opened).searchParams.get('text')).toBe('今回123点 & #\nhttps://chameleonjp-lab.github.io/kakomare/');
});
