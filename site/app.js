/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* Privacy Stack Builder. Plain JS, no dependencies, no network. */
(function () {
  "use strict";

  const D = window.STACK_DATA;
  const CRIT = Object.fromEntries(D.criteria.map((c) => [c.id, c]));
  const TOOL = Object.fromEntries(D.tools.map((t) => [t.id, t]));
  const CAT = Object.fromEntries(D.categories.map((c) => [c.id, c]));
  const STORAGE_KEY = "privacy-stack-v1";
  const HASH_VERSION = "v1";

  const state = {
    picks: {}, // categoryId -> [toolId, ...] primary first
    filterCriteria: new Set(),
    filterPlatform: "",
  };

  // ---------- helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const el = (tag, attrs, ...children) => {
    const n = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") n.className = v;
        else if (k === "text") n.textContent = v;
        else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
        else if (k === "style") Object.assign(n.style, v); // CSSOM, CSP-safe
        else if (v !== null && v !== undefined) n.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      n.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return n;
  };

  function flag(code) {
    if (!code || code === "none") return "🌍";
    return [...code.toUpperCase()]
      .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
      .join("");
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._h);
    toast._h = setTimeout(() => (t.hidden = true), 1800);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Clipboard blocked. Select and copy manually.");
    }
  }

  // ---------- state persistence ----------
  function encodeHash() {
    const parts = [HASH_VERSION];
    for (const c of D.categories) {
      const ids = state.picks[c.id] || [];
      if (ids.length) parts.push(`${c.id}=${ids.join(",")}`);
    }
    return "#" + parts.join("&");
  }

  function decodeHash(hash) {
    if (!hash || !hash.startsWith("#" + HASH_VERSION)) return null;
    const picks = {};
    for (const part of hash.slice(1).split("&").slice(1)) {
      const [cat, list] = part.split("=");
      if (!CAT[cat] || !list) continue;
      const ids = list.split(",").filter((id) => TOOL[id] && TOOL[id].category === cat);
      if (ids.length) picks[cat] = ids.slice(0, CAT[cat].max);
    }
    return picks;
  }

  function save() {
    const hash = encodeHash();
    history.replaceState(null, "", hash === "#" + HASH_VERSION ? location.pathname : hash);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.picks));
    } catch {
      /* storage unavailable; URL still carries state */
    }
  }

  function load() {
    const fromHash = decodeHash(location.hash);
    if (fromHash) {
      state.picks = fromHash;
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const [cat, ids] of Object.entries(parsed)) {
          if (CAT[cat]) state.picks[cat] = ids.filter((id) => TOOL[id]);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  // ---------- mutations ----------
  function addPick(cat, id) {
    const list = (state.picks[cat] = state.picks[cat] || []);
    if (list.includes(id) || list.length >= CAT[cat].max) return;
    list.push(id);
    commit();
  }
  function removePick(cat, id) {
    state.picks[cat] = (state.picks[cat] || []).filter((x) => x !== id);
    commit();
  }
  function promotePick(cat, id) {
    const list = state.picks[cat] || [];
    const i = list.indexOf(id);
    if (i <= 0) return;
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
    commit();
  }
  function applyPreset(p) {
    state.picks = {};
    for (const [cat, ids] of Object.entries(p.picks)) {
      if (CAT[cat]) state.picks[cat] = ids.filter((id) => TOOL[id]).slice(0, CAT[cat].max);
    }
    commit();
    toast(`Loaded "${p.label}"`);
  }
  function commit() {
    save();
    render();
  }

  // ---------- filters ----------
  function matchesFilter(t) {
    for (const c of state.filterCriteria) if (!t.criteria.includes(c)) return false;
    if (state.filterPlatform && !t.platforms.includes(state.filterPlatform)) return false;
    return true;
  }

  // ---------- rendering ----------
  function badgeCrit(id) {
    const c = CRIT[id];
    return el("span", { class: "badge", title: c.desc }, `${c.icon} ${c.label}`);
  }
  function badgesFor(t) {
    return [
      el("span", { class: "badge jur", title: "Jurisdiction" }, `${flag(t.jurisdiction)} ${t.jurisdiction === "none" ? "n/a" : t.jurisdiction}`),
      t.wip && el("span", { class: "badge wip" }, "WIP"),
      ...t.criteria.map(badgeCrit),
    ];
  }

  function renderPresets() {
    const root = $("#presets");
    root.replaceChildren(
      ...D.presets.map((p) =>
        el("button", { class: "preset", title: p.desc, onclick: () => applyPreset(p) }, p.icon, " ", p.label)
      )
    );
  }

  function renderFilters() {
    const root = $("#filter-criteria");
    root.replaceChildren(
      ...D.criteria.map((c) =>
        el(
          "span",
          {
            class: "chip" + (state.filterCriteria.has(c.id) ? " on" : ""),
            title: c.desc,
            role: "button",
            tabindex: "0",
            onclick: () => {
              state.filterCriteria.has(c.id) ? state.filterCriteria.delete(c.id) : state.filterCriteria.add(c.id);
              render();
            },
          },
          c.icon,
          " ",
          c.label
        )
      )
    );
    const sel = $("#filter-platform");
    if (sel.options.length === 1) {
      const plats = [...new Set(D.tools.flatMap((t) => t.platforms))].sort();
      for (const p of plats) sel.append(el("option", { value: p }, p));
      sel.addEventListener("change", () => {
        state.filterPlatform = sel.value;
        render();
      });
    }
  }

  function renderSlot(cat) {
    const picks = state.picks[cat.id] || [];
    const full = picks.length >= cat.max;
    const pool = D.tools.filter((t) => t.category === cat.id && !picks.includes(t.id));
    const visible = pool.filter(matchesFilter);

    const pickItems = picks.map((id, i) => {
      const t = TOOL[id];
      return el(
        "li",
        { class: "pick" + (i === 0 ? " primary" : "") },
        el("span", { class: "rank" }, i === 0 ? "MAIN" : `ALT ${i}`),
        el("div", null, el("div", { class: "name" }, t.name), el("div", { class: "meta" }, ...badgesFor(t))),
        el(
          "div",
          { class: "ctl" },
          i > 0 && el("button", { class: "small", title: "Move up", onclick: () => promotePick(cat.id, id) }, "▲"),
          el("button", { class: "small", title: "Remove", onclick: () => removePick(cat.id, id) }, "✕")
        )
      );
    });

    const candItems = visible.map((t) =>
      el(
        "li",
        { class: "cand" + (full ? " dim" : "") },
        el(
          "div",
          null,
          el("div", { class: "name" }, t.name),
          el("p", { class: "why" }, t.why),
          t.warn && el("p", { class: "warn" }, "⚠ ", t.warn),
          el("div", { class: "meta" }, ...badgesFor(t), ...t.platforms.map((p) => el("span", { class: "badge plat" }, p)))
        ),
        el("button", { class: "small primary", disabled: full ? "" : null, onclick: () => addPick(cat.id, t.id) }, "+ add")
      )
    );

    const hidden = pool.length - visible.length;
    const req = (cat.require || []).map((r) => CRIT[r].label);

    return el(
      "section",
      { class: "slot", id: "slot-" + cat.id },
      el(
        "div",
        { class: "slot-head" },
        el("h2", null, `${cat.icon} ${cat.label}`),
        req.length ? el("span", { class: "req", title: "Required for this slot" }, "needs " + req.join(", ")) : null,
        el("span", { class: "count" }, `${picks.length}/${cat.max}`)
      ),
      el("ul", { class: "picks" }, ...pickItems),
      el(
        "details",
        { class: "pool", open: picks.length === 0 ? "" : null },
        el("summary", null, `Pool: ${visible.length} available${hidden ? ` (${hidden} hidden by filter)` : ""}`),
        visible.length ? el("ul", null, ...candItems) : el("div", { class: "empty" }, pool.length ? "Nothing matches the filter." : "Every pool entry is picked.")
      )
    );
  }

  function renderSlots() {
    $("#slots").replaceChildren(...D.categories.map(renderSlot));
  }

  function renderSummary() {
    const picked = Object.values(state.picks).flat().map((id) => TOOL[id]);
    const n = picked.length;
    const filled = D.categories.filter((c) => (state.picks[c.id] || []).length).length;
    const root = $("#summary");

    const bars = D.criteria.map((c) => {
      const k = picked.filter((t) => t.criteria.includes(c.id)).length;
      const pct = n ? Math.round((100 * k) / n) : 0;
      return el(
        "div",
        { class: "bar", title: c.desc },
        el("span", null, c.icon),
        el("span", { class: "lbl" }, c.label),
        el("div", { class: "track" }, el("div", { class: "fill", style: { width: pct + "%" } })),
        el("span", { class: "n" }, `${k}/${n}`)
      );
    });

    const jurCount = {};
    for (const t of picked) jurCount[t.jurisdiction] = (jurCount[t.jurisdiction] || 0) + 1;
    const jurs = Object.entries(jurCount)
      .sort((a, b) => b[1] - a[1])
      .map(([j, k]) => el("span", { class: "badge jur" }, `${flag(j)} ${j === "none" ? "n/a" : j} ×${k}`));

    const warns = picked.filter((t) => t.warn).map((t) => el("li", null, el("b", null, t.name + ": "), t.warn));

    root.replaceChildren(
      el("h2", null, `Your stack: ${filled}/${D.categories.length} slots, ${n} tools`),
      el("h3", null, "Criteria coverage"),
      ...bars,
      el("h3", null, "Jurisdictions"),
      el("div", { class: "jurs" }, ...(jurs.length ? jurs : [el("span", { class: "badge" }, "none yet")])),
      el(
        "details",
        { open: window.matchMedia("(min-width: 961px)").matches ? "" : null },
        el("summary", null, `Trade-offs to know (${warns.length})`),
        warns.length ? el("ul", { class: "warnlist" }, ...warns) : el("p", { class: "badge" }, "none")
      )
    );
  }

  function renderPolicy() {
    const req = D.policy.required || [];
    const anyOf = D.policy.any_of || [];
    const body = $("#policy-body");
    body.replaceChildren(
      el("p", null, "A tool enters the pool only if it meets every global criterion, minus any the category waives, plus any the category adds. The check runs at build time from ", el("code", null, "data/policy.yaml"), " and ", el("code", null, "data/categories.yaml"), "."),
      el("h3", null, "Global"),
      el(
        "ul",
        null,
        ...req.map((r) => el("li", null, badgeCrit(r), " ", CRIT[r].desc)),
        ...anyOf.map((g) => el("li", null, "At least one of: ", ...g.flatMap((r, i) => [i ? " or " : "", badgeCrit(r)])))
      ),
      el("h3", null, "Per category"),
      el(
        "ul",
        null,
        ...D.categories
          .filter((c) => c.require || c.waive)
          .map((c) =>
            el(
              "li",
              null,
              `${c.icon} ${c.label}: `,
              c.require ? "also needs " + c.require.map((r) => CRIT[r].label).join(", ") : "",
              c.require && c.waive ? "; " : "",
              c.waive ? "waives " + c.waive.map((r) => CRIT[r].label).join(", ") : ""
            )
          )
      ),
      el("h3", null, "All criteria"),
      el("ul", null, ...D.criteria.map((c) => el("li", null, badgeCrit(c.id), " ", c.desc)))
    );
  }

  function render() {
    renderFilters();
    renderSlots();
    renderSummary();
  }

  // ---------- export ----------
  function exportText() {
    const lines = ["My Privacy Stack " + new Date().getFullYear(), ""];
    for (const c of D.categories) {
      const ids = state.picks[c.id] || [];
      if (!ids.length) continue;
      lines.push(`${c.icon} ${ids.map((id) => TOOL[id].name).join(", ")}`);
    }
    lines.push("", "Stack you'd swap in?", "", "Build yours: " + location.origin + location.pathname + encodeHash());
    return lines.join("\n");
  }

  // ---------- suggest a tool ----------
  const CODEBERG = "https://codeberg.org/schmidt1024/privacy-stack-builder";
  const PLATFORMS = ["android", "ios", "linux", "macos", "windows", "web"];

  function yamlStr(v) {
    // Double-quote when YAML could misread the plain scalar.
    return /[:#'"{}\[\],&*?|>!%@`]|^\s|\s$/.test(v) || v === "" ? JSON.stringify(v) : v;
  }
  function slug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tool-id";
  }
  function suggestYaml() {
    const name = $("#sg-name").value.trim();
    const cat = $("#sg-category").value;
    const plats = [...document.querySelectorAll("#sg-platforms input:checked")].map((i) => i.value);
    const crits = [...document.querySelectorAll("#sg-criteria input:checked")].map((i) => i.value);
    const jur = ($("#sg-jur").value.trim() || "none").toUpperCase().replace("NONE", "none");
    const lines = [
      `- id: ${slug(name)}`,
      `  name: ${yamlStr(name)}`,
      `  category: ${cat}`,
      `  platforms: [${plats.join(", ")}]`,
      `  jurisdiction: ${jur}`,
      `  url: ${$("#sg-url").value.trim()}`,
      `  criteria: [${crits.join(", ")}]`,
      `  why: ${yamlStr($("#sg-why").value.trim())}`,
    ];
    const warn = $("#sg-warn").value.trim();
    if (warn) lines.push(`  warn: ${yamlStr(warn)}`);
    return lines.join("\n");
  }
  function refreshSuggest() {
    $("#sg-yaml").value = suggestYaml();
  }
  function initSuggest() {
    const sel = $("#sg-category");
    sel.replaceChildren(...D.categories.map((c) => el("option", { value: c.id }, `${c.icon} ${c.label}`)));
    $("#sg-platforms").replaceChildren(
      ...PLATFORMS.map((p) => el("label", { class: "chip" }, el("input", { type: "checkbox", value: p }), p))
    );
    $("#sg-criteria").replaceChildren(
      ...D.criteria.map((c) =>
        el("label", { class: "chip", title: c.desc }, el("input", { type: "checkbox", value: c.id }), `${c.icon} ${c.label}`)
      )
    );
    $("#suggest-form").addEventListener("input", refreshSuggest);
    $("#btn-suggest").addEventListener("click", () => {
      refreshSuggest();
      $("#dlg-suggest").showModal();
    });
    $("#btn-suggest-copy").addEventListener("click", () => copy(suggestYaml()));
    $("#btn-suggest-close").addEventListener("click", () => $("#dlg-suggest").close());
    // Enter in a text field must not submit the dialog form (required
    // fields would block it and the dialog would appear stuck).
    $("#suggest-form").addEventListener("submit", (e) => {
      e.preventDefault();
      $("#dlg-suggest").close();
    });
    $("#btn-suggest-issue").addEventListener("click", () => {
      const form = $("#suggest-form");
      if (!form.reportValidity()) return;
      const name = $("#sg-name").value.trim();
      const cat = CAT[$("#sg-category").value];
      const title = `Tool suggestion: ${name} (${cat.label})`;
      const body = `Proposed entry for \`data/tools/${cat.id}.yaml\`:\n\n\`\`\`yaml\n${suggestYaml()}\n\`\`\`\n\nEvidence for the criteria ticked (license, audit report, payment page, ...):\n\n- `;
      window.open(`${CODEBERG}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
    });
    for (const a of document.querySelectorAll("#dlg-suggest .policy-link")) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        $("#dlg-policy").showModal();
      });
    }
  }

  // ---------- wiring ----------
  $("#btn-share").addEventListener("click", () => {
    save();
    copy(location.href);
  });
  $("#btn-export").addEventListener("click", () => {
    $("#export-text").value = exportText();
    $("#dlg-export").showModal();
  });
  $("#btn-copy-export").addEventListener("click", () => copy($("#export-text").value));
  $("#btn-reset").addEventListener("click", () => {
    state.picks = {};
    commit();
  });
  $("#policy-link").addEventListener("click", (e) => {
    e.preventDefault();
    $("#dlg-policy").showModal();
  });
  window.addEventListener("hashchange", () => {
    const p = decodeHash(location.hash);
    if (p) {
      state.picks = p;
      render();
    }
  });

  load();
  renderPresets();
  renderPolicy();
  initSuggest();
  render();
})();
