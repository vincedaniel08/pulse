# How Pulse works

A walk through the whole system: what runs where, what is stored, and what happens from the moment you open the page to the moment you close it.

## The short version

- The **server** only coordinates. It knows who is online, roughly where their dot is, and it passes small messages between two browsers so they can find each other.
- The **conversation itself** (chat text, video, audio) goes directly from one browser to the other over WebRTC. The server never sees it.
- There are **no WebSockets**. Vercel functions are short-lived, so each browser asks the server "anything new?" every 1.5 seconds (polling).
- **Nothing is permanent.** Two database tables hold live sessions and undelivered messages. Rows are deleted when you leave, when you go quiet for 15 seconds, or once a message is delivered.

```
 Browser A                      Server (Next.js on Vercel)                Browser B
 ─────────                      ──────────────────────────                ─────────
 page.tsx  ── join / poll / signal / leave ──►  app/api/*  ◄── same ──   page.tsx
                                                    │
                                              Postgres (Neon)
                                           Presence + Signal tables

 PeerSession ◄═══════════ WebRTC: chat data channel + video/audio ═══════════► PeerSession
                            (direct, never through the server)
```

## Where things live

| Path | What it does |
|------|--------------|
| `app/page.tsx` | The client. Holds the session, the connection state machine and the poll loop |
| `app/components/WorldMap.tsx` | Mapbox globe, dots, the arc between two people |
| `app/components/EntryGate.tsx` | First screen: explains the rules, asks for location and an optional mood |
| `app/components/PeerCard.tsx` | Card shown when you tap a dot: mood, distance, wave / ask / hide |
| `app/components/ConnectionPrompt.tsx` | "A stranger wants to talk" and "Turn on video?" |
| `app/components/ChatPanel.tsx`, `VideoPanel.tsx` | The conversation UI |
| `app/api/join` | Creates a session |
| `app/api/poll` | Heartbeat, list of dots, your mailbox |
| `app/api/signal` | Sends one message to another session, if the rules allow it |
| `app/api/leave` | Deletes your session |
| `lib/auth.ts` | Session tokens: create, hash, verify |
| `lib/webrtc.ts` | `PeerSession`: one WebRTC connection (data channel + media) |
| `lib/geo.ts` | Privacy offset, distance, great-circle arc, time-of-day label |
| `lib/presence.ts` | Timing constants shared by client and server |
| `lib/rate-limit.ts` | In-memory limiter for `/api/join` |
| `lib/vibes.ts` | The fixed list of moods |
| `prisma/schema.prisma` | The two tables |
| `scripts/smoke.mjs` | End-to-end API test |

## Data model

Two tables, both temporary.

**Presence** — one row per open tab.

| Column | Meaning |
|--------|---------|
| `id` | Public session id (UUID). Everyone can see it |
| `tokenHash` | SHA-256 of the secret token. The token itself is never stored |
| `lat`, `lng` | The dot's position, **already moved 1–3 km**. The real position is never stored |
| `vibe` | Optional mood key, one of six fixed values |
| `lastSeen` | Updated on every poll. Older than 15 s means offline |
| `requestedId`, `requestedAt` | Who this session asked to talk to, and when |
| `peerId` | Who this session is connected to. Not null means "busy" |
| `wavedAt` | Last wave sent, for the cooldown |

**Signal** — a mailbox. One row per undelivered message: `toId`, `fromId`, `type`, optional `payload`, `createdAt`. Deleted the moment the recipient reads it, or after 60 s if nobody does.

## Sessions and authentication

A session has two halves:

- the **id** is public. Other people need it to address a message to you.
- the **token** is secret. It is 32 random bytes, returned once from `/api/join`, kept only in the tab's memory.

Every later request sends `Authorization: Bearer <id>.<token>`. The server looks up the row by id, hashes the token and compares it to `tokenHash` in constant time (`lib/auth.ts`). The sender of a signal is always taken from this header, never from the request body, so you cannot send a message "as" someone else.

Why two halves: the list of online dots includes every id. If the id alone were the password (as it was originally), anyone could read another user's mailbox or delete their session.

## Life of a session

1. **Open the page.** The globe loads and spins. No request has been made yet.
2. **Enter.** The browser asks for your location. The client calls `POST /api/join { lat, lng, vibe }`.
3. **Join.** The server moves the point 1–3 km in a random direction (`applyPrivacyOffset`), creates the Presence row and returns `{ id, token, lat, lng }`. The returned position is the offset one, so your own pin shows exactly what other people see.
4. **Poll loop.** Every 1.5 s the client calls `GET /api/poll`. One call does four things:
   1. refreshes your `lastSeen` (the heartbeat),
   2. deletes sessions silent for more than 15 s and signals older than 60 s,
   3. returns every other online dot (`id`, position, `busy`, `vibe`),
   4. returns and deletes the messages waiting in your mailbox.
5. **Leave.** On `pagehide` the client fires `POST /api/leave` with `keepalive: true` so it survives the tab closing. The row and any pending signals are deleted, so the dot disappears on everyone's next poll. If the request never arrives (crash, lost network) the 15 s staleness rule removes the dot instead.
6. **Expired while asleep.** Browsers slow timers in background tabs, so a session can be reaped while the tab is hidden. Poll then answers `410`, and the client joins again with the coordinates it kept in memory.

## Connecting two people

The server keeps a small state machine per session and only relays a signal if it is a legal move. A is the person asking, B the person being asked.

```
A                          Server                          B
│  signal(request → B)       │                             │
│ ─────────────────────────► │ A.requestedId = B           │
│                            │ ───── request (next poll) ─►│  prompt appears
│                            │                             │
│                            │ ◄──── signal(accept → A) ── │
│                            │ only if A.requestedId == B: │
│                            │ A.peerId = B, B.peerId = A  │
│ ◄──── accept (next poll) ──│                             │
│                                                          │
│  offer / answer / ice, relayed only because peerId matches on both sides
│ ◄═══════════════════ direct WebRTC connection ══════════►│
│                                                          │
│  signal(end → B)           │ both peerId = null          │
```

Rules enforced in `app/api/signal/route.ts`:

| Signal | Allowed when | Effect |
|--------|--------------|--------|
| `request` | sender is not connected, 2 s since their last request | sets `requestedId`. If the target is offline or busy, the server answers `decline` for them |
| `accept` | the target's `requestedId` is the sender, and both are free | pairs them. Done as one conditional update so two accepts cannot both win |
| `decline` | the target's `requestedId` is the sender | clears it |
| `offer`, `answer`, `ice` | the two are paired | relayed. Payload must be JSON, max 16 KB, max 100 queued |
| `end` | sender is paired with, or has a pending request to, the target | frees both, or cancels the request |
| `wave` | target is online, 3 s since sender's last wave | relayed, changes no state |

Things that end a connection without an `end` signal: the other tab closes or loses network. The client notices because its peer is no longer in the poll list, tears down and frees itself.

## The WebRTC part (`lib/webrtc.ts`)

- The person who asked becomes the **initiator** and creates the data channel named `chat`. That triggers `negotiationneeded`, which produces the first offer.
- Offers, answers and ICE candidates travel through `/api/signal` and arrive in poll batches. `PeerSession` applies them **one at a time** through a promise queue, and holds ICE candidates that arrive before the remote description is set.
- It uses the "perfect negotiation" pattern: if both sides make an offer at once, the non-initiator (polite side) backs off and accepts the other's.
- **Chat** messages are JSON on the data channel: `{ t: "chat", text }`.
- **Control** messages share the channel: `{ t: "ctrl", ctrl }` with `video-request`, `video-accept`, `video-decline`, `video-end`, `typing`. So starting video is negotiated directly between the two browsers; the server is not involved.
- **Video** adds camera and microphone tracks to the same connection, which triggers a renegotiation through the same signalling path.
- Only a public STUN server is configured, no TURN. Most home networks connect; some strict corporate networks will not.
- Everything received on the data channel is treated as untrusted: length capped, types checked, unknown control values ignored.

## The client state machine (`app/page.tsx`)

```
connection:  idle ─► requesting ─► connecting ─► connected
               │         │ (decline / 30 s timeout / cancel) ─► idle
               └► incoming ─► connecting ─► connected
                     │ (decline / requester gives up) ─► idle

video:       none ─► requesting ─► active
               └► incoming ───────► active          any ─► none on end
```

State is kept in React state for rendering and mirrored in refs, because the poll loop and WebRTC callbacks run outside React's render cycle and need the current value, not the one from the render in which they were created.

## Privacy

- Real coordinates exist only in the browser's memory and in the single `join` request. The server stores the offset point.
- The server never receives chat text, audio or video.
- Hiding a person is kept in the tab's memory only. There is no stored block list.
- Known limit: the offset is random per session, as the requirements ask. Someone watching the same user rejoin many times could average the dots. See NOTES.md, Phase 3.
- Known limit: a direct WebRTC connection reveals each side's IP address to the other. That is inherent to peer-to-peer without a relay.

## Security summary

| Layer | Measure |
|-------|---------|
| Identity | Secret token per session, hashed at rest, sent in a header |
| Authorisation | Server-side connection state decides which signals are relayed |
| Input | Coordinates range-checked, ids must be UUIDs, mood from a fixed list, payload JSON and size limits |
| Abuse | Join limited per IP (in memory), request and wave cooldowns, mailbox cap |
| Browser | CSP, no framing, no sniffing, no referrer, permissions limited to location / camera / microphone |
| Peer data | Data-channel messages validated and length capped; text rendered by React, never as HTML |

## Running and testing

```bash
npm install            # also generates the Prisma client
cp .env.example .env   # fill in DATABASE_URL and NEXT_PUBLIC_MAPBOX_TOKEN
npx prisma db push     # create the tables
npm run dev
npm run smoke          # 13 API checks against localhost:3000
```

To try it as two people, open two browser windows (one normal, one private), set a different mock location in each (DevTools → Sensors), enter in both and tap the other dot.

## Deployment

- Vercel builds with `prisma generate && prisma migrate deploy && next build`, so the schema is always applied before the new code serves traffic.
- Environment variables: `DATABASE_URL` (pooled Postgres URL), `NEXT_PUBLIC_MAPBOX_TOKEN`. If `DATABASE_URL_UNPOOLED` exists (Neon provides it) migrations use that direct connection.
- No other services are needed.

## Limits and what would change at scale

- **Polling** costs one request per user every 1.5 s, and each poll also does the cleanup. Fine for hundreds of users. Beyond that: move cleanup to a scheduled job and only return dots inside the visible map area.
- **Dots are DOM elements.** Past a few thousand, switch to a clustered map layer.
- **Rate limiting is per server instance.** A shared store (Redis) or the platform firewall would make it firm.
- **No TURN server**, so some networks cannot connect.
