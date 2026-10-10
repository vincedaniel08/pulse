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
