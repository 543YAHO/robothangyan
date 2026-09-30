import {handle} from '../../server/research.mjs';
export const onRequest=context=>handle(context.request,{...context.env,PUBLIC_ORIGIN:context.env?.PUBLIC_ORIGIN||'https://robot-evidence-research-nzyugtat.edgeone.cool'});
