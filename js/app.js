(function () {
  "use strict";

  const D = window.TITLE_DATA;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // --- Deterministic randomness: the same name always gets the same career. ---

  function hashString(str) {
    // cyrb53
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }

  function makeRng(seed) {
    let a = seed;
    function next() {
      // mulberry32
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next,
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      chance: (p) => next() < p,
    };
  }

  function normalizeName(name) {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
  }

  // --- Title generation ---

  function pickNear(rng, items, level) {
    let candidates = items.filter((i) => Math.abs(i.l - level) <= 0.75);
    if (candidates.length === 0) {
      const target = Math.round(level);
      candidates = items.filter((i) => i.l === target);
    }
    return rng.pick(candidates).w;
  }

  function weightedPick(rng, items) {
    const total = items.reduce((sum, i) => sum + i.weight, 0);
    let roll = rng.next() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll < 0) return item;
    }
    return items[items.length - 1];
  }

  function makeTitle(rng, level) {
    const L = Math.round(level);
    const template = weightedPick(rng, D.templates.filter((t) => L >= t.min && L <= t.max));
    const parts = {
      prefix: () => pickNear(rng, D.prefixes, level),
      role: () => pickNear(rng, D.roles, level),
      modifier: () => rng.pick(D.modifiers),
      domain: () => rng.pick(D.domains),
      abstract: () => rng.pick(D.abstracts),
    };
    let title = template.t.replace(/\{(\w+)\}/g, (_, key) => parts[key]());
    if (rng.chance(0.3)) {
      title += rng.pick(D.suffixes.filter((s) => L >= s.min && L <= s.max)).w;
    }
    return title;
  }

  function makeUniqueTitle(rng, level, seen) {
    let title;
    for (let attempt = 0; attempt < 25; attempt++) {
      title = makeTitle(rng, level);
      if (!seen.has(title)) break;
    }
    seen.add(title);
    return title;
  }

  function levelCode(rng, level, isFinal) {
    if (isFinal) return rng.pick(D.absurdCodes);
    const major = Math.round(level * 1.4) + 1;
    return rng.pick(D.bands) + major + rng.pick(D.codeSuffixes);
  }

  // Draws from a pool without repeating until the pool runs dry.
  function makeDeck(rng, pool) {
    let remaining = [];
    return function draw() {
      if (remaining.length === 0) remaining = pool.slice();
      return remaining.splice(Math.floor(rng.next() * remaining.length), 1)[0];
    };
  }

  // --- Dates ---

  function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  function formatMonth(date) {
    return MONTHS[date.getMonth()] + " " + date.getFullYear();
  }

  function formatQuarter(date) {
    return "Q" + (Math.floor(date.getMonth() / 3) + 1) + " " + date.getFullYear();
  }

  // --- Career assembly ---

  function buildCareer(name, reorg) {
    const seed = normalizeName(name) + (reorg > 0 ? "#reorg" + reorg : "");
    const rng = makeRng(hashString(seed));
    const seen = new Set();
    const drawPast = makeDeck(rng, D.pastChanges);
    const drawFuture = makeDeck(rng, D.futureChanges);

    const pastCount = rng.int(3, 6);
    const futureCount = rng.int(5, 8);
    const currentLevel = 1.5 + rng.next() * 3;
    const lateralIndex = rng.chance(0.4) ? rng.int(1, pastCount - 1) : -1;

    // Past levels climb from ~0 up toward the current level.
    const pastLevels = [];
    for (let i = 0; i < pastCount; i++) {
      if (i === lateralIndex) {
        pastLevels.push(pastLevels[i - 1]);
        continue;
      }
      const base = (currentLevel * i) / pastCount;
      pastLevels.push(Math.max(0, base + (rng.next() - 0.5) * 0.4));
    }

    // Walk backward from now to date the past roles.
    const now = new Date();
    const currentStart = addMonths(now, -rng.int(2, 30));
    const pastRanges = [];
    let end = currentStart;
    for (let i = pastCount - 1; i >= 0; i--) {
      const start = addMonths(end, -rng.int(5, 38));
      pastRanges[i] = { start, end };
      end = start;
    }

    const steps = [];

    pastLevels.forEach((level, i) => {
      const isLateral = i === lateralIndex;
      steps.push({
        kind: "past",
        title: makeUniqueTitle(rng, level, seen),
        code: levelCode(rng, level, false),
        when: formatMonth(pastRanges[i].start) + " – " + formatMonth(pastRanges[i].end),
        change: i === 0 ? rng.pick(D.origins) : isLateral ? rng.pick(D.lateralChanges) : drawPast(),
      });
    });

    steps.push({
      kind: "current",
      title: makeUniqueTitle(rng, currentLevel, seen),
      code: levelCode(rng, currentLevel, false),
      when: formatMonth(currentStart) + " – Present",
      change: drawPast(),
    });

    let eta = now;
    for (let j = 1; j <= futureCount; j++) {
      const isFinal = j === futureCount;
      const level = isFinal ? 9 : currentLevel + ((9 - currentLevel) * j) / futureCount;
      eta = addMonths(eta, rng.int(8, 40));
      let when = rng.pick(D.finalEtas);
      if (!isFinal) {
        when = "Projected " + formatQuarter(eta);
        if (rng.chance(0.45)) when += " (" + rng.pick(D.caveats) + ")";
      }
      steps.push({
        kind: isFinal ? "future final" : "future",
        title: makeUniqueTitle(rng, level, seen),
        code: levelCode(rng, level, isFinal),
        when,
        change: isFinal ? rng.pick(D.finalChanges) : drawFuture(),
      });
    }

    return { steps, current: steps[pastCount], final: steps[steps.length - 1], futureCount };
  }

  function titleSpaceSize() {
    return D.prefixes.length * D.modifiers.length * D.domains.length * D.roles.length;
  }

  // --- Rendering ---

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render(name, reorg) {
    const career = buildCareer(name, reorg);
    const results = document.getElementById("results");
    results.replaceChildren();

    const header = el("header", "result-header");
    header.append(el("p", "eyebrow", reorg > 0 ? "Career path · Reorg #" + reorg + " applied" : "Official career path"));
    header.append(el("h2", "result-name", name));
    const current = el("p", "result-current");
    current.append("Currently serving as ", el("strong", null, career.current.title), ".");
    header.append(current);
    const outlook = el("p", "result-outlook");
    outlook.append(
      "Just " + career.futureCount + " promotions until ",
      el("strong", null, career.final.title),
      "."
    );
    header.append(outlook);
    results.append(header);

    const list = el("ol", "timeline");
    for (const step of career.steps) {
      const item = el("li", "step " + step.kind);
      if (step.kind === "current") item.append(el("span", "you-are-here", "You are here"));
      const meta = el("div", "step-meta");
      meta.append(el("span", "step-when", step.when), el("span", "step-code", step.code));
      item.append(meta, el("h3", "step-title", step.title));
      const change = el("p", "step-change");
      change.append(el("span", "step-change-label", step.kind.startsWith("future") ? "What will change" : "What changed"), step.change);
      item.append(change);
      list.append(item);
    }
    results.append(list);

    const actions = el("div", "actions");
    const copy = el("button", "button secondary", "Copy link");
    copy.type = "button";
    copy.addEventListener("click", () => copyLink(copy));
    const reorgButton = el("button", "button secondary", "Request a reorg");
    reorgButton.type = "button";
    reorgButton.addEventListener("click", () => show(name, reorg + 1));
    actions.append(copy, reorgButton);
    results.append(actions);

    results.hidden = false;
  }

  function copyLink(button) {
    const done = () => {
      button.textContent = "Copied!";
      setTimeout(() => (button.textContent = "Copy link"), 1600);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(location.href).then(done, () => prompt("Copy this link:", location.href));
    } else {
      prompt("Copy this link:", location.href);
    }
  }

  function show(name, reorg) {
    const params = new URLSearchParams();
    params.set("name", name);
    if (reorg > 0) params.set("reorg", String(reorg));
    history.replaceState(null, "", "?" + params.toString());
    render(name, reorg);
  }

  function init() {
    document.getElementById("title-count").textContent = titleSpaceSize().toLocaleString();

    const form = document.getElementById("name-form");
    const input = document.getElementById("name-input");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = input.value.trim().replace(/\s+/g, " ");
      if (!name) {
        input.focus();
        return;
      }
      show(name, 0);
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const params = new URLSearchParams(location.search);
    const name = (params.get("name") || "").trim();
    if (name) {
      input.value = name;
      render(name, Math.max(0, parseInt(params.get("reorg"), 10) || 0));
    }
  }

  init();
})();
