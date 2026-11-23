import { gate, type GateEnv } from '../server/gate';

// Cloudflare Pages: runs before every request, static assets included.
export const onRequest = (ctx: { request: Request; env: GateEnv; next: () => Promise<Response> }) =>
  gate(ctx.request, ctx.env, ctx.next);
