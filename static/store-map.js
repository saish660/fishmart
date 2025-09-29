// Store page map initializer
// Shows store location using saved lat/lng when available.
// If missing, geocodes (Nominatim) using stored address/city.
(function () {
  const el = document.getElementById("store-map");
  if (!el || !window.L) return;

  const name = el.dataset.name || "Store";
  const addr = el.dataset.address || "";
  const city = el.dataset.city || "";
  const latRaw = el.dataset.lat;
  const lngRaw = el.dataset.lng;

  const readLat = document.getElementById("store-lat");
  const readLng = document.getElementById("store-lng");
  const readAddr = document.getElementById("store-address");
  const note = document.getElementById("store-map-note");
  const osmLink = document.getElementById("open-osm-link");

  const DEFAULT_CENTER = [20, 0];
  const DEFAULT_ZOOM = 2;
  const map = L.map("store-map", { worldCopyJump: true }).setView(
    DEFAULT_CENTER,
    DEFAULT_ZOOM
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  let marker = L.marker(DEFAULT_CENTER).addTo(map);

  function updateReadout(lat, lng, addressText) {
    if (lat != null) readLat.textContent = Number(lat).toFixed(6);
    if (lng != null) readLng.textContent = Number(lng).toFixed(6);
    if (addressText) readAddr.textContent = addressText;
    if (lat != null && lng != null && osmLink) {
      osmLink.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
    }
  }

  function setMarker(lat, lng, addressText) {
    const ll = L.latLng(lat, lng);
    marker.setLatLng(ll);
    map.setView(ll, 15, { animate: true });
    marker
      .bindPopup(`<strong>${name}</strong><br/>${addressText || ""}`)
      .openPopup();
    updateReadout(lat, lng, addressText);
  }

  async function geocodeAddress(q) {
    if (!q) return null;
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      const resp = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          label: data[0].display_name,
        };
      }
    } catch (e) {
      console.warn(e);
    }
    return null;
  }

  (async function init() {
    // This script only runs if the map element exists, which is handled by the template.
    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);

    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      setMarker(lat, lng, addr || `${name}, ${city}`);
      return;
    }

    // Fallback to geocoding is removed as the map will not be shown
    // if lat/lng are not present.
    note.textContent = "Location data is not available for this store.";
    updateReadout(undefined, undefined, addr || city || "");
  })();
})();
