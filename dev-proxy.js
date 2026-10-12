// Local stand-in for nginx.conf: :3030 -> Express (:3032) / Elysia (:3031).
// Same routing as nginx.conf: POST course search + /seats and /ws go to Elysia, rest to Express.
const EXPRESS = process.env.EXPRESS_PORT || 3032;
const ELYSIA = process.env.ELYSIA_PORT || 3031;
const elysiaRoute = /^\/university\/[^/]+\/course\/[^/]+\/[^/]+(\/seats)?$/;

Bun.serve({
  port: process.env.PORT || 3030,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === '/ws/planriean') {
      return server.upgrade(req, { data: { search: url.search, headers: req.headers } }) ? undefined : new Response('upgrade failed', { status: 400 });
    }
    const toElysia = req.method === 'POST' && elysiaRoute.test(url.pathname);
    return fetch(`http://localhost:${toElysia ? ELYSIA : EXPRESS}${url.pathname}${url.search}`, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      redirect: 'manual',
    });
  },
  websocket: {
    open(ws) {
      ws.data.up = new WebSocket(`ws://localhost:${ELYSIA}/ws/planriean${ws.data.search}`, {
        headers: { authorization: ws.data.headers.get('authorization') ?? '' },
      });
      ws.data.queue = [];
      ws.data.up.onopen = () => ws.data.queue.splice(0).forEach((m) => ws.data.up.send(m));
      ws.data.up.onmessage = (e) => ws.send(e.data);
      ws.data.up.onclose = () => ws.close();
    },
    message(ws, msg) {
      ws.data.up.readyState === WebSocket.OPEN ? ws.data.up.send(msg) : ws.data.queue.push(msg);
    },
    close(ws) {
      ws.data.up?.close();
    },
  },
});
console.log(`dev-proxy :${process.env.PORT || 3030} -> express :${EXPRESS}, elysia :${ELYSIA}`);
