"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";
import { dotColor } from "@/lib/color";
import { VIBES } from "@/lib/vibes";
import { greatCircle } from "@/lib/geo";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Degrees per second the globe drifts while nobody is touching it.
const SPIN_SPEED = 3;

const EMPTY_LINE = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: [] as number[][] },
};

export default function WorldMap({
  peers,
  me,
  linkedPeerId,
  waveFrom,
  onPeerClick,
  canConnect,
}: {
  peers: PeerDot[];
  // Null until the user has joined. Until then the globe just spins.
  me: { lat: number; lng: number } | null;
  // Draws an arc from me to this peer (pending request or live connection).
  linkedPeerId: string | null;
  // Latest wave we received; `at` changes each time so repeat waves replay.
  waveFrom: { id: string; at: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxRef = useRef<typeof import("mapbox-gl").default | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  // Map callbacks are bound once, so they read live props through refs
  // (synced in an effect, never during render).
  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  const spinRef = useRef(true);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
    spinRef.current = me === null;
  });

  // Initialise the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      mapboxRef.current = mapboxgl;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        projection: "globe",
        center: [20, 20],
        zoom: 1.6,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
      mapRef.current = map;
      // Keep the globe clear of the entry panel on wide screens.
      if (window.innerWidth >= 640) map.setPadding({ left: 400, top: 0, right: 0, bottom: 0 });

      // Drift the globe one second at a time; each finished step queues the
      // next, and any user gesture simply interrupts it.
      const spin = () => {
        if (!spinRef.current || map.isMoving()) return;
        const center = map.getCenter();
        center.lng -= SPIN_SPEED;
        map.easeTo({ center, duration: 1000, easing: (t) => t });
      };
      map.on("moveend", spin);

      map.on("style.load", () => {
        map.setFog({
          color: "rgb(16, 16, 20)",
          "high-color": "rgb(60, 70, 110)",
          "horizon-blend": 0.03,
          "space-color": "rgb(9, 9, 11)",
          "star-intensity": 0.35,
        });
        map.addSource("link", { type: "geojson", data: EMPTY_LINE });
        map.addLayer({
          id: "link-glow",
          type: "line",
          source: "link",
          layout: { "line-cap": "round" },
          paint: { "line-color": "#ff5a36", "line-width": 6, "line-opacity": 0.15, "line-blur": 4 },
        });
        map.addLayer({
          id: "link",
          type: "line",
          source: "link",
          layout: { "line-cap": "round" },
          paint: { "line-color": "#ff8f73", "line-width": 1.5, "line-dasharray": [1, 2.5] },
        });
        if (!cancelled) setReady(true);
        spin();
      });
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Once we know where the user is: stop drifting, fly there, drop their pin.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl || !ready || !me) return;

    if (!meMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "dot dot-me";
      el.title = "Your dot, as others see it";
      el.innerHTML = "<span>You</span>";
      meMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([me.lng, me.lat])
        .addTo(map);
      map.flyTo({
        center: [me.lng, me.lat],
        zoom: 3,
        padding: { left: 0, top: 0, right: 0, bottom: 0 },
        duration: 2400,
        essential: true,
      });
    } else {
      meMarkerRef.current.setLngLat([me.lng, me.lat]);
    }
  }, [me, ready]);

  // Reconcile markers whenever the peer list changes (or the map becomes ready).
  // ponytail: one DOM marker per peer is fine for hundreds of dots; past a few
  // thousand, switch to a clustered GeoJSON circle layer.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl || !ready) return;
    const markers = markersRef.current;
    const seen = new Set<string>();

    for (const peer of peers) {
      seen.add(peer.id);
      let marker = markers.get(peer.id);
      if (!marker) {
        const el = document.createElement("button");
        el.className = "dot";
        el.style.setProperty("--c", dotColor(peer.id));
        if (peer.vibe) el.title = VIBES[peer.vibe];
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (canConnectRef.current) onPeerClickRef.current(peer.id);
        });
        marker = new mapboxgl.Marker({ element: el })
          .setLngLat([peer.lng, peer.lat])
          .addTo(map);
        markers.set(peer.id, marker);
      }
      const el = marker.getElement();
      el.dataset.busy = String(peer.busy);
      el.setAttribute(
        "aria-label",
        peer.busy ? "Stranger, in a conversation" : "Stranger, tap for details",
      );
    }

    // Drop markers for peers that went offline.
    for (const [id, marker] of markers) {
      if (!seen.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }
  }, [peers, ready]);

  // Ripple the dot that just waved at us.
  useEffect(() => {
    if (!waveFrom) return;
    const el = markersRef.current.get(waveFrom.id)?.getElement();
    if (!el) return;
    el.dataset.waving = "true";
    const timer = setTimeout(() => delete el.dataset.waving, 2800);
    return () => clearTimeout(timer);
  }, [waveFrom]);

  // The arc between me and whoever I'm reaching for / talking to.
  const linked = peers.find((p) => p.id === linkedPeerId);
  const linkLat = linked?.lat;
  const linkLng = linked?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource<GeoJSONSource>("link");
    if (!source) return;

    if (!me || linkLat === undefined || linkLng === undefined) {
      source.setData(EMPTY_LINE);
      return;
    }
    const coordinates = greatCircle(me, { lat: linkLat, lng: linkLng });
    source.setData({ ...EMPTY_LINE, geometry: { type: "LineString", coordinates } });

    // Bring both ends into view, leaving room for the chat panel on the right.
    const lngs = coordinates.map((c) => c[0]);
    const lats = coordinates.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      {
        padding: { top: 120, bottom: 260, left: 80, right: window.innerWidth >= 640 ? 440 : 80 },
        maxZoom: 5,
        duration: 1400,
      },
    );
  }, [me, linkLat, linkLng, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-ink" />

      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="surface max-w-md rounded-xl p-5 text-sm text-zinc-200">
            Set <code className="text-pulse-soft">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
            in <code>.env</code> to load the map.
          </p>
        </div>
      )}
    </div>
  );
}
