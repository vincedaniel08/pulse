# Pulse — Notes

- Live: https://pulse-vincedaniel.vercel.app
- Repo: https://github.com/vincedaniel08/pulse
- Commits are prefixed `[HOTFIX]` (a fix) or `[FEAT]` (new behaviour), one concern each.
- `npm run smoke` runs an end-to-end check of the API (13 cases) against `localhost:3000`, or against any deploy with `BASE_URL=...`.

## Phase 1 — Make it run

How I looked: read the request path end to end (gate → join → poll → signal → WebRTC) before changing anything, then wrote down every place where the code disagreed with its own comments or with `docs/requirements.md`.

| # | Symptom | Cause | Fix |
|---|---------|-------|-----|
| 1 | Dots never disappear (the README example) | The poll heartbeat ran `updateMany({ where: {} })`, so every poll refreshed `lastSeen` for **all** rows and nothing could go stale | Scope the heartbeat to the caller |
| 2 | Chat messages never arrive | Sender tagged messages `"msg"`, receiver only handled `"chat"` | Use `"chat"` on both sides |
| 3 | Stuck on "Connecting…" | Early ICE candidates were flushed **before** `setRemoteDescription`, where `addIceCandidate` rejects; the error was swallowed | Flush after the remote description is set |
| 4 | After one chat, both users are un-connectable forever | `end` never cleared `busy`; `decline` did, which also un-busied someone mid-chat | `end` frees the pair, `decline` leaves the flag alone |
| 5 | Other side stays in a dead chat when you close the tab | `leave` only deletes your own row; the peer got no signal | Client ends the connection when its peer drops out of the poll list |
| 6 | Fresh clone crashes on first API call | `prisma generate` only ran in `build`, not for `npm run dev` | `postinstall: prisma generate` |
| 7 | Blank map with no hint when the token is missing | A fake hardcoded fallback token made the "set your token" message unreachable | Removed the fallback (and a stale ngrok dev origin) |
| 8 | Invisible "ghost" users | `join()` ignored the HTTP result; a tab that slept in the background was reaped and then polled forever without a row | `join` throws and the gate shows it; poll returns 410 and the client rejoins |
| 9 | "Me" pin sat on the real coordinates | The client pinned the raw GPS fix, not the offset dot others see | `join` returns the offset position and the pin uses it |
| 10 | Unhandled rejections during negotiation | Offer / answer / ICE from one poll batch were applied concurrently | Signals go through a promise queue in `PeerSession` |

## Phase 2 — Make it good

Idea: the product is "a living globe", so the globe should be the interface, not a background behind modals.

- **Globe first.** Mapbox globe projection with atmosphere and stars, mounted from first paint. It drifts slowly behind the entry card, then flies to your dot when you join.
- **The connection is drawn.** A great-circle arc links you to the person you are asking or talking to, and the camera frames both ends. It makes "talking to someone 8,000 km away" visible.
- **Entry card earns the permission prompt.** Three short promises (fuzzy location, peer-to-peer, nothing kept) before the browser asks for location, and a useful message if it is denied.
- **Nothing blocks the map.** Incoming requests are a floating card with a 30 s countdown bar (same timeout the requester has). Pending request is a pill with Cancel.
- **Chat** floats on desktop and is full screen on phones: grouped bubbles, typing indicator (sent over the data channel, so still nothing on the server), autofocus, safe-area padding.
- **Video**: mute and camera toggles, mirrored self view, "direct call, not recorded" label.
- **System**: one accent colour on near-black blues, one `glass` surface, Geist (it was loaded but overridden by Arial), 40 px touch targets on dots, focus rings, `aria-live` regions, `prefers-reduced-motion` respected.
- Each stranger gets a stable colour from their id, reused for their dot, prompt and chat avatar.

Trade-off: dots are DOM markers, which is fine for hundreds. Past a few thousand I would move to a clustered GeoJSON layer (marked in `WorldMap.tsx`).

## Phase 3 — Make it secure

Ranked by what an attacker gets for the least effort.

| Rank | Issue | Status |
|------|-------|--------|
| 1 | **The session id was the credential, and poll hands every id to every client.** Anyone could read another user's mailbox (their SDP/ICE, so their IP), signal as them, move their dot, or delete their session | **Fixed.** Server issues a public id plus a random secret token on join and stores only its SHA-256. `poll`, `signal`, `leave` need `Authorization: Bearer <id>.<token>`; the sender is taken from the token, never the body. Token is out of the URL |
| 2 | **Signal relay had no rules.** Forge an `accept` to mark two strangers busy, push SDP at anyone, end other people's calls | **Fixed.** Presence tracks `requestedId` / `peerId`; each signal type is only relayed when it is a legal move between those two sessions. Accept is one conditional update, so two simultaneous accepts cannot both win |
| 3 | **Mailbox / payload flooding.** 64 KB of anything, unlimited messages, to any id | **Fixed.** Handshake payloads must be JSON ≤ 16 KB, other types carry none, max 100 undelivered signals per sender per mailbox, 2 s request cooldown |
| 4 | **Unlimited anonymous joins** (fill the map with fake dots) | **Mitigated.** 10 joins / minute / IP, in memory. Per-instance on serverless, so best effort; see below |
| 5 | **Untrusted peer data in the browser.** Chat and control messages come from a stranger's client | **Fixed.** Length cap, type checks, allow-list of control values. Text is rendered by React, never as HTML |
| 6 | **No security headers** on a page that uses location, camera and mic | **Fixed.** CSP (self + Mapbox), `frame-ancestors 'none'`, nosniff, no-referrer, Permissions-Policy limited to the three features, `no-store` on the API |
| 7 | Hardcoded token in source, leftover ngrok origin | **Removed** |

Known and not fixed:

- **Rate limiting is not durable.** The brief rules out external services. With one allowed I would put join and poll behind Upstash or the Vercel firewall.
- **Averaging attack on the privacy offset.** A fresh random 1–3 km offset per session is what the requirements ask for, but someone who watches the same user rejoin many times can average the dots towards the real spot. Fix would be a per-device stable offset or snapping to a coarse grid first; both change the stated requirement, so I left it and am flagging it.
- **WebRTC exposes IP addresses to the peer** once connected. Inherent to peer-to-peer without a TURN relay; the UI says "direct".
- **Poll does writes on a GET and reaps on every request.** Fine at this size; at scale reaping moves to a cron.
- CSP still needs `'unsafe-inline'` for Next's bootstrap scripts; nonces would force dynamic rendering of the page.

## Phase 4 — Make it better

**What:** dots stop being anonymous pixels. Tapping one opens a card instead of firing a request blind.

- **Mood.** Pick one of six presets on the way in ("Can't sleep", "Talk music"…). It rides on your dot as a small badge and headlines your card.
- **Context.** The card shows roughly how far away the person is and what part of the day it is for them ("~8,400 km away · Middle of the night there").
- **Wave.** A hello that asks for nothing back. Their map ripples on your dot and they can wave back in one tap.
- **Hide.** Remove someone's dot and drop their requests and waves for the rest of your session. On the card and inside a chat.
- **Blurred-first video.** A stranger's camera opens blurred; you choose when to look and can re-blur.

**Why:** the hard part of talking to strangers is the first tap. A blank dot gives no reason to pick it and no idea what you will get. Mood + distance + time of day gives a reason; a wave gives a step smaller than a full request; blur and hide make saying yes less risky. Alive and safe turned out to be the same problem.

Decisions:

- **Presets, not free text.** Free text on an anonymous map needs moderation. Six fixed values need none and the server rejects anything else.
- **Hide is local, in memory.** There are no accounts to attach a server block to, and a stored block list would break "nothing persists". The server still rate limits what a hidden person can send.
- **Blur is on the viewer's side**, so it protects the viewer without trusting the sender.
- **Time of day is solar time from longitude**, not a time zone lookup. It can be an hour or two off, so the UI says "evening there", not "7:42 pm".
- **This costs one extra tap to connect**, which departs from "tapping a dot sends a request". I think informed consent is worth one tap, and it also stops accidental requests on a crowded map.

With more time:

- Match by mood: filter the globe to people in the same mood, or "surprise me".
- Report alongside hide, with a short-lived server-side strike count per session.
- TURN fallback so strict networks can connect.
- Day/night terminator on the globe, and a subtle sound for waves.
- Component tests for the client state machine; today only the API has an automated check.

## Assumptions

- One Postgres database for local and production is acceptable, since every row is transient.
- `prisma migrate deploy` runs in the Vercel build. Local setup from the README (`prisma db push`) still works.
