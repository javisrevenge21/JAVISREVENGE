// Reads a request's query string with the WHATWG URL parser.
// Vercel's Node runtime fills req.query lazily with the legacy url.parse(),
// which logs a deprecation warning (DEP0169) on every request that reads it.
// Handlers use queryOf(req) instead so that parser never runs.
// A key given more than once keeps its last value.
export function queryOf(req) {
  try {
    return Object.fromEntries(new URL(req.url || '/', 'http://localhost').searchParams);
  } catch {
    return {};
  }
}
