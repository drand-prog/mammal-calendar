// Auto-ported from the original single-file artifact script.
// Vanilla imperative DOM code, run once after BODY_HTML mounts.
// eslint-disable
export function initMammalCalendarApp(SPECIES_DATA, INITIAL_FAQS) {
"use strict";

  "use strict";

  // ---------- Clade / month metadata ----------
  // index = calendar month (0 = January)
  var CLADES = [
    { name:"Primates",           formal:"Primates",          month:0,  icon:iconPrimate },
    { name:"Rodents",            formal:"Rodentia",          month:1,  icon:iconRodent },
    { name:"Lagomorphs",         formal:"Lagomorpha",        month:2,  icon:iconLagomorph },
    { name:"Monotremes",         formal:"Monotremata",       month:3,  icon:iconMonotreme },
    { name:"Marsupials",         formal:"Marsupialia",       month:4,  icon:iconMarsupial },
    { name:"Afroinsectiphiles",  formal:"Afroinsectiphilia", month:5,  icon:iconAfro },
    { name:"Paenungulates",      formal:"Paenungulata",      month:6,  icon:iconPaenungulate },
    { name:"Carnivorans",        formal:"Carnivora",         month:7,  icon:iconCarnivore },
    { name:"Xenarthrans",        formal:"Xenarthra",         month:8,  icon:iconXenarthra },
    { name:"Eulipotyphlans",     formal:"Eulipotyphla",      month:9,  icon:iconEulipotyphla },
    { name:"Chiropterans",       formal:"Chiroptera",        month:10, icon:iconBat },
    { name:"Ungulates",          formal:"Ungulata (incl. whales)", month:11, icon:iconUngulate }
  ];
  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var MONTH_DAYS  = [31,29,31,30,31,30,31,31,30,31,30,31]; // generous Feb, day max is 26 anyway

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

  document.getElementById("totalCount").textContent = DATA.length;

  // ---------- Letter math ----------
  function letterIndex(ch){ return ch.toUpperCase().charCodeAt(0) - 64; } // A=1..Z=26

  function dayOf(species){ return letterIndex(species[0]); } // 1..26

  function hourOf(genus){
    var idx = letterIndex(genus[0]);
    return idx <= 23 ? idx - 1 : 24; // A..W -> 0..22, X/Y/Z -> 24
  }

  function minuteOf(species){ return letterIndex(species[species.length - 1]); } // 1..26

  function pad2(n){ return String(n).padStart(2,"0"); }

  function compute(entry){
    var clade = CLADES[entry[3]];
    var species = entry[2];
    var genus = entry[1];
    var override = entry[5] || null;
    var day = (override && override.day != null) ? override.day : dayOf(species);
    var hour = (override && override.hour != null) ? override.hour : hourOf(genus);
    var minute = (override && override.minute != null) ? override.minute : minuteOf(species);
    var month = (override && override.month != null) ? override.month : clade.month;
    return {
      common: entry[0], genus: genus, species: species,
      clade: clade, month: month,
      day: day, hour: hour, minute: minute,
      fact: entry[4] || null,
      override: override
    };
  }

  // ---------- Wheel geometry ----------
  var CX = 450, CY = 450;
  var R_OUTER = 264, R_TICK_OUT = 250, R_TICK_IN = 232, R_LABEL = 205, R_CLADE = 178, R_INNER = 108, R_HUB = 78;
  var R_HIST_BASE = R_OUTER + 6;
  var HIST_BAR_UNIT = 34;       // a "scaled" bar's max reach
  var HIST_UNSCALED_MULT = 4;   // unscaled mode's tallest bar reaches 4x that
  var R_HIST_MAX = R_HIST_BASE + HIST_BAR_UNIT * HIST_UNSCALED_MULT; // canvas reserves room for the taller of the two modes
  var NEEDLE_LEN = R_TICK_IN - 4;

  function polar(cx, cy, r, deg){
    var rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }
  function arcPath(r, a0, a1){
    var p0 = polar(CX,CY,r,a0), p1 = polar(CX,CY,r,a1);
    var large = (a1 - a0) % 360 > 180 ? 1 : 0;
    return "M"+p0.x.toFixed(2)+","+p0.y.toFixed(2)+" A"+r+","+r+" 0 "+large+" 1 "+p1.x.toFixed(2)+","+p1.y.toFixed(2);
  }
  function wedgePath(rIn, rOut, a0, a1){
    var large = (a1 - a0) % 360 > 180 ? 1 : 0;
    var o0 = polar(CX,CY,rOut,a0), o1 = polar(CX,CY,rOut,a1);
    var i1 = polar(CX,CY,rIn,a1), i0 = polar(CX,CY,rIn,a0);
    return [
      "M", o0.x.toFixed(2), o0.y.toFixed(2),
      "A", rOut, rOut, 0, large, 1, o1.x.toFixed(2), o1.y.toFixed(2),
      "L", i1.x.toFixed(2), i1.y.toFixed(2),
      "A", rIn, rIn, 0, large, 0, i0.x.toFixed(2), i0.y.toFixed(2),
      "Z"
    ].join(" ");
  }

  var svg = document.getElementById("wheel");
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs){
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function buildWheel(){
    var wedgeAngle = 360/12;

    // outer rim
    svg.appendChild(el("circle",{cx:CX,cy:CY,r:R_OUTER,fill:"none",stroke:"var(--border)","stroke-width":1}));

    CLADES.forEach(function(clade, i){
      var a0 = i*wedgeAngle, a1 = (i+1)*wedgeAngle;

      var wedge = el("path",{
        d: wedgePath(R_INNER, R_OUTER, a0, a1),
        fill: i%2===0 ? "var(--wedge-a)" : "var(--wedge-b)",
        stroke: "var(--border)", "stroke-width":1,
        class:"wedge", "data-month": clade.month
      });
      svg.appendChild(wedge);

      // 26 day ticks (alphabet ring)
      for (var d=0; d<26; d++){
        var ang = a0 + (d/26)*wedgeAngle;
        var isMajor = (d % 5 === 0);
        var p0 = polar(CX,CY,R_TICK_IN,ang);
        var p1 = polar(CX,CY, isMajor ? R_TICK_OUT : R_TICK_OUT-6, ang);
        svg.appendChild(el("line",{
          x1:p0.x.toFixed(2), y1:p0.y.toFixed(2), x2:p1.x.toFixed(2), y2:p1.y.toFixed(2),
          class:"tick"+(isMajor?" major":"")
        }));
      }

      // month label + clade label, centered in wedge, upright
      var mid = a0 + wedgeAngle/2;
      var lp = polar(CX,CY,R_LABEL,mid);
      var t1 = el("text",{x:lp.x.toFixed(2), y:lp.y.toFixed(2), class:"wedge-label", "text-anchor":"middle"});
      t1.textContent = MONTH_NAMES[clade.month];
      svg.appendChild(t1);

      var cp = polar(CX,CY,R_CLADE,mid);
      var t2 = el("text",{x:cp.x.toFixed(2), y:cp.y.toFixed(2), class:"wedge-clade", "text-anchor":"middle"});
      t2.textContent = clade.name;
      svg.appendChild(t2);

      // small icon glyph near outer edge
      var ip = polar(CX,CY, R_OUTER-16, mid);
      var g = el("g",{transform:"translate("+ip.x.toFixed(2)+","+ip.y.toFixed(2)+")", opacity:.8});
      clade.icon(g, el);
      svg.appendChild(g);

      // radial divider
      var d0 = polar(CX,CY,R_INNER,a0), d1 = polar(CX,CY,R_OUTER,a0);
      svg.appendChild(el("line",{x1:d0.x.toFixed(2),y1:d0.y.toFixed(2),x2:d1.x.toFixed(2),y2:d1.y.toFixed(2), class:"tick major"}));
    });

    // hub
    svg.appendChild(el("circle",{cx:CX,cy:CY,r:R_INNER-6,class:"hub-ring"}));
    svg.appendChild(el("circle",{cx:CX,cy:CY,r:R_HUB,class:"hub"}));
    var hubT1 = el("text",{x:CX,y:CY-4,"text-anchor":"middle",class:"hub-text",style:"font-size:15px;"});
    hubT1.textContent = "twelve";
    svg.appendChild(hubT1);
    var hubT2 = el("text",{x:CX,y:CY+15,"text-anchor":"middle",class:"hub-text",style:"font-size:15px;"});
    hubT2.textContent = "clades";
    svg.appendChild(hubT2);

    // needle (hidden until a mammal is chosen)
    var needleOrigin = "transform-origin:"+CX+"px "+CY+"px;";
    var needle = el("line",{x1:CX,y1:CY,x2:CX,y2:CY-NEEDLE_LEN,class:"needle",id:"needle",style:needleOrigin+"transform:rotate(0deg);"});
    svg.appendChild(needle);
    var needleDot = el("circle",{cx:CX,cy:CY-NEEDLE_LEN,r:5.5,class:"needle-dot",id:"needleDot",style:needleOrigin+"transform:rotate(0deg);"});
    svg.appendChild(needleDot);
  }

  function pointNeedle(month, day){
    var wedgeAngle = 360/12;
    var ang = month*wedgeAngle + ((day-0.5)/26)*wedgeAngle;
    var needle = document.getElementById("needle");
    var dot = document.getElementById("needleDot");
    needle.style.transform = "rotate("+ang+"deg)";
    dot.style.transform = "rotate("+ang+"deg)";
    needle.classList.add("live");
    dot.classList.add("live");

    document.querySelectorAll(".wedge").forEach(function(w){
      w.classList.toggle("active", Number(w.getAttribute("data-month")) === month);
    });
  }

  // ---------- Species-count histogram around the rim ----------
  // Three display modes:
  //  - "hidden":   no histogram at all
  //  - "scaled":   bar height relative to that MONTH's own busiest day
  //                (every clade's shape is visible, regardless of size)
  //  - "unscaled": bar height relative to the single busiest day anywhere
  //                (true relative sizes — smaller clades read as near-flat)
  var HIST_COUNTS = null, HIST_GLOBAL_MAX = 0, histGroup = null;

  function computeHistCounts(){
    var counts = [];
    for (var m = 0; m < 12; m++){
      counts[m] = [];
      for (var d = 0; d <= 26; d++) counts[m][d] = 0;
    }
    DATA.forEach(function(entry){
      var r = compute(entry);
      counts[r.month][r.day]++;
    });
    HIST_COUNTS = counts;
    HIST_GLOBAL_MAX = 0;
    for (var mi = 0; mi < 12; mi++){
      HIST_GLOBAL_MAX = Math.max(HIST_GLOBAL_MAX, Math.max.apply(null, counts[mi].slice(1, 27)));
    }
  }

  function renderHistogram(mode){
    histGroup.innerHTML = "";
    if (mode === "hidden") return;

    var wedgeAngle = 360/12;
    var barSpanDeg = (wedgeAngle/26) * 0.78;
    var barWidthPx = 2 * R_HIST_BASE * Math.sin((barSpanDeg/2) * Math.PI/180);

    // Zero-baseline ring, split into 12 dashed arcs (one per wedge) with a
    // hairline gap at each month boundary.
    var wedgeArc = 2*Math.PI*R_HIST_BASE/12;
    histGroup.appendChild(el("circle",{cx:CX,cy:CY,r:R_HIST_BASE,class:"hist-base",
      "stroke-dasharray":(wedgeArc*0.97)+" "+(wedgeArc*0.03)}));

    for (var month = 0; month < 12; month++){
      var a0 = month*wedgeAngle;
      var wedgeMax = Math.max.apply(null, HIST_COUNTS[month].slice(1, 27));
      var denom = mode === "unscaled" ? HIST_GLOBAL_MAX : wedgeMax;
      var maxReach = mode === "unscaled" ? HIST_BAR_UNIT * HIST_UNSCALED_MULT : HIST_BAR_UNIT;
      for (var day = 1; day <= 26; day++){
        var count = HIST_COUNTS[month][day];
        if (!count || !denom) continue;
        var len = (count/denom) * maxReach;
        var ang = a0 + ((day-0.5)/26)*wedgeAngle;
        var p0 = polar(CX,CY,R_HIST_BASE,ang);
        var p1 = polar(CX,CY,R_HIST_BASE+len,ang);
        var bar = el("line",{
          x1:p0.x.toFixed(2), y1:p0.y.toFixed(2), x2:p1.x.toFixed(2), y2:p1.y.toFixed(2),
          class:"hist-bar", "stroke-width":barWidthPx.toFixed(2)
        });
        var t = document.createElementNS(NS,"title");
        t.textContent = MONTH_NAMES[month] + " " + day + " (" + letterForDay(day) + ") — " + count + " species";
        bar.appendChild(t);
        histGroup.appendChild(bar);
      }
    }
  }

  var HIST_MODE_KEY = "mammal-ephemeris-hist-mode";
  function loadHistMode(){
    try {
      var v = localStorage.getItem(HIST_MODE_KEY);
      if (v === "hidden" || v === "scaled" || v === "unscaled") return v;
    } catch (err) {}
    return "scaled";
  }
  function saveHistMode(mode){
    try { localStorage.setItem(HIST_MODE_KEY, mode); } catch (err) {}
  }

  function setHistMode(mode){
    renderHistogram(mode);
    saveHistMode(mode);
    document.querySelectorAll(".hist-opt").forEach(function(btn){
      var active = btn.getAttribute("data-mode") === mode;
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
  }

  // ---------- Fixed holiday markers (Groundhog Day, Mole Day, ...) ----------
  var R_MARK = R_HIST_MAX + 14;
  function starPath(){ return "M0,-6.5 L1.9,-2.1 L6.6,-2 L2.9,1.1 L4.2,5.7 L0,3 L-4.2,5.7 L-2.9,1.1 L-6.6,-2 L-1.9,-2.1 Z"; }

  function fixedEntries(){ return DATA.filter(function(e){ return e[5] && e[5].holiday; }); }

  function drawFixedMarkers(){
    var wedgeAngle = 360/12;
    fixedEntries().forEach(function(entry){
      var r = compute(entry);
      var ang = r.month*wedgeAngle + ((r.day-0.5)/26)*wedgeAngle;
      var rim = polar(CX,CY,R_HIST_MAX,ang);
      var tip = polar(CX,CY,R_MARK-7,ang);
      svg.appendChild(el("line",{x1:rim.x.toFixed(2),y1:rim.y.toFixed(2),x2:tip.x.toFixed(2),y2:tip.y.toFixed(2),stroke:"var(--clay)","stroke-width":1.4}));

      var p = polar(CX,CY,R_MARK,ang);
      var g = el("g",{transform:"translate("+p.x.toFixed(2)+","+p.y.toFixed(2)+")",style:"cursor:pointer;"});
      g.appendChild(el("path",{d:starPath(),fill:"var(--clay)",stroke:"var(--surface)","stroke-width":1}));
      var titleEl = document.createElementNS(NS,"title");
      titleEl.textContent = entry[5].holiday + " — " + MONTH_NAMES[r.month] + " " + r.day + " (" + r.common + ")";
      g.appendChild(titleEl);
      g.addEventListener("click", function(){ selectEntry(entry); });
      svg.appendChild(g);
    });
  }

  function buildFixedLegend(){
    var container = document.getElementById("fixedLegend");
    container.innerHTML = "";
    fixedEntries().forEach(function(entry){
      var r = compute(entry);
      var ov = entry[5];
      var timeStr = (ov.hour != null || ov.minute != null) ? (", " + pad2(r.hour) + ":" + pad2(r.minute)) : "";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fixed-item";
      btn.innerHTML = '<svg width="10" height="10" viewBox="-7 -7 14 14"><path d="'+starPath()+'" fill="currentColor"/></svg><b></b><span></span>';
      btn.querySelector("b").textContent = ov.holiday;
      btn.querySelector("span").textContent = " — " + MONTH_NAMES[r.month] + " " + r.day + timeStr;
      btn.title = r.common + " (" + r.genus + " " + r.species + ")";
      btn.addEventListener("click", function(){ selectEntry(entry); });
      container.appendChild(btn);
    });
  }

  // ---------- Small clade icon glyphs (simple line marks, ~14px) ----------
  function stroke(g, elFn, attrs){ attrs.fill = attrs.fill || "none"; attrs.stroke = attrs.stroke || "var(--text-muted)"; attrs["stroke-width"]=attrs["stroke-width"]||1.3; attrs["stroke-linecap"]="round"; g.appendChild(elFn("path", attrs)); }

  function iconPrimate(g, elFn){ stroke(g, elFn, {d:"M-5,5 Q-5,-4 0,-4 Q5,-4 5,5 M-5,5 L-6,7 M5,5 L6,7 M-2,-4 L-2,-6 M2,-4 L2,-6"}); }
  function iconRodent(g, elFn){ stroke(g, elFn, {d:"M-6,3 Q-6,-3 0,-3 Q7,-3 7,1 L3,1 M-2,-3 L-4,-6 M7,1 L9,0"}); }
  function iconLagomorph(g, elFn){ stroke(g, elFn, {d:"M-2,2 Q-4,-6 -1,-7 Q1,-6 -1,1 M2,2 Q0,-7 3,-7 Q5,-6 1,1 M-3,3 Q0,6 3,3"}); }
  function iconMonotreme(g, elFn){ g.appendChild(elFn("ellipse",{cx:0,cy:0,rx:5,ry:6.5,fill:"none",stroke:"var(--text-muted)","stroke-width":1.3})); }
  function iconMarsupial(g, elFn){ stroke(g, elFn, {d:"M-6,-2 Q-6,4 0,5 Q6,4 6,-2 M-4,4 Q0,7 4,4"}); }
  function iconAfro(g, elFn){ stroke(g, elFn, {d:"M-2,-4 Q-6,-4 -7,1 Q-6,4 -3,4 L4,4 Q6,4 6,1 Q6,-2 3,-2 L-2,-4 L-4,-7"}); }
  function iconPaenungulate(g, elFn){ stroke(g, elFn, {d:"M-1,-6 Q-6,-6 -6,0 Q-6,5 -1,5 M-1,-6 Q3,-6 4,-2 L2,0 L4,2"}); }
  function iconCarnivore(g, elFn){ stroke(g, elFn, {d:"M0,6 Q-5,3 -5,-1 Q-5,-4 -2,-4 Q0,-4 0,-1 Q0,-4 2,-4 Q5,-4 5,-1 Q5,3 0,6 M-2,-4 L-2,-6 M2,-4 L2,-6"}); }
  function iconXenarthra(g, elFn){ stroke(g, elFn, {d:"M-6,3 Q-6,-5 0,-5 Q6,-5 6,3 M-6,3 L6,3 M-3,-5 L-3,3 M3,-5 L3,3 M0,-5 L0,3"}); }
  function iconEulipotyphla(g, elFn){ stroke(g, elFn, {d:"M-5,4 Q-6,-4 0,-5 Q6,-5 5,3 M-5,-2 L-7,-3 M-4,-4 L-6,-6 M-2,-5 L-3,-7 M0,-5 L0,-7 M2,-5 L3,-7"}); }
  function iconBat(g, elFn){ stroke(g, elFn, {d:"M0,1 Q-3,-4 -8,-2 Q-6,1 -3,1 Q-1,1 0,1 Q1,1 3,1 Q6,1 8,-2 Q3,-4 0,1"}); }
  function iconUngulate(g, elFn){ stroke(g, elFn, {d:"M-3,5 L-4,-2 Q-4,-6 0,-6 Q4,-6 4,-2 L3,5 M-4,-2 L-6,-4 M4,-2 L6,-4"}); }

  buildWheel();
  histGroup = el("g", {id:"histGroup"});
  svg.appendChild(histGroup);
  computeHistCounts();
  setHistMode(loadHistMode());
  document.querySelectorAll(".hist-opt").forEach(function(btn){
    btn.setAttribute("role", "radio");
    btn.addEventListener("click", function(){ setHistMode(btn.getAttribute("data-mode")); });
  });
  drawFixedMarkers();
  buildFixedLegend();

  // ---------- Search / autocomplete ----------
  var input = document.getElementById("search");
  var resultsBox = document.getElementById("results");
  var specimen = document.getElementById("specimen");
  var emptyHint = document.getElementById("emptyHint");
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

  function selectEntry(entry){
    var r = compute(entry);
    input.value = entry[0];
    resultsBox.innerHTML = "";

    emptyHint.style.display = "none";
    specimen.classList.add("show");

    document.getElementById("outCommon").textContent = r.common;
    document.getElementById("outSci").textContent = r.genus + " " + r.species;
    document.getElementById("outCladePill").textContent = MONTH_NAMES[r.month] + " · " + r.clade.formal;

    document.getElementById("outDate").textContent = MONTH_NAMES[r.month] + " " + r.day;
    document.getElementById("outTime").textContent = pad2(r.hour) + ":" + pad2(r.minute);

    var ov = r.override;
    var note = document.getElementById("overrideNote");
    if (ov && ov.note){
      document.getElementById("overrideText").innerHTML = ov.note;
      note.classList.add("show");
    } else {
      note.classList.remove("show");
    }

    var species = r.species, genus = r.genus;
    var bd = document.getElementById("breakdown");
    bd.innerHTML = "";
    var fixedFor = ov && ov.holiday ? ("Fixed for " + ov.holiday) : null;
    var rows = [
      ["Month", (ov && ov.month != null) ? fixedFor : ("Clade " + r.clade.formal + " governs"), MONTH_NAMES[r.month]],
      ["Day", (ov && ov.day != null) ? fixedFor : ("First letter of “" + species + "” is " + species[0].toUpperCase()), "the " + ordinal(r.day)],
      ["Hour", (ov && ov.hour != null) ? fixedFor : ("First letter of “" + genus + "” is " + genus[0].toUpperCase()), pad2(r.hour) + ":00"],
      ["Minute", (ov && ov.minute != null) ? fixedFor : ("Last letter of “" + species + "” is " + species[species.length-1].toUpperCase()), ":" + pad2(r.minute)]
    ];
    rows.forEach(function(row){
      var div = document.createElement("div");
      div.className = "b-row";
      div.innerHTML = '<span class="b-label"></span><span class="b-detail"></span><span class="b-result"></span>';
      div.querySelector(".b-label").textContent = row[0];
      div.querySelector(".b-detail").textContent = row[1];
      div.querySelector(".b-result").textContent = row[2];
      bd.appendChild(div);
    });

    var fact = document.getElementById("outFact");
    var base = "<b>" + r.clade.formal + "</b> claims " + MONTH_NAMES[r.month] + ", so every species in the order shares this month &mdash; only the day and time are its own.";
    fact.innerHTML = r.fact ? (base + " " + r.fact) : base;

    pointNeedle(r.month, r.day);
    document.getElementById("wheelCaption").innerHTML = "<b>"+r.common+"</b> falls on " + MONTH_NAMES[r.month] + " " + r.day + " at " + pad2(r.hour) + ":" + pad2(r.minute) + ".";
  }

  function ordinal(n){
    var s = ["th","st","nd","rd"], v = n % 100;
    return n + (s[(v-20)%10] || s[v] || s[0]);
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

  document.querySelectorAll(".chip").forEach(function(chip){
    chip.addEventListener("click", function(){
      var name = chip.getAttribute("data-pick").toLowerCase();
      var entry = DATA.find(function(e){ return e[0].toLowerCase() === name; });
      if (entry) selectEntry(entry);
    });
  });

  // ---------- Browse by date ----------
  function letterForDay(d){ return String.fromCharCode(64 + d); } // 1->A ... 26->Z

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
  for (var d = 1; d <= 26; d++){
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
    for (var di = 0; di <= 26; di++) DATE_INDEX[mi][di] = [];
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

    pointNeedle(month, day);
    document.getElementById("wheelCaption").innerHTML =
      "<b>" + MONTH_NAMES[month] + " " + day + "</b> belongs to " + list.length + " mammal" + (list.length === 1 ? "" : "s") + " in the index.";
  }

  function browsePromptState(){
    browseSummary.textContent = "Pick a month and day above, or click the ring, to see who's celebrating.";
    browseResultsBox.innerHTML = "";
  }

  function handleBrowseChange(){
    if (browseMonthSel.value === "" || browseDaySel.value === ""){ browsePromptState(); return; }
    renderBrowse(Number(browseMonthSel.value), Number(browseDaySel.value));
  }
  browseMonthSel.addEventListener("change", handleBrowseChange);
  browseDaySel.addEventListener("change", handleBrowseChange);

  // Click anywhere on the wedge ring to browse that exact date.
  svg.addEventListener("click", function(evt){
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var ctm = svg.getScreenCTM();
    if (!ctm) return;
    var loc = pt.matrixTransform(ctm.inverse());
    var dx = loc.x - CX, dy = loc.y - CY;
    var dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < R_INNER || dist > R_HIST_MAX) return; // ignore hub & anything outside the wedges/histogram

    var wedgeAngle = 360/12;
    var degRaw = Math.atan2(dy, dx) * 180/Math.PI + 90;
    var deg = ((degRaw % 360) + 360) % 360;
    var month = Math.floor(deg / wedgeAngle);
    var within = deg - month*wedgeAngle;
    var day = Math.min(26, Math.max(1, Math.ceil((within/wedgeAngle) * 26)));
    renderBrowse(month, day);
  });

  browsePromptState();

  // ---------- FAQ accordion ----------
  function renderFaqs(){
    var list = document.getElementById("faqList");
    list.innerHTML = "";
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
      var btn = wrap.querySelector(".faq-q");
      var ans = wrap.querySelector(".faq-a");
      btn.addEventListener("click", function(){
        var open = wrap.getAttribute("data-open") === "true";
        wrap.setAttribute("data-open", open ? "false" : "true");
        btn.setAttribute("aria-expanded", open ? "false" : "true");
        ans.hidden = open;
      });
      list.appendChild(wrap);
    });
  }
  renderFaqs();
}
