// End-to-end check of the coordination API, including the abuse cases the
// security pass closed. Needs a running server and a migrated database:
//
//   npm run dev            (in one terminal)
//   npm run smoke          (in another; or BASE_URL=https://... npm run smoke)
//
// Each run uses its own forwarded IP so the join rate limit doesn't trip.

import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const IP = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.1`;

async function call(path, { session, body, method = body ? "POST" : "GET" } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": IP,
      ...(session && { Authorization: `Bearer ${session.id}.${session.token}` }),
    },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const join = async (lat, lng, vibe) => (await call("/api/join", { body: { lat, lng, vibe } })).data;
const poll = (session) => call("/api/poll", { session });
const signal = (session, toId, type, payload) =>
  call("/api/signal", { session, body: { toId, type, payload } });
const types = (res) => res.data.signals.map((s) => s.type);

const steps = [];
const step = (name, fn) => steps.push([name, fn]);

let a, b, c;

step("join issues an id and token, and offsets the position 1-3 km", async () => {
  a = await join(14.5995, 120.9842, "music"); // Manila
  b = await join(51.5072, -0.1276, "not-a-vibe"); // London
  c = await join(40.7128, -74.006); // New York
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.ok(a.token.length >= 32);
  const km = Math.hypot((a.lat - 14.5995) * 111.32, (a.lng - 120.9842) * 111.32 * Math.cos(0.2548));
  assert.ok(km >= 0.99 && km <= 3.01, `offset was ${km} km`);
});

step("join rejects bad coordinates", async () => {
  assert.equal((await call("/api/join", { body: { lat: 200, lng: 0 } })).status, 400);
});

step("poll lists the other peers with their mood, never tokens", async () => {
  const res = await poll(a);
  assert.equal(res.status, 200);
  const ids = res.data.peers.map((p) => p.id);
  assert.ok(ids.includes(b.id) && ids.includes(c.id) && !ids.includes(a.id));
  assert.equal(res.data.peers.find((p) => p.id === b.id).vibe, null, "unknown vibe is dropped");
  assert.ok(!JSON.stringify(res.data).includes("token"));
  assert.equal((await poll(b)).data.peers.find((p) => p.id === a.id).vibe, "music");
});

step("knowing someone's id is not enough to act as them", async () => {
  const thief = { id: a.id, token: "guessed" };
  assert.equal((await poll(thief)).status, 410);
  assert.equal((await signal(thief, b.id, "request")).status, 401);
  assert.equal((await call("/api/leave", { session: thief, method: "POST" })).status, 401);
  assert.equal((await poll(a)).status, 200, "the real session is untouched");
});

step("cannot accept a request that was never made", async () => {
  assert.equal((await signal(c, a.id, "accept")).status, 409);
  assert.equal((await poll(b)).data.peers.find((p) => p.id === a.id).busy, false);
});

step("cannot push WebRTC signals at someone you are not connected to", async () => {
  assert.equal((await signal(c, a.id, "offer", "{}")).status, 403);
});

step("request, accept, then both show as busy", async () => {
  assert.equal((await signal(a, b.id, "request")).status, 200);
  assert.deepEqual(types(await poll(b)), ["request"]);
  assert.equal((await signal(b, a.id, "accept")).status, 200);
  assert.deepEqual(types(await poll(a)), ["accept"]);
  const seen = (await poll(c)).data.peers;
  assert.ok(seen.find((p) => p.id === a.id).busy && seen.find((p) => p.id === b.id).busy);
});

step("handshake is relayed between the pair, with a validated payload", async () => {
  assert.equal((await signal(a, b.id, "offer", JSON.stringify({ type: "offer", sdp: "x" }))).status, 200);
  assert.equal((await signal(a, b.id, "ice", "not json")).status, 400);
  assert.equal((await signal(a, b.id, "ice", "x".repeat(20_000))).status, 400);
  const res = await poll(b);
  assert.deepEqual(types(res), ["offer"]);
  assert.equal(res.data.signals[0].fromId, a.id);
  assert.deepEqual(types(await poll(b)), [], "mailbox is drained once read");
});

step("a request to a busy peer is declined for them", async () => {
  const res = await signal(c, a.id, "request");
  assert.equal(res.data.autoDeclined, true);
  assert.deepEqual(types(await poll(c)), ["decline"]);
  assert.deepEqual(types(await poll(a)), [], "the busy peer is not interrupted");
});

step("a third party cannot end someone else's conversation", async () => {
  assert.equal((await signal(c, a.id, "end")).status, 409);
});

step("waves are delivered and rate limited", async () => {
  assert.equal((await signal(c, b.id, "wave")).status, 200);
  assert.equal((await signal(c, b.id, "wave")).status, 429);
  assert.deepEqual(types(await poll(b)), ["wave"]);
});

step("end frees both peers", async () => {
  assert.equal((await signal(b, a.id, "end")).status, 200);
  assert.deepEqual(types(await poll(a)), ["end"]);
  const seen = (await poll(c)).data.peers;
  assert.ok(!seen.find((p) => p.id === a.id).busy && !seen.find((p) => p.id === b.id).busy);
});

step("leave removes the dot immediately and kills the session", async () => {
  for (const s of [a, b]) {
    assert.equal((await call("/api/leave", { session: s, method: "POST" })).status, 200);
  }
  assert.deepEqual((await poll(c)).data.peers.filter((p) => [a.id, b.id].includes(p.id)), []);
  assert.equal((await poll(a)).status, 410);
  await call("/api/leave", { session: c, method: "POST" });
});

let failed = 0;
for (const [name, fn] of steps) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}
console.log(failed ? `\n${failed} of ${steps.length} failed` : `\nall ${steps.length} passed`);
process.exit(failed ? 1 : 0);
