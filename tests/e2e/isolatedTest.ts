import {test as base} from '@playwright/test';
import {isolateBrowserNetwork} from './networkSafety';
export const test=base.extend<{networkBlocks:string[]}>({
 // Playwright requires an object destructuring pattern for a fixture with no dependencies.
 // eslint-disable-next-line no-empty-pattern
 networkBlocks:async({},use)=>{await use([])},
 context:async({context,baseURL,networkBlocks},use)=>{if(!baseURL)throw Error('Fixture URL missing');await isolateBrowserNetwork(context,baseURL,kind=>networkBlocks.push(kind));await use(context);},
});
export {expect,type Page} from '@playwright/test';
