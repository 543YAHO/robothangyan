import {handle} from '../../server/research.mjs';
export const onRequest=context=>handle(context.request,context.env);
