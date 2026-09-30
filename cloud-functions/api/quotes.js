import {handleMarket} from '../../server/market.mjs';
export const onRequest=context=>handleMarket(context.request,{...context.env,PUBLIC_ORIGIN:context.env?.PUBLIC_ORIGIN||'https://robot-evidence-research-nzyugtat.edgeone.cool'});
