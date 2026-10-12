// Local-only request log (enabled with DEV_LOG=1). One line per request, plus the
// result/error underneath when the status is >= 400 or the body says success:false.
const enabled = process.env.DEV_LOG === "1";
const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const MAX = 600;

const short = (v) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > MAX ? `${s.slice(0, MAX)}… (${s.length} chars)` : s;
};

function logRequest({ service, method, path, status, ms, body, error }) {
  const failed = status >= 400 || error || body?.success === false || body?.error;
  const color = status >= 500 || error ? 31 : failed ? 33 : 32;
  const time = new Date().toLocaleTimeString("en-GB");
  console.log(`${c(90, time)} ${c(36, service.padEnd(7))} ${method.padEnd(6)} ${path} ${c(color, status)} ${c(90, `${ms}ms`)}`);
  if (error) console.log(c(color, `  ↳ error: ${(status >= 500 && error.stack) || error.message || error.code || error}`));
  else if (failed && body !== undefined) console.log(c(color, `  ↳ result: ${short(body)}`));
}

// Express: wraps res.json/res.send to capture the body; errors come via res.locals.err (see errorTap).
const expressLogger = (req, res, next) => {
  const start = performance.now();
  let body;
  const { json, send } = res;
  res.json = function (b) { body = b; return json.call(this, b); };
  res.send = function (b) {
    if (body === undefined) body = b;
    return send.call(this, b);
  };
  res.on("finish", () =>
    logRequest({
      service: "express", method: req.method, path: req.originalUrl,
      status: res.statusCode, ms: Math.round(performance.now() - start), body, error: res.locals.err,
    }));
  next();
};

// Register AFTER all routes: records the thrown error, then lets Express answer as usual.
const errorTap = (err, req, res, next) => { res.locals.err = err; next(err); };

// Elysia plugin: onRequest stamps the start, onError remembers the error, onAfterResponse logs once.
const elysiaLogger = (app) =>
  app
    .onRequest(({ request }) => { request.__start = performance.now(); })
    .onError({ as: "global" }, ({ request, code, error }) => { request.__code = code; request.__err = error; })
    .onAfterResponse({ as: "global" }, ({ request, path, set, response }) => {
      const error = request.__err;
      const status = typeof set.status === "number" ? set.status : error ? (request.__code === "NOT_FOUND" ? 404 : request.__code === "VALIDATION" ? 422 : 500) : 200;
      logRequest({ service: "elysia", method: request.method, path, status, ms: Math.round(performance.now() - request.__start), body: response, error });
    });

module.exports = { enabled, expressLogger, errorTap, elysiaLogger };
