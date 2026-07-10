const DATA_URL = "./data/climatology_index_1996_2025_s_stations.json";
const STATION_DATA_URL = "./data/stations/{station_key}.json";
const FORECAST_URL = "./data/twoweek_latest_s_stations.json";
const THRESHOLDS = [-5, 0, 5, 10, 15, 20, 25, 30, 35, 40];

const elements = {
  max: { name: "最高気温", axis: "日最高気温", defaultThreshold: 30 },
  min: { name: "最低気温", axis: "日最低気温", defaultThreshold: 10 },
};

const colors = {
  ink: "#1f2430",
  muted: "#667085",
  grid: "#d9dee8",
  gridStrong: "#aeb7c6",
  grayBand: "#f1f1f1",
  grayLine: "#969ca6",
  p1090: "#e6eef9",
  p2575: "#c9d9f0",
  mean: "#d64937",
  median: "#253b73",
  threshold: "#7a6538",
  year: "#111827",
  current: "#16855b",
  forecast: "#8b42d6",
  forecastBand: "rgba(139, 66, 214, 0.14)",
};

const refs = {
  datasetMeta: document.querySelector("#datasetMeta"),
  regionSelect: document.querySelector("#regionSelect"),
  stationSelect: document.querySelector("#stationSelect"),
  stationSearch: document.querySelector("#stationSearch"),
  thresholdSelect: document.querySelector("#thresholdSelect"),
  viewModeSelect: document.querySelector("#viewModeSelect"),
  periodSelect: document.querySelector("#periodSelect"),
  yearSelect: document.querySelector("#yearSelect"),
  backgroundPeriodSelect: document.querySelector("#backgroundPeriodSelect"),
  headerToggle: document.querySelector("#headerToggle"),
  controlsToggle: document.querySelector("#controlsToggle"),
  summaryToggle: document.querySelector("#summaryToggle"),
  maxButton: document.querySelector("#maxButton"),
  minButton: document.querySelector("#minButton"),
  thresholdMarkersButton: document.querySelector("#thresholdMarkersButton"),
  currentYearButton: document.querySelector("#currentYearButton"),
  forecastButton: document.querySelector("#forecastButton"),
  downloadButton: document.querySelector("#downloadButton"),
  copyButton: document.querySelector("#copyButton"),
  canvas: document.querySelector("#chartCanvas"),
  chartScrollbars: document.querySelector("#chartScrollbars"),
  chartHScroll: document.querySelector("#chartHScroll"),
  tooltip: document.querySelector("#tooltip"),
  stationPosition: document.querySelector("#stationPosition"),
  stationElevation: document.querySelector("#stationElevation"),
  stationBlock: document.querySelector("#stationBlock"),
  meanPeakLabel: document.querySelector("#meanPeakLabel"),
  meanTroughLabel: document.querySelector("#meanTroughLabel"),
  recordHighLabel: document.querySelector("#recordHighLabel"),
  recordLowLabel: document.querySelector("#recordLowLabel"),
  riskLabel: document.querySelector("#riskLabel"),
  fallRiskLabel: document.querySelector("#fallRiskLabel"),
  meanPeak: document.querySelector("#meanPeak"),
  meanTrough: document.querySelector("#meanTrough"),
  recordHigh: document.querySelector("#recordHigh"),
  recordLow: document.querySelector("#recordLow"),
  riskMetric: document.querySelector("#riskMetric"),
  fallRiskMetric: document.querySelector("#fallRiskMetric"),
  statusText: document.querySelector("#statusText"),
};

const state = {
  data: null,
  stationData: null,
  stationDataCache: new Map(),
  forecastData: null,
  stationKey: "prec44_s47662",
  element: "min",
  threshold: elements.min.defaultThreshold,
  region: "all",
  search: "",
  viewMode: "stats",
  period: "30",
  backgroundPeriod: "30",
  selectedYear: "2025",
  showThresholdMarkers: true,
  showCurrentYear: false,
  showForecast: false,
  hoverIndex: null,
  zoomStart: 0,
  zoomEnd: 365,
  collapsed: {
    header: false,
    controls: false,
    summary: false,
  },
};

const chartDrag = {
  active: false,
  moved: false,
  startX: 0,
  startY: 0,
  startZoomStart: 0,
  startZoomEnd: 365,
};

const scrollbarDrag = {
  active: null,
};

const chartTouch = {
  pointers: new Map(),
  pinching: false,
  startDistance: 0,
  startZoomStart: 0,
  startZoomEnd: 365,
  centerRatio: 0.5,
};

function finite(value) {
  return Number.isFinite(value);
}

function formatTemp(value) {
  return finite(value) ? `${value.toFixed(1)}℃` : "--";
}

function formatDate(day) {
  return day ? day.label : "--";
}

function formatThresholdDate(day) {
  return day ? day.label : "該当なし";
}

function stationMap() {
  return new Map(state.data.stations.map((station) => [station.station_key, station]));
}

function currentStation() {
  return stationMap().get(state.stationKey) || state.data.stations[0];
}

function stationDataUrl(stationKey) {
  return STATION_DATA_URL.replace("{station_key}", encodeURIComponent(stationKey));
}

async function loadStationData(stationKey) {
  if (state.stationDataCache.has(stationKey)) {
    state.stationData = state.stationDataCache.get(stationKey);
    return state.stationData;
  }
  refs.statusText.textContent = "地点データを読み込み中...";
  const payload = await loadJson(stationDataUrl(stationKey), null);
  if (!payload) throw new Error(`station data load failed: ${stationKey}`);
  state.stationDataCache.set(stationKey, payload);
  if (state.stationKey === stationKey) {
    state.stationData = payload;
  }
  return payload;
}

function periodMeta(key) {
  return state.data.meta.periods.find((period) => period.key === key) || state.data.meta.periods[0];
}

function baseStats() {
  const period = state.viewMode === "stats" ? state.period : state.backgroundPeriod;
  return state.stationData.stats[period][state.element];
}

function selectedYearSeries() {
  return state.stationData.years?.[state.selectedYear]?.[state.element] || null;
}

function currentYearSeries() {
  return state.stationData.current_year?.[state.element] || null;
}

function forecastRows() {
  if (!state.forecastData) return [];
  return state.forecastData.stations?.[state.stationKey]?.[state.element] || [];
}

function forecastStation() {
  if (!state.forecastData) return null;
  return state.forecastData.stations?.[state.stationKey] || null;
}

function currentDateKeyInJapan(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function forecastFreshness() {
  const rows = forecastRows();
  if (!rows.length) return "unavailable";
  const today = currentDateKeyInJapan();
  return rows.some((row) => typeof row.date === "string" && row.date >= today && finite(row.value))
    ? "available"
    : "stale";
}

function forecastAvailable() {
  return forecastFreshness() === "available";
}

function hasFiniteValues(series) {
  return Array.isArray(series) && series.some(finite);
}

function effectiveChartLayers() {
  const forecast = forecastPoints();
  return {
    selectedYear: state.viewMode === "year" && hasFiniteValues(selectedYearSeries()),
    currentYear: state.showCurrentYear && hasFiniteValues(currentYearSeries()),
    forecast: state.showForecast && forecastAvailable() && forecast.length > 0,
    forecastPoints: forecast,
  };
}

function formatMonthDay(value) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : "--";
}

function formatShortUpdateHour(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/);
  return match
    ? `${Number(match[1])}/${Number(match[2])}/${Number(match[3])} ${Number(match[4])}時`
    : "更新時刻なし";
}

function formatForecastDateRange(first, last) {
  const start = String(first || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const end = String(last || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!start || !end) return `${formatMonthDay(first)}〜${formatMonthDay(last)}`;
  const startLabel = `${Number(start[1])}/${Number(start[2])}/${Number(start[3])}`;
  const endLabel = start[1] === end[1]
    ? `${Number(end[2])}/${Number(end[3])}`
    : `${Number(end[1])}/${Number(end[2])}/${Number(end[3])}`;
  return `${startLabel}〜${endLabel}`;
}

function latestFiniteDayLabel(series) {
  for (let index = Math.min(series?.length || 0, state.data.days.length) - 1; index >= 0; index -= 1) {
    if (finite(series[index])) return state.data.days[index]?.label || null;
  }
  return null;
}

function formatUpdateHour(value) {
  if (!value) return "更新時刻なし";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新時刻なし";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}時`;
}

function dayKeyIndex() {
  return new Map(state.data.days.map((day, index) => [day.key, index]));
}

function maxDayIndex() {
  return Math.max(0, (state.data?.days?.length || 366) - 1);
}

function chartZoom() {
  const maxIndex = maxDayIndex();
  const start = Math.max(0, Math.min(maxIndex, finite(state.zoomStart) ? state.zoomStart : 0));
  const end = Math.max(start + 1, Math.min(maxIndex, finite(state.zoomEnd) ? state.zoomEnd : maxIndex));
  return { start, end };
}

function setChartZoom(start, end) {
  const maxIndex = maxDayIndex();
  const minSpan = 14;
  let nextStart = Math.max(0, Math.min(maxIndex, start));
  let nextEnd = Math.max(0, Math.min(maxIndex, end));
  if (nextEnd < nextStart) [nextStart, nextEnd] = [nextEnd, nextStart];
  if (nextEnd - nextStart < minSpan) {
    const center = (nextStart + nextEnd) / 2;
    nextStart = center - minSpan / 2;
    nextEnd = center + minSpan / 2;
  }
  if (nextStart < 0) {
    nextEnd -= nextStart;
    nextStart = 0;
  }
  if (nextEnd > maxIndex) {
    nextStart -= nextEnd - maxIndex;
    nextEnd = maxIndex;
  }
  state.zoomStart = Math.max(0, nextStart);
  state.zoomEnd = Math.min(maxIndex, nextEnd);
}

function resetChartZoom() {
  setChartZoom(0, maxDayIndex());
  state.hoverIndex = null;
  refs.tooltip.hidden = true;
  updateUrl();
  drawChart();
}

function chartIsZoomed() {
  const zoom = chartZoom();
  return Math.round(zoom.start) > 0 || Math.round(zoom.end) < maxDayIndex();
}

function forecastPoints() {
  const lookup = dayKeyIndex();
  const today = currentDateKeyInJapan();
  return forecastRows()
    .map((row) => ({ ...row, index: lookup.get(row.day_key) }))
    .filter((row) => row.date >= today && Number.isInteger(row.index) && finite(row.value));
}

function setActiveElementButtons() {
  refs.maxButton.classList.toggle("active", state.element === "max");
  refs.minButton.classList.toggle("active", state.element === "min");
}

function applyCollapsedState() {
  document.body.classList.toggle("collapse-header", state.collapsed.header);
  document.body.classList.toggle("collapse-controls", state.collapsed.controls);
  document.body.classList.toggle("collapse-summary", state.collapsed.summary);
  [
    { ref: refs.headerToggle, key: "header", label: "見出し" },
    { ref: refs.controlsToggle, key: "controls", label: "条件" },
    { ref: refs.summaryToggle, key: "summary", label: "要約" },
  ].forEach(({ ref, key, label }) => {
    const collapsed = state.collapsed[key];
    ref.textContent = collapsed ? "▾" : "▴";
    ref.title = label;
    ref.setAttribute("aria-label", `${label}を${collapsed ? "表示" : "隠す"}`);
    ref.setAttribute("aria-expanded", String(!collapsed));
    ref.classList.toggle("active", collapsed);
  });
}

function sectionRect(selector) {
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

function setPanelTogglePositions() {
  const clampTop = (value) => Math.max(18, Math.min(window.innerHeight - 18, Math.round(value)));
  const header = sectionRect(".app-header");
  const toolbar = sectionRect(".toolbar");
  const metrics = sectionRect(".metric-grid");

  const headerTop = header ? header.top + header.height / 2 : 38;
  const controlsTop = toolbar
    ? toolbar.top + Math.min(toolbar.height / 2, 58)
    : (header ? header.bottom + 28 : 92);
  const summaryTop = metrics
    ? metrics.top + Math.min(metrics.height / 2, 68)
    : (toolbar ? toolbar.bottom + 34 : controlsTop + 58);

  refs.headerToggle.style.setProperty("--toggle-top", `${clampTop(headerTop)}px`);
  refs.controlsToggle.style.setProperty("--toggle-top", `${clampTop(controlsTop)}px`);
  refs.summaryToggle.style.setProperty("--toggle-top", `${clampTop(summaryTop)}px`);
}

function setOverlayButtons() {
  const freshness = forecastFreshness();
  refs.thresholdMarkersButton.classList.toggle("active", state.showThresholdMarkers);
  refs.currentYearButton.classList.toggle("active", state.showCurrentYear);
  refs.forecastButton.classList.toggle("active", state.showForecast);
  refs.forecastButton.disabled = !forecastAvailable();
  refs.currentYearButton.textContent = "今年の観測値を重ね表示";
  if (freshness === "available") {
    const updateText = formatUpdateHour(forecastStation()?.report_date || state.forecastData?.meta?.generated_at);
    refs.forecastButton.textContent = "2週間気温予報を重ね表示";
    refs.forecastButton.title = `2週間気温予報を重ね表示（更新時刻 ${updateText}／1週目は日別値・2週目は5日間平均値）`;
  } else if (freshness === "stale") {
    const updateText = formatUpdateHour(forecastStation()?.report_date || state.forecastData?.meta?.generated_at);
    refs.forecastButton.textContent = "2週間気温予報は期限切れ";
    refs.forecastButton.title = `最新の予報期間が終了しています（最終更新 ${updateText}）`;
  } else {
    refs.forecastButton.textContent = "2週間気温予報なし";
    refs.forecastButton.title = "この地点の2週間気温予報はありません";
  }
}

function fillThresholds() {
  refs.thresholdSelect.replaceChildren(
    ...THRESHOLDS.map((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}℃`;
      option.selected = Number(state.threshold) === value;
      return option;
    }),
  );
}

function fillPeriods() {
  const makeOptions = (selected) => state.data.meta.periods.map((period) => {
    const option = document.createElement("option");
    option.value = period.key;
    option.textContent = period.label;
    option.selected = period.key === selected;
    return option;
  });
  refs.periodSelect.replaceChildren(...makeOptions(state.period));
  refs.backgroundPeriodSelect.replaceChildren(...makeOptions(state.backgroundPeriod));
}

function fillYears() {
  refs.yearSelect.replaceChildren(
    ...state.data.meta.years.map((year) => {
      const option = document.createElement("option");
      option.value = String(year);
      option.textContent = `${year}年`;
      option.selected = String(year) === state.selectedYear;
      return option;
    }),
  );
}

function fillRegions() {
  const seen = new Set();
  const regions = [];
  for (const station of state.data.stations) {
    if (!seen.has(station.region)) {
      seen.add(station.region);
      regions.push(station.region);
    }
  }
  refs.regionSelect.replaceChildren(
    ...[
      ["all", "すべて"],
      ...regions.map((region) => [region, region]),
    ].map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = value === state.region;
      return option;
    }),
  );
}

function stationMatchesFilter(station) {
  const needle = state.search.trim();
  const regionOk = needle || state.region === "all" || station.region === state.region;
  const searchOk = !needle || `${station.name} ${station.kana} ${station.region}`.includes(needle);
  return regionOk && searchOk;
}

function stationSearchScore(station, index) {
  const needle = state.search.trim();
  if (!needle) return index;
  if (station.name === needle) return 0;
  if (station.kana === needle) return 1;
  if (station.name.startsWith(needle)) return 2;
  if (station.kana?.startsWith(needle)) return 3;
  if (station.region === needle || station.region.replace(/(都|道|府|県|地方)$/, "") === needle) return 4;
  return 5 + index;
}

function fillStations({ keepCurrent = true } = {}) {
  const filtered = state.data.stations
    .map((station, index) => ({ station, index }))
    .filter(({ station }) => stationMatchesFilter(station))
    .sort((a, b) => stationSearchScore(a.station, a.index) - stationSearchScore(b.station, b.index))
    .map(({ station }) => station);
  const current = currentStation();
  const candidates = filtered.length ? filtered : [current];
  if (filtered.length && (!keepCurrent || !candidates.some((station) => station.station_key === state.stationKey))) {
    state.stationKey = candidates[0].station_key;
  }
  refs.stationSelect.replaceChildren(
    ...candidates.map((station) => {
      const option = document.createElement("option");
      option.value = station.station_key;
      option.textContent = `${station.name}（${station.region}）`;
      option.selected = station.station_key === state.stationKey;
      return option;
    }),
  );
  refs.stationSelect.disabled = filtered.length === 0;
  refs.stationSearch.value = state.search;
}

function syncRegionToCurrentStation() {
  const station = currentStation();
  if (station?.region) state.region = station.region;
}

function valueAt(array, index) {
  const value = array?.[index];
  return finite(value) ? value : null;
}

function findExtreme(array, mode) {
  let bestIndex = -1;
  let bestValue = null;
  array.forEach((value, index) => {
    if (!finite(value)) return;
    if (bestValue === null || (mode === "max" ? value > bestValue : value < bestValue)) {
      bestValue = value;
      bestIndex = index;
    }
  });
  return { index: bestIndex, value: bestValue, day: state.data.days[bestIndex] };
}

function findFirstAtOrAbove(array, threshold) {
  const index = array.findIndex((value) => finite(value) && value >= threshold);
  return index >= 0 ? state.data.days[index] : null;
}

function findWarmSeasonStableAtOrAbove(array, threshold) {
  const endIndex = state.data.days.findIndex((day) => day.month === 9 && day.day === 1);
  const warmSeasonEnd = endIndex >= 0 ? endIndex : state.data.days.length - 1;
  for (let i = 0; i <= warmSeasonEnd; i += 1) {
    let stable = true;
    for (let j = i; j <= warmSeasonEnd; j += 1) {
      if (!finite(array[j]) || array[j] < threshold) {
        stable = false;
        break;
      }
    }
    if (stable) return state.data.days[i];
  }
  return null;
}

function dayFromIndex(index) {
  return Number.isInteger(index) && index >= 0 ? state.data.days[index] : null;
}

function dayFromOrdinal(ordinal) {
  if (!finite(ordinal)) return null;
  const index = Math.max(0, Math.min(state.data.days.length - 1, Math.round(ordinal) - 1));
  return state.data.days[index];
}

function peakIndex(array) {
  return findExtreme(array, "max").index;
}

function crossingIndex(array, threshold, direction) {
  const peak = peakIndex(array);
  if (peak < 0) return null;
  if (direction === "up") {
    for (let i = 0; i <= peak; i += 1) {
      if (finite(array[i]) && array[i] >= threshold) return i;
    }
  } else {
    for (let i = peak; i < array.length; i += 1) {
      if (finite(array[i]) && array[i] < threshold) return i;
    }
  }
  return null;
}

function stableCrossingUpIndex(array, threshold) {
  const peak = peakIndex(array);
  if (peak < 0) return null;
  let lastBelow = -1;
  for (let i = 0; i <= peak; i += 1) {
    if (finite(array[i]) && array[i] < threshold) lastBelow = i;
  }
  for (let i = Math.max(0, lastBelow + 1); i <= peak; i += 1) {
    if (finite(array[i]) && array[i] >= threshold) return i;
  }
  return null;
}

function stableCrossingDownIndex(array, threshold) {
  const peak = peakIndex(array);
  if (peak < 0) return null;
  let lastAtOrAbove = -1;
  for (let i = peak; i < array.length; i += 1) {
    if (finite(array[i]) && array[i] >= threshold) lastAtOrAbove = i;
  }
  for (let i = Math.max(peak, lastAtOrAbove + 1); i < array.length; i += 1) {
    if (finite(array[i]) && array[i] < threshold) return i;
  }
  return null;
}

function yearsForActivePeriod() {
  const period = periodMeta(state.viewMode === "stats" ? state.period : state.backgroundPeriod);
  const years = [];
  for (let year = period.start_year; year <= period.end_year; year += 1) {
    years.push(String(year));
  }
  return years;
}

function timingSummary(stats, direction) {
  const threshold = Number(state.threshold);
  const averageIndex = crossingIndex(stats.mean, threshold, direction);
  const fastestIndex = direction === "up"
    ? crossingIndex(stats.max, threshold, direction)
    : crossingIndex(stats.min, threshold, direction);
  const cautiousIndex = direction === "up"
    ? stableCrossingUpIndex(stats.p10, threshold)
    : crossingIndex(stats.p10, threshold, direction);
  const slowestIndex = direction === "up"
    ? stableCrossingUpIndex(stats.min, threshold)
    : stableCrossingDownIndex(stats.max, threshold);
  return {
    direction,
    averageIndex,
    fastestIndex,
    cautiousIndex,
    slowestIndex,
    averageDay: dayFromIndex(averageIndex),
    fastestDay: dayFromIndex(fastestIndex),
    cautiousDay: dayFromIndex(cautiousIndex),
    slowestDay: dayFromIndex(slowestIndex),
  };
}

function metricHtml(day, value) {
  return `
    <span class="metric-value">
      <span class="metric-date">${formatDate(day)}</span>
      <span class="metric-temp">${formatTemp(value)}</span>
    </span>
  `;
}

function thresholdHtml(summary) {
  const period = periodMeta(state.viewMode === "stats" ? state.period : state.backgroundPeriod);
  const rows = summary.direction === "down"
    ? [
        ["最速", summary.fastestDay],
        ["慎重目安", summary.cautiousDay],
        ["平均", summary.averageDay],
        ["最遅", summary.slowestDay],
      ]
    : [
        ["最速", summary.fastestDay],
        ["平均", summary.averageDay],
        ["慎重目安", summary.cautiousDay],
        ["最遅", summary.slowestDay],
      ];
  return `
    <span class="threshold-list">
      ${rows.map(([label, day]) => `<div><span>${period.label}${label}</span><b>${formatThresholdDate(day)}</b></div>`).join("")}
    </span>
  `;
}

function updateSummary() {
  const station = currentStation();
  const stats = baseStats();
  const elementShort = state.element === "max" ? "日最高" : "日最低";
  const period = periodMeta(state.viewMode === "stats" ? state.period : state.backgroundPeriod);
  const meanPeak = findExtreme(stats.mean, "max");
  const meanTrough = findExtreme(stats.mean, "min");
  const high = findExtreme(stats.max, "max");
  const low = findExtreme(stats.min, "min");
  const rising = timingSummary(stats, "up");
  const falling = timingSummary(stats, "down");

  refs.stationPosition.textContent = `${station.latitude?.toFixed(2) ?? "--"}N, ${station.longitude?.toFixed(2) ?? "--"}E`;
  refs.stationElevation.textContent = station.elevation_m === null ? "--" : `${station.elevation_m.toFixed(1)}m`;
  refs.stationBlock.textContent = station.block_no;

  refs.riskLabel.textContent = `${elementShort}気温${Number(state.threshold)}℃を上回るタイミング | ${period.label}`;
  refs.fallRiskLabel.textContent = `${elementShort}気温${Number(state.threshold)}℃を下回るタイミング | ${period.label}`;
  refs.meanPeakLabel.textContent = `${elementShort}気温平均の年間最高 | ${period.label}`;
  refs.meanTroughLabel.textContent = `${elementShort}気温平均の年間最低 | ${period.label}`;
  refs.recordHighLabel.textContent = `${elementShort}気温の観測最高 | ${period.label}`;
  refs.recordLowLabel.textContent = `${elementShort}気温の観測最低 | ${period.label}`;
  refs.meanPeak.innerHTML = metricHtml(meanPeak.day, meanPeak.value);
  refs.meanTrough.innerHTML = metricHtml(meanTrough.day, meanTrough.value);
  refs.recordHigh.innerHTML = metricHtml(high.day, high.value);
  refs.recordLow.innerHTML = metricHtml(low.day, low.value);
  refs.riskMetric.innerHTML = thresholdHtml(rising);
  refs.fallRiskMetric.innerHTML = thresholdHtml(falling);
}

function updateMeta() {
  const meta = state.data.meta;
  const freshness = forecastFreshness();
  const updateText = formatUpdateHour(forecastStation()?.report_date || state.forecastData?.meta?.generated_at);
  const forecastUpdate = freshness === "available"
    ? ` / 2週間気温予報: ${updateText}`
    : freshness === "stale"
      ? ` / 2週間気温予報: 期限切れ（最終更新 ${updateText}）`
      : "";
  refs.datasetMeta.textContent = `${meta.base_period}年・気象台等${meta.station_count}地点`;
  refs.statusText.textContent = `統計期間: ${meta.base_period}年 / 今年実況: ${state.data.current_year?.latest_date || "なし"}${forecastUpdate}`;
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set("station", state.stationKey);
  params.set("element", state.element);
  params.set("threshold", String(state.threshold));
  params.set("mode", state.viewMode);
  params.set("period", state.period);
  params.set("year", state.selectedYear);
  params.set("bg", state.backgroundPeriod);
  if (!state.showThresholdMarkers) params.set("markers", "0");
  if (state.showCurrentYear) params.set("current", "1");
  if (state.showForecast) params.set("forecast", "1");
  if (state.collapsed.header) params.set("hideHeader", "1");
  if (state.collapsed.controls) params.set("hideControls", "1");
  if (state.collapsed.summary) params.set("hideSummary", "1");
  if (chartIsZoomed()) {
    const zoom = chartZoom();
    params.set("z0", String(Math.round(zoom.start)));
    params.set("z1", String(Math.round(zoom.end)));
  }
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

function collectRangeValues(stats, zoom = chartZoom(), options = {}) {
  const { includeThreshold = true } = options;
  const start = Math.max(0, Math.floor(zoom.start));
  const end = Math.min(maxDayIndex(), Math.ceil(zoom.end));
  const visible = (array) => (array || []).slice(start, end + 1);
  const values = [...visible(stats.min), ...visible(stats.max)];
  if (includeThreshold) values.push(Number(state.threshold));
  if (state.viewMode === "year") values.push(...visible(selectedYearSeries()));
  if (state.showCurrentYear) values.push(...visible(currentYearSeries()));
  if (state.showForecast) {
    for (const point of forecastPoints()) {
      if (point.index >= start && point.index <= end) values.push(point.value, point.lower, point.upper);
    }
  }
  return values.filter(finite);
}

function dataRange(stats, zoom = chartZoom()) {
  const zoomed = Math.round(zoom.start) > 0 || Math.round(zoom.end) < maxDayIndex();
  let values = collectRangeValues(stats, zoom, { includeThreshold: !zoomed });
  if (!values.length) values = [0, Number(state.threshold)].filter(finite);
  let min = Math.min(...values);
  let max = Math.max(...values);

  let step = 5;
  if (zoomed) {
    const threshold = Number(state.threshold);
    const rawSpan = Math.max(1, max - min);
    let paddedMin = min - Math.max(0.8, rawSpan * 0.14);
    let paddedMax = max + Math.max(0.8, rawSpan * 0.14);
    if (finite(threshold) && threshold >= paddedMin - 2 && threshold <= paddedMax + 2) {
      paddedMin = Math.min(paddedMin, threshold);
      paddedMax = Math.max(paddedMax, threshold);
    }
    const span = paddedMax - paddedMin;
    step = span <= 8 ? 1 : span <= 16 ? 2 : 5;
    min = Math.floor(paddedMin / step) * step;
    max = Math.ceil(paddedMax / step) * step;
    if (max - min < step * 4) {
      const center = (max + min) / 2;
      min = center - step * 2;
      max = center + step * 2;
    }
  } else {
    min = Math.floor((min - 1) / 5) * 5;
    max = Math.ceil((max + 1) / 5) * 5;
    if (state.element === "max") {
      min = Math.min(min, -5);
      max = Math.max(max, 40);
    } else {
      min = Math.min(min, -10);
      max = Math.max(max, 35);
    }
  }
  return { min, max, step };
}

function setupCanvas() {
  const rect = refs.canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width);
  const height = width * (780 / 1440);
  refs.canvas.width = Math.round(width * ratio);
  refs.canvas.height = Math.round(height * ratio);
  refs.canvas.style.height = `${height}px`;
  const ctx = refs.canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function drawBand(ctx, lower, upper, color, xOf, yOf) {
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < upper.length; i += 1) {
    if (!finite(upper[i]) || !finite(lower[i])) continue;
    const x = xOf(i);
    const y = yOf(upper[i]);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  for (let i = lower.length - 1; i >= 0; i -= 1) {
    if (!finite(upper[i]) || !finite(lower[i])) continue;
    ctx.lineTo(xOf(i), yOf(lower[i]));
  }
  if (started) {
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawLine(ctx, array, color, width, xOf, yOf, dash = [], alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < array.length; i += 1) {
    if (!finite(array[i])) {
      started = false;
      continue;
    }
    const x = xOf(i);
    const y = yOf(array[i]);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawForecast(ctx, points, xOf, yOf) {
  if (!points.length) return;
  ctx.save();
  ctx.strokeStyle = colors.forecast;
  ctx.fillStyle = colors.forecast;
  ctx.lineWidth = 2.2;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  points.forEach((point, i) => {
    const x = xOf(point.index);
    const y = yOf(point.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  for (const point of points) {
    const x = xOf(point.index);
    if (finite(point.lower) && finite(point.upper)) {
      ctx.strokeStyle = colors.forecast;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, yOf(point.lower));
      ctx.lineTo(x, yOf(point.upper));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(x, yOf(point.value), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function thresholdMarkerPoints(stats) {
  const rising = timingSummary(stats, "up");
  const falling = timingSummary(stats, "down");
  const points = [
    ["上回る 平均", rising.averageIndex],
    ["上回る 最速", rising.fastestIndex],
    ["上回る 慎重目安", rising.cautiousIndex],
    ["上回る 最遅", rising.slowestIndex],
    ["下回る 最速", falling.fastestIndex],
    ["下回る 慎重目安", falling.cautiousIndex],
    ["下回る 平均", falling.averageIndex],
    ["下回る 最遅", falling.slowestIndex],
  ].filter(([, index]) => Number.isInteger(index));
  const grouped = new Map();
  for (const [label, index] of points) {
    if (!grouped.has(index)) grouped.set(index, []);
    grouped.get(index).push(label);
  }
  return [...grouped.entries()].map(([index, labels]) => ({ index, labels }));
}

function drawThresholdMarkers(ctx, stats, xOf, yOf) {
  if (!state.showThresholdMarkers) return;
  const threshold = Number(state.threshold);
  for (const point of thresholdMarkerPoints(stats)) {
    const x = xOf(point.index);
    const y = yOf(threshold);
    ctx.save();
    ctx.fillStyle = "#e23b3b";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function chartPresentation() {
  const station = currentStation();
  const period = periodMeta(state.viewMode === "stats" ? state.period : state.backgroundPeriod);
  const layers = effectiveChartLayers();
  const currentYear = state.stationData.current_year?.year || state.data.current_year?.year;
  const currentLabel = currentYear ? `${currentYear}年実況` : "今年実況";
  const focus = [
    state.viewMode === "stats"
      ? `${period.start_year}〜${period.end_year}年の日別統計`
      : (layers.selectedYear ? `${state.selectedYear}年の推移` : `${state.selectedYear}年（データなし）`),
  ];
  if (layers.currentYear) focus.push(currentLabel);
  if (layers.forecast) focus.push("2週間気温予報");

  const context = [
    state.viewMode === "stats"
      ? `統計期間：${period.label}`
      : `背景統計：${period.start_year}〜${period.end_year}年（${period.label}）`,
  ];
  if (layers.currentYear) {
    const latestDate = state.stationData.current_year?.latest_date || state.data.current_year?.latest_date;
    const latestLabel = latestFiniteDayLabel(currentYearSeries()) || formatMonthDay(latestDate);
    context.push(`実況：${latestLabel}まで`);
  }
  context.push(`目安気温：${Number(state.threshold)}℃`);
  if (chartIsZoomed()) {
    const zoom = chartZoom();
    const startDay = state.data.days[Math.max(0, Math.floor(zoom.start))];
    const endDay = state.data.days[Math.min(maxDayIndex(), Math.ceil(zoom.end))];
    context.push(`表示範囲：${startDay.label}〜${endDay.label}`);
  }

  const forecastContext = [];
  if (layers.forecast) {
    const first = layers.forecastPoints[0];
    const last = layers.forecastPoints[layers.forecastPoints.length - 1];
    const updated = formatShortUpdateHour(
      forecastStation()?.report_date || state.forecastData?.meta?.generated_at,
    );
    forecastContext.push(
      `予報期間：${formatForecastDateRange(first.date, last.date)}`,
      "1週目：日別値・2週目：5日間平均値",
      `${updated}更新`,
    );
  }

  const legend = [
    "赤=平均",
    "青=中央値",
    "青帯=過去分布の中央80%・50%",
    "灰=期間内の最小〜最大",
  ];
  if (layers.selectedYear) legend.push(`黒=${state.selectedYear}年`);
  if (layers.currentYear) legend.push(`緑=${currentLabel}`);
  if (layers.forecast) legend.push("紫=2週間気温予報");
  legend.push(`茶破線=${Number(state.threshold)}℃`);
  if (state.showThresholdMarkers) {
    legend.push(state.viewMode === "year" ? "赤丸=背景統計の目安日" : "赤丸=統計上の目安日");
  }

  return {
    heading: `${station.name}の${elements[state.element].axis}`,
    focus,
    context,
    forecastContext,
    legend,
    layers,
    period,
  };
}

function chartTitle(presentation = chartPresentation()) {
  const background = state.viewMode === "year"
    ? `（背景：${presentation.period.start_year}〜${presentation.period.end_year}年統計）`
    : "";
  return `${presentation.heading}｜${presentation.focus.join("・")}${background}`;
}

function chartAccessibleLabel(presentation) {
  return [
    chartTitle(presentation),
    presentation.context.join("、"),
    presentation.forecastContext.join("、"),
    presentation.legend.join("、"),
  ].filter(Boolean).join("。 ");
}

function drawChartHeader(ctx, width, presentation) {
  const compact = width < 900;
  const maxWidth = width - 24;
  const fontFamily = "-apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif";
  const fitFont = (text, preferred, minimum, weight) => {
    let size = preferred;
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    const measured = ctx.measureText(text).width;
    if (measured > maxWidth) size = Math.max(minimum, Math.floor(size * (maxWidth / measured)));
    ctx.font = `${weight} ${size}px ${fontFamily}`;
  };
  const title = chartTitle(presentation);

  ctx.textAlign = "center";
  ctx.fillStyle = colors.ink;
  fitFont(title, compact ? 20 : 24, compact ? 12 : 15, 700);
  ctx.fillText(title, width / 2, compact ? 28 : 34, maxWidth);
  return compact ? 50 : 58;
}

function drawChart() {
  if (!state.data) return;
  const { ctx, width, height } = setupCanvas();
  const stats = baseStats();
  const days = state.data.days;
  const zoom = chartZoom();
  const range = dataRange(stats, zoom);
  const presentation = chartPresentation();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const headerBottom = drawChartHeader(ctx, width, presentation);
  const margin = { left: Math.max(62, width * 0.06), right: 30, top: headerBottom, bottom: 48 };
  const plot = {
    left: margin.left,
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
  };
  plot.width = plot.right - plot.left;
  plot.height = plot.bottom - plot.top;

  const xOf = (index) => plot.left + ((index - zoom.start) / (zoom.end - zoom.start)) * plot.width;
  const yOf = (value) => plot.bottom - ((value - range.min) / (range.max - range.min)) * plot.height;

  refs.canvas.setAttribute("aria-label", chartAccessibleLabel(presentation));

  ctx.strokeStyle = colors.gridStrong;
  ctx.lineWidth = 1;
  ctx.strokeRect(plot.left, plot.top, plot.width, plot.height);

  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = colors.muted;
  const yStep = range.step || 5;
  for (let value = range.min; value <= range.max + yStep * 0.1; value += yStep) {
    const y = yOf(value);
    ctx.strokeStyle = value === 0 ? colors.gridStrong : colors.grid;
    ctx.lineWidth = value === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(value * 10) / 10}℃`, plot.left - 8, y + 4);
  }

  ctx.textAlign = "left";
  const visibleSpan = zoom.end - zoom.start;
  const tickInterval = visibleSpan <= 45 ? 7 : visibleSpan <= 100 ? 14 : null;
  for (let i = Math.max(0, Math.floor(zoom.start)); i <= Math.min(days.length - 1, Math.ceil(zoom.end)); i += 1) {
    if (tickInterval === null && days[i].day !== 1) continue;
    if (tickInterval !== null && i !== Math.max(0, Math.floor(zoom.start)) && i % tickInterval !== 0) continue;
    const x = xOf(i);
    ctx.strokeStyle = [1, 4, 7, 10].includes(days[i].month) ? colors.gridStrong : colors.grid;
    ctx.lineWidth = [1, 4, 7, 10].includes(days[i].month) ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
    ctx.stroke();
    ctx.fillStyle = colors.muted;
    ctx.fillText(tickInterval === null ? `${days[i].month}月` : days[i].label, x + 4, plot.bottom + 22);
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.left, plot.top, plot.width, plot.height);
  ctx.clip();
  drawBand(ctx, stats.min, stats.max, colors.grayBand, xOf, yOf);
  drawBand(ctx, stats.p10, stats.p90, colors.p1090, xOf, yOf);
  drawBand(ctx, stats.p25, stats.p75, colors.p2575, xOf, yOf);
  drawLine(ctx, stats.max, colors.grayLine, 1.3, xOf, yOf, [], state.viewMode === "year" ? 0.75 : 1);
  drawLine(ctx, stats.min, colors.grayLine, 1.3, xOf, yOf, [], state.viewMode === "year" ? 0.75 : 1);
  drawLine(ctx, stats.median, colors.median, state.viewMode === "year" ? 1.8 : 2.4, xOf, yOf, [], state.viewMode === "year" ? 0.55 : 1);
  drawLine(ctx, stats.mean, colors.mean, state.viewMode === "year" ? 2.2 : 3.6, xOf, yOf, [], state.viewMode === "year" ? 0.55 : 1);

  const threshold = Number(state.threshold);
  if (threshold >= range.min && threshold <= range.max) {
    const y = yOf(threshold);
    ctx.save();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = colors.threshold;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colors.threshold;
    ctx.font = "700 13px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${threshold}℃`, plot.right - 6, y - 8);
    ctx.restore();
  }

  if (presentation.layers.selectedYear) {
    drawLine(ctx, selectedYearSeries() || [], colors.year, 3, xOf, yOf);
  }
  if (presentation.layers.currentYear) {
    drawLine(ctx, currentYearSeries() || [], colors.current, 3.2, xOf, yOf);
  }
  if (presentation.layers.forecast) {
    drawForecast(ctx, presentation.layers.forecastPoints, xOf, yOf);
  }
  drawThresholdMarkers(ctx, stats, xOf, yOf);

  if (state.hoverIndex !== null) {
    const x = xOf(state.hoverIndex);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
    ctx.stroke();
  }
  ctx.restore();

  refs.canvas._plot = { left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom, width: plot.width, zoomStart: zoom.start, zoomEnd: zoom.end };
  syncChartScrollbars();
}

function scrollbarThumb(ref) {
  return ref?.querySelector(".chart-scrollbar-thumb");
}

function hScrollbarInfo() {
  const plot = refs.canvas._plot;
  if (!plot || !refs.chartHScroll) return null;
  const maxIndex = maxDayIndex();
  const zoom = chartZoom();
  const span = zoom.end - zoom.start;
  if (span >= maxIndex - 0.5) return null;
  const trackLength = refs.chartHScroll.clientWidth;
  const thumbLength = Math.max(36, Math.min(trackLength, trackLength * (span / maxIndex)));
  const travel = Math.max(1, trackLength - thumbLength);
  const maxStart = Math.max(1, maxIndex - span);
  return { trackLength, thumbLength, travel, maxStart, span, zoom };
}

function positionChartScrollbars(plot) {
  const canvasLeft = refs.canvas.offsetLeft;
  const canvasTop = refs.canvas.offsetTop;
  refs.chartHScroll.style.left = `${canvasLeft + plot.left}px`;
  refs.chartHScroll.style.top = `${canvasTop + plot.bottom + 32}px`;
  refs.chartHScroll.style.width = `${plot.width}px`;
}

function syncChartScrollbars() {
  if (!refs.chartScrollbars || !refs.chartHScroll) return;
  const plot = refs.canvas._plot;
  const show = Boolean(plot && chartIsZoomed());
  refs.chartScrollbars.hidden = !show;
  if (!show) return;
  positionChartScrollbars(plot);

  const hInfo = hScrollbarInfo();
  const hThumb = scrollbarThumb(refs.chartHScroll);
  if (hInfo && hThumb) {
    const x = (hInfo.zoom.start / hInfo.maxStart) * hInfo.travel;
    hThumb.style.left = `${Math.max(0, Math.min(hInfo.travel, x))}px`;
    hThumb.style.width = `${hInfo.thumbLength}px`;
  }
}

function setHScrollFromPointer(clientX) {
  const info = hScrollbarInfo();
  if (!info) return;
  const rect = refs.chartHScroll.getBoundingClientRect();
  const position = Math.max(0, Math.min(info.travel, clientX - rect.left - info.thumbLength / 2));
  const start = (position / info.travel) * info.maxStart;
  setChartZoom(start, start + info.span);
}

function startChartScrollbarDrag(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  scrollbarDrag.active = "x";
  refs.tooltip.hidden = true;
  refs.chartHScroll.classList.add("dragging");
  refs.chartHScroll.setPointerCapture?.(event.pointerId);
  setHScrollFromPointer(event.clientX);
  updateUrl();
  drawChart();
}

function moveChartScrollbarDrag(event) {
  if (!scrollbarDrag.active) return;
  event.preventDefault();
  setHScrollFromPointer(event.clientX);
  refs.tooltip.hidden = true;
  drawChart();
}

function endChartScrollbarDrag(event) {
  if (!scrollbarDrag.active) return;
  refs.chartHScroll.releasePointerCapture?.(event.pointerId);
  refs.chartHScroll.classList.remove("dragging");
  scrollbarDrag.active = null;
  updateUrl();
}

function nudgeChartScrollbar(direction) {
  const zoom = chartZoom();
  const step = Math.max(1, (zoom.end - zoom.start) * 0.08) * direction;
  setChartZoom(zoom.start + step, zoom.end + step);
  updateUrl();
  drawChart();
}

function forecastAt(index) {
  return forecastPoints().find((point) => point.index === index);
}

function markerLabelsAt(stats, index) {
  if (!state.showThresholdMarkers) return [];
  return thresholdMarkerPoints(stats)
    .filter((point) => point.index === index)
    .flatMap((point) => point.labels);
}

function renderTooltip(event) {
  if (chartDrag.active) return;
  const plot = refs.canvas._plot;
  if (!plot) return;
  const rect = refs.canvas.getBoundingClientRect();
  const cssX = event.clientX - rect.left;
  if (cssX < plot.left || cssX > plot.right) {
    state.hoverIndex = null;
    refs.tooltip.hidden = true;
    drawChart();
    return;
  }
  const ratio = (cssX - plot.left) / plot.width;
  const index = Math.max(0, Math.min(state.data.days.length - 1, Math.round(plot.zoomStart + ratio * (plot.zoomEnd - plot.zoomStart))));
  state.hoverIndex = index;
  const stats = baseStats();
  const day = state.data.days[index];
  const yearValue = valueAt(selectedYearSeries(), index);
  const currentValue = valueAt(currentYearSeries(), index);
  const forecast = forecastAt(index);
  const markerLabels = markerLabelsAt(stats, index);
  refs.tooltip.innerHTML = `
    <strong>${day.label}</strong>
    平均 ${formatTemp(valueAt(stats.mean, index))}<br>
    中央値 ${formatTemp(valueAt(stats.median, index))}<br>
    10〜90% ${formatTemp(valueAt(stats.p10, index))}〜${formatTemp(valueAt(stats.p90, index))}<br>
    過去MAX〜MIN ${formatTemp(valueAt(stats.max, index))}〜${formatTemp(valueAt(stats.min, index))}
    ${state.viewMode === "year" ? `<br>${state.selectedYear}年 ${formatTemp(yearValue)}` : ""}
    ${state.showCurrentYear ? `<br>${state.data.current_year.year}年実況 ${formatTemp(currentValue)}` : ""}
    ${state.showForecast && forecast ? `<br>2週間気温予報 ${formatTemp(forecast.value)}（${formatTemp(forecast.lower)}〜${formatTemp(forecast.upper)}）` : ""}
    ${markerLabels.length ? `<br>目安日 ${markerLabels.join(" / ")}` : ""}
  `;
  refs.tooltip.hidden = false;
  refs.tooltip.style.left = `${Math.min(Math.max(event.clientX - rect.left + 16, 8), rect.width - 250)}px`;
  refs.tooltip.style.top = `${Math.min(Math.max(event.clientY - rect.top + 16, 8), rect.height - 170)}px`;
  drawChart();
}

function canvasPoint(event) {
  const rect = refs.canvas.getBoundingClientRect();
  return {
    rect,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function pointIsInsidePlot(point, plot) {
  return point.x >= plot.left && point.x <= plot.right && point.y >= plot.top && point.y <= plot.bottom;
}

function touchPoints() {
  return [...chartTouch.pointers.values()];
}

function distanceBetween(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function startPinchZoom() {
  const plot = refs.canvas._plot;
  const points = touchPoints();
  if (!plot || points.length < 2) return;
  const rect = refs.canvas.getBoundingClientRect();
  const centerX = (points[0].clientX + points[1].clientX) / 2 - rect.left;
  chartTouch.pinching = true;
  chartTouch.startDistance = Math.max(1, distanceBetween(points[0], points[1]));
  chartTouch.startZoomStart = plot.zoomStart;
  chartTouch.startZoomEnd = plot.zoomEnd;
  chartTouch.centerRatio = Math.max(0, Math.min(1, (centerX - plot.left) / plot.width));
  refs.tooltip.hidden = true;
}

function updatePinchZoom(event) {
  if (!chartTouch.pinching) return;
  const plot = refs.canvas._plot;
  const points = touchPoints();
  if (!plot || points.length < 2) return;
  event.preventDefault();
  const nextDistance = Math.max(1, distanceBetween(points[0], points[1]));
  const scale = Math.max(0.25, Math.min(4, nextDistance / chartTouch.startDistance));
  const startSpan = chartTouch.startZoomEnd - chartTouch.startZoomStart;
  const nextSpan = Math.max(14, Math.min(maxDayIndex(), startSpan / scale));
  const centerIndex = chartTouch.startZoomStart + chartTouch.centerRatio * startSpan;
  setChartZoom(centerIndex - chartTouch.centerRatio * nextSpan, centerIndex + (1 - chartTouch.centerRatio) * nextSpan);
  state.hoverIndex = null;
  drawChart();
}

function endPinchZoom(event) {
  chartTouch.pointers.delete(event.pointerId);
  if (!chartTouch.pinching) return;
  if (chartTouch.pointers.size < 2) {
    chartTouch.pinching = false;
    refs.tooltip.hidden = true;
    updateUrl();
    syncChartScrollbars();
  }
}

function startChartDrag(event) {
  if (event.pointerType === "touch") {
    chartTouch.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (chartTouch.pointers.size === 2) {
      event.preventDefault();
      startPinchZoom();
    }
    return;
  }
  if (event.button !== 0) return;
  const plot = refs.canvas._plot;
  if (!plot) return;
  const point = canvasPoint(event);
  if (!pointIsInsidePlot(point, plot)) return;
  event.preventDefault();
  const zoom = chartZoom();
  chartDrag.active = true;
  chartDrag.moved = false;
  chartDrag.startX = event.clientX;
  chartDrag.startY = event.clientY;
  chartDrag.startZoomStart = zoom.start;
  chartDrag.startZoomEnd = zoom.end;
  state.hoverIndex = null;
  refs.tooltip.hidden = true;
  refs.canvas.classList.add("dragging");
  refs.canvas.setPointerCapture?.(event.pointerId);
}

function moveChartDrag(event) {
  if (event.pointerType === "touch") {
    if (!chartTouch.pointers.has(event.pointerId)) return;
    chartTouch.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    updatePinchZoom(event);
    return;
  }
  if (!chartDrag.active) return;
  event.preventDefault();
  const plot = refs.canvas._plot;
  if (!plot) return;
  const dx = event.clientX - chartDrag.startX;
  if (Math.abs(dx) > 2 || Math.abs(event.clientY - chartDrag.startY) > 2) chartDrag.moved = true;
  const zoomSpan = chartDrag.startZoomEnd - chartDrag.startZoomStart;
  const dayShift = -(dx / plot.width) * zoomSpan;
  setChartZoom(chartDrag.startZoomStart + dayShift, chartDrag.startZoomEnd + dayShift);
  state.hoverIndex = null;
  refs.tooltip.hidden = true;
  drawChart();
}

function endChartDrag(event) {
  if (event.pointerType === "touch") {
    endPinchZoom(event);
    return;
  }
  if (!chartDrag.active) return;
  refs.canvas.releasePointerCapture?.(event.pointerId);
  refs.canvas.classList.remove("dragging");
  chartDrag.active = false;
  refs.tooltip.hidden = true;
  updateUrl();
}

function handleChartWheel(event) {
  const plot = refs.canvas._plot;
  if (!plot) return;
  const rect = refs.canvas.getBoundingClientRect();
  const cssX = event.clientX - rect.left;
  const cssY = event.clientY - rect.top;
  if (cssX < plot.left || cssX > plot.right || cssY < plot.top || cssY > plot.bottom) return;
  event.preventDefault();
  const zoom = chartZoom();
  const ratio = (cssX - plot.left) / plot.width;
  const centerIndex = zoom.start + ratio * (zoom.end - zoom.start);
  const factor = event.deltaY < 0 ? 0.78 : 1.28;
  const maxSpan = maxDayIndex();
  const nextSpan = Math.max(14, Math.min(maxSpan, (zoom.end - zoom.start) * factor));
  setChartZoom(centerIndex - ratio * nextSpan, centerIndex + (1 - ratio) * nextSpan);
  updateUrl();
  renderTooltip(event);
}

function updateControlState() {
  refs.viewModeSelect.value = state.viewMode;
  refs.periodSelect.value = state.period;
  refs.yearSelect.value = state.selectedYear;
  refs.backgroundPeriodSelect.value = state.backgroundPeriod;
  refs.periodSelect.disabled = state.viewMode !== "stats";
  refs.yearSelect.disabled = state.viewMode !== "year";
  refs.backgroundPeriodSelect.disabled = state.viewMode !== "year";
}

function renderAll() {
  setActiveElementButtons();
  applyCollapsedState();
  setOverlayButtons();
  fillThresholds();
  fillPeriods();
  fillYears();
  updateControlState();
  refs.regionSelect.value = state.region;
  fillStations({ keepCurrent: true });
  refs.stationSelect.value = state.stationKey;
  updateSummary();
  updateMeta();
  updateUrl();
  drawChart();
  window.requestAnimationFrame(setPanelTogglePositions);
}

function bindEvents() {
  refs.regionSelect.addEventListener("change", async () => {
    state.region = refs.regionSelect.value;
    fillStations({ keepCurrent: false });
    await loadStationData(state.stationKey);
    if (!forecastAvailable()) state.showForecast = false;
    renderAll();
  });
  refs.stationSelect.addEventListener("change", async () => {
    state.stationKey = refs.stationSelect.value;
    syncRegionToCurrentStation();
    await loadStationData(state.stationKey);
    if (!forecastAvailable()) state.showForecast = false;
    renderAll();
  });
  refs.stationSearch.addEventListener("input", async () => {
    state.search = refs.stationSearch.value;
    fillStations({ keepCurrent: true });
    syncRegionToCurrentStation();
    await loadStationData(state.stationKey);
    if (!forecastAvailable()) state.showForecast = false;
    renderAll();
  });
  refs.thresholdSelect.addEventListener("change", () => {
    state.threshold = Number(refs.thresholdSelect.value);
    renderAll();
  });
  refs.viewModeSelect.addEventListener("change", () => {
    state.viewMode = refs.viewModeSelect.value;
    renderAll();
  });
  refs.periodSelect.addEventListener("change", () => {
    state.period = refs.periodSelect.value;
    renderAll();
  });
  refs.yearSelect.addEventListener("change", () => {
    state.selectedYear = refs.yearSelect.value;
    renderAll();
  });
  refs.backgroundPeriodSelect.addEventListener("change", () => {
    state.backgroundPeriod = refs.backgroundPeriodSelect.value;
    renderAll();
  });
  refs.headerToggle.addEventListener("click", () => {
    state.collapsed.header = !state.collapsed.header;
    renderAll();
  });
  refs.controlsToggle.addEventListener("click", () => {
    state.collapsed.controls = !state.collapsed.controls;
    renderAll();
  });
  refs.summaryToggle.addEventListener("click", () => {
    state.collapsed.summary = !state.collapsed.summary;
    renderAll();
  });
  for (const button of [refs.maxButton, refs.minButton]) {
    button.addEventListener("click", () => {
      state.element = button.dataset.element;
      state.threshold = elements[state.element].defaultThreshold;
      renderAll();
    });
  }
  refs.thresholdMarkersButton.addEventListener("click", () => {
    state.showThresholdMarkers = !state.showThresholdMarkers;
    renderAll();
  });
  refs.currentYearButton.addEventListener("click", () => {
    state.showCurrentYear = !state.showCurrentYear;
    renderAll();
  });
  refs.forecastButton.addEventListener("click", () => {
    if (!forecastAvailable()) return;
    state.showForecast = !state.showForecast;
    renderAll();
  });
  refs.canvas.addEventListener("mousemove", renderTooltip);
  refs.canvas.addEventListener("pointerdown", startChartDrag);
  refs.canvas.addEventListener("pointermove", moveChartDrag);
  refs.canvas.addEventListener("pointerup", endChartDrag);
  refs.canvas.addEventListener("pointercancel", endChartDrag);
  refs.canvas.addEventListener("wheel", handleChartWheel, { passive: false });
  refs.canvas.addEventListener("dblclick", resetChartZoom);
  refs.canvas.addEventListener("mouseleave", () => {
    state.hoverIndex = null;
    refs.tooltip.hidden = true;
    drawChart();
  });
  refs.canvas.addEventListener("touchmove", (event) => {
    if (event.touches.length) renderTooltip(event.touches[0]);
  }, { passive: true });
  refs.chartHScroll.addEventListener("pointerdown", startChartScrollbarDrag);
  refs.chartHScroll.addEventListener("pointermove", moveChartScrollbarDrag);
  refs.chartHScroll.addEventListener("pointerup", endChartScrollbarDrag);
  refs.chartHScroll.addEventListener("pointercancel", endChartScrollbarDrag);
  refs.chartHScroll.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      nudgeChartScrollbar(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  refs.downloadButton.addEventListener("click", () => {
    const station = currentStation();
    const link = document.createElement("a");
    link.href = refs.canvas.toDataURL("image/png");
    link.download = `${station.name}_${elements[state.element].name}_${state.viewMode}.png`;
    link.click();
  });
  refs.copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      refs.statusText.textContent = "リンクをコピーしました";
    } catch {
      refs.statusText.textContent = location.href;
    }
  });
  window.addEventListener("resize", () => {
    window.clearTimeout(window._chartResizeTimer);
    window._chartResizeTimer = window.setTimeout(() => {
      drawChart();
      setPanelTogglePositions();
    }, 120);
  });
  window.addEventListener("scroll", () => {
    window.requestAnimationFrame(setPanelTogglePositions);
  }, { passive: true });
}

async function loadJson(url, fallback) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

async function init() {
  const params = new URLSearchParams(location.search);
  const [data, forecastData] = await Promise.all([
    loadJson(DATA_URL, null),
    loadJson(FORECAST_URL, null),
  ]);
  if (!data) throw new Error("climatology data load failed");
  state.data = data;
  state.forecastData = forecastData;

  const stationKeys = new Set(data.stations.map((station) => station.station_key));
  if (stationKeys.has(params.get("station"))) state.stationKey = params.get("station");
  if (elements[params.get("element")]) state.element = params.get("element");
  if (params.has("threshold") && THRESHOLDS.includes(Number(params.get("threshold")))) state.threshold = Number(params.get("threshold"));
  else state.threshold = elements[state.element].defaultThreshold;
  if (["stats", "year"].includes(params.get("mode"))) state.viewMode = params.get("mode");
  if (data.meta.periods.some((period) => period.key === params.get("period"))) state.period = params.get("period");
  if (data.meta.periods.some((period) => period.key === params.get("bg"))) state.backgroundPeriod = params.get("bg");
  if (data.meta.years.includes(Number(params.get("year")))) state.selectedYear = params.get("year");
  state.showThresholdMarkers = params.get("markers") !== "0";
  state.showCurrentYear = params.get("current") === "1";
  state.showForecast = params.get("forecast") === "1";
  state.collapsed.header = params.get("hideHeader") === "1";
  state.collapsed.controls = params.get("hideControls") === "1";
  state.collapsed.summary = params.get("hideSummary") === "1";
  const z0 = Number(params.get("z0"));
  const z1 = Number(params.get("z1"));
  if (finite(z0) && finite(z1) && z1 > z0) {
    setChartZoom(z0, z1);
  } else {
    setChartZoom(0, maxDayIndex());
  }
  await loadStationData(state.stationKey);
  const station = currentStation();
  state.region = station.region;
  fillRegions();
  fillStations();
  fillThresholds();
  fillPeriods();
  fillYears();
  updateMeta();
  bindEvents();
  if (!forecastAvailable()) state.showForecast = false;
  renderAll();
}

init().catch((error) => {
  refs.statusText.textContent = `読み込みに失敗しました: ${error.message}`;
});
