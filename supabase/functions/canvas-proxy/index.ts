const CANVAS_ORIGIN = "https://canvas.eur.nl";
const ALLOWED_API_PATHS = [
  /^\/api\/v1\/courses$/,
  /^\/api\/v1\/courses\/\d+\/modules$/,
  /^\/api\/v1\/courses\/\d+\/modules\/\d+\/items$/,
  /^\/api\/v1\/files\/\d+$/,
];

function originAllowed(origin) {
  if (!origin) return false;
  return origin === "https://romaobraz04.github.io" || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
}
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": originAllowed(origin) ? origin : "https://romaobraz04.github.io",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "content-type, apikey, x-canvas-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "content-length, content-type",
  };
}
function jsonResponse(origin, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function configuredPublishableKeys() {
  const keys = new Set();
  try {
    const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    if (raw) for (const value of Object.values(JSON.parse(raw))) if (typeof value === "string") keys.add(value);
  } catch {}
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) keys.add(legacy);
  return keys;
}
function apiKeyAllowed(req) {
  const candidate = req.headers.get("apikey") || "";
  return candidate.length > 0 && configuredPublishableKeys().has(candidate);
}
function nextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const [rawUrl, ...params] = part.trim().split(";");
    if (params.some((param) => param.trim() === 'rel="next"')) return rawUrl.trim().replace(/^<|>$/g, "");
  }
  return null;
}
async function readCanvasError(response) {
  try {
    const body = await response.json();
    if (Array.isArray(body?.errors) && body.errors[0]?.message) return body.errors[0].message;
    if (body?.message) return body.message;
    return JSON.stringify(body);
  } catch { return await response.text(); }
}
async function fetchCanvasJson(path, params, token) {
  if (!ALLOWED_API_PATHS.some((pattern) => pattern.test(path))) throw new Error("This Canvas API path is not allowed.");
  const url = new URL(path, CANVAS_ORIGIN);
  for (const [key, value] of Object.entries(params || {})) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  let next = url.toString();
  let pages = 0;
  const collected = [];
  while (next) {
    pages += 1;
    if (pages > 30) throw new Error("Canvas returned too many pages.");
    const response = await fetch(next, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, redirect: "follow" });
    if (!response.ok) {
      const error = new Error((await readCanvasError(response)) || `Canvas request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    const data = await response.json();
    if (!Array.isArray(data)) return data;
    collected.push(...data);
    next = nextLink(response.headers.get("Link"));
  }
  return collected;
}
async function proxyFile(urlString, token, origin) {
  const url = new URL(urlString);
  if (url.protocol !== "https:" || url.hostname !== "canvas.eur.nl") return jsonResponse(origin, { error: "File URL is not a permitted Canvas URL." }, 400);
  const response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` }, redirect: "follow" });
  if (!response.ok || !response.body) return jsonResponse(origin, { error: (await readCanvasError(response)) || `Canvas file request failed (${response.status}).` }, response.status || 502);
  const headers = { ...corsHeaders(origin), "Cache-Control": "no-store", "Content-Type": response.headers.get("Content-Type") || "application/octet-stream" };
  const contentLength = response.headers.get("Content-Length");
  if (contentLength) headers["Content-Length"] = contentLength;
  return new Response(response.body, { status: 200, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin") || "";
  if (req.method === "OPTIONS") {
    if (!originAllowed(origin)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return jsonResponse(origin, { error: "Method not allowed." }, 405);
  if (!originAllowed(origin)) return jsonResponse(origin, { error: "Origin not allowed." }, 403);
  if (!apiKeyAllowed(req)) return jsonResponse(origin, { error: "Invalid application key." }, 401);
  const token = (req.headers.get("X-Canvas-Token") || "").trim();
  if (!token) return jsonResponse(origin, { error: "Canvas token is required." }, 400);
  let payload;
  try { payload = await req.json(); }
  catch { return jsonResponse(origin, { error: "Invalid JSON body." }, 400); }
  try {
    if (payload.action === "api") {
      if (typeof payload.path !== "string") return jsonResponse(origin, { error: "Canvas path is required." }, 400);
      return jsonResponse(origin, await fetchCanvasJson(payload.path, payload.params || {}, token));
    }
    if (payload.action === "file") {
      if (typeof payload.url !== "string") return jsonResponse(origin, { error: "Canvas file URL is required." }, 400);
      return await proxyFile(payload.url, token, origin);
    }
    return jsonResponse(origin, { error: "Unknown action." }, 400);
  } catch (error) {
    return jsonResponse(origin, { error: error instanceof Error ? error.message : String(error) }, Number(error?.status) || 502);
  }
});
