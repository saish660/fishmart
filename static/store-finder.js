// Store Finder: plots all stores on Leaflet map, supports search/geolocate, filters by radius, and renders cards.
(function () {
  const mapEl = document.getElementById("stores-map");
  if (!mapEl || !window.L) return;

  const searchInput = document.getElementById("finder-search");
  const suggestions = document.getElementById("finderSuggestions");
  const detectBtn = document.getElementById("finder-detect");
  const radiusSel = document.getElementById("radius");
  const cardsEl = document.getElementById("store-cards");
  const centerLat = document.getElementById("center-lat");
  const centerLng = document.getElementById("center-lng");
  const centerAddr = document.getElementById("center-addr");

  let stores = [];
  try {
    stores = JSON.parse(mapEl.dataset.stores || "[]") || [];
  } catch (e) {
    stores = [];
  }

  const DEFAULT_CENTER = [20, 0];
  const DEFAULT_ZOOM = 2;
  const map = L.map("stores-map", { worldCopyJump: true }).setView(
    DEFAULT_CENTER,
    DEFAULT_ZOOM
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const markers = [];
  const group = L.featureGroup().addTo(map);

  function setCenterReadout(lat, lng, addr) {
    if (lat != null) centerLat.textContent = Number(lat).toFixed(6);
    if (lng != null) centerLng.textContent = Number(lng).toFixed(6);
    if (addr) centerAddr.textContent = addr;
  }

  function haversineKm(aLat, aLng, bLat, bLng) {
    function toRad(d) {
      return (d * Math.PI) / 180;
    }
    const R = 6371;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const A =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(aLat)) *
        Math.cos(toRad(bLat)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
    return R * c;
  }

  async function reverseGeocode(lat, lng) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", lat);
      url.searchParams.set("lon", lng);
      url.searchParams.set("zoom", "14");
      url.searchParams.set("addressdetails", "1");
      const resp = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return "";
      const data = await resp.json();
      return data.display_name || "";
    } catch {
      return "";
    }
  }

  let searchController = null;
  async function searchPlaces(q) {
    if (!q || q.trim().length < 3) return [];
    try {
      if (searchController) searchController.abort();
      searchController = new AbortController();
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "8");
      url.searchParams.set("addressdetails", "1");
      const resp = await fetch(url.toString(), {
        signal: searchController.signal,
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data || []).map((x) => ({
        label: x.display_name,
        lat: parseFloat(x.lat),
        lon: parseFloat(x.lon),
      }));
    } catch (e) {
      if (e.name !== "AbortError") console.warn(e);
      return [];
    }
  }

  function updateSuggestions(items) {
    suggestions.innerHTML = "";
    items.forEach((it) => {
      const opt = document.createElement("option");
      opt.value = it.label;
      suggestions.appendChild(opt);
    });
  }

  function clearMarkers() {
    group.clearLayers();
    markers.length = 0;
  }

  function addStoreMarker(s) {
    if (!(s.lat != null && s.lng != null)) return null;
    const m = L.marker([s.lat, s.lng]);
    const popup = `
      <div style="min-width:180px">
        <strong>${s.name || "Store"}</strong><br/>
        ${(s.address || s.location || s.city || "").toString()}<br/>
        ${s.rating ? `${s.rating}/5 ⭐ (${s.reviews || 0})<br/>` : ""}
        <a href="/store/${s.id}">View Store</a>
      </div>`;
    m.bindPopup(popup);
    m.addTo(group);
    markers.push(m);
    return m;
  }

  function renderCards(list, center) {
    cardsEl.innerHTML = "";
    if (!list || list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "no-products";
      empty.innerHTML = "<p>No stores found in this area.</p>";
      cardsEl.appendChild(empty);
      return;
    }
    list.forEach((s) => {
      const card = document.createElement("div");
      card.className = "product-card";
      card.addEventListener("click", () => {
        window.location.href = `/store/${s.id}`;
      });
      const distKm =
        center && s.lat != null && s.lng != null
          ? haversineKm(center.lat, center.lng, s.lat, s.lng)
          : null;
      card.innerHTML = `
        <div class="product-content">
          <h3 class="product-title">${s.name || "Store"}</h3>
          <div class="store-meta">
            ${(s.address || s.location || "").toString()} ${
        s.city ? `, ${s.city}` : ""
      }
          </div>
          ${
            s.rating
              ? `<div class="store-meta">Rating: ${s.rating}/5 (${
                  s.reviews || 0
                } reviews)</div>`
              : ""
          }
          <div class="store-meta">Products: ${s.product_count || 0}</div>
          ${
            distKm != null
              ? `<div class="distance-chip">~${distKm.toFixed(1)} km away</div>`
              : ""
          }
        </div>`;
      cardsEl.appendChild(card);
    });
  }

  function applyFilter(center, radiusKm) {
    clearMarkers();
    let list = stores.slice();
    if (center && radiusKm > 0) {
      list = list.filter(
        (s) =>
          s.lat != null &&
          s.lng != null &&
          haversineKm(center.lat, center.lng, s.lat, s.lng) <= radiusKm
      );
    }
    // Add markers and fit bounds
    let bounds = [];
    list.forEach((s) => {
      const m = addStoreMarker(s);
      if (m) bounds.push(m.getLatLng());
    });
    if (bounds.length > 0) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [20, 20] });
    }
    renderCards(list, center);
  }

  let typingTimer = null;
  const TYPING_DELAY = 250;
  let lastResults = [];
  searchInput?.addEventListener("input", (e) => {
    const q = e.target.value;
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(async () => {
      lastResults = await searchPlaces(q);
      updateSuggestions(lastResults);
    }, TYPING_DELAY);
  });

  searchInput?.addEventListener("change", async (e) => {
    const value = e.target.value;
    const match = lastResults.find((x) => x.label === value);
    if (match) {
      const { lat, lon } = match;
      setCenterReadout(lat, lon, match.label);
      map.setView([lat, lon], 13, { animate: true });
      applyFilter({ lat, lng: lon }, parseFloat(radiusSel.value || "0"));
    }
  });

  detectBtn?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    detectBtn.disabled = true;
    detectBtn.textContent = "Detecting…";
    navigator.geolocation
      .getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          const addr = await reverseGeocode(lat, lng);
          setCenterReadout(lat, lng, addr);
          map.setView([lat, lng], 13, { animate: true });
          applyFilter({ lat, lng }, parseFloat(radiusSel.value || "0"));
        },
        (err) => {
          console.warn(err);
          alert("Unable to detect your location.");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
      .finally(() => {
        detectBtn.disabled = false;
        detectBtn.textContent = "Use My Location";
      });
  });

  radiusSel?.addEventListener("change", () => {
    const lat = parseFloat(centerLat.textContent);
    const lng = parseFloat(centerLng.textContent);
    const hasCenter = !Number.isNaN(lat) && !Number.isNaN(lng);
    applyFilter(
      hasCenter ? { lat, lng } : null,
      parseFloat(radiusSel.value || "0")
    );
  });

  // Initial: add markers for all stores and fit bounds, then render all cards
  applyFilter(null, 0);
})();
