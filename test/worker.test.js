import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../worker/index.js";

const APP_ORIGIN = "https://canvas-downloader.example.workers.dev";
const TOKEN = "test-canvas-token";

function appRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.token !== false) headers.set("X-Canvas-Token", TOKEN);
  return new Request(`${APP_ORIGIN}${path}`, { method: options.method || "GET", headers });
}

test("health is same-origin friendly and does not emit CORS headers", async () => {
  const response = await handleRequest(appRequest("/api/health", { token: false }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "canvas-downloader" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("rejects missing tokens before calling Canvas", async () => {
  let called = false;
  const response = await handleRequest(appRequest("/api/courses", { token: false }), {
    fetchImpl: async () => { called = true; return new Response(); },
  });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});

test("rejects unknown routes, client query strings, and wrong methods", async () => {
  assert.equal((await handleRequest(appRequest("/api/admin"))).status, 404);
  assert.equal((await handleRequest(appRequest("/api/courses?per_page=999"))).status, 400);
  const wrongMethod = await handleRequest(appRequest("/api/courses", { method: "POST" }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("Allow"), "GET");
});

test("rejects foreign browser origins without granting CORS", async () => {
  const response = await handleRequest(appRequest("/api/courses", {
    headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
  }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("maps public routes to fixed Canvas endpoints and aggregates pagination", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) {
      return new Response(JSON.stringify([{ id: 1 }]), {
        headers: {
          "Content-Type": "application/json",
          Link: '<https://canvas.eur.nl/api/v1/courses?enrollment_state=active&per_page=100&page=2>; rel="next"',
        },
      });
    }
    return Response.json([{ id: 2 }]);
  };

  const response = await handleRequest(appRequest("/api/courses"), { fetchImpl });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: 1 }, { id: 2 }]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://canvas.eur.nl/api/v1/courses?enrollment_state=active&per_page=100");
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].init.redirect, "manual");
  for (const call of calls) assert.match(call.init.headers["User-Agent"], /^CanvasDownloader\/\d+(?:\.\d+)+ /);
});

test("identifies the app to Canvas instead of forwarding the browser user agent", async () => {
  const response = await handleRequest(appRequest("/api/courses", {
    headers: { "User-Agent": "browser-client-agent" },
  }), {
    fetchImpl: async (url, init) => {
      if (!/^CanvasDownloader\/\d+(?:\.\d+)+ /.test(init.headers["User-Agent"] || "")) {
        return Response.json({ message: "A valid user agent is required." }, { status: 403 });
      }
      return Response.json([{ id: 1 }]);
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: 1 }]);
});

test("bounds metadata across all pagination pages", async () => {
  let calls = 0;
  const page = JSON.stringify([{ description: "x".repeat(3 * 1024 * 1024) }]);
  const response = await handleRequest(appRequest("/api/courses"), {
    fetchImpl: async () => {
      calls += 1;
      return new Response(page, {
        headers: calls === 1 ? {
          Link: '<https://canvas.eur.nl/api/v1/courses?page=2>; rel="next"',
        } : {},
      });
    },
  });

  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /too much metadata/i);
  assert.equal(calls, 2);
});

test("rejects pagination links that leave the exact Canvas origin", async () => {
  const fetchImpl = async () => new Response(JSON.stringify([{ id: 1 }]), {
    headers: { Link: '<https://evil.example/api/v1/courses?page=2>; rel="next"' },
  });
  const response = await handleRequest(appRequest("/api/courses"), { fetchImpl });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /unsafe pagination/i);
});

test("resolves file URLs server-side, streams bytes, and strips the token on storage redirects", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url: String(url),
      authorization: init.headers.Authorization || null,
      userAgent: init.headers["User-Agent"],
    });
    if (calls.length === 1) {
      return Response.json({
        id: 42,
        display_name: "notes.pdf",
        url: "https://canvas.eur.nl/files/42/download?download_frd=1&verifier=signed",
      });
    }
    if (calls.length === 2) {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://canvas-storage.example/objects/notes.pdf" },
      });
    }
    return new Response("file-bytes", { headers: { "Content-Type": "application/pdf" } });
  };

  const response = await handleRequest(appRequest("/api/files/42/download"), { fetchImpl });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.equal(await response.text(), "file-bytes");
  assert.equal(calls[0].url, "https://canvas.eur.nl/api/v1/files/42");
  assert.equal(calls[0].authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[1].authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[2].authorization, null);
  for (const call of calls) assert.match(call.userAgent, /^CanvasDownloader\/\d+(?:\.\d+)+ /);
});

test("rejects unsafe file redirects and cancels their response bodies", async () => {
  let calls = 0;
  let canceled = false;
  const response = await handleRequest(appRequest("/api/files/42/download"), {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return Response.json({ url: "https://canvas.eur.nl/files/42/download" });
      return new Response(new ReadableStream({
        cancel() { canceled = true; },
      }), {
        status: 302,
        headers: { Location: "http://canvas-storage.example/notes.pdf" },
      });
    },
  });

  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /unsafe file redirect/i);
  assert.equal(canceled, true);
  assert.equal(calls, 2);
});

test("rejects a metadata file URL that does not belong to EUR Canvas", async () => {
  const fetchImpl = async () => Response.json({
    id: 42,
    url: "https://evil.example/files/42/download",
  });
  const response = await handleRequest(appRequest("/api/files/42/download"), { fetchImpl });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /permitted EUR file URL/i);
});

test("preserves content encoding while streaming file bytes", async () => {
  let call = 0;
  const encoded = new Uint8Array([31, 139, 8, 0, 0, 0, 0, 0]);
  const fetchImpl = async () => {
    call += 1;
    if (call === 1) {
      return Response.json({
        id: 7,
        url: "https://canvas.eur.nl/files/7/download?download_frd=1",
      });
    }
    return new Response(encoded, {
      headers: { "Content-Encoding": "gzip", "Content-Type": "application/octet-stream" },
    });
  };

  const response = await handleRequest(appRequest("/api/files/7/download"), { fetchImpl });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Encoding"), "gzip");
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), encoded);
});
