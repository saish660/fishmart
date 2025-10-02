// Leaflet Location Picker for Fisherman Signup
// Requirements implemented:
// - Leaflet map with OSM tiles
// - Detect My Location (Geolocation API)
// - Draggable marker
// - Search autocomplete using Nominatim (with optional Photon fallback)
// - Reverse geocoding on marker move or geolocate
// - Live display of lat/lng/address and hidden inputs for form submission

(function () {
  const MAP_ID = "shop-map";
  const latInput = document.getElementById("latitude");
  const lngInput = document.getElementById("longitude");
  const addrInputHidden = document.getElementById("address");
  const addrSearch = document.getElementById("addressSearch");
  const addrDatalist = document.getElementById("addressSuggestions");
  const detectBtn = document.getElementById("detectLocationBtn");
  const readLat = document.getElementById("current-lat");
  const readLng = document.getElementById("current-lng");
  const readAddr = document.getElementById("current-address");

  // If the page doesn't have the location picker section, bail
  const mapEl = document.getElementById(MAP_ID);
  if (!mapEl || !window.L) return;

  // Default view: world/country level
  const DEFAULT_CENTER = [20.0, 0.0]; // near equator, global view
  const DEFAULT_ZOOM = 2;

  // Create map
  const map = L.map(MAP_ID, {
    worldCopyJump: true,
  }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  // Add OSM tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Create a draggable marker; hidden until we know a position
  let marker = L.marker(DEFAULT_CENTER, { draggable: true, autoPan: true });
  let markerAdded = false;

  function showMarker(lat, lng) {
    const latLng = L.latLng(lat, lng);
    if (!markerAdded) {
      marker.setLatLng(latLng).addTo(map);
      markerAdded = true;
    } else {
      marker.setLatLng(latLng);
    }
  }

  function setReadout(lat, lng, addressText) {
    if (lat != null) {
      readLat.textContent = Number(lat).toFixed(6);
      latInput.value = String(lat);
    }
    if (lng != null) {
      readLng.textContent = Number(lng).toFixed(6);
      lngInput.value = String(lng);
    }
    if (addressText) {
      readAddr.textContent = addressText;
      addrInputHidden.value = addressText;
      // Optionally sync visible storeLocation if present
      const storeLocation = document.getElementById("storeLocation");
      if (storeLocation && !storeLocation.value) {
        storeLocation.value = addressText;
      }
    }
  }

  // Reverse geocode using Nominatim
  async function reverseGeocode(lat, lng) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("lat", lat);
      url.searchParams.set("lon", lng);
      url.searchParams.set("zoom", "18");
      url.searchParams.set("addressdetails", "1");
      const resp = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      });
      if (!resp.ok) throw new Error("Reverse geocoding failed");
      const data = await resp.json();
      return data.display_name || "";
    } catch (e) {
      console.warn(e);
      return "";
    }
  }

  // Search autocomplete via Nominatim search endpoint
  let searchController = null;
  async function searchPlaces(q) {
    if (!q || q.trim().length < 3) return [];
    try {
      if (searchController) searchController.abort();
      searchController = new AbortController();
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "8");
      const resp = await fetch(url.toString(), {
        signal: searchController.signal,
        headers: {
          Accept: "application/json",
        },
      });
      if (!resp.ok) throw new Error("Search failed");
      const data = await resp.json();
      return (data || []).map((item) => ({
        label: item.display_name,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      }));
    } catch (e) {
      if (e.name !== "AbortError") console.warn(e);
      return [];
    }
  }

  function fitMapTo(lat, lng) {
    const latLng = L.latLng(lat, lng);
    map.setView(latLng, 15, { animate: true });
    showMarker(lat, lng);
  }

  // Allow placing/moving the marker by clicking on the map
  map.on("click", async (e) => {
    const { lat, lng } = e.latlng;
    showMarker(lat, lng);
    setReadout(lat, lng, "");
    const addr = await reverseGeocode(lat, lng);
    setReadout(undefined, undefined, addr);
  });

  // Marker drag -> update lat/lng + reverse geocode
  marker.on("moveend", async (ev) => {
    const { lat, lng } = ev.target.getLatLng();
    setReadout(lat, lng, "");
    const addr = await reverseGeocode(lat, lng);
    setReadout(undefined, undefined, addr);
  });

  // Detect my location
  if (detectBtn) {
    detectBtn.addEventListener("click", () => {
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
            fitMapTo(lat, lng);
            const addr = await reverseGeocode(lat, lng);
            setReadout(lat, lng, addr);
          },
          (err) => {
            console.warn(err);
            alert(
              "Unable to detect location. You can search or set the marker manually."
            );
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        )
        .finally(() => {
          detectBtn.disabled = false;
          detectBtn.textContent = "Detect My Location";
        });
    });
  }

  // Datalist-based autocomplete
  let datalistItems = [];
  let lastQuery = "";
  function updateDatalist(items) {
    datalistItems = items || [];
    addrDatalist.innerHTML = "";
    for (let i = 0; i < datalistItems.length; i++) {
      const opt = document.createElement("option");
      opt.value = datalistItems[i].label;
      addrDatalist.appendChild(opt);
    }
  }

  let typingTimer = null;
  const TYPING_DELAY = 250;
  if (addrSearch) {
    addrSearch.addEventListener("input", (e) => {
      const q = e.target.value;
      if (q === lastQuery) return;
      lastQuery = q;
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(async () => {
        const results = await searchPlaces(q);
        updateDatalist(results);
      }, TYPING_DELAY);
    });

    // When user selects an option or presses Enter
    addrSearch.addEventListener("change", async (e) => {
      const value = e.target.value;
      const match = datalistItems.find((x) => x.label === value);
      if (match) {
        fitMapTo(match.lat, match.lon);
        setReadout(match.lat, match.lon, match.label);
      } else if (value && value.length > 2) {
        // If they typed a freeform value, try geocoding it directly
        const results = await searchPlaces(value);
        if (results.length > 0) {
          const best = results[0];
          fitMapTo(best.lat, best.lon);
          setReadout(best.lat, best.lon, best.label);
        }
      }
    });
  }

  // Initialize readout if hidden inputs pre-filled (e.g., form re-render)
  (function initFromInputs() {
    const lat = parseFloat(latInput?.value);
    const lng = parseFloat(lngInput?.value);
    const addr = addrInputHidden?.value;
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      fitMapTo(lat, lng);
      setReadout(lat, lng, addr || "");
    }
  })();
})();
