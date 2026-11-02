import type { BrowserContext } from '@playwright/test';
export async function isolateBrowserNetwork(context:BrowserContext,baseURL:string,onBlocked:(kind:string)=>void=()=>undefined):Promise<void>{
 const base=new URL(baseURL);if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||!base.port||base.username||base.password)throw Error('Expected local fixture server origin');
 await context.routeWebSocket('**/*',socket=>{onBlocked('websocket');void socket.close()});
 await context.route('**/*',async route=>{
  const request=route.request();if(new URL(request.url()).origin!==base.origin||!['GET','HEAD'].includes(request.method())){onBlocked(new URL(request.url()).origin!==base.origin?'external-origin':'non-static-method');await route.abort('blockedbyclient');return;}
  const response=await route.fetch({maxRedirects:0,maxRetries:2});if(response.status()>=300&&response.status()<400){onBlocked('redirect');await route.abort();throw Error('Unexpected local redirect blocked');}await route.fulfill({response});
 });
}
