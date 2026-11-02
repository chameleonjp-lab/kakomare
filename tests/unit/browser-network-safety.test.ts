import {expect,it} from 'vitest';import type {BrowserContext,Route,WebSocketRoute} from '@playwright/test';
import {isolateBrowserNetwork} from '../e2e/networkSafety';
it('allows only fixture static GET/HEAD; refuses external, POST, redirects and WebSocket',async()=>{
 let handler:(route:Route)=>Promise<void>=async()=>undefined;let ws:(socket:WebSocketRoute)=>void=()=>undefined;
 const context={route:async(_pattern:string,fn:typeof handler)=>{handler=fn},routeWebSocket:async(_pattern:string,fn:typeof ws)=>{ws=fn}} as unknown as BrowserContext;
 for(const base of ['https://example.com/','http://localhost.evil:4173/','http://user@127.0.0.1:4173/','http://127.0.0.1/'])await expect(isolateBrowserNetwork(context,base)).rejects.toThrow();
 const blocked:string[]=[];await isolateBrowserNetwork(context,'http://127.0.0.1:4173/kakomare/',kind=>blocked.push(kind));
 async function invoke(url:string,method='GET',status=200){let fetch=0,abort=0,fulfill=0;const route={request:()=>({url:()=>url,method:()=>method}),fetch:async(options:unknown)=>{expect(options).toEqual({maxRedirects:0,maxRetries:2});fetch++;return{status:()=>status}},abort:async()=>{abort++},fulfill:async()=>{fulfill++}}as unknown as Route;await handler(route);return{fetch,abort,fulfill}}
 for(const [url,method]of [['https://example.com/','GET'],['http://127.0.0.1:4174/','GET'],['http://127.0.0.1:4173/','POST'],['http://127.0.0.1:4173/','DELETE']])expect(await invoke(url,method)).toEqual({fetch:0,abort:1,fulfill:0});
 for(const method of ['GET','HEAD'])expect(await invoke('http://127.0.0.1:4173/kakomare/',method)).toEqual({fetch:1,abort:0,fulfill:1});
 await expect(invoke('http://127.0.0.1:4173/', 'GET',302)).rejects.toThrow(/redirect/);let closed=false;ws({close:()=>{closed=true}}as unknown as WebSocketRoute);expect(closed).toBe(true);expect(blocked).toEqual(['external-origin','external-origin','non-static-method','non-static-method','redirect','websocket']);
});
