// Sibling of the bird calendar's apps/bird-public/lib/appScript.js. Reptiles
// and amphibians DO split cleanly into a fixed 12 groups (see the GROUPS
// table in scripts/fetch_reptile_amphibian_data.py) -- unlike birds' 46
// orders -- but this reuses the bird app's admin-editable engine anyway
// rather than hardcoding a month table the way the mammal app's CLADES does:
// ORDER_DATA (data/reptile/orders.json, admin-editable) carries a `month`
// per group that starts out null -- a species whose group has no month yet
// simply has no date, and stays out of the calendar, search's month tag,
// and the .ics export until it does.
// eslint-disable
import { ORDER_EMOJI } from "./orderEmoji";

export function initReptileCalendarApp(SPECIES_DATA, ORDER_DATA, INITIAL_FAQS, BROWSE_PROMPT, MONTH_DESCRIPTIONS) {
"use strict";

  "use strict";

  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  // Highest day a month can actually produce (see dayOf below): February
  // tops out at 29 (its own "leap day" code, AC), 30-day months at 30,
  // everything else at the full 31.
  var MONTH_DAYS  = [31,29,31,30,31,30,31,31,30,31,30,31];

  // ---------- Order data (admin-editable: which month, if any) ----------
  // [{ name, formal, count, month }] -- month is 0-11 once assigned in the
  // admin panel's "Order months" section, or null until then.
  var ORDERS = ORDER_DATA;

  function pickEmoji(month){
    var pool = [];
    ORDERS.forEach(function(o){
      if (o.month !== month) return;
      var options = ORDER_EMOJI[o.formal] || [];
      pool = pool.concat(options);
    });
    if (!pool.length) return null; // nothing assigned to this month yet
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---------- Species data ----------
  // Sourced from GBIF's backbone taxonomy -- see
  // scripts/fetch_reptile_amphibian_data.py for exactly how each of the 12
  // groups was resolved. See data/reptile/species.json.
  var FAQS = INITIAL_FAQS.slice();

  // [common name, Genus, species, orderIndex, fact?]
  var DATA = SPECIES_DATA;

  // ---------- Letter math (identical rules to the mammal calendar) ----------
  function letterIndex(ch){ return ch.toUpperCase().charCodeAt(0) - 64; } // A=1..Z=26

  // Day comes from the species name's first letter (1-26) UNLESS the name
  // contains one of nine rarer letter patterns anywhere in it, in which case
  // that pattern wins outright over the first letter: a bare Q/X/Y/Z reaches
  // the days a single letter can't (17/24/25/26 -- already where a name
  // literally starting with that letter would land, just no longer requiring
  // it to start there), and a doubled N/O/P/R/S reaches the days beyond 26
  // that used to come from the old AA-AE start-of-name codes. (Not T: a
  // doubled T is common enough to catch names that need to fall through to
  // their first letter for other reasons -- e.g. the mammal calendar's Pica
  // nuttallii, pinned to March 14 by its "N" for the Pi Day FAQ, contains
  // "TT" and would otherwise get hijacked to day 31 instead.) Each doubled
  // letter is capped by how long the month actually is: OO (28) never fires
  // in February since nothing there is longer than 28 days; RR (30) never
  // fires in a 30-day month, for the same reason -- so the search simply
  // stops before checking PP/RR/SS (or RR/SS) once the month is too short
  // for them to mean anything.
  function dayOf(species, month){
    var name = species.toUpperCase();
    if (name.indexOf("Q") !== -1) return 17;
    if (name.indexOf("X") !== -1) return 24;
    if (name.indexOf("Y") !== -1) return 25;
    if (name.indexOf("Z") !== -1) return 26;
    if (name.indexOf("NN") !== -1) return 27;
    if (name.indexOf("OO") !== -1) return 28;
    if (month === 1) return letterIndex(species[0]); // February stops here
    if (name.indexOf("PP") !== -1) return 29;
    if (name.indexOf("RR") !== -1) return 30;
    if (MONTH_DAYS[month] === 30) return letterIndex(species[0]); // 30-day months stop here
    if (name.indexOf("SS") !== -1) return 31;
    return letterIndex(species[0]);
  }

  // Hour and minute both come from the species name: add up the letter
  // values (A=1..Z=26) of every letter after the first one, then split
  // that sum's digits -- the last digit is the minute, whatever's left
  // is the hour. A sum under 10 has nothing to its left, so it reads as
  // 0:0N. Unlike day, this always starts from the second letter -- the
  // letter patterns dayOf looks for can appear anywhere in the name
  // (including inside the part that feeds this sum) without being
  // "claimed" by day the way the old two-letter overflow codes were.
  function hourMinuteOf(species){
    var sum = 0;
    for (var i = 1; i < species.length; i++) sum += letterIndex(species[i]);
    var str = String(sum);
    var minute = Number(str.charAt(str.length - 1));
    var hour = str.length > 1 ? Number(str.slice(0, -1)) : 0;
    return { hour: hour, minute: minute };
  }

  function pad2(n){ return String(n).padStart(2,"0"); }

  var EXTENDED_DAY_CODES = ["NN","OO","PP","RR","SS"]; // 27..31
  function letterForDay(d){
    return d <= 26 ? String.fromCharCode(64 + d) : EXTENDED_DAY_CODES[d - 27];
  }

  // The tuatara is the sole living species of Rhynchocephalia, an order
  // distinct from -- not a member of -- any of the 12 squamate/amphibian
  // groups above, so no group's month can ever be the right home for it.
  // It's pinned to February 29 outright, regardless of its (nominal, for
  // display purposes only) order's assigned month.
  function isTuatara(entry){ return entry[1] === "Sphenodon" && entry[2] === "punctatus"; }

  // Returns null fields when the species' order has no month yet -- callers
  // check r.month === null and render a "not yet assigned" state instead of
  // a date.
  function compute(entry){
    var order = ORDERS[entry[3]];
    var species = entry[2];
    var genus = entry[1];
    var hm = hourMinuteOf(species);
    if (isTuatara(entry)){
      return {
        common: entry[0], genus: genus, species: species,
        order: order, month: 1, day: 29,
        hour: hm.hour, minute: hm.minute,
        fact: entry[4] || null
      };
    }
    var month = order.month;
    if (month == null){
      return { common: entry[0], genus: genus, species: species, order: order, month: null, day: null, hour: null, minute: null, fact: entry[4] || null };
    }
    var day = dayOf(species, month);
    return {
      common: entry[0], genus: genus, species: species,
      order: order, month: month,
      day: day, hour: hm.hour, minute: hm.minute,
      fact: entry[4] || null
    };
  }

  // Species with a real date, precomputed once -- everything that scans by
  // date (the heatmap, DATE_INDEX, auto-select) works from this rather than
  // re-checking order.month on every pass.
  var ASSIGNED = [];
  function refreshAssigned(){
    ASSIGNED = DATA.filter(function(entry){ return isTuatara(entry) || ORDERS[entry[3]].month != null; });
  }
  refreshAssigned();

  // ---------- Month grid: a real calendar page of day boxes ----------
  var WEEKDAY_LABELS = ["S","M","T","W","T","F","S"];
  // Weekday (Sunday=0) that the 1st of each 2026 month falls on, so each
  // month's boxes line up exactly the way a 2026 wall calendar would.
  var START_WEEKDAY_2026 = [4,0,0,3,5,1,3,6,2,4,0,2];

  var monthGrid = document.getElementById("monthGrid");
  var MONTHS = []; // MONTHS[month] = { card, dayGrid, cells: {day: cellEl}, labelEl }

  function ordersForMonth(month){
    return ORDERS.filter(function(o){ return o.month === month; });
  }

  function buildMonthGrid(){
    for (var month = 0; month < 12; month++){
      (function(month){
        var monthDays = MONTH_DAYS[month];
        var startWeekday = START_WEEKDAY_2026[month];
        var assignedHere = ordersForMonth(month);

        var card = document.createElement("div");
        card.className = "month-card " + (month % 2 === 0 ? "stripe-a" : "stripe-b");
        card.setAttribute("data-month", month);

        var emoji = pickEmoji(month);
        if (emoji){
          var emojiEl = document.createElement("span");
          emojiEl.className = "month-card-emoji";
          emojiEl.setAttribute("aria-hidden", "true");
          emojiEl.textContent = emoji;
          card.appendChild(emojiEl);
        }

        var head = document.createElement("div");
        head.className = "month-card-head";

        var labels = document.createElement("div");
        labels.className = "month-card-labels";
        var nameEl = document.createElement("span");
        nameEl.className = "month-card-name";
        nameEl.textContent = MONTH_NAMES[month];
        var description = (MONTH_DESCRIPTIONS || [])[month];
        var orderEl = document.createElement("span");
        orderEl.className = "month-card-order" + (assignedHere.length ? "" : " unassigned");
        orderEl.textContent = description
          ? description
          : assignedHere.length
          ? assignedHere.map(function(o){ return o.name; }).join(" · ")
          : "No orders assigned yet";
        labels.appendChild(nameEl);
        labels.appendChild(orderEl);
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
        var _loop = function(day){
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
        };
        for (var day = 1; day <= monthDays; day++) _loop(day);

        card.appendChild(dayGrid);
        monthGrid.appendChild(card);

        MONTHS[month] = { card: card, dayGrid: dayGrid, cells: cells };
      })(month);
    }
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
  // Each day box is shaded relative to that MONTH's own busiest day, so
  // every order's shape is visible regardless of the order's overall size.
  var DAY_COUNTS = null, DAY_MONTH_MAX = [];

  function computeDayCounts(){
    var counts = [];
    for (var m = 0; m < 12; m++){
      counts[m] = [];
      for (var d = 0; d <= 31; d++) counts[m][d] = 0;
    }
    ASSIGNED.forEach(function(entry){
      var r = compute(entry);
      counts[r.month][r.day]++;
    });
    DAY_COUNTS = counts;
    DAY_MONTH_MAX = [];
    for (var mi = 0; mi < 12; mi++){
      DAY_MONTH_MAX[mi] = Math.max.apply(null, counts[mi].slice(1, MONTH_DAYS[mi]+1));
    }
  }

  function paintHeatmap(){
    MONTHS.forEach(function(m, month){
      var denom = DAY_MONTH_MAX[month];
      Object.keys(m.cells).forEach(function(d){
        var day = Number(d);
        var count = DAY_COUNTS[month][day];
        var cell = m.cells[d];
        if (count && denom){
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

  buildMonthGrid();
  computeDayCounts();
  paintHeatmap();

  // ---------- Search / autocomplete ----------
  var input = document.getElementById("search");
  var resultsBox = document.getElementById("results");
  var specimen = document.getElementById("specimen");
  var activeIndex = -1;
  var currentMatches = [];

  // Clicking anywhere in the specimen card opens its Wikipedia page in a
  // new tab -- except the photo credit link and the "Add to Calendar"
  // button, which have their own click behavior and would otherwise also
  // trigger this one.
  var currentWikiUrl = null;
  var currentEntry = null;
  specimen.addEventListener("click", function(e){
    if (!currentWikiUrl || e.target.closest(".photo-credit") || e.target.closest(".add-to-calendar")) return;
    window.open(currentWikiUrl, "_blank", "noopener");
  });

  var RESULT_LIMIT = 60;

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
      var r = compute(entry);
      resultsBox.appendChild(buildResultRow(entry, r.month != null ? MONTH_NAMES[r.month] : "Unassigned"));
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
  var photoRequestSeq = 0;

  function loadSpecimenPhoto(r){
    var reqId = ++photoRequestSeq;
    var container = document.getElementById("specimenPhoto");
    var img = document.getElementById("specimenPhotoImg");
    var credit = document.getElementById("photoCredit");

    container.className = "specimen-photo loading";
    img.removeAttribute("src");
    img.alt = "";
    credit.setAttribute("tabindex", "-1");

    var title = (r.genus + "_" + r.species);
    fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title))
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if (reqId !== photoRequestSeq) return;
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

  // ---------- "Add to Calendar" (.ics download) ----------
  function isLeapYear(y){ return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

  function icsAnchorYear(month, day){
    var year = new Date().getFullYear();
    if (month === 1 && day === 29) while (!isLeapYear(year)) year++;
    return year;
  }

  function icsEscape(text){
    return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  function foldIcsLine(line){
    var bytes = new TextEncoder().encode(line);
    if (bytes.length <= 75) return line;
    var parts = [];
    var start = 0, limit = 75;
    while (start < bytes.length){
      var end = Math.min(start + limit, bytes.length);
      while (end < bytes.length && (bytes[end] & 0xC0) === 0x80) end--;
      parts.push(new TextDecoder().decode(bytes.slice(start, end)));
      start = end;
      limit = 74;
    }
    return parts.join("\r\n ");
  }

  function icsDateTime(y, mo, d, h, mi){
    return y + pad2(mo + 1) + pad2(d) + "T" + pad2(h) + pad2(mi) + "00";
  }

  function buildIcs(r, wikiUrl){
    var now = new Date();
    var dtstamp = now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) + "T" +
      pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + "Z";

    var year = icsAnchorYear(r.month, r.day);
    var start = new Date(year, r.month, r.day, r.hour, r.minute, 0);
    var end = new Date(start.getTime() + 30 * 60000);
    var dtstart = icsDateTime(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours(), start.getMinutes());
    var dtend = icsDateTime(end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes());

    var summary = "Happy " + r.common + " Day!";
    var descLines = [r.genus + " " + r.species];
    if (r.fact) descLines.push(r.fact);
    descLines.push(wikiUrl);

    var uid = encodeURIComponent(r.genus + "_" + r.species) + "@reptileephemeris";
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//The Reptile & Amphibian Ephemeris//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + dtstamp,
      "DTSTART:" + dtstart,
      "DTEND:" + dtend,
      "RRULE:FREQ=YEARLY",
      "SUMMARY:" + icsEscape(summary),
      "DESCRIPTION:" + icsEscape(descLines.join("\n")),
      "URL:" + wikiUrl,
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return lines.map(foldIcsLine).join("\r\n") + "\r\n";
  }

  function downloadIcs(entry){
    var r = compute(entry);
    if (r.month == null) return; // no date yet -- button is hidden in this state anyway
    var wikiUrl = "https://en.wikipedia.org/wiki/" + encodeURIComponent(r.genus + "_" + r.species);
    var blob = new Blob([buildIcs(r, wikiUrl)], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = r.common.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-day.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  var addToCalendarBtn = document.getElementById("addToCalendar");
  addToCalendarBtn.addEventListener("click", function(){
    if (currentEntry) downloadIcs(currentEntry);
  });

  var userInteracted = false;

  function selectEntry(entry, isAuto){
    if (!isAuto) userInteracted = true;
    currentEntry = entry;
    var r = compute(entry);
    input.value = entry[0];
    resultsBox.innerHTML = "";

    specimen.classList.add("show");
    specimen.classList.toggle("pending", r.month == null);

    document.getElementById("outGreeting").textContent = "Happy " + r.common + " Day!";
    document.getElementById("outSci").textContent = r.genus + " " + r.species;

    if (r.month != null){
      document.getElementById("outDate").textContent = MONTH_NAMES[r.month] + " " + r.day;
      document.getElementById("outTime").textContent = pad2(r.hour) + ":" + pad2(r.minute);
      pointMarker(r.month, r.day);
    } else {
      document.getElementById("outDate").textContent = "No date yet";
      document.getElementById("outTime").textContent = "— pending —";
    }

    currentWikiUrl = "https://en.wikipedia.org/wiki/" + encodeURIComponent(r.genus + "_" + r.species);
    loadSpecimenPhoto(r);
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
  for (var d = 1; d <= 31; d++){
    var dopt = document.createElement("option");
    dopt.value = d;
    dopt.textContent = d + " — " + letterForDay(d);
    browseDaySel.appendChild(dopt);
  }

  // DATE_INDEX[month][day] -> every assigned entry whose computed date
  // lands there. Built once from ASSIGNED (not all of DATA), so browsing
  // is an instant lookup and never lists a species with no date.
  var DATE_INDEX = [];
  for (var mi = 0; mi < 12; mi++){
    DATE_INDEX[mi] = [];
    for (var di = 0; di <= 31; di++) DATE_INDEX[mi][di] = [];
  }
  ASSIGNED.forEach(function(entry){
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
      ? "<b>" + list.length + "</b> species share " + MONTH_NAMES[month] + " " + day + " (" + letterForDay(day) + ")."
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

  // ---------- Auto-select today's closest species ----------
  // Show whichever species lands on today's real month/day (among species
  // whose order has been assigned one) and has the hour:minute closest to
  // right now. If nobody lands on today -- likely, until enough orders are
  // assigned -- the specimen card just stays hidden until the visitor picks
  // one themselves.
  function autoSelectForNow(){
    if (userInteracted) return;
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
    if (best) selectEntry(best, true);
  }
  autoSelectForNow();
  setInterval(autoSelectForNow, 60000);
}
