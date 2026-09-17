const CANVAS_ORIGIN = "https://canvas.eur.nl";
const TOKEN_HEADER = "X-Canvas-Token";
const USER_AGENT = "CanvasDownloader/2.0 (EUR Canvas file downloader)";
const MAX_PAGES = 30;
const MAX_REDIRECTS = 5;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_ERROR_BYTES = 32 * 1024;
const ID_PATTERN = "(\\d{1,20})";

class CanvasProxyError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function responseHeaders() {
  return {
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...responseHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function isCrossOrigin(request, requestUrl) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== requestUrl.origin) return true;
  return request.headers.get("Sec-Fetch-Site") === "cross-site";
}

function routeFor(pathname) {
  if (pathname === "/api/health") return { kind: "health" };
  if (pathname === "/api/courses") {
    return {
      kind: "json",
      canvasPath: "/api/v1/courses",
      query: { enrollment_state: "active", per_page: "100" },
      collection: true,
    };
  }

  let match = pathname.match(new RegExp(`^/api/courses/${ID_PATTERN}/modules$`));
  if (match) {
    return {
      kind: "json",
      canvasPath: `/api/v1/courses/${match[1]}/modules`,
      query: { per_page: "100" },
      collection: true,
    };
  }

  match = pathname.match(new RegExp(`^/api/courses/${ID_PATTERN}/modules/${ID_PATTERN}/items$`));
  if (match) {
    return {
      kind: "json",
      canvasPath: `/api/v1/courses/${match[1]}/modules/${match[2]}/items`,
      query: { per_page: "100" },
      collection: true,
    };
  }

  match = pathname.match(new RegExp(`^/api/files/${ID_PATTERN}$`));
  if (match) {
    return {
      kind: "json",
      canvasPath: `/api/v1/files/${match[1]}`,
      query: {},
      collection: false,
    };
  }

  match = pathname.match(new RegExp(`^/api/files/${ID_PATTERN}/download$`));
  if (match) return { kind: "download", fileId: match[1] };

  return null;
}

function readToken(request) {
  const token = (request.headers.get(TOKEN_HEADER) || "").trim();
  if (!token) throw new CanvasProxyError("Canvas token is required.", 401);
  if (token.length > 4096 || /[\u0000-\u001f\u007f]/.test(token)) {
    throw new CanvasProxyError("Canvas token is invalid.", 400);
  }
  return token;
}

function nextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(/,(?=\s*<)/)) {
    const urlMatch = part.match(/<([^>]+)>/);
    const relMatch = part.match(/;\s*rel\s*=\s*"?([^";,]+)"?/i);
    if (urlMatch && relMatch && relMatch[1].split(/\s+/).includes("next")) return urlMatch[1];
  }
  return null;
}

function validateCanvasApiUrl(url, expectedPath) {
  if (
    url.origin !== CANVAS_ORIGIN ||
    url.pathname !== expectedPath ||
    url.username ||
    url.password ||
    [...url.searchParams.keys()].some((key) => key.toLowerCase() === "access_token")
  ) {
    throw new CanvasProxyError("Canvas returned an unsafe pagination URL.", 502);
  }
}

function publicCanvasError(raw, fallback) {
  let message = "";
  try {
    const body = JSON.parse(raw);
    if (Array.isArray(body?.errors) && body.errors[0]?.message) message = body.errors[0].message;
    else if (body?.message) message = body.message;
    else if (body?.error) message = body.error;
  } catch {
    message = raw;
  }
  message = String(message || fallback).replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return message.slice(0, 500) || fallback;
}

function upstreamStatus(status) {
  return status >= 400 && status < 500 ? status : 502;
}

async function readLimitedText(response, limit, tooLargeMessage) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > limit) {
      await reader.cancel();
      throw new CanvasProxyError(tooLargeMessage, 502);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function readCanvasError(response, fallback) {
  try {
    const raw = await readLimitedText(response, MAX_ERROR_BYTES, fallback);
    return publicCanvasError(raw, fallback);
  } catch {
    return fallback;
  }
}

async function fetchCanvasJson(canvasPath, query, token, collection, fetchImpl) {
  const initialUrl = new URL(canvasPath, CANVAS_ORIGIN);
  for (const [key, value] of Object.entries(query)) initialUrl.searchParams.set(key, value);

  const values = [];
  let metadataBytes = 0;
  let currentUrl = initialUrl;
  for (let page = 1; currentUrl; page += 1) {
    if (page > MAX_PAGES) throw new CanvasProxyError("Canvas returned too many pages.", 502);
    validateCanvasApiUrl(currentUrl, initialUrl.pathname);

    const response = await fetchImpl(currentUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
      redirect: "manual",
      cache: "no-store",
    });

    if (response.status >= 300 && response.status < 400) {
      if (response.body) await response.body.cancel().catch(() => {});
      throw new CanvasProxyError("Canvas API redirected unexpectedly.", 502);
    }

    if (!response.ok) {
      const fallback = `Canvas request failed (${response.status}).`;
      throw new CanvasProxyError(
        await readCanvasError(response, fallback),
        upstreamStatus(response.status),
      );
    }

    const raw = await readLimitedText(
      response,
      MAX_JSON_BYTES - metadataBytes,
      "Canvas returned too much metadata.",
    );
    metadataBytes += new TextEncoder().encode(raw).byteLength;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new CanvasProxyError("Canvas returned an invalid JSON response.", 502);
    }

    if (!collection) return data;
    if (!Array.isArray(data)) throw new CanvasProxyError("Canvas returned an unexpected response.", 502);
    for (const value of data) values.push(value);

    const rawNext = nextLink(response.headers.get("Link"));
    if (!rawNext) currentUrl = null;
    else {
      if (rawNext.length > 8192) throw new CanvasProxyError("Canvas returned an unsafe pagination URL.", 502);
      let parsed;
      try {
        parsed = new URL(rawNext, currentUrl);
      } catch {
        throw new CanvasProxyError("Canvas returned an unsafe pagination URL.", 502);
      }
      validateCanvasApiUrl(parsed, initialUrl.pathname);
      currentUrl = parsed;
    }
  }

  return values;
}

function isAllowedCanvasDownloadUrl(url, fileId) {
  return (
    url.origin === CANVAS_ORIGIN &&
    !url.username &&
    !url.password &&
    url.pathname === `/files/${fileId}/download`
  );
}

function isRedirect(response) {
  return response.status >= 300 && response.status < 400;
}

function redirectTarget(response, currentUrl) {
  const location = response.headers.get("Location");
  if (!location || location.length > 8192) {
    throw new CanvasProxyError("Canvas returned an invalid file redirect.", 502);
  }

  let target;
  try {
    target = new URL(location, currentUrl);
  } catch {
    throw new CanvasProxyError("Canvas returned an invalid file redirect.", 502);
  }

  if (target.protocol !== "https:" || target.username || target.password) {
    throw new CanvasProxyError("Canvas returned an unsafe file redirect.", 502);
  }
  return target;
}

async function streamCanvasFile(fileId, token, fetchImpl) {
  const metadata = await fetchCanvasJson(
    `/api/v1/files/${fileId}`,
    {},
    token,
    false,
    fetchImpl,
  );
  const rawDownloadUrl = metadata?.url || metadata?.download_url;
  if (typeof rawDownloadUrl !== "string" || rawDownloadUrl.length > 8192) {
    throw new CanvasProxyError("Canvas did not provide a valid file URL.", 502);
  }

  let currentUrl;
  try {
    currentUrl = new URL(rawDownloadUrl);
  } catch {
    throw new CanvasProxyError("Canvas did not provide a valid file URL.", 502);
  }
  if (!isAllowedCanvasDownloadUrl(currentUrl, fileId)) {
    throw new CanvasProxyError("Canvas did not provide a permitted EUR file URL.", 502);
  }

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const onCanvas = currentUrl.origin === CANVAS_ORIGIN;
    if (onCanvas && !isAllowedCanvasDownloadUrl(currentUrl, fileId)) {
      throw new CanvasProxyError("Canvas returned an unsafe file redirect.", 502);
    }

    const headers = { Accept: "*/*", "User-Agent": USER_AGENT };
    if (onCanvas) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      headers,
      redirect: "manual",
      cache: "no-store",
    });

    if (isRedirect(response)) {
      if (redirectCount === MAX_REDIRECTS) {
        if (response.body) await response.body.cancel().catch(() => {});
        throw new CanvasProxyError("Canvas returned too many file redirects.", 502);
      }
      let target;
      try {
        target = redirectTarget(response, currentUrl);
      } finally {
        if (response.body) await response.body.cancel().catch(() => {});
      }
      currentUrl = target;
      continue;
    }

    if (!response.ok) {
      const fallback = `Canvas file request failed (${response.status}).`;
      throw new CanvasProxyError(
        await readCanvasError(response, fallback),
        upstreamStatus(response.status),
      );
    }
    if (!response.body) throw new CanvasProxyError("Canvas returned an empty file response.", 502);

    const headersOut = new Headers(responseHeaders());
    headersOut.set("Content-Type", response.headers.get("Content-Type") || "application/octet-stream");
    const contentEncoding = response.headers.get("Content-Encoding");
    const responseInit = { status: 200, headers: headersOut };
    if (contentEncoding) {
      headersOut.set("Content-Encoding", contentEncoding);
      responseInit.encodeBody = "manual";
    }
    return new Response(response.body, responseInit);
  }

  throw new CanvasProxyError("Canvas file request failed.", 502);
}

export async function handleRequest(request, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const requestUrl = new URL(request.url);

  if (!requestUrl.pathname.startsWith("/api/")) {
    return jsonResponse({ error: "Not found." }, 404);
  }
  if (isCrossOrigin(request, requestUrl)) return jsonResponse({ error: "Cross-origin requests are not allowed." }, 403);

  const route = routeFor(requestUrl.pathname);
  if (!route) return jsonResponse({ error: "API route not found." }, 404);
  if (requestUrl.search) return jsonResponse({ error: "Query parameters are not allowed." }, 400);
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405, { Allow: "GET" });
  if (route.kind === "health") return jsonResponse({ ok: true, service: "canvas-downloader" });

  try {
    const token = readToken(request);
    if (route.kind === "download") return await streamCanvasFile(route.fileId, token, fetchImpl);
    const data = await fetchCanvasJson(
      route.canvasPath,
      route.query,
      token,
      route.collection,
      fetchImpl,
    );
    return jsonResponse(data);
  } catch (error) {
    if (error instanceof CanvasProxyError) return jsonResponse({ error: error.message }, error.status);
    return jsonResponse({ error: "Canvas request failed." }, 502);
  }
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
};
