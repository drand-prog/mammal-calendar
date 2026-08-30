// Auto-ported from the original single-file artifact script.
// Vanilla imperative DOM code, run once after BODY_HTML mounts.
// eslint-disable
import { MONTH_EMOJI } from "./monthEmoji";

export function initMammalCalendarApp(SPECIES_DATA, INITIAL_FAQS, BROWSE_PROMPT) {
"use strict";

  "use strict";

  // ---------- Clade / month metadata ----------
  // index = calendar month (0 = January)
  var CLADES = [
    { name:"Primates",           formal:"Primates",          month:0 },
    { name:"Rodents",            formal:"Rodentia",          month:1 },
    { name:"Lagomorphs",         formal:"Lagomorpha",        month:2 },
    { name:"Monotremes",         formal:"Monotremata",       month:3 },
    { name:"Marsupials",         formal:"Marsupialia",       month:4 },
    { name:"Afroinsectiphiles",  formal:"Afroinsectiphilia", month:5 },
    { name:"Paenungulates",      formal:"Paenungulata",      month:6 },
    { name:"Carnivorans",        formal:"Carnivora",         month:7 },
    { name:"Xenarthrans",        formal:"Xenarthra",         month:8 },
    { name:"Eulipotyphlans",     formal:"Eulipotyphla",      month:9 },
    { name:"Chiropterans",       formal:"Chiroptera",        month:10 },
    { name:"Ungulates",          formal:"Ungulata (incl. whales)", month:11 }
  ];
  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // One emoji badge per month card, upper-right corner (MONTH_EMOJI is
  // shared with icon.tsx, which draws the rotating favicon from the same
  // pool). April and June are fixed (egg for the only egg-laying mammals;
  // rainbow for Afroinsectiphilia, which has no animal emoji of its own).
  // Everywhere else with more than one plausible option, one is picked at
  // random each time the page loads.
  function pickEmoji(month){
    var options = MONTH_EMOJI[month];
    return options[Math.floor(Math.random() * options.length)];
  }
  // Highest day each month's clade can actually produce (see dayOf below):
  // February tops out at 29 (its own "leap day" code, AC), 30-day months
  // at 30, everything else at the full 31.
  var MONTH_DAYS  = [31,29,31,30,31,30,31,31,30,31,30,31];

  // ---------- Species data ----------
  // Sourced from the ASM Mammal Diversity Database (MDD v2.4), the taxonomic
  // standard maintained by the American Society of Mammalogists — every
  // currently-recognized extant species, plus two extinct species kept as a
  // memorial (Thylacine, Steller's sea cow). Pangolins (Pholidota) are folded
  // into Carnivora month; treeshrews (Scandentia) and colugos (Dermoptera)
  // are folded into Primates month, as neither has a month of its own.
  // ---------- FAQ data ----------
  // Edited by the admin panel below, which fetches this page's own served
  // HTML, replaces the text between these markers, and republishes it via
  // the `artifact` capability — so keep the markers exactly as they are.
  var FAQS = INITIAL_FAQS.slice();

  // [common name, Genus, species, cladeIndex, fact?, holidayOverride?]
  var DATA = SPECIES_DATA;

  // ---------- Letter math ----------
  function letterIndex(ch){ return ch.toUpperCase().charCodeAt(0) - 64; } // A=1..Z=26

  // Day comes from the species name's first two letters. A single letter
  // (any first letter followed by anything other than A-E) gives days
  // 1-26 directly. But when the name starts with "A" AND its second
  // letter is A-E, that pair is read as an overflow code for the days a
  // single letter can't reach: AA=27, AB=28, AC=29 (February's leap day,
  // when it applies), AD=30 (or the 28th in February, which has no 30th),
  // AE=31 (or the 28th in February, or the 30th in a 30-day month).
  function dayOf(species, month){
    var first = species[0].toUpperCase();
    var second = species.length > 1 ? species[1].toUpperCase() : "";
    if (first === "A" && second >= "A" && second <= "E"){
      switch (second){
        case "A": return 27;
        case "B": return 28;
        case "C": return 29;
        case "D": return month === 1 ? 28 : 30;
        case "E":
          if (month === 1) return 28;
          return MONTH_DAYS[month] === 30 ? 30 : 31;
      }
    }
    return letterIndex(first); // 1..26
  }

  function hourOf(genus){
    var idx = letterIndex(genus[0]);
    return idx <= 23 ? idx : 0; // A..W -> 1..23, X/Y/Z -> 0
  }

  function minuteOf(species){ return letterIndex(species[species.length - 1]); } // 1..26

  function pad2(n){ return String(n).padStart(2,"0"); }

  var EXTENDED_DAY_CODES = ["AA","AB","AC","AD","AE"]; // 27..31
  function letterForDay(d){
    return d <= 26 ? String.fromCharCode(64 + d) : EXTENDED_DAY_CODES[d - 27];
  }

  function compute(entry){
    var clade = CLADES[entry[3]];
    var species = entry[2];
    var genus = entry[1];
    var override = entry[5] || null;
    var month = (override && override.month != null) ? override.month : clade.month;
    var day = (override && override.day != null) ? override.day : dayOf(species, month);
    var hour = (override && override.hour != null) ? override.hour : hourOf(genus);
    var minute = (override && override.minute != null) ? override.minute : minuteOf(species);
    return {
      common: entry[0], genus: genus, species: species,
      clade: clade, month: month,
      day: day, hour: hour, minute: minute,
      fact: entry[4] || null,
      override: override
    };
  }

  // ---------- Month grid: a real calendar page of day boxes ----------
  var WEEKDAY_LABELS = ["S","M","T","W","T","F","S"];
  // Weekday (Sunday=0) that the 1st of each 2026 month falls on, so each
  // month's boxes line up exactly the way a 2026 wall calendar would.
  var START_WEEKDAY_2026 = [4,0,0,3,5,1,3,6,2,4,0,2];

  var monthGrid = document.getElementById("monthGrid");
  var MONTHS = []; // MONTHS[month] = { card, dayGrid, cells: {day: cellEl} }

  function buildMonthGrid(){
    CLADES.forEach(function(clade, i){
      var monthDays = MONTH_DAYS[clade.month];
      var startWeekday = START_WEEKDAY_2026[clade.month];
      var month = clade.month;

      var card = document.createElement("div");
      card.className = "month-card " + (i % 2 === 0 ? "stripe-a" : "stripe-b");
      card.setAttribute("data-month", month);

      var emojiEl = document.createElement("span");
      emojiEl.className = "month-card-emoji";
      emojiEl.setAttribute("aria-hidden", "true");
      emojiEl.textContent = pickEmoji(month);
      card.appendChild(emojiEl);

      var head = document.createElement("div");
      head.className = "month-card-head";

      var labels = document.createElement("div");
      labels.className = "month-card-labels";
      var nameEl = document.createElement("span");
      nameEl.className = "month-card-name";
      nameEl.textContent = MONTH_NAMES[month];
      var cladeEl = document.createElement("span");
      cladeEl.className = "month-card-clade";
      cladeEl.textContent = clade.name;
      labels.appendChild(nameEl);
      labels.appendChild(cladeEl);
      head.appendChild(labels);
      card.appendChild(head);

      var dayGrid = document.createElement("div");
      dayGrid.className = "day-grid";
      dayGrid.setAttribute("role", "img");
      dayGrid.setAttribute("aria-label", MONTH_NAMES[month] + ", " + monthDays + " days, shaded by species count -- click a day to browse it");

      WEEKDAY_LABELS.forEach(function(w){
        var label = document.createElement("span");
        label.className = "weekday-label";
        label.textContent = w;
        label.setAttribute("aria-hidden", "true");
        dayGrid.appendChild(label);
      });

      for (var b = 0; b < startWeekday; b++){
        var blank = document.createElement("span");
        blank.className = "day-cell blank";
        blank.setAttribute("aria-hidden", "true");
        dayGrid.appendChild(blank);
      }

      var cells = {};
      for (var day = 1; day <= monthDays; day++){
        (function(day){
          var cell = document.createElement("button");
          cell.type = "button";
          cell.className = "day-cell";
          cell.setAttribute("data-month", month);
          cell.setAttribute("data-day", day);
          var num = document.createElement("span");
          num.className = "day-num";
          num.textContent = String(day);
          cell.appendChild(num);
          cell.addEventListener("click", function(){ renderBrowse(month, day); });
          dayGrid.appendChild(cell);
          cells[day] = cell;
        })(day);
      }

      card.appendChild(dayGrid);
      monthGrid.appendChild(card);

      MONTHS[month] = {card:card, dayGrid:dayGrid, cells:cells};
    });
  }

  function pointMarker(month, day){
    MONTHS.forEach(function(m, mi){
      var isTarget = mi === month;
      m.card.classList.toggle("active", isTarget);
      Object.keys(m.cells).forEach(function(d){
        m.cells[d].classList.toggle("selected", isTarget && Number(d) === day);
      });
    });
  }

  // ---------- Species-count heat map ----------
  // Three display modes, mirroring the old histogram's:
  //  - "hidden":   no shading at all
  //  - "scaled":   shading relative to that MONTH's own busiest day
  //                (every clade's shape is visible, regardless of size)
  //  - "unscaled": shading relative to the single busiest day anywhere
  //                (true relative density — smaller clades read as faint)
  var DAY_COUNTS = null, DAY_GLOBAL_MAX = 0, DAY_MONTH_MAX = [];

  function computeDayCounts(){
    var counts = [];
    for (var m = 0; m < 12; m++){
      counts[m] = [];
      for (var d = 0; d <= 31; d++) counts[m][d] = 0;
    }
    DATA.forEach(function(entry){
      var r = compute(entry);
      counts[r.month][r.day]++;
    });
    DAY_COUNTS = counts;
    DAY_GLOBAL_MAX = 0;
    DAY_MONTH_MAX = [];
    for (var mi = 0; mi < 12; mi++){
      DAY_MONTH_MAX[mi] = Math.max.apply(null, counts[mi].slice(1, MONTH_DAYS[mi]+1));
      DAY_GLOBAL_MAX = Math.max(DAY_GLOBAL_MAX, DAY_MONTH_MAX[mi]);
    }
  }

  function paintHeatmap(mode){
    MONTHS.forEach(function(m, month){
      var denom = mode === "unscaled" ? DAY_GLOBAL_MAX : DAY_MONTH_MAX[month];
      Object.keys(m.cells).forEach(function(d){
        var day = Number(d);
        var count = DAY_COUNTS[month][day];
        var cell = m.cells[d];
        if (mode !== "hidden" && count && denom){
          var heat = Math.max(0.14, count / denom);
          cell.style.setProperty("--heat", heat.toFixed(3));
        } else {
          cell.style.removeProperty("--heat");
        }
        cell.title = count
          ? MONTH_NAMES[month] + " " + day + " (" + letterForDay(day) + ") — " + count + " species"
          : MONTH_NAMES[month] + " " + day;
      });
    });
  }

  var HEAT_MODE_KEY = "mammal-ephemeris-heat-mode";
  function loadHeatMode(){
    try {
      var v = localStorage.getItem(HEAT_MODE_KEY);
      if (v === "hidden" || v === "scaled" || v === "unscaled") return v;
    } catch (err) {}
    return "scaled";
  }
  function saveHeatMode(mode){
    try { localStorage.setItem(HEAT_MODE_KEY, mode); } catch (err) {}
  }

  function setHeatMode(mode){
    paintHeatmap(mode);
    saveHeatMode(mode);
    document.querySelectorAll(".heat-opt").forEach(function(btn){
      var active = btn.getAttribute("data-mode") === mode;
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  // ---------- Fixed holiday markers (Groundhog Day, Mole Day, ...) ----------
  function starPath(){ return "M0,-6.5 L1.9,-2.1 L6.6,-2 L2.9,1.1 L4.2,5.7 L0,3 L-4.2,5.7 L-2.9,1.1 L-6.6,-2 L-1.9,-2.1 Z"; }

  function fixedEntries(){ return DATA.filter(function(e){ return e[5] && e[5].holiday; }); }

  function drawFixedMarkers(){
    fixedEntries().forEach(function(entry){
      var r = compute(entry);
      var cell = MONTHS[r.month].cells[r.day];
      if (!cell) return;
      var star = document.createElement("span");
      star.className = "day-star";
      star.setAttribute("aria-hidden", "true");
      star.textContent = "★";
      star.title = entry[5].holiday + " — " + MONTH_NAMES[r.month] + " " + r.day + " (" + r.common + ")";
      star.addEventListener("click", function(evt){
        evt.stopPropagation();
        selectEntry(entry);
      });
      cell.appendChild(star);
    });
  }

  function buildFixedLegend(){
    var container = document.getElementById("fixedLegend");
    container.innerHTML = "";
    fixedEntries().forEach(function(entry){
      var r = compute(entry);
      var ov = entry[5];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fixed-item";
      btn.innerHTML = '<svg width="10" height="10" viewBox="-7 -7 14 14"><path d="'+starPath()+'" fill="currentColor"/></svg><b></b><span></span>';
      btn.querySelector("b").textContent = ov.holiday;
      btn.querySelector("span").textContent = " — " + MONTH_NAMES[r.month] + " " + r.day;
      btn.title = r.common + " (" + r.genus + " " + r.species + ")";
      btn.addEventListener("click", function(){ selectEntry(entry); });
      container.appendChild(btn);
    });
  }

  buildMonthGrid();
  computeDayCounts();
  setHeatMode(loadHeatMode());
  document.querySelectorAll(".heat-opt").forEach(function(btn){
    btn.setAttribute("role", "radio");
    btn.addEventListener("click", function(){ setHeatMode(btn.getAttribute("data-mode")); });
  });
  drawFixedMarkers();
  buildFixedLegend();

  // ---------- Search / autocomplete ----------
  var input = document.getElementById("search");
  var resultsBox = document.getElementById("results");
  var specimen = document.getElementById("specimen");
  var activeIndex = -1;
  var currentMatches = [];

  var RESULT_LIMIT = 60;
  var wordBoundary = {}; // cache of RegExp per query, avoids rebuilding per row

  function normalize(s){ return s.toLowerCase(); }

  function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // Lower score = more relevant: exact name, then name-starts-with,
  // then a whole-word hit, then any substring, then a scientific-name hit.
  function matchScore(e, q, wb){
    var common = normalize(e[0]);
    var sci = normalize(e[1] + " " + e[2]);
    if (common === q) return 0;
    if (common.indexOf(q) === 0) return 1;
    if (wb.test(common)) return 2;
    if (common.indexOf(q) !== -1) return 3;
    if (sci.indexOf(q) === 0) return 4;
    if (sci.indexOf(q) !== -1) return 5;
    return -1; // no match
  }

  function search(q){
    q = normalize(q.trim());
    if (!q) return { shown: [], total: 0 };
    var wb = new RegExp("\\b" + escapeRe(q));
    var scored = [];
    for (var i = 0; i < DATA.length; i++){
      var s = matchScore(DATA[i], q, wb);
      if (s !== -1) scored.push([s, i, DATA[i]]);
    }
    scored.sort(function(a, b){ return a[0] - b[0] || a[1] - b[1]; });
    return { shown: scored.slice(0, RESULT_LIMIT).map(function(t){ return t[2]; }), total: scored.length };
  }

  function buildResultRow(entry, rightLabel){
    var row = document.createElement("button");
    row.type = "button";
    row.className = "result-row";
    row.innerHTML =
      '<span class="rn"><span class="common"></span><span class="sci"></span></span>' +
      '<span class="tag"></span>';
    row.querySelector(".common").textContent = entry[0];
    row.querySelector(".sci").textContent = entry[1] + " " + entry[2];
    row.querySelector(".tag").textContent = rightLabel;
    row.addEventListener("click", function(){ selectEntry(entry); });
    return row;
  }

  function renderResults(result){
    var matches = result.shown;
    currentMatches = matches;
    activeIndex = -1;
    resultsBox.innerHTML = "";
    if (!input.value.trim()){ return; }
    if (!matches.length){
      var d = document.createElement("div");
      d.className = "no-match";
      d.textContent = "No specimen matches that name.";
      resultsBox.appendChild(d);
      return;
    }
    matches.forEach(function(entry){
      var clade = CLADES[entry[3]];
      resultsBox.appendChild(buildResultRow(entry, MONTH_NAMES[clade.month]));
    });
    if (result.total > matches.length){
      var more = document.createElement("div");
      more.className = "results-more";
      more.textContent = "Showing " + matches.length + " of " + result.total + " matches — keep typing to narrow it down.";
      resultsBox.appendChild(more);
    }
  }

  function highlight(i){
    var rows = resultsBox.querySelectorAll(".result-row");
    rows.forEach(function(r){ r.classList.remove("hi"); });
    if (i>=0 && i<rows.length){ rows[i].classList.add("hi"); rows[i].scrollIntoView({block:"nearest"}); }
  }

  // ---------- Specimen photo (fetched live from Wikipedia on selection) ----------
  // photoRequestSeq guards against a slow, now-superseded fetch overwriting
  // a photo for whatever species the user has since selected.
  var photoRequestSeq = 0;

  function loadSpecimenPhoto(r){
    var reqId = ++photoRequestSeq;
    var container = document.getElementById("specimenPhoto");
    var img = document.getElementById("specimenPhotoImg");
    var credit = document.getElementById("photoCredit");

    container.className = "specimen-photo loading";
    img.removeAttribute("src");
    img.alt = "";
    credit.setAttribute("tabindex", "-1"); // not reachable by keyboard until a photo is actually loaded

    var title = (r.genus + "_" + r.species);
    fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title))
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if (reqId !== photoRequestSeq) return; // a newer selection moved on already
        var src = data && data.thumbnail && data.thumbnail.source;
        if (!src){
          container.className = "specimen-photo";
          return;
        }
        credit.href = (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) ||
          ("https://en.wikipedia.org/wiki/" + encodeURIComponent(title));
        credit.removeAttribute("tabindex");
        img.alt = "Photo of " + r.common + " (" + r.genus + " " + r.species + ")";
        img.src = src;
        container.className = "specimen-photo loaded";
      })
      .catch(function(){
        if (reqId !== photoRequestSeq) return;
        container.className = "specimen-photo";
      });
  }

  function selectEntry(entry){
    var r = compute(entry);
    input.value = entry[0];
    resultsBox.innerHTML = "";

    specimen.classList.add("show");

    var ov = r.override;
    var greeting = "Happy " + ((ov && ov.holiday) ? ov.holiday : (r.common + " Day")) + "!";
    document.getElementById("outGreeting").textContent = greeting;
    document.getElementById("outSci").textContent = r.genus + " " + r.species;

    document.getElementById("outDate").textContent = MONTH_NAMES[r.month] + " " + r.day;
    document.getElementById("outTime").textContent = pad2(r.hour) + ":" + pad2(r.minute);

    loadSpecimenPhoto(r);

    pointMarker(r.month, r.day);
  }

  input.addEventListener("input", function(){
    renderResults(search(input.value));
  });
  input.addEventListener("keydown", function(e){
    var rows = resultsBox.querySelectorAll(".result-row");
    if (!rows.length) return;
    if (e.key === "ArrowDown"){ e.preventDefault(); activeIndex = Math.min(activeIndex+1, rows.length-1); highlight(activeIndex); }
    else if (e.key === "ArrowUp"){ e.preventDefault(); activeIndex = Math.max(activeIndex-1, 0); highlight(activeIndex); }
    else if (e.key === "Enter"){ e.preventDefault(); if (activeIndex>=0 && currentMatches[activeIndex]) selectEntry(currentMatches[activeIndex]); }
    else if (e.key === "Escape"){ resultsBox.innerHTML = ""; }
  });
  document.addEventListener("click", function(e){
    if (!e.target.closest(".search-card")) resultsBox.innerHTML = "";
  });

  // Two more "Try:" chips, randomly picked fresh on each page load and
  // appended after the curated set.
  (function addRandomChips(){
    var chipsBox = document.querySelector(".chips");
    if (!chipsBox) return;
    var picks = [];
    var tries = 0;
    while (picks.length < 2 && tries < 50){
      tries++;
      var candidate = DATA[Math.floor(Math.random() * DATA.length)];
      var alreadyPicked = picks.some(function(p){ return p[0] === candidate[0]; });
      if (!alreadyPicked) picks.push(candidate);
    }
    picks.forEach(function(entry){
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("data-pick", entry[0]);
      chip.textContent = entry[0];
      chipsBox.appendChild(chip);
    });
  })();

  document.querySelectorAll(".chip").forEach(function(chip){
    chip.addEventListener("click", function(){
      var name = chip.getAttribute("data-pick").toLowerCase();
      var entry = DATA.find(function(e){ return e[0].toLowerCase() === name; });
      if (entry) selectEntry(entry);
    });
  });

  // ---------- Browse by date ----------
  var browseMonthSel = document.getElementById("browseMonth");
  var browseDaySel = document.getElementById("browseDay");
  var browseSummary = document.getElementById("browseSummary");
  var browseResultsBox = document.getElementById("browseResults");

  var monthPlaceholder = document.createElement("option");
  monthPlaceholder.value = "";
  monthPlaceholder.textContent = "Month";
  monthPlaceholder.disabled = true;
  monthPlaceholder.selected = true;
  browseMonthSel.appendChild(monthPlaceholder);
  MONTH_NAMES.forEach(function(name, i){
    var opt = document.createElement("option");
    opt.value = i;
    opt.textContent = name;
    browseMonthSel.appendChild(opt);
  });

  var dayPlaceholder = document.createElement("option");
  dayPlaceholder.value = "";
  dayPlaceholder.textContent = "Day";
  dayPlaceholder.disabled = true;
  dayPlaceholder.selected = true;
  browseDaySel.appendChild(dayPlaceholder);
  // 1-31 always shown; a day beyond a given month's real range (e.g. Feb
  // 31) is still selectable but simply comes back with nobody in it.
  for (var d = 1; d <= 31; d++){
    var dopt = document.createElement("option");
    dopt.value = d;
    dopt.textContent = d + " — " + letterForDay(d);
    browseDaySel.appendChild(dopt);
  }

  // DATE_INDEX[month][day] -> every entry whose computed date lands there.
  // Built once so browsing (and wheel clicks) is an instant lookup, not a
  // 6,700-row scan on every interaction.
  var DATE_INDEX = [];
  for (var mi = 0; mi < 12; mi++){
    DATE_INDEX[mi] = [];
    for (var di = 0; di <= 31; di++) DATE_INDEX[mi][di] = [];
  }
  DATA.forEach(function(entry){
    var r = compute(entry);
    DATE_INDEX[r.month][r.day].push(entry);
  });

  function renderBrowse(month, day){
    browseMonthSel.value = month;
    browseDaySel.value = day;

    var list = DATE_INDEX[month][day].slice().sort(function(a, b){
      var ra = compute(a), rb = compute(b);
      return (ra.hour - rb.hour) || (ra.minute - rb.minute) || a[0].localeCompare(b[0]);
    });

    browseSummary.innerHTML = list.length
      ? "<b>" + list.length + "</b> mammal" + (list.length === 1 ? "" : "s") + " share " + MONTH_NAMES[month] + " " + day + " (" + letterForDay(day) + ")."
      : "Nobody in the index lands here — " + MONTH_NAMES[month] + " " + day + " is unclaimed.";

    browseResultsBox.innerHTML = "";
    list.forEach(function(entry){
      var r = compute(entry);
      browseResultsBox.appendChild(buildResultRow(entry, pad2(r.hour) + ":" + pad2(r.minute)));
    });

    pointMarker(month, day);
  }

  function browsePromptState(){
    browseSummary.textContent = BROWSE_PROMPT;
    browseResultsBox.innerHTML = "";
  }

  function handleBrowseChange(){
    if (browseMonthSel.value === "" || browseDaySel.value === ""){ browsePromptState(); return; }
    renderBrowse(Number(browseMonthSel.value), Number(browseDaySel.value));
  }
  browseMonthSel.addEventListener("change", handleBrowseChange);
  browseDaySel.addEventListener("change", handleBrowseChange);

  browsePromptState();

  // ---------- FAQ accordion ----------
  function renderFaqs(){
    var list = document.getElementById("faqList");
    var toggleAllBtn = document.getElementById("faqToggleAll");
    list.innerHTML = "";

    function allOpen(){
      var items = list.querySelectorAll(".faq-item");
      return items.length > 0 && Array.prototype.every.call(items, function(el){
        return el.getAttribute("data-open") === "true";
      });
    }
    function updateToggleAllLabel(){
      if (toggleAllBtn) toggleAllBtn.textContent = allOpen() ? "Collapse all" : "Expand all";
    }
    function setItemOpen(wrap, open){
      wrap.setAttribute("data-open", open ? "true" : "false");
      wrap.querySelector(".faq-q").setAttribute("aria-expanded", open ? "true" : "false");
      wrap.querySelector(".faq-a").hidden = !open;
    }

    FAQS.forEach(function(item){
      var wrap = document.createElement("div");
      wrap.className = "faq-item";
      wrap.setAttribute("data-open", "false");
      wrap.innerHTML =
        '<button type="button" class="faq-q" aria-expanded="false">' +
          '<span class="faq-q-text"></span>' +
          '<span class="faq-icon" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="faq-a" hidden></div>';
      wrap.querySelector(".faq-q-text").textContent = item.q;
      wrap.querySelector(".faq-a").textContent = item.a;
      wrap.querySelector(".faq-q").addEventListener("click", function(){
        setItemOpen(wrap, wrap.getAttribute("data-open") !== "true");
        updateToggleAllLabel();
      });
      list.appendChild(wrap);
    });

    if (toggleAllBtn){
      toggleAllBtn.addEventListener("click", function(){
        var makeOpen = !allOpen();
        list.querySelectorAll(".faq-item").forEach(function(wrap){ setItemOpen(wrap, makeOpen); });
        updateToggleAllLabel();
      });
    }
    updateToggleAllLabel();
  }
  renderFaqs();

  // ---------- Auto-select today's closest mammal ----------
  // On load, show whichever species lands on today's real month/day and
  // has the hour:minute closest to right now -- using the visitor's own
  // local clock. If nobody lands on today at all, the specimen card just
  // stays hidden until the visitor picks one themselves.
  (function autoSelectForNow(){
    var now = new Date();
    var todays = DATE_INDEX[now.getMonth()][now.getDate()];
    if (!todays || !todays.length) return;

    var nowMinutes = now.getHours()*60 + now.getMinutes();
    var best = null, bestDiff = Infinity;
    todays.forEach(function(entry){
      var r = compute(entry);
      var diff = Math.abs((r.hour*60 + r.minute) - nowMinutes);
      if (diff < bestDiff){ bestDiff = diff; best = entry; }
    });
    if (best) selectEntry(best);
  })();
}
