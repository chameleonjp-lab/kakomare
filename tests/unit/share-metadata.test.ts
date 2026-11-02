import {expect,it} from 'vitest';import {readFileSync}from'node:fs';import {createHash}from'node:crypto';
const root=new URL('../../',import.meta.url),url='https://chameleonjp-lab.github.io/kakomare/',imageURL=url+'og-image-v2.png';
function meta(html:string,key:string):string|undefined{return html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]+)"`))?.[1]}
it('declares the verified 1200x630 actual-scene image for both social consumers',()=>{
 const png=readFileSync(new URL('public/og-image-v2.png',root));expect(png.subarray(1,4).toString()).toBe('PNG');expect(png.readUInt32BE(16)).toBe(1200);expect(png.readUInt32BE(20)).toBe(630);expect(png[24]).toBe(8);expect(png[25]).toBe(6);expect(createHash('sha256').update(png).digest('hex')).toBe('6f1b3cee0ec8e8a825e2aa87eb33adbcdd88ce4ffe5af399b5471aca8cd71366');
 const html=readFileSync(new URL('index.html',root),'utf8');expect(meta(html,'og:url')).toBe(url);expect(meta(html,'og:image')).toBe(imageURL);expect(meta(html,'twitter:image')).toBe(imageURL);expect(meta(html,'twitter:card')).toBe('summary_large_image');expect(meta(html,'og:image:type')).toBe('image/png');expect(meta(html,'og:image:width')).toBe('1200');expect(meta(html,'og:image:height')).toBe('630');expect(meta(html,'og:image:alt')).toContain('実ゲーム画面');expect(meta(html,'twitter:image:alt')).toBe(meta(html,'og:image:alt'));
 // Keep the previous generated image recoverable, rather than rewriting its pixels.
 expect(readFileSync(new URL('public/og-image.png',root)).length).toBe(13903);
});
it('native composition embeds the unmodified normal-run Canvas only',()=>{
 const svg=readFileSync(new URL('docs/share-assets/kakomare-og-v2.svg',root),'utf8');const refs=[...svg.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);expect(refs).toHaveLength(1);expect(refs[0].startsWith('data:image/png;base64,')).toBe(true);expect(createHash('sha256').update(Buffer.from(refs[0].split(',')[1],'base64')).digest('hex')).toBe('d8d387b0f19bb3ece00b28a7ab86576916c91e965da11a70943af565b4cbbe22');expect(svg.replace('http://www.w3.org/2000/svg','')).not.toMatch(/https?:\/\//);
});
