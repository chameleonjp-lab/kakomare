import { afterEach, expect, it, vi } from 'vitest';
import { ShareService } from '../../src/services/ShareService';
afterEach(() => vi.unstubAllGlobals());
it('opens X with a canonical URL and preserves exact punctuation', async () => {
  let opened = '';
  vi.stubGlobal('window', {location:{href:'http://localhost/?debug=true'},open(url:string){opened=url;return {opener:null}}});
  const service=new ShareService();
  expect(service.getShareUrl()).toBe('https://chameleonjp-lab.github.io/kakomare/');
  expect(await service.share('title','今回123点 & #')).toEqual({success:true,method:'x'});
  expect(new URL(opened).searchParams.get('text')).toBe('今回123点 & #\n#カコマレ #ゲーム制作\nhttps://chameleonjp-lab.github.io/kakomare/');
});
it('clipboard fallback keeps exactly the same formal hashtags and canonical text',async()=>{
 let copied='';vi.stubGlobal('window',{open:()=>null});vi.stubGlobal('navigator',{clipboard:{writeText:async(text:string)=>{copied=text}}});const service=new ShareService();
 expect(await service.share('title','今回123点 & #')).toEqual({success:true,method:'clipboard'});expect(copied).toBe(service.getShareText('今回123点 & #'));expect(copied).toBe('今回123点 & #\n#カコマレ #ゲーム制作\nhttps://chameleonjp-lab.github.io/kakomare/');
});
