// --- Constants ----------------------------------------------------

const MIN_YEAR = 1950;
const MAX_YEAR = 2025;

let tornadoData = null;
let playInterval = null;

// --- 1. Map setup -------------------------------------------------


mapboxgl.accessToken =
  "pk.eyJ1IjoiandoaXNsZXIxMTE3IiwiYSI6ImNtaHRrYWZzdzF6YmwycnEwMmVxeGU5cHYifQ.yp1rbNFWqnbk_1kfoRJKQw";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/dark-v11",
  center: [-96, 37], // US center
  zoom: 4,
});

function parseDamageToUSD(value) {
  if (value == null) return 0;
  const s = String(value).trim();
  if (!s || s === "0" || s.toUpperCase() === "NULL") return 0;

  const match = s.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!match) {
    const num = Number(s);
    return Number.isFinite(num) ? num : 0;
  }

  const amount = parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();

  let factor = 1;
  if (suffix === "K") factor = 1_000;
  else if (suffix === "M") factor = 1_000_000;
  else if (suffix === "B") factor = 1_000_000_000;

  return amount * factor;
}

function preprocessTornadoData() {
  if (!tornadoData || !tornadoData.features) return;

  tornadoData.features.forEach((f) => {
    const p = f.properties || {};

    
    p.damage_usd = parseDamageToUSD(p.damage_property);

    
    p.injuries_num = Number(p.injuries) || 0;
    p.deaths_num = Number(p.deaths) || 0;

    f.properties = p;
  });
}


// --- 2. Load data and initialize ----------------------------------

Promise.all([d3.json("data/tornado_points.geojson")]).then(([geojson]) => {
  tornadoData = geojson;

  preprocessTornadoData();

  map.on("load", () => {
    // Source
    map.addSource("tornadoes", {
      type: "geojson",
      data: tornadoData,
    });

    // Heatmap
    map.addLayer({
      id: "tornado-heat",
      type: "heatmap",
      source: "tornadoes",
      maxzoom: 10,
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["coalesce", ["to-number", ["get", "ef"]], 0],
          0,
          0.1,
          5,
          1,
        ],
        "heatmap-intensity": 1.2,
        "heatmap-radius": 20,
        "heatmap-opacity": 0.85,
      },
    });

map.addLayer({
  id: "tornado-points",
  type: "circle",
  source: "tornadoes",
  minzoom: 4,
  paint: {
    // EF-based circle size
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["coalesce", ["to-number", ["get", "ef"]], 0],
      0, 3,
      1, 4,
      2, 5,
      3, 6,
      4, 8,
      5, 10
    ],

    "circle-opacity": 0.75,
    "circle-stroke-width": 0.4,
    "circle-stroke-color": "#000",

   
    "circle-color": [
      "interpolate",
      ["linear"],
      ["coalesce", ["to-number", ["get", "ef"]], 0],
      0, "#88c0ff", // EF0
      1, "#60a5fa", // EF1
      2, "#4ade80", // EF2
      3, "#facc15", // EF3
      4, "#fb923c", // EF4
      5, "#ef4444"  // EF5
    ]
  }
});


    // --- Tooltip ---
    const hoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "tornado-tooltip",
    });

    let isHoveringTornado = false;

    map.on("mousemove", (e) => {
      const bbox = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ];

      const features = map.queryRenderedFeatures(bbox, {
        layers: ["tornado-points"],
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
        p.ef === null || p.ef === undefined || p.ef === "null"
          ? "Unknown"
          : `EF${p.ef}`;

      const windText =
        p.wind_low != null &&
        p.wind_high != null &&
        p.wind_low !== "null" &&
        p.wind_high !== "null"
          ? `${p.wind_low}–${p.wind_high} mph`
          : "Unknown";

      const dateText =
        p.date && p.date !== "NaT" && p.date !== "null" ? p.date : "Unknown";

      const lengthText =
        p.length_miles != null && p.length_miles !== "null"
          ? `${Number(p.length_miles).toFixed(1)} mi`
          : "Unknown";

      const widthText =
        p.width_yards != null && p.width_yards !== "null"
          ? `${Math.round(Number(p.width_yards))} yd`
          : "Unknown";

      const damageText =
        p.damage_property != null && p.damage_property !== "null"
          ? String(p.damage_property)
          : "Unknown";

      const html = `
        <strong>${p.state}</strong><br/>
        Date: ${dateText}<br/>
        EF Rating: ${efText}<br/>
        Wind Speed Range: ${windText}<br/>
        Distance Traveled: ${lengthText}<br/>
        Max Width: ${widthText}<br/>
        Injuries: ${p.injuries}<br/>
        Deaths: ${p.deaths}<br/>
        Property Damage: ${damageText}
      `;

      map.getCanvas().style.cursor = "pointer";
      isHoveringTornado = true;

      hoverPopup.setLngLat(coords).setHTML(html).addTo(map);
    });

function populateStateDropdown() {
  const stateSelect = document.getElementById("state-select");

  const states = new Set();

  tornadoData.features.forEach(f => {
    const st = f.properties.state;
    if (st && st !== "null") {
      states.add(st.trim());
    }
  });

  const sorted = Array.from(states).sort();

  sorted.forEach(st => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = toTitleCase(st);
    stateSelect.appendChild(opt);
  });

  function toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

}

populateStateDropdown();

    
    initEFHistogram();
    buildYearTimeline();
    setupControls();
  });
});


// --- EF histogram -------------------------------------------

function initEFHistogram() {
  const container = d3.select("#ef-histogram");

  const margin = { top: 10, right: 10, bottom: 20, left: 50 };
  const width = 280;
  const height = 120;

  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const x = d3
    .scaleBand()
    .domain([0, 1, 2, 3, 4, 5])
    .range([margin.left, width - margin.right])
    .padding(0.2);

  const y = d3.scaleLinear().range([height - margin.bottom, margin.top]);

  const xAxis = (g) =>
    g
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickFormat((d) => "EF" + d))
      .selectAll("text")
      .attr("font-size", 10);

  svg.append("g").attr("class", "x-axis").call(xAxis);

  
  svg
    .append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(${margin.left},0)`);

  initEFHistogram.svg = svg;
  initEFHistogram.x = x;
  initEFHistogram.y = y;
  initEFHistogram.margin = margin;
  initEFHistogram.height = height;
}


function updateEFHistogramForRange(start, end) {
  if (!initEFHistogram.svg || !tornadoData) return;

  const svg = initEFHistogram.svg;
  const x = initEFHistogram.x;
  const y = initEFHistogram.y;
  const margin = initEFHistogram.margin;
  const height = initEFHistogram.height;

  
  const feats = tornadoData.features.filter((f) => {
    const yv = +f.properties.year;
    return yv >= start && yv <= end;
  });

  
  const counts = d3.rollup(
    feats,
    (v) => v.length,
    (d) => +d.properties.ef
  );

  const data = [0, 1, 2, 3, 4, 5].map((ef) => ({
    ef,
    count: counts.get(ef) || 0,
  }));

  y.domain([0, d3.max(data, (d) => d.count) || 1]).nice();

  
  svg
    .select(".y-axis")
    .transition()
    .duration(300)
    .call(
      d3
        .axisLeft(y)
        .ticks(3)
        .tickFormat(d3.format(",d")) 
    )
    .selectAll("text")
    .style("font-size", "10px");

  const bars = svg
    .selectAll("rect.ef-bar")
    .data(data, (d) => d.ef);

  bars.join(
    (enter) =>
      enter
        .append("rect")
        .attr("class", "ef-bar")
        .attr("x", (d) => x(d.ef))
        .attr("width", x.bandwidth())
        .attr("y", y(0))
        .attr("height", 0)
        .attr("fill", (d) => {
          const colors = [
            "#88c0ff",
            "#60a5fa",
            "#4ade80",
            "#facc15",
            "#fb923c",
            "#ef4444",
          ];
          return colors[d.ef] || "#999";
        })
        .call((enter) =>
          enter
            .transition()
            .duration(300)
            .attr("y", (d) => y(d.count))
            .attr("height", (d) => y(0) - y(d.count))
        ),
    (update) =>
      update.call((update) =>
        update
          .transition()
          .duration(300)
          .attr("y", (d) => y(d.count))
          .attr("height", (d) => y(0) - y(d.count))
      )
  );
}

// Timeline of tornado counts by year

function buildYearTimeline() {
  if (!tornadoData) return;

  const container = d3.select("#year-timeline");

  const margin = { top: 10, right: 10, bottom: 20, left: 30 };
  const width = 280;
  const height = 80;

  const svg = container
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const countsByYear = d3.rollup(
    tornadoData.features,
    (v) => v.length,
    (d) => +d.properties.year
  );

  const years = d3.range(MIN_YEAR, MAX_YEAR + 1);
  const data = years.map((y) => ({
    year: y,
    count: countsByYear.get(y) || 0,
  }));

  const x = d3
    .scaleBand()
    .domain(years)
    .range([margin.left, width - margin.right])
    .padding(0.1);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.count) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const bars = svg
    .append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(d.year))
    .attr("y", (d) => y(d.count))
    .attr("width", x.bandwidth())
    .attr("height", (d) => y(0) - y(d.count))
    .attr("fill", "#60a5fa")
    .on("mouseover", function () {
      d3.select(this).attr("fill", "#facc15");
    })
    .on("mouseout", function (event, d) {
      const range = getCurrentRangeSafe();
      const inRange =
        range && d.year >= range.start && d.year <= range.end;
      d3.select(this).attr("fill", inRange ? "#fb923c" : "#60a5fa");
    })
    .on("click", (event, d) => {
      
      stopPlaying();
      setYearRange(d.year, d.year);
    });

  const tickYears = years.filter((y) => y % 10 === 0);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call((g) =>
      g
        .selectAll("text")
        .data(tickYears)
        .join("text")
        .attr("x", (d) => x(d) + x.bandwidth() / 2)
        .attr("y", 12)
        .attr("text-anchor", "middle")
        .attr("font-size", 8)
        .text((d) => d)
    );

  buildYearTimeline.bars = bars;
}

// --- Helpers for year range controls ----------------------------

function updateRangeTrack(start, end) {
  const track = document.getElementById("range-track");
  const slider = document.getElementById("year-start-slider");

  const min = Number(slider.min);
  const max = Number(slider.max);

  const percent1 = ((start - min) / (max - min)) * 100;
  const percent2 = ((end - min) / (max - min)) * 100;

  track.style.left = percent1 + "%";
  track.style.width = (percent2 - percent1) + "%";
}


function getSelectedEFs() {
  const efContainer = document.getElementById("ef-filters");
  const checked = Array.from(
    efContainer.querySelectorAll('input[type="checkbox"]:checked')
  );
  return checked.map((c) => Number(c.value));
}


function normalizeRange(start, end) {
  let s = Number(start);
  let e = Number(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;

  s = Math.max(MIN_YEAR, Math.min(MAX_YEAR, s));
  e = Math.max(MIN_YEAR, Math.min(MAX_YEAR, e));

  if (s > e) [s, e] = [e, s]; // swap so s <= e

  return { start: s, end: e };
}

function getCurrentRangeSafe() {
  const startSlider = document.getElementById("year-start-slider");
  const endSlider = document.getElementById("year-end-slider");
  if (!startSlider || !endSlider) return null;
  return normalizeRange(startSlider.value, endSlider.value);
}

// Clamp + set range from any control (sliders, inputs, timeline, play)
function setYearRange(start, end) {
  const range = normalizeRange(start, end);
  if (!range) return;
  const { start: s, end: e } = range;

  const startSlider = document.getElementById("year-start-slider");
  const endSlider = document.getElementById("year-end-slider");
  const startInput = document.getElementById("year-start-input");
  const endInput = document.getElementById("year-end-input");

  startSlider.value = s;
  endSlider.value = e;
  startInput.value = s;
  endInput.value = e;


  updateRangeTrack(s, e);

  // apply to map + charts
  applyYearRangeAndFilters(s, e);
}


function applyYearRangeAndFilters(start, end) {
  const rangeLabel = document.getElementById("year-range-label");
  if (rangeLabel) {
    rangeLabel.textContent = `${start}–${end}`;
  }

  const selectedEFs = getSelectedEFs();

  const yearFilterLower = [">=", ["to-number", ["get", "year"]], start];
  const yearFilterUpper = ["<=", ["to-number", ["get", "year"]], end];

  let efFilter;
  if (selectedEFs.length === 0) {
    efFilter = ["==", ["to-number", ["get", "ef"]], -999];
  } else {
    const clauses = selectedEFs.map((v) => [
      "==",
      ["to-number", ["get", "ef"]],
      v,
    ]);
    efFilter = ["any", ...clauses];
  }

  // 🔹 State filter
  const stateSelect = document.getElementById("state-select");
  let stateFilter = true;
  if (stateSelect && stateSelect.value !== "ALL") {
    stateFilter = ["==", ["get", "state"], stateSelect.value];
  }

  // 🔹 Property damage filter
  const damageSelect = document.getElementById("damage-select");
  let damageFilter = true;
  if (damageSelect) {
    const v = damageSelect.value;
    const dmg = ["to-number", ["get", "damage_usd"]];

    if (v === "NONE") {
      damageFilter = ["==", dmg, 0];
    } else if (v === "LOW") {
      damageFilter = ["<", dmg, 1_000_000]; // < $1M
    } else if (v === "MED") {
      damageFilter = [
        "all",
        [">=", dmg, 1_000_000],
        ["<", dmg, 10_000_000],
      ];
    } else if (v === "HIGH") {
      damageFilter = [">=", dmg, 10_000_000]; // >= $10M
    }
  }

  // 🔹 Injuries filter
  const injuriesSelect = document.getElementById("injuries-select");
  let injuriesFilter = true;
  if (injuriesSelect) {
    const v = injuriesSelect.value;
    const inj = ["to-number", ["get", "injuries_num"]];

    if (v === "NONE") {
      injuriesFilter = ["==", inj, 0];
    } else if (v === "LOW") {
      injuriesFilter = [
        "all",
        [">=", inj, 1],
        ["<=", inj, 10],
      ];
    } else if (v === "MED") {
      injuriesFilter = [
        "all",
        [">=", inj, 11],
        ["<=", inj, 50],
      ];
    } else if (v === "HIGH") {
      injuriesFilter = [">=", inj, 51];
    }
  }

  // 🔹 Fatalities filter
  const fatalitiesSelect = document.getElementById("fatalities-select");
  let fatalitiesFilter = true;
  if (fatalitiesSelect) {
    const v = fatalitiesSelect.value;
    const fat = ["to-number", ["get", "deaths_num"]];

    if (v === "NONE") {
      fatalitiesFilter = ["==", fat, 0];
    } else if (v === "LOW") {
      fatalitiesFilter = [
        "all",
        [">=", fat, 1],
        ["<=", fat, 5],
      ];
    } else if (v === "MED") {
      fatalitiesFilter = [
        "all",
        [">=", fat, 6],
        ["<=", fat, 20],
      ];
    } else if (v === "HIGH") {
      fatalitiesFilter = [">=", fat, 21];
    }
  }

  // 🔹 Combined filter
  const combinedFilter = [
    "all",
    yearFilterLower,
    yearFilterUpper,
    efFilter,
    stateFilter,
    damageFilter,
    injuriesFilter,
    fatalitiesFilter,
  ];

  if (map.getLayer("tornado-heat")) {
    map.setFilter("tornado-heat", combinedFilter);
  }
  if (map.getLayer("tornado-points")) {
    map.setFilter("tornado-points", combinedFilter);
  }

  // Highlight bars in the timeline
  if (buildYearTimeline.bars) {
    buildYearTimeline.bars.attr("fill", (d) =>
      d.year >= start && d.year <= end ? "#fb923c" : "#60a5fa"
    );
  }

  // Update EF histogram
  updateEFHistogramForRange(start, end);

  // Keep blue slider track synced
  updateRangeTrack(start, end);
}


function stopPlaying() {
  if (playInterval !== null) {
    clearInterval(playInterval);
    playInterval = null;
  }
  const playBtn = document.getElementById("play-btn");
  const pauseBtn = document.getElementById("pause-btn");
  if (playBtn && pauseBtn) {
    playBtn.disabled = false;
    pauseBtn.disabled = true;
  }
}

function startPlayingRange() {
  if (playInterval !== null) return;

  const playBtn = document.getElementById("play-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const startSlider = document.getElementById("year-start-slider");
  const endSlider = document.getElementById("year-end-slider");

  playBtn.disabled = true;
  pauseBtn.disabled = false;

  playInterval = setInterval(() => {
    const range = normalizeRange(startSlider.value, endSlider.value);
    if (!range) return;
    const windowSize = range.end - range.start;

    let newStart = range.start + 1;
    let newEnd = range.end + 1;

    if (newEnd > MAX_YEAR) {
      // wrap around while preserving window size
      newStart = MIN_YEAR;
      newEnd = MIN_YEAR + windowSize;
      if (newEnd > MAX_YEAR) {
        newEnd = MAX_YEAR;
        newStart = MAX_YEAR - windowSize;
      }
    }

    setYearRange(newStart, newEnd);
  }, 300);
}

// --- 6. Wire up DOM events ----------------------------------------

function setupControls() {
  const startSlider = document.getElementById("year-start-slider");
  const endSlider = document.getElementById("year-end-slider");
  const startInput = document.getElementById("year-start-input");
  const endInput = document.getElementById("year-end-input");
  const efContainer = document.getElementById("ef-filters");

  // Initial range
  const initialStart = 2020;
  const initialEnd = 2021;
  setYearRange(initialStart, initialEnd); // also sets track + labels

  function getCurrentRange() {
    return normalizeRange(startSlider.value, endSlider.value);
  }

  // While dragging: keep inputs & blue bar in sync, but don't touch the map yet
  startSlider.addEventListener("input", () => {
    const range = getCurrentRange();
    if (!range) return;
    const { start, end } = range;

    startInput.value = start;
    endInput.value = end;
    updateRangeTrack(start, end);
  });

  endSlider.addEventListener("input", () => {
    const range = getCurrentRange();
    if (!range) return;
    const { start, end } = range;

    startInput.value = start;
    endInput.value = end;
    updateRangeTrack(start, end);
  });

  // When you release the thumb: apply filters to the map + charts
  startSlider.addEventListener("change", () => {
    const range = getCurrentRange();
    if (range) setYearRange(range.start, range.end);
  });

  endSlider.addEventListener("change", () => {
    const range = getCurrentRange();
    if (range) setYearRange(range.start, range.end);
  });

  // Typing in "From" / "To" boxes
  startInput.addEventListener("change", () => {
    setYearRange(startInput.value, endInput.value);
  });

  endInput.addEventListener("change", () => {
    setYearRange(startInput.value, endInput.value);
  });

  // EF filters
  efContainer.addEventListener("change", () => {
    const range = getCurrentRange();
    if (range) applyYearRangeAndFilters(range.start, range.end);
  });

  const stateSelect = document.getElementById("state-select");
  const damageSelect = document.getElementById("damage-select");
  const injuriesSelect = document.getElementById("injuries-select");
  const fatalitiesSelect = document.getElementById("fatalities-select");

  function reapplyForCurrentRange() {
    const range = getCurrentRange();
    if (range) applyYearRangeAndFilters(range.start, range.end);
  }

  if (stateSelect) {
    stateSelect.addEventListener("change", reapplyForCurrentRange);
  }
  if (damageSelect) {
    damageSelect.addEventListener("change", reapplyForCurrentRange);
  }
  if (injuriesSelect) {
    injuriesSelect.addEventListener("change", reapplyForCurrentRange);
  }
  if (fatalitiesSelect) {
    fatalitiesSelect.addEventListener("change", reapplyForCurrentRange);
  }


}


