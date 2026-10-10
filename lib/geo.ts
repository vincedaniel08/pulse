// Privacy offset: move a real coordinate 1–3 km in a random direction so the
// dot is placed *near* the user, never at their exact location. A fresh random
// offset is generated each session (this runs once per join), so the same user
// lands somewhere different every time.

const KM_PER_DEG_LAT = 111.32;

export function applyPrivacyOffset(
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  const distanceKm = 1 + Math.random() * 2; // 1–3 km
  const bearing = Math.random() * 2 * Math.PI; // random direction

  const dLat = (distanceKm * Math.cos(bearing)) / KM_PER_DEG_LAT;
  const latRad = (lat * Math.PI) / 180;
  const dLng =
    (distanceKm * Math.sin(bearing)) /
    (KM_PER_DEG_LAT * Math.cos(latRad) || KM_PER_DEG_LAT);

  return {
    lat: clamp(lat + dLat, -90, 90),
    lng: wrapLng(lng + dLng),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrapLng(lng: number): number {
  // Keep longitude in [-180, 180].
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

type LatLng = { lat: number; lng: number };

// Points along the shortest path over the globe from a to b, as [lng, lat]
// pairs for a GeoJSON LineString. Longitudes are kept continuous (they may
// run past ±180) so the line doesn't jump across the map at the antimeridian.
export function greatCircle(a: LatLng, b: LatLng, steps = 64): [number, number][] {
  const lat1 = toRad(a.lat);
  const lng1 = toRad(a.lng);
  const lat2 = toRad(b.lat);
  const lng2 = toRad(b.lng);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
      ),
    );
  if (d === 0) return [[a.lng, a.lat]];

  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const p = Math.sin((1 - f) * d) / Math.sin(d);
    const q = Math.sin(f * d) / Math.sin(d);
    const x = p * Math.cos(lat1) * Math.cos(lng1) + q * Math.cos(lat2) * Math.cos(lng2);
    const y = p * Math.cos(lat1) * Math.sin(lng1) + q * Math.cos(lat2) * Math.sin(lng2);
    const z = p * Math.sin(lat1) + q * Math.sin(lat2);

    let lng = toDeg(Math.atan2(y, x));
    const prev = points[points.length - 1];
    if (prev) {
      while (lng - prev[0] > 180) lng -= 360;
      while (lng - prev[0] < -180) lng += 360;
    }
    points.push([lng, toDeg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return points;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// "Nearby", "~340 km away", "~8,400 km away". Deliberately vague: both dots
// are already fuzzed by up to 3 km, so more digits would be false precision.
export function describeDistance(km: number): string {
  if (km < 50) return "Nearby";
  const step = km < 1000 ? 10 : 100;
  return `~${(Math.round(km / step) * step).toLocaleString("en-US")} km away`;
}

// What part of the day it is at a longitude.
// ponytail: this is solar time (15° per hour), not the legal time zone, so it
// can be an hour or two off. Good enough for "it's the middle of the night
// there"; an exact clock would need a time zone lookup for each coordinate.
export function describeTimeOfDay(lng: number, now = new Date()): string {
  const utc = now.getUTCHours() + now.getUTCMinutes() / 60;
  const hour = (((utc + lng / 15) % 24) + 24) % 24;
  if (hour < 5) return "Middle of the night there";
  if (hour < 8) return "Early morning there";
  if (hour < 12) return "Morning there";
  if (hour < 17) return "Afternoon there";
  if (hour < 21) return "Evening there";
  return "Late night there";
}
