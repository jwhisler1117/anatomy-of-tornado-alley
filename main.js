// --- Constants ----------------------------------------------------

const MIN_YEAR = 1950;
const MAX_YEAR = 2025;

// --- 1. Map setup -------------------------------------------------

// Paste your token here:
mapboxgl.accessToken =
  "pk.eyJ1IjoiandoaXNsZXIxMTE3IiwiYSI6ImNtaHRrYWZzdzF6YmwycnEwMmVxeGU5cHYifQ.yp1rbNFWqnbk_1kfoRJKQw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-96, 37], // US center
  zoom: 3.5,
});

let tornadoData = null;

// --- 2. Load GeoJSON and add layers -------------------------------

// --- 2. Load GeoJSON and add layers -------------------------------

Promise.all([d3.json("data/tornado_points.geojson")]).then(([geojson]) => {
  tornadoData = geojson;

  map.on("load", () => {
    map.addSource("tornadoes", {
      type: "geojson",
      data: tornadoData,
    });

    // Heatmap: density of tornadoes, slightly weighted by EF
    map.addLayer({
      id: "tornado-heat",
      type: "heatmap",
      source: "tornadoes",
      maxzoom: 8,
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "ef"], 0],
          0, 0.1,
          5, 1
        ],
        "heatmap-intensity": 1.2,
        "heatmap-radius": 20,
        "heatmap-opacity": 0.85
      }
    });

    // Circle layer for individual tornadoes (EF rating shown by color)
    map.addLayer({
      id: "tornado-points",
      type: "circle",
      source: "tornadoes",
      minzoom: 5,
      paint: {
        "circle-radius": 3,
        "circle-opacity": 0.75,
        "circle-stroke-width": 0.4,
        "circle-stroke-color": "#000",
        "circle-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "ef"], 0],
          0, "#88c0ff", // EF0
          1, "#60a5fa", // EF1
          2, "#4ade80", // EF2
          3, "#facc15", // EF3
          4, "#fb923c", // EF4
          5, "#ef4444"  // EF5
        ]
      }
    });

  // --- Hover tooltip for tornado points ---
// One reusable popup

const hoverPopup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false,
  className: "tornado-tooltip" // optional: for custom CSS styling
});

let isHoveringTornado = false;

map.on("mousemove", (e) => {
  // Hitbox around cursor so it's not too finicky
  const bbox = [
    [e.point.x - 12, e.point.y - 12],
    [e.point.x + 12, e.point.y + 12]
  ];

  const features = map.queryRenderedFeatures(bbox, {
    layers: ["tornado-points"]
  });

  if (!features.length) {
    if (isHoveringTornado) {
      map.getCanvas().style.cursor = "";
      hoverPopup.remove();
      isHoveringTornado = false;
    }
    return;
  }

  const f = features[0];
  const p = f.properties;
  const coords = f.geometry.coordinates.slice();

  const efText =
    p.ef_display && p.ef_display !== "Unknown"
      ? p.ef_display
      : "Unknown";

  const windText =
    p.wind_low != null && p.wind_high != null && p.wind_low !== "null" && p.wind_high !== "null"
      ? `${p.wind_low}–${p.wind_high} mph`
      : "Unknown";

  const dateText =
    p.date && p.date !== "NaT" && p.date !== "null"
      ? p.date
      : "Unknown";

  const lengthText =
    p.length_miles != null && p.length_miles !== "null"
      ? `${Number(p.length_miles).toFixed(1)} mi`
      : "Unknown";

  const widthText =
    p.width_yards != null && p.width_yards !== "null"
      ? `${Math.round(Number(p.width_yards))} yd`
      : "Unknown";

  const html = `
    <strong>${p.state}</strong><br/>
    Date: ${dateText}<br/>
    EF: ${efText}<br/>
    Wind speed: ${windText}<br/>
    Distance traveled: ${lengthText}<br/>
    Max width: ${widthText}<br/>
    Injuries: ${p.injuries}<br/>
    Deaths: ${p.deaths}<br/>
    Damage: ${p.damage_property}
  `;

  map.getCanvas().style.cursor = "pointer";
  isHoveringTornado = true;

  hoverPopup
    .setLngLat(coords)
    .setHTML(html)
    .addTo(map);
});


    // hook up slider / EF filters / play button
    setupControls();
  });
});




// --- 3. Controls: slider + input + play/pause + EF filter ---------

function setupControls() {
  const slider = document.getElementById("year-slider");
  const label = document.getElementById("year-label");
  const yearInput = document.getElementById("year-input");
  const playBtn = document.getElementById("play-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const efContainer = document.getElementById("ef-filters");

  let playInterval = null;

  function getSelectedEFs() {
    const checked = Array.from(
      efContainer.querySelectorAll('input[type="checkbox"]:checked')
    );
    return checked.map((c) => Number(c.value));
  }

  function updateFilters() {
    const year = Number(slider.value);
    label.textContent = year;
    yearInput.value = year; // keep number input synced

    const selectedEFs = getSelectedEFs();

    const yearFilter = ["==", ["get", "year"], year];

    let efFilter;
    if (selectedEFs.length === 0) {
      // Hide everything if no EF bins selected
      efFilter = ["==", ["get", "ef"], -999];
    } else {
      const clauses = selectedEFs.map((v) => ["==", ["get", "ef"], v]);
      efFilter = ["any", ...clauses];
    }

    const combinedFilter = ["all", yearFilter, efFilter];

    if (map.getLayer("tornado-heat")) {
      map.setFilter("tornado-heat", combinedFilter);
    }
    if (map.getLayer("tornado-points")) {
      map.setFilter("tornado-points", combinedFilter);
    }
  }

  function setYear(newYear) {
    let y = Number(newYear);
    if (Number.isNaN(y)) return;

    // Clamp to [MIN_YEAR, MAX_YEAR]
    y = Math.max(MIN_YEAR, Math.min(MAX_YEAR, y));
    slider.value = y;
    updateFilters();
  }

  function stopPlaying() {
    if (playInterval !== null) {
      clearInterval(playInterval);
      playInterval = null;
    }
    playBtn.disabled = false;
    pauseBtn.disabled = true;
  }

  function startPlaying() {
    if (playInterval !== null) return; // already playing

    playBtn.disabled = true;
    pauseBtn.disabled = false;

    playInterval = setInterval(() => {
      let current = Number(slider.value);
      let next = current >= MAX_YEAR ? MIN_YEAR : current + 1;
      slider.value = next;
      updateFilters();
    }, 300); // speed in ms (300 = fast-ish)
  }

  // --- Event handlers ---

  // Slider: update map as user drags
  slider.addEventListener("input", () => {
    stopPlaying(); // stop animation if user interacts
    updateFilters();
  });

  // Numeric input: jump to year
  yearInput.addEventListener("change", () => {
    stopPlaying();
    setYear(yearInput.value);
  });

  // EF filters: reapply filter
  efContainer.addEventListener("change", () => {
    stopPlaying();
    updateFilters();
  });

  playBtn.addEventListener("click", () => {
    startPlaying();
  });

  pauseBtn.addEventListener("click", () => {
    stopPlaying();
  });

  // --- Initial state ---
  const initialYear = 2000;
  slider.value = initialYear;
  yearInput.value = initialYear;
  label.textContent = initialYear;
  pauseBtn.disabled = true;

  updateFilters();
}
