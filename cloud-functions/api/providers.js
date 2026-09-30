import {handleMarket} from '../../server/market.mjs';
export const onRequest=context=>handleMarket(context.request,context.env);
