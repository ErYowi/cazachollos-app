// Cazachollos · app móvil. Mismo panel que la extensión, adaptado al iPhone.
// Datos: chollos, mercado y tiendas del bot de la nube (GitHub). Modo vendedor/beneficios: importados desde la extensión.
import { DEFAULT_SEARCHES } from "./scanner.js";
import { sellerAnalysis, profitAnalysis, DEFAULT_COSTS } from "./seller.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (n) => (n == null || isNaN(n) ? "–" : Math.round(n).toLocaleString("es-ES") + " €");
const round5 = (x) => Math.max(5, Math.floor(x / 5) * 5);
const BF = new Date(2026, 10, 27);
const DAY = 864e5;

// ---------- almacenamiento local ----------
const store = {
  get(k, def) { try { const v = localStorage.getItem("cz." + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem("cz." + k, JSON.stringify(v)); } catch (e) { toast("Memoria llena: " + e.message); } },
};
const DEF_SETTINGS = { theme: "ext", ghUser: "ErYowi", autoMin: 5, hideB: false, onlyShip: false };
const S = {
  settings: { ...DEF_SETTINGS, ...store.get("settings", {}) },
  cloud: store.get("cloud", null), // {updated, wallapop, vinted, deals, shop}
  market: store.get("market", {}), // {nombre: [{t,w,v,wl,wn}]}
  searches: store.get("searches", DEFAULT_SEARCHES),
  hidden: store.get("hidden", []), saved: store.get("saved", []),
  watchlist: store.get("watchlist", []), inventory: store.get("inventory", []),
  sellerData: store.get("sellerData", null), sellerCosts: store.get("sellerCosts", DEFAULT_COSTS), sellerAt: store.get("sellerAt", 0),
  log: store.get("log", []),
};
const save = (k) => store.set(k, S[k]);
function addLog(m) { S.log.unshift(new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + "  " + m); S.log = S.log.slice(0, 300); save("log"); if ($("#log")) renderLog(); }
const deals = () => (S.cloud?.deals || []);

// ---------- utilidades visuales ----------
let tt;
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => el.classList.remove("on"), 3000); }
function countTo(el, to, fmt = (v) => Math.round(v).toLocaleString("es-ES")) {
  if (!el) return;
  const from = parseFloat(el.dataset.v || "0"); el.dataset.v = to;
  const t0 = performance.now(), d = 800;
  const step = (t) => { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#ff7a1a";
function spark(values, { w = 300, h = 34, color, fill = true } = {}) {
  color ||= cssVar("--a2");
  const v = values.filter((x) => x != null);
  if (v.length < 2) return `<svg viewBox="0 0 ${w} ${h}"><text x="0" y="${h - 8}" fill="currentColor" opacity=".45" font-size="11">Aún sin historial</text></svg>`;
  const min = Math.min(...v), max = Math.max(...v), rng = max - min || 1;
  const pts = v.map((y, i) => [(i / (v.length - 1)) * w, h - 3 - ((y - min) / rng) * (h - 6)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const id = "g" + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>${fill ? `<path d="${d} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/>` : ""}<path class="draw" d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
function chart(points) {
  const W = 600, H = 100;
  const all = points.flatMap((p) => [p.w, p.v, p.wl]).filter((x) => x != null);
  if (points.length < 2 || !all.length) return `<svg viewBox="0 0 ${W} ${H}"><text x="0" y="55" fill="currentColor" opacity=".45" font-size="22">Se necesitan 2 lecturas para la gráfica</text></svg>`;
  const min = Math.min(...all) * 0.97, max = Math.max(...all) * 1.03, rng = max - min || 1;
  const line = (key, color) => {
    const pts = points.map((p, i) => (p[key] == null ? null : [(i / (points.length - 1)) * W, H - 6 - ((p[key] - min) / rng) * (H - 14)])).filter(Boolean);
    if (pts.length < 2) return "";
    return `<path class="draw" d="${pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>`;
  };
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" stroke="currentColor" opacity=".12" stroke-dasharray="3 4"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${line("w", "#ff6a2a")}${line("v", "#22c55e")}${line("wl", "#ffd166")}</svg>`;
}
const fmtT = (t) => new Date(t).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
function timeAgo(t) { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; }
const margin = (d) => Math.max(0, Math.round(d.median * 0.97 - d.price - (d.ship ? 3 : 0)));

// ---------- navegación ----------
const TITLES = { resumen: ["Resumen", "Lo importante de un vistazo"], chollos: ["Chollos", "Wallapop y Vinted, desde la nube"], tiendas: ["Tiendas", "Chollómetro con margen de reventa"], mercado: ["Mercado", "Cómo se mueven los precios"], vigilados: ["Vigilados", "Anuncios que sigues de cerca"], vendedor: ["Modo vendedor", "Tus anuncios de Wallapop y Vinted"], beneficios: ["Beneficios", "Ventas, gastos y beneficio por mes"], inventario: ["Mi stock", "Apuntes a mano"], calc: ["Calculadora", "¿Compensa la compra?"], chat: ["Asistente", "Órdenes en español"], busquedas: ["Búsquedas", "Qué vigila el bot"], ajustes: ["Ajustes", "Estilo y datos"], registro: ["Registro", "Lo que ha hecho la app"], ayuda: ["Cómo funciona", "Guía rápida"] };
const MORE = [["tiendas", "🛒", "Tiendas", "nShops"], ["vigilados", "👁", "Vigilados", "nWatch"], ["beneficios", "💶", "Beneficios"], ["inventario", "📦", "Mi stock"], ["calc", "🧮", "Calculadora"], ["chat", "💬", "Asistente"], ["busquedas", "🎯", "Búsquedas"], ["ajustes", "⚙️", "Ajustes"], ["registro", "☰", "Registro"], ["ayuda", "❔", "Ayuda"]];
const badges = {};
let current = "resumen";
function openTab(id, push = true) {
  if (!TITLES[id]) id = "resumen";
  current = id;
  $$("#tabbar button[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === id));
  $("#tabbar [data-more]").classList.toggle("on", !["resumen", "chollos", "mercado", "vendedor"].includes(id));
  $$(".tab").forEach((t) => t.classList.toggle("on", t.id === id));
  const h = $("#title"); h.style.animation = "none"; void h.offsetWidth; h.style.animation = "";
  h.textContent = TITLES[id][0]; $("#subtitle").textContent = TITLES[id][1];
  if (push) history.replaceState(null, "", "#" + id);
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  closeSheet();
  if (id === "chollos") renderDeals(true);
  if (id === "mercado") renderMarket();
}
$$("#tabbar button[data-tab]").forEach((b) => (b.onclick = () => openTab(b.dataset.tab)));
$("#tabbar [data-more]").onclick = () => openSheet(`<h3 style="margin:2px 2px 12px">Más secciones</h3><div class="moregrid">${MORE.map(([id, ic, n, bid], i) => `<button data-go="${id}" style="animation-delay:${i * 25}ms"><i>${ic}</i>${n}${bid ? `<em>${badges[bid] || ""}</em>` : ""}</button>`).join("")}</div>`);
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]"); if (g) { e.preventDefault(); openTab(g.dataset.go); }
  if (e.target.closest("[data-import]")) openImport();
});

// ---------- hoja inferior ----------
function openSheet(html) { $("#sheetBody").innerHTML = html; $("#sheet").scrollTop = 0; $("#sheet").classList.add("on"); $("#scrim").classList.add("on"); }
function closeSheet() { $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on"); }
$("#scrim").onclick = closeSheet;
(() => { // arrastrar hacia abajo para cerrar
  let y0 = null, dy = 0; const sh = $("#sheet");
  sh.addEventListener("touchstart", (e) => { if (sh.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; sh.style.transition = "none"; } }, { passive: true });
  sh.addEventListener("touchmove", (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); if (dy > 0) sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sh.addEventListener("touchend", () => { sh.style.transition = ""; sh.style.transform = ""; if (y0 != null && dy > 110) closeSheet(); y0 = null; });
})();

// ---------- nube ----------
let loading = false;
const base = () => `https://raw.githubusercontent.com/${(S.settings.ghUser || "ErYowi").trim()}/cazachollos/main/`;
async function getJson(name) { const r = await fetch(base() + name + "?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" }); if (!r.ok) throw new Error(name + " " + r.status); return r.json(); }
async function refreshCloud(manual) {
  if (loading) return; loading = true;
  $("#refreshBtn").classList.add("spin"); renderStatus();
  try {
    const d = await getJson("deals.json");
    const prev = S.cloud?.updated || 0;
    const known = new Set(deals().map((x) => x.key));
    S.cloud = { updated: d.updated, wallapop: d.wallapop, vinted: d.vinted, deals: d.deals || [], shop: d.shop || S.cloud?.shop || [] };
    save("cloud");
    // historial de mercado: el de la nube si existe; si no, lo voy guardando aquí con las medianas de los chollos
    try {
      const m = await getJson("market.json");
      if (m && typeof m === "object") { S.market = m; save("market"); }
    } catch {
      if (d.updated !== prev) {
        const bySearch = {};
        (d.market || []).forEach((x) => { (bySearch[x.search] ||= {})[x.platform === "Vinted" ? "v" : "w"] = x.median; if (x.low) bySearch[x.search].wl = x.low; if (x.count && x.platform !== "Vinted") bySearch[x.search].wn = x.count; });
        if (!d.market) (d.deals || []).forEach((x) => { const b = (bySearch[x.search] ||= {}); const k = x.platform === "Vinted" ? "v" : "w"; b[k] = b[k] ? Math.round((b[k] + x.median) / 2) : x.median; });
        for (const [n, p] of Object.entries(bySearch)) { (S.market[n] ||= []).push({ t: d.updated, ...p }); S.market[n] = S.market[n].slice(-90); }
        save("market");
      }
    }
    try { const cfg = await getJson("config.json"); if (cfg?.busquedas?.length) { S.searches = cfg.busquedas; save("searches"); } } catch {}
    const fresh = (d.deals || []).filter((x) => !known.has(x.key));
    if (manual) toast(fresh.length && prev ? `🔥 ${fresh.length} chollo(s) nuevo(s)` : `Actualizado · nube ${timeAgo(d.updated)}`);
    else if (fresh.length && prev && fresh.some((x) => x.tier === "S")) toast(`🔥 Nuevo chollo S: ${fresh.find((x) => x.tier === "S").title.slice(0, 40)}`);
    if (d.updated !== prev) addLog(`Nube: ${(d.deals || []).length} chollos (${fresh.length} nuevos) · Wallapop ${d.wallapop ? "✅" : "❌"} Vinted ${d.vinted ? "✅" : "❌"}`);
  } catch (e) {
    if (manual) toast("No pude conectar con la nube");
    addLog("Error nube: " + e.message);
  } finally {
    loading = false; $("#refreshBtn").classList.remove("spin"); renderAll();
  }
}
$("#refreshBtn").onclick = () => refreshCloud(true);
let timer;
function schedule() { clearInterval(timer); const m = +S.settings.autoMin; if (m > 0) timer = setInterval(() => document.visibilityState === "visible" && refreshCloud(false), m * 60000); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && Date.now() - (S.lastFetch || 0) > 60000) { S.lastFetch = Date.now(); refreshCloud(false); } });

// tirar hacia abajo para actualizar
(() => {
  let y0 = null, dy = 0; const pull = $("#pull");
  window.addEventListener("touchstart", (e) => { if (window.scrollY <= 0 && !$("#sheet").classList.contains("on")) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  window.addEventListener("touchmove", (e) => { if (y0 == null) return; dy = e.touches[0].clientY - y0; if (dy > 0) { pull.style.transform = `translateY(${Math.min(dy, 120) * 0.6 - 60}px) rotate(${dy * 2}deg)`; } }, { passive: true });
  window.addEventListener("touchend", () => { if (y0 != null && dy > 90) refreshCloud(true); pull.style.transform = ""; y0 = null; });
})();

function renderStatus() {
  const c = S.cloud;
  const txt = loading ? "Actualizando…" : c?.updated ? `Nube ${timeAgo(c.updated)} · W ${c.wallapop ? "✓" : "✗"} · V ${c.vinted ? "✓" : "✗"}` : "Sin datos de la nube";
  const stale = c?.updated && Date.now() - c.updated > 12 * 36e5;
  $("#status").innerHTML = `<span class="dot ${loading ? "busy" : !c || stale ? "off" : ""}"></span><span>${txt}</span>`;
}

// ---------- resumen ----------
function sellerCalc() {
  if (!S.sellerData) return {};
  const sa = sellerAnalysis(S.sellerData, { searches: S.searches, market: S.market });
  const pa = profitAnalysis(S.sellerData, S.sellerCosts, sa.listings);
  return { sa, pa };
}
const visible = () => deals().filter((d) => !S.hidden.includes(d.key) && !(S.settings.hideB && d.tier === "B") && !(S.settings.onlyShip && !d.ship));
function renderResumen() {
  const vis = visible();
  const day = vis.filter((d) => Date.now() - d.found < DAY);
  countTo($("#kToday"), day.length);
  $("#kTodayS").textContent = `${day.filter((d) => d.tier === "S").length} tier S · ${day.filter((d) => d.tier === "A").length} tier A`;
  countTo($("#kMargin"), day.reduce((a, d) => a + margin(d), 0), (v) => eur(v));
  const { sa, pa } = sellerCalc();
  const stock = S.inventory.filter((i) => !i.soldPrice), sold = S.inventory.filter((i) => i.soldPrice);
  if (sa && sa.listings.length) {
    countTo($("#kStock"), sa.kpi.products);
    $("#kStockV").textContent = `${eur(pa.kpi.invested)} invertidos · ${sa.kpi.relist} para resubir`;
    countTo($("#kProfit"), pa.kpi.profit, (v) => eur(v));
    $("#kProfitN").textContent = `${pa.kpi.sold} venta(s) en Wallapop y Vinted`;
  } else {
    countTo($("#kStock"), stock.length);
    $("#kStockV").textContent = stock.length ? `${eur(stock.reduce((a, i) => a + (+i.cost || 0), 0))} invertidos` : "importa tus datos del PC";
    countTo($("#kProfit"), sold.reduce((a, i) => a + (i.soldPrice - i.cost), 0), (v) => eur(v));
    $("#kProfitN").textContent = `${sold.length} venta(s) registradas`;
  }
  const top = [...vis].sort((a, b) => b.score - a.score || b.found - a.found).slice(0, 6);
  $("#topList").innerHTML = top.length ? top.map((d, i) => `<div class="li" data-deal="${esc(d.key)}" style="animation-delay:${i * 45}ms">${d.img ? `<img src="${esc(d.img)}" alt="" loading="lazy">` : `<div class="ph0"></div>`}<div style="min-width:0"><div class="t"><span class="tag ${d.tier}">${d.tier}</span> ${esc(d.title)}</div><div class="m">${d.platform} · ${esc(d.search)} · ${timeAgo(d.found)}</div></div><div class="r"><b>${d.price} €</b><span class="pos">-${d.discount}% · +${margin(d)} €</span></div></div>`).join("") : `<div class="empty"><div class="radar"></div><p>${S.cloud ? "Sin chollos ahora mismo." : "Cargando chollos de la nube…"}</p></div>`;
  const days = Math.ceil((BF - new Date()) / DAY);
  $("#bfDays").textContent = days > 0 ? days : "¡Ya!";
  const todos = [];
  if (sa && sa.listings.length) {
    todos.push(`📦 Te quedan ${sa.kpi.products} producto(s) por vender (${eur(sa.kpi.value)})`);
    if (sa.kpi.relist) todos.push(`🔁 ${sa.kpi.relist} anuncio(s) para resubir → <a href="#vendedor" data-go="vendedor">Modo vendedor</a>`);
  } else if (stock.length) todos.push(`📦 Te quedan ${stock.length} producto(s) por vender`);
  if (days > 7) todos.push("🎮 Prepara compras para Navidad (consolas y juegos)");
  if (days <= 7 && days > 0) todos.push("⚠️ Última semana: si no se mueven, baja un poco el precio");
  if (days <= 0 && days > -5) todos.push("🛍️ Black Friday: el mercado nuevo está barato, espera para comprar segunda mano");
  if (!S.sellerData) todos.push(`📥 <a href="#" data-import>Importa tus datos del PC</a> para ver stock y beneficios`);
  $("#bfTodo").innerHTML = todos.map((t, i) => `<div style="animation:fade .35s ${i * 60}ms both">${t}</div>`).join("");
  const main = ["Nintendo Switch", "Switch OLED", "PS5", "iPhone 13"].map((n) => [n, S.market[n] || []]);
  $("#miniMarket").innerHTML = main.map(([n, pts]) => {
    const vals = pts.map((p) => p.w); const last = [...vals].reverse().find((x) => x);
    const first = vals.find((x) => x); const ch = last && first ? Math.round((last / first - 1) * 100) : 0;
    return `<div class="mc"><small>${esc(n)}</small><b>${eur(last)} <span class="${ch > 0 ? "pos" : ch < 0 ? "neg" : "muted"}" style="font-size:11.5px">${ch > 0 ? "▲" : ch < 0 ? "▼" : ""}${ch ? Math.abs(ch) + "%" : ""}</span></b>${spark(vals.slice(-40))}</div>`;
  }).join("");
  $("#installTip").classList.toggle("hidden", navigator.standalone || matchMedia("(display-mode: standalone)").matches);
}

// ---------- chollos (todos a la vez, con scroll infinito) ----------
const filter = { tier: "", plat: "", text: "", sort: "score", prod: "", saved: false };
const PAGE = 24; let shown = PAGE, listCache = [];
function filtered() {
  const q = filter.text.toLowerCase().trim();
  const sorters = { score: (a, b) => b.score - a.score || b.found - a.found, new: (a, b) => b.found - a.found, disc: (a, b) => b.discount - a.discount, margin: (a, b) => margin(b) - margin(a), cheap: (a, b) => a.price - b.price };
  const base = filter.saved ? deals().filter((d) => S.saved.includes(d.key)) : visible();
  return base.filter((d) => (!filter.tier || d.tier === filter.tier) && (!filter.plat || d.platform === filter.plat) && (!filter.prod || d.search === filter.prod) && (!q || (d.title + " " + d.search + " " + (d.city || "")).toLowerCase().includes(q))).sort(sorters[filter.sort]);
}
function cardHtml(d, i) {
  return `<article class="card" data-deal="${esc(d.key)}" style="animation-delay:${(i % PAGE) * 28}ms"><div class="img" style="background-image:url('${esc(d.img)}')"><span class="tier ${d.tier}">${d.tier}</span><span class="plat">${d.platform}</span>${Date.now() - d.found < 2 * 36e5 ? '<span class="new">NUEVO</span>' : ""}<span class="dsc">-${d.discount}%</span></div>
    <div class="bd"><h4>${S.saved.includes(d.key) ? "⭐ " : ""}${esc(d.title)}</h4><div class="pr"><b>${d.price} €</b><s>${d.median} €</s></div>
    <div class="bar"><i data-w="${Math.min(100, d.discount * 2)}"></i></div><div class="mg">Margen <b>+${margin(d)} €</b> · ${d.ship ? "📦" : "🤝"} ${timeAgo(d.found)}</div></div></article>`;
}
function animateBars() { requestAnimationFrame(() => $$("#grid .bar i").forEach((b) => { if (!b.style.width) b.style.width = b.dataset.w + "%"; })); }
function renderDeals(reset) {
  listCache = filtered();
  if (reset) shown = PAGE;
  $("#count").textContent = `${listCache.length} chollo${listCache.length === 1 ? "" : "s"}${filter.tier ? " · tier " + filter.tier : ""}${filter.prod ? " · " + filter.prod : ""}`;
  $("#empty").classList.toggle("hidden", listCache.length > 0);
  $("#grid").innerHTML = listCache.slice(0, shown).map(cardHtml).join("");
  $("#sentinel").textContent = shown < listCache.length ? "Cargando más…" : listCache.length ? "· Has llegado al final ·" : "";
  animateBars();
  // chips de productos con contador
  const counts = {}; visible().forEach((d) => (counts[d.search] = (counts[d.search] || 0) + 1));
  const prods = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  $("#prodChips").innerHTML = `<button class="chip ${!filter.prod ? "on" : ""}" data-prod="">Todos los productos</button>` + prods.map(([n, c]) => `<button class="chip ${filter.prod === n ? "on" : ""}" data-prod="${esc(n)}">${esc(n)} · ${c}</button>`).join("");
}
function loadMore() {
  if (shown >= listCache.length) return;
  const from = shown; shown = Math.min(listCache.length, shown + PAGE);
  $("#grid").insertAdjacentHTML("beforeend", listCache.slice(from, shown).map(cardHtml).join(""));
  $("#sentinel").textContent = shown < listCache.length ? "Cargando más…" : "· Has llegado al final ·";
  animateBars();
}
new IntersectionObserver((e) => e[0].isIntersecting && current === "chollos" && loadMore(), { rootMargin: "600px" }).observe($("#sentinel"));
$("#q").oninput = (e) => { filter.text = e.target.value; renderDeals(true); };
$("#sort").onchange = (e) => { filter.sort = e.target.value; renderDeals(true); };
$("#tierChips").onclick = (e) => {
  const b = e.target.closest(".chip"); if (!b) return;
  if (b.dataset.tier != null) { filter.tier = b.dataset.tier; $$("#tierChips [data-tier]").forEach((x) => x.classList.toggle("on", x === b)); }
  if (b.dataset.plat) { filter.plat = filter.plat === b.dataset.plat ? "" : b.dataset.plat; $$("#tierChips [data-plat]").forEach((x) => x.classList.toggle("on", x.dataset.plat === filter.plat)); }
  if (b.dataset.saved) { filter.saved = !filter.saved; b.classList.toggle("on", filter.saved); }
  renderDeals(true);
};
$("#prodChips").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; filter.prod = b.dataset.prod; renderDeals(true); };
document.addEventListener("click", (e) => { const c = e.target.closest("[data-deal]"); if (c) openDeal(c.dataset.deal); });

// ---------- ficha de compra rápida ----------
const RISK = /ps5|playstation|switch 2|airpods|iphone 1[4-7]|apple watch/i;
function scamChecks(d) {
  const s = d.seller || {}, out = [];
  const bad = (t) => out.push(`<div class="bad">⚠️ ${t}</div>`), ok = (t) => out.push(`<div>✅ ${t}</div>`), tip = (t) => out.push(`<div>💡 ${t}</div>`);
  if (s.days >= 0 && s.days <= 7) bad(`Cuenta creada hace ${s.days} días: descártalo`);
  else if (s.reviews === 0 && !(s.days >= 180)) bad("Sin valoraciones y cuenta reciente");
  else ok(`Vendedor: ${esc(s.why || "comprobado por el bot")}${s.stars ? ` · ${Number(s.stars).toFixed(1)}★` : ""}`);
  if (RISK.test(d.title + " " + d.search)) bad("Producto muy estafado: cuenta de esta semana, 0 valoraciones y 1–3 productos = huye");
  if (d.discount >= 45) bad(`-${d.discount}% es demasiado bonito: pide vídeo funcionando antes de nada`);
  if (d.country && d.country !== "ES") tip(`Vendedor de fuera de España (${esc(d.country)}): el envío tarda más`);
  ok("Paga SIEMPRE por la app. Nada de Bizum, transferencia, PayPal amigos ni WhatsApp");
  if (/iphone/i.test(d.title + d.search)) tip("Pide: % de batería, sin iCloud ni bloqueos, Face ID y IMEI limpio");
  if (/switch/i.test(d.title + d.search)) tip("Pide: si los Joy-Con tienen drift y el número de serie (HAC-001(-01) = V2)");
  if (/ps5|playstation/i.test(d.title + d.search)) tip("Pide vídeo encendiéndola con su usuario y el ticket si lo tiene");
  if (/airpods/i.test(d.title + d.search)) tip("Pide el número de serie y compruébalo en checkcoverage.apple.com");
  return out.join("");
}
function shortName(d) { return (d.search || d.title).replace(/\s*\(.*\)/, ""); }
function openDeal(key) {
  const d = deals().find((x) => x.key === key); if (!d) return;
  const first = round5(d.price * 0.85), fair = round5(d.price * 0.9), maxBuy = Math.floor((d.median * 0.97 - (d.ship ? 3 : 0)) / 1.2);
  const n = shortName(d).toLowerCase();
  const msgs = [
    ["Primer contacto (2 mensajes)", [`Hola! Me interesa la ${n}, ¿sigue disponible?`, `Si te parece bien te ofrezco ${first} € y la compro hoy por la app 🙂`]],
    ["Preguntar antes de ofertar", [`Hola! ¿Funciona todo bien? ¿Tiene algún golpe o fallo?`, `Si está todo bien te hago la oferta por la app`]],
    ["Contraoferta", [`Te puedo subir un poco, ¿${fair} €?`, `Si te encaja la compro ahora mismo por la app`]],
  ];
  const saved = S.saved.includes(d.key);
  openSheet(`<div class="fhero" style="background-image:url('${esc(d.img)}')"><span class="tier ${d.tier}">${d.tier}</span><span class="plat">${d.platform}</span></div>
    <h2 class="ftitle">${esc(d.title)}</h2>
    <div class="fprice"><b>${d.price} €</b><s>${d.median} €</s><span class="d">-${d.discount}%</span></div>
    <div class="fgrid">
      <div><small>Margen estimado</small><b class="pos">+${margin(d)} €</b></div>
      <div><small>Reventa (mercado)</small><b>${eur(d.median)}</b></div>
      <div><small>Primera oferta</small><b>${eur(first)}</b></div>
      <div><small>Compra máxima (20 %)</small><b>${eur(maxBuy)}</b></div>
    </div>
    <div class="muted small">${d.ship ? `📦 Envío${d.city ? " · " + esc(d.city) : ""}` : `🤝 En mano · ${esc(d.city)}${d.distKm != null ? ` (${d.distKm} km)` : ""}`} · 👤 ${esc(d.seller?.name || "vendedor")} · 🕒 ${timeAgo(d.found)} · ${esc(d.search)}</div>
    <div class="fsec">Antes de comprar</div><div class="checks">${scamChecks(d)}</div>
    <div class="fsec">Mensajes para copiar</div>
    ${msgs.map(([h, parts], i) => `<div class="msg"><p><small>${h}</small>${parts.map(esc).join("<br>")}</p><button class="btn sm" data-copymsg="${i}">Copiar</button></div>`).join("")}
    <p class="muted small" style="margin:4px 2px 0">Se copian los 2 mensajes separados por una línea. Nunca se envían solos.</p>
    <div class="factions"><a class="btn primary" href="${esc(d.url)}" target="_blank" rel="noopener">Abrir anuncio</a><button class="btn" data-save="${esc(d.key)}">${saved ? "★" : "☆"}</button><button class="btn" data-watch="${esc(d.key)}">👁</button></div>
    <button class="btn block" style="margin-top:8px" data-hide="${esc(d.key)}">✕ Descartar este chollo</button>`);
  $$("[data-copymsg]").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(msgs[b.dataset.copymsg][1].join("\n\n")); toast("Copiado ✓ (no se ha enviado nada)"); } catch { toast("No se pudo copiar"); } }));
  $("[data-save]").onclick = (e) => { const k = d.key; S.saved = S.saved.includes(k) ? S.saved.filter((x) => x !== k) : [k, ...S.saved].slice(0, 300); save("saved"); e.target.textContent = S.saved.includes(k) ? "★" : "☆"; toast(S.saved.includes(k) ? "Guardado ⭐" : "Quitado de guardados"); renderDeals(); };
  $("[data-watch]").onclick = () => { addWatch({ platform: d.platform, url: d.url, title: d.title, price: d.price, img: d.img, median: d.median }); };
  $("[data-hide]").onclick = () => {
    S.hidden = [...S.hidden, d.key].slice(-3000); save("hidden"); closeSheet();
    const card = $(`#grid [data-deal="${CSS.escape(d.key)}"]`); if (card) { card.classList.add("out"); setTimeout(() => { renderDeals(); renderResumen(); }, 300); } else { renderDeals(); renderResumen(); }
    toast("Descartado");
  };
}

// ---------- tiendas ----------
function renderShops() {
  const list = S.cloud?.shop || [];
  badges.nShops = list.filter((d) => d.arbitrage && Date.now() - d.found < DAY).length || "";
  $("#shopEmpty").classList.toggle("hidden", list.length > 0);
  $("#shopList").innerHTML = list.slice(0, 80).map((d, i) => `<a class="li" href="${esc(d.link)}" target="_blank" rel="noopener" style="animation-delay:${Math.min(i, 16) * 25}ms">${d.img ? `<img src="${esc(d.img)}" alt="" loading="lazy">` : `<div class="ph0"></div>`}<div style="min-width:0"><div class="t">${d.arbitrage ? '<span class="tag S">MARGEN</span> ' : ""}${esc(d.title)}</div><div class="m">${esc(d.merchant || "Tienda")} · ${esc(d.search)} · ${timeAgo(d.found)}</div></div><div class="r"><b>${d.price} €</b><span class="${d.margin > 0 ? "pos" : "muted"}">${d.margin != null ? (d.margin > 0 ? "+" : "") + d.margin + " €" : "–"}</span></div></a>`).join("");
}

// ---------- mercado ----------
function renderMarket() {
  const names = [...new Set([...S.searches.filter((s) => s.on !== false).map((s) => s.name), ...Object.keys(S.market)])];
  $("#marketGrid").innerHTML = names.map((n, i) => {
    const pts = (S.market[n] || []).slice(-60);
    const last = [...pts].reverse().find((p) => p.w) || {};
    const lastV = [...pts].reverse().find((p) => p.v) || {};
    const wk = pts.filter((p) => p.w && Date.now() - p.t > 6 * DAY).slice(-1)[0];
    const ch = last.w && wk?.w ? Math.round((last.w / wk.w - 1) * 100) : null;
    return `<div class="mk" style="animation-delay:${i * 35}ms"><div class="h"><h4>${esc(n)}</h4><span class="ch ${ch > 0 ? "pos" : ch < 0 ? "neg" : "muted"}">${ch == null ? "7 d: –" : `7 d: ${ch > 0 ? "▲" : ch < 0 ? "▼" : ""}${Math.abs(ch)}%`}</span></div>
      <div class="vals"><div><small>Wallapop</small><b>${eur(last.w)}</b></div><div><small>Vinted</small><b>${eur(lastV.v)}</b></div><div><small>Compra</small><b style="color:#ffd166">${eur(last.wl)}</b></div><div><small>Anuncios</small><b>${last.wn || "–"}</b></div></div>
      ${chart(pts)}<div class="lg"><span><i style="background:#ff6a2a"></i>Wallapop</span><span><i style="background:#22c55e"></i>Vinted</span><span><i style="background:#ffd166"></i>Compra</span></div></div>`;
  }).join("") || `<div class="empty"><div class="radar"></div><p>Aún no hay datos de mercado.</p></div>`;
}

// ---------- vigilados ----------
function addWatch(item) {
  if (S.watchlist.some((w) => w.url === item.url)) return toast("Ya lo estás vigilando");
  S.watchlist.unshift({ ...item, status: "activo", added: Date.now(), history: item.price ? [{ t: Date.now(), p: item.price }] : [] });
  save("watchlist"); renderWatch(); toast("👁 Añadido a vigilados");
}
function renderWatch() {
  const list = S.watchlist;
  badges.nWatch = list.filter((w) => w.status !== "vendido").length || "";
  $("#watchEmpty").classList.toggle("hidden", list.length > 0);
  $("#watchList").innerHTML = list.map((w, i) => {
    const first = w.history?.[0]?.p || w.price; const ch = first && w.price ? Math.round((w.price / first - 1) * 100) : 0;
    return `<div class="wc" style="animation-delay:${i * 30}ms">${w.img ? `<img src="${esc(w.img)}" alt="" loading="lazy">` : `<img alt="">`}<div><div class="t">${esc(w.title)}</div><div class="p"><b>${w.price ?? "–"} €</b>${ch ? `<span class="${ch < 0 ? "pos" : "neg"}">${ch < 0 ? "▼" : "▲"}${Math.abs(ch)}%</span>` : ""}<span class="st ${w.status}">${w.status}</span></div><div class="muted small">${w.platform} · ${w.median ? `mercado ~${w.median} € · ` : ""}desde ${new Date(w.added).toLocaleDateString("es-ES")}</div></div>
      ${spark((w.history || []).map((h) => h.p), { h: 36, color: ch < 0 ? "#22c55e" : undefined })}
      <div class="a"><a href="${esc(w.url)}" target="_blank" rel="noopener">Abrir</a><button data-unwatch="${esc(w.url)}">Dejar de vigilar</button></div></div>`;
  }).join("");
  $$("[data-unwatch]").forEach((b) => (b.onclick = () => { S.watchlist = S.watchlist.filter((w) => w.url !== b.dataset.unwatch); save("watchlist"); renderWatch(); toast("Quitado de vigilados"); }));
}
$("#watchAddBtn").onclick = () => {
  const url = $("#watchUrl").value.trim();
  const m = url.match(/wallapop\.com\/item\/([^?#]+)|vinted\.[a-z.]+\/items\/(\d+)[^?#]*/);
  if (!m) return toast("Pega un enlace de Wallapop o Vinted");
  const slug = m[1] || m[0].split("/").pop();
  const title = slug.replace(/^\d+-?/, "").replace(/-\d+$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Anuncio";
  addWatch({ platform: m[1] ? "Wallapop" : "Vinted", url: url.split("?")[0], title, price: null, img: "" });
  $("#watchUrl").value = "";
};

// ---------- modo vendedor ----------
const sFilter = { f: "" };
const d1 = (n) => (n == null ? "–" : n.toFixed(1).replace(".", ","));
const fmtD = (t) => (t ? new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) : "–");
function plat(l, name) {
  if (!l) return `<div><em>${name}</em>no subido</div>`;
  const st = l.review ? " · en revisión" : l.reserved ? " · reservado" : "";
  return `<div><em>${name}</em><a href="${esc(l.url)}" target="_blank" rel="noopener">${eur(l.price)}</a>${l.days != null ? Math.round(l.days) + " d" + (l.estimated ? "*" : "") : "–"} · ${l.views ?? "–"} 👁 · ${l.favs ?? "–"} ❤<br>${l.vpd != null ? d1(l.vpd) + " visitas/día" : ""}${st}</div>`;
}
function renderSeller() {
  const at = S.sellerAt;
  const sync = S.sellerData ? ["Wallapop", "Vinted"].map((p) => { const d = S.sellerData[p.toLowerCase()]; return d?.at ? `<span class="ok">● ${p}: ${timeAgo(d.at)}</span>` : `<span class="muted">○ ${p}: sin datos</span>`; }).join("") : "";
  $("#syncInfo").innerHTML = S.sellerData ? `${sync}<span class="muted">Importado ${timeAgo(at)}</span>` : `<span class="muted">Aún no has importado tus datos del PC.</span>`;
  const { sa } = sellerCalc();
  const has = sa && sa.listings.length;
  $("#sEmpty").classList.toggle("hidden", !!has);
  badges.nSeller = has && sa.kpi.relist ? sa.kpi.relist : "";
  $("#nSeller").textContent = badges.nSeller;
  if (!has) { $("#sBody").innerHTML = ""; $("#sActions").innerHTML = `<div class="muted small">Sin datos todavía.</div>`; return; }
  countTo($("#sProducts"), sa.kpi.products); $("#sListings").textContent = `${sa.kpi.listings} anuncios en total`;
  countTo($("#sValue"), sa.kpi.value, (v) => eur(v));
  countTo($("#sViews"), sa.kpi.views); $("#sFavs").textContent = `${sa.kpi.favs} favoritos`;
  countTo($("#sRelist"), sa.kpi.relist);
  $("#sActions").innerHTML = sa.actions.length ? sa.actions.slice(0, 14).map((a, i) => `<a class="act-row" href="${esc(a.url)}" target="_blank" rel="noopener" style="animation-delay:${i * 35}ms"><span class="ic">${a.icon}</span><span class="tx"><b>${esc(a.text)}</b><small>${esc(a.why)}</small></span></a>`).join("") : `<div class="muted">✅ Todo en orden.</div>`;
  const rows = sa.groups.filter((g) => !sFilter.f || (sFilter.f === "relist" ? g.items.some((i) => i.relist) : g.items.some((i) => i.platform === sFilter.f)))
    .sort((a, b) => Number(b.items.some((i) => i.relist)) - Number(a.items.some((i) => i.relist)) || b.price - a.price);
  $("#sBody").innerHTML = rows.map((g, k) => {
    const w = g.items.find((i) => i.platform === "Wallapop"), v = g.items.find((i) => i.platform === "Vinted");
    const mk = g.items.find((i) => i.market);
    const tags = []; g.items.forEach((i) => i.tags.forEach((t) => { if (!tags.some((u) => u.t === t.t && u.p === i.platform)) tags.push({ ...t, p: i.platform }); }));
    return `<div class="prodc" style="animation-delay:${Math.min(k, 12) * 30}ms"><div class="hd"><div style="flex:1;min-width:0"><b>${esc(g.title)}</b><div class="muted small">${esc(g.family)}${mk ? ` · mercado ${eur(mk.market)}` : ""}</div></div></div>
      <div class="pl">${plat(w, "Wallapop")}${plat(v, "Vinted")}</div>
      <div>${tags.length ? tags.map((t) => `<span class="pchip ${t.k}">${esc(t.t)}${g.items.length > 1 ? " · " + t.p[0] : ""}</span>`).join("") : `<span class="pchip ok">OK</span>`}</div></div>`;
  }).join("");
}
$("#sFilter").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; sFilter.f = b.dataset.f; $$("#sFilter .chip").forEach((x) => x.classList.toggle("on", x === b)); renderSeller(); };

// ---------- beneficios ----------
function barChart(months) {
  const W = 360, H = 220, P = { l: 34, r: 6, t: 14, b: 26 };
  if (!months.length) return `<svg viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="currentColor" opacity=".45" font-size="13">Sin ventas todavía</text></svg>`;
  const ms = months.slice(-6);
  const max = Math.max(10, ...ms.flatMap((m) => [m.income, m.spent, Math.abs(m.profit)]));
  const min = Math.min(0, ...ms.map((m) => m.profit));
  const y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const gw = (W - P.l - P.r) / ms.length, bw = Math.min(22, gw / 4);
  let svg = [0, 0.5, 1].map((f) => min + (max - min) * f).map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" stroke="currentColor" opacity=".12" stroke-dasharray="3 4"/><text x="${P.l - 5}" y="${y(t) + 3}" text-anchor="end" fill="currentColor" opacity=".5" font-size="9.5">${Math.round(t)}€</text>`).join("");
  ms.forEach((m, i) => {
    const cx = P.l + gw * i + gw / 2;
    [[m.income, "#38bdf8"], [m.spent, "#ef4444"], [m.profit, "#22c55e"]].forEach(([v, c], k) => {
      const x = cx + (k - 1.5) * bw + 2, y0 = y(0), y1 = y(v), h = Math.max(1, Math.abs(y1 - y0));
      svg += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${bw - 4}" height="${h}" rx="4" fill="${c}"><animate attributeName="height" from="0" to="${h}" dur=".8s" fill="freeze"/><animate attributeName="y" from="${y0}" to="${Math.min(y0, y1)}" dur=".8s" fill="freeze"/></rect>`;
      if (Math.abs(v) > 0) svg += `<text x="${x + (bw - 4) / 2}" y="${Math.min(y0, y1) - 3}" text-anchor="middle" fill="currentColor" opacity=".7" font-size="9">${Math.round(v)}</text>`;
    });
    svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle" fill="currentColor" font-size="11" font-weight="700">${esc(m.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}">${svg}</svg>`;
}
function renderProfit() {
  const { pa } = sellerCalc();
  renderCosts();
  if (!pa) { $("#pChart").innerHTML = barChart([]); $("#pSales").innerHTML = `<div class="muted small">Importa tus datos del PC para ver tus ventas.</div>`; $("#pStock").innerHTML = ""; return; }
  const k = pa.kpi;
  countTo($("#pTotal"), k.profit, (v) => eur(v)); $("#pMargin").textContent = k.avgMargin != null ? `margen medio ${k.avgMargin} %` : "";
  countTo($("#pMonth"), k.month.profit, (v) => eur(v)); $("#pMonthS").textContent = `${eur(k.month.income)} vendidos · ${eur(k.month.spent)} gastados`;
  countTo($("#pIncome"), k.income, (v) => eur(v)); $("#pSold").textContent = `${k.sold} venta(s)`;
  countTo($("#pInvested"), k.invested, (v) => eur(v)); $("#pExpected").textContent = k.expected ? `si lo vendes: +${eur(k.expected)}` : "";
  $("#pChart").innerHTML = barChart(pa.months);
  $("#pNote").textContent = (k.unknown ? `⚠️ ${k.unknown} venta(s) sin coste conocido (no cuentan en el beneficio). ` : "") + "Gastos = compras de ese mes.";
  $("#pSales").innerHTML = pa.sales.map((s) => `<div class="salerow"><div><b>${esc(s.title)}</b><div class="muted small">${fmtD(s.date)} · ${s.platform}${s.pending ? " · pendiente" : ""} · coste ${s.cost != null ? eur(s.cost) : "?"}</div></div><div class="r"><b>${eur(s.price)}</b><div class="${s.profit == null ? "muted" : s.profit >= 0 ? "pos" : "neg"} small">${s.profit == null ? `<input class="input costin" type="number" inputmode="decimal" placeholder="¿coste?" data-cost="${esc(s.key)}">` : (s.profit >= 0 ? "+" : "") + eur(s.profit)}</div></div></div>`).join("") || `<div class="muted small">Sin ventas todavía.</div>`;
  $$("[data-cost]").forEach((el) => (el.onchange = () => { const v = parseFloat(el.value); if (isNaN(v)) return; S.sellerCosts = { ...S.sellerCosts, manual: { ...(S.sellerCosts.manual || {}), [el.dataset.cost]: v } }; save("sellerCosts"); toast("Coste guardado"); renderAll(); }));
  $("#pStock").innerHTML = pa.stock.length ? pa.stock.map((b) => `<div class="li"><div class="ph0" style="display:grid;place-items:center;font-size:22px">📦</div><div style="min-width:0"><div class="t">${esc(b.title)}</div><div class="m">${fmtD(b.date)} · ${esc(b.platform || "")}${b.listing ? ` · a la venta ${eur(b.listing.price)}` : ""}</div></div><div class="r"><b>${eur(b.price)}</b>${b.expected != null ? `<span class="${b.expected >= 0 ? "pos" : "neg"}">${b.expected >= 0 ? "+" : ""}${eur(b.expected)}</span>` : ""}</div></div>`).join("") : `<div class="muted small">Todo lo comprado está vendido.</div>`;
}
function renderCosts() {
  const c = S.sellerCosts || DEFAULT_COSTS;
  $("#pCosts").innerHTML = [...Object.entries(c.unit || {}).map(([f, v]) => `<div class="cost-row"><span>Coste por unidad · <b>${esc(f)}</b></span><input class="input costin" type="number" inputmode="decimal" value="${v}" data-unit="${esc(f)}"></div>`),
    ...(c.extra || []).map((e, i) => `<div class="cost-row"><span><b>${esc(e.title)}</b><div class="muted small">${fmtD(e.date)} · en mano</div></span><b>${eur(e.price)}</b><button class="btn sm" data-xdel="${i}">✕</button></div>`)].join("");
  $$("[data-unit]").forEach((el) => (el.onchange = () => { S.sellerCosts = { ...S.sellerCosts, unit: { ...(S.sellerCosts.unit || {}), [el.dataset.unit]: parseFloat(el.value) || 0 } }; save("sellerCosts"); toast("Guardado"); renderAll(); }));
  $$("[data-xdel]").forEach((el) => (el.onclick = () => { const x = [...(S.sellerCosts.extra || [])]; x.splice(+el.dataset.xdel, 1); S.sellerCosts = { ...S.sellerCosts, extra: x }; save("sellerCosts"); renderAll(); }));
}
$("#pExtraForm").onsubmit = (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  S.sellerCosts = { ...S.sellerCosts, extra: [...(S.sellerCosts.extra || []), { id: "x-" + Date.now(), title: String(f.get("title")), price: +f.get("price"), date: new Date(f.get("date") + "T12:00").getTime(), platform: "En mano" }] };
  save("sellerCosts"); e.target.reset(); toast("Compra añadida"); renderAll();
};

// ---------- mi stock ----------
function renderInventory() {
  const inv = S.inventory, stock = inv.filter((i) => !i.soldPrice), sold = inv.filter((i) => i.soldPrice);
  $("#iInv").textContent = eur(stock.reduce((a, i) => a + (+i.cost || 0), 0));
  $("#iVal").textContent = eur(stock.reduce((a, i) => a + (+i.price || 0), 0));
  $("#iProfit").textContent = eur(sold.reduce((a, i) => a + (i.soldPrice - i.cost), 0));
  const dd = sold.filter((i) => i.listedAt && i.soldAt).map((i) => (i.soldAt - i.listedAt) / DAY);
  $("#iDays").textContent = dd.length ? Math.round(dd.reduce((a, b) => a + b, 0) / dd.length) + " d" : "–";
  $("#invEmpty").classList.toggle("hidden", inv.length > 0);
  $("#invBody").innerHTML = inv.map((i, k) => {
    const days = i.listedAt ? Math.floor(((i.soldAt || Date.now()) - i.listedAt) / DAY) : null;
    const m = (i.soldPrice || i.price || 0) - i.cost;
    return `<div class="invrow"><div><b>${esc(i.name)}</b><div class="muted small">${esc(i.where || "")} · ${days != null ? days + " días" : "–"}${!i.soldPrice && days >= 14 ? " · <span class='warnc'>resubir</span>" : ""}</div></div><div style="text-align:right"><b>${i.soldPrice ? eur(i.soldPrice) : eur(i.price)}</b><div class="small ${m >= 0 ? "pos" : "neg"}">${m >= 0 ? "+" : ""}${eur(m)}</div></div>
      <div class="bt">${i.soldPrice ? `<span class="st activo">vendido</span>` : `<button class="btn sm" data-sell="${k}">Vendido</button><button class="btn sm" data-relist="${k}">Resubido</button>`}<button class="btn sm" data-del="${k}">✕</button></div></div>`;
  }).join("");
  $$("[data-sell]").forEach((b) => (b.onclick = () => { const it = S.inventory[b.dataset.sell]; const p = prompt(`¿Por cuánto has vendido "${it.name}"?`, it.price || ""); if (!p) return; it.soldPrice = parseFloat(String(p).replace(",", ".")); it.soldAt = Date.now(); save("inventory"); toast(`¡Venta! Beneficio: ${eur(it.soldPrice - it.cost)}`); renderAll(); }));
  $$("[data-relist]").forEach((b) => (b.onclick = () => { S.inventory[b.dataset.relist].listedAt = Date.now(); save("inventory"); toast("Fecha actualizada"); renderInventory(); }));
  $$("[data-del]").forEach((b) => (b.onclick = () => { S.inventory.splice(b.dataset.del, 1); save("inventory"); renderAll(); }));
}
$("#invForm").onsubmit = (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  S.inventory.unshift({ name: f.get("name"), cost: +f.get("cost"), price: f.get("price") ? +f.get("price") : null, where: f.get("where"), listedAt: f.get("listedAt") ? new Date(f.get("listedAt")).getTime() : Date.now(), added: Date.now() });
  save("inventory"); e.target.reset(); toast("Añadido a tu stock"); renderAll();
};
$("#invCsv").onclick = () => {
  const rows = [["Producto", "Coste", "Precio", "Vendido por", "Beneficio"], ...S.inventory.map((i) => [i.name, i.cost, i.price ?? "", i.soldPrice ?? "", i.soldPrice ? i.soldPrice - i.cost : ""])];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "mi-stock.csv"; a.click();
};

// ---------- calculadora ----------
function renderCalc() {
  const sel = $("#cProd");
  if (sel.options.length <= 1) sel.innerHTML = `<option value="">— producto —</option>` + S.searches.map((s) => `<option>${esc(s.name)}</option>`).join("");
  const n = (id) => parseFloat($(id).value) || 0;
  const buy = n("#cBuy"), sell = n("#cSell"), ship = n("#cShip"), other = n("#cOther"), target = n("#cTarget");
  const profit = sell - buy - ship - other, roi = buy ? Math.round((profit / buy) * 100) : 0;
  const maxBuy = Math.floor((sell - ship - other) / (1 + target / 100));
  const last = sel.value ? [...(S.market[sel.value] || [])].reverse().find((p) => p.w) : null;
  $("#cRes").innerHTML = `<div><small>Beneficio</small><b class="${profit >= 0 ? "pos" : "neg"}">${profit >= 0 ? "+" : ""}${eur(profit)}</b></div><div><small>Rentabilidad</small><b class="${roi >= target ? "pos" : roi >= 10 ? "" : "neg"}">${roi} %</b></div><div><small>Compra máx.</small><b>${eur(maxBuy)}</b></div>
    <div class="wide">${profit <= 0 ? "❌ Con estos números pierdes dinero." : roi >= target ? "✅ Compensa: cumple tu objetivo de margen." : roi >= 10 ? "🟡 Justo: negocia para bajar a " + eur(maxBuy) + "." : "❌ Poco margen para el riesgo."}${last ? `<br><span class="muted">${esc(sel.value)}: ~${eur(last.w)} en Wallapop${last.wl ? `, el 25 % más barato ~${eur(last.wl)}` : ""}.</span>` : ""}</div>`;
  const o = Math.round(n("#mOffer"));
  const tpls = [
    ["Primera oferta", [`Hola! Me interesa mucho, ¿sigue disponible?`, `Si te parece bien te ofrezco ${o} € y lo cerramos hoy por la app 🙂`]],
    ["Preguntar antes de comprar", ["Hola! ¿Funciona todo bien? ¿Tiene algún fallo o golpe?", "Si está todo bien te hago la oferta por la app"]],
    ["Contraoferta", [`Te puedo subir un poco, ¿${o + 10} €?`, "Es mi máximo, si te encaja lo compro ahora por la app"]],
    ["Cerrar trato", [`Perfecto, ${o} € entonces`, "Te hago la compra por la app ahora mismo 👍"]],
    ["A quien ofrece poco", ["Gracias por la oferta, pero es poco para cómo está", "Si quieres algo más razonable lo hablamos"]],
  ];
  $("#tpls").innerHTML = tpls.map(([h, t], i) => `<div class="tpl"><p><small>${h}</small>${t.map(esc).join("<br>")}</p><button class="btn sm" data-copy="${i}">Copiar</button></div>`).join("");
  $$("[data-copy]").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(tpls[b.dataset.copy][1].join("\n\n")); toast("Copiado ✓"); } catch { toast("No se pudo copiar"); } }));
}
["#cBuy", "#cSell", "#cShip", "#cOther", "#cTarget", "#cProd", "#mOffer"].forEach((id) => $(id).addEventListener("input", renderCalc));

// ---------- asistente ----------
const AYUDA = `Puedo hacer esto:
• "mejores" → los mejores chollos
• "solo switch" / "solo iphone 14" → filtro la lista
• "solo tier s" / "solo tier a" → por tier
• "todos" → quito filtros
• "actualiza" → traigo chollos de la nube
• "mercado", "tiendas", "vigilados", "vendedor", "beneficios", "stock", "calculadora" → abro esa sección
• "tema cristal" / "tema oro" / "tema aurora" / "tema nieve" / "tema extensión"
• "estado" → cómo va todo`;
const normT = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
function chatHandle(text) {
  const t = normT(text);
  if (/^(ayuda|help|\?)/.test(t)) return { reply: AYUDA };
  if (/^(actualiza|nube|refresca|busca)/.test(t)) { refreshCloud(true); return { reply: "Traigo lo último de la nube ☁️" }; }
  const tier = t.match(/tier ([sab])\b/);
  if (tier) return { reply: `Solo tier ${tier[1].toUpperCase()} 👇`, filter: { tier: tier[1].toUpperCase() } };
  if (/^(mejores|top|chollos)/.test(t)) return { reply: "Los mejores 👇", filter: { sort: "score" } };
  if (/^(todo|todos|quita filtro)/.test(t)) return { reply: "Mostrando todo.", filter: {} };
  const solo = t.match(/^solo (.+)/); if (solo) return { reply: `Filtrando por "${solo[1]}"`, filter: { text: solo[1] } };
  const tema = t.match(/^tema (.+)/);
  if (tema) { const map = { cristal: "glass", ios: "glass", oro: "gold", dorado: "gold", aurora: "aurora", nieve: "nieve", claro: "nieve", extension: "ext", naranja: "ext" }; const k = Object.keys(map).find((x) => tema[1].includes(x)); if (k) { setTheme(map[k]); return { reply: "Estilo cambiado ✨" }; } }
  for (const [re, id, r] of [[/^mercado/, "mercado", "📈"], [/^tienda/, "tiendas", "🛒"], [/^vigila/, "vigilados", "👁"], [/^(vendedor|mis anuncios|resubir)/, "vendedor", "🏷"], [/^(beneficio|ganancia|cuanto he ganado)/, "beneficios", "💶"], [/^(stock|inventario)/, "inventario", "📦"], [/^calcul/, "calc", "🧮"], [/^ajuste/, "ajustes", "⚙️"]]) if (re.test(t)) return { reply: `Abriendo ${TITLES[id][0]} ${r}`, go: id };
  if (/^(estado|como va)/.test(t)) {
    const c = S.cloud, { sa, pa } = sellerCalc();
    return { reply: `Nube: ${c?.updated ? fmtT(c.updated) : "sin datos"}\nChollos: ${visible().length} (${visible().filter((d) => d.tier === "S").length} tier S)\nWallapop ${c?.wallapop ? "✅" : "❌"} · Vinted ${c?.vinted ? "✅" : "❌"}${sa ? `\nTu stock: ${sa.kpi.products} productos · ${sa.kpi.relist} para resubir\nBeneficio total: ${eur(pa.kpi.profit)}` : ""}` };
  }
  return { reply: 'No te he entendido 😅. Escribe "ayuda".' };
}
function say(text, who) { const d = document.createElement("div"); d.className = "m " + who; d.textContent = text; $("#msgs").appendChild(d); $("#msgs").scrollTop = 1e9; }
async function botSay(text) { const d = document.createElement("div"); d.className = "m bot"; d.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; $("#msgs").appendChild(d); $("#msgs").scrollTop = 1e9; await new Promise((r) => setTimeout(r, 420)); d.textContent = text; $("#msgs").scrollTop = 1e9; }
async function send(text) {
  if (!text.trim()) return; say(text, "me");
  const r = chatHandle(text); await botSay(r.reply);
  if (r.go) setTimeout(() => openTab(r.go), 450);
  if (r.filter) {
    Object.assign(filter, { tier: r.filter.tier || "", text: r.filter.text || "", sort: r.filter.sort || filter.sort, prod: "", plat: "", saved: false });
    $("#q").value = filter.text; $$("#tierChips [data-tier]").forEach((x) => x.classList.toggle("on", x.dataset.tier === filter.tier));
    setTimeout(() => openTab("chollos"), 450);
  }
}
$("#chatForm").onsubmit = (e) => { e.preventDefault(); const v = $("#chatIn").value; $("#chatIn").value = ""; send(v); };
$$(".quick button").forEach((b) => (b.onclick = () => send(b.textContent)));

// ---------- búsquedas ----------
function renderSearches() {
  $("#slist").innerHTML = S.searches.map((s, i) => `<div class="srow" style="animation-delay:${i * 20}ms"><div><b>${esc(s.name)} ${s.strict ? "🛡️" : ""}</b><small>${s.min}–${s.max} € · ${esc(s.kw || "")}</small></div><span class="st ${s.on !== false ? "activo" : "vendido"}">${s.on !== false ? "activa" : "apagada"}</span></div>`).join("");
  $("#editCfg").href = `https://github.com/${S.settings.ghUser || "ErYowi"}/cazachollos/edit/main/config.json`;
}

// ---------- ajustes y estilos ----------
const THEMES = [
  ["ext", "Como la extensión", "Oscuro, rojo y naranja", "#0a0c11", "linear-gradient(90deg,#ff5a1f,#ffb020)", "#ff8a3d"],
  ["glass", "Cristal iOS", "Transparencias y desenfoque", "linear-gradient(135deg,#0a84ff,#bf5af2 60%,#ff375f)", "rgba(255,255,255,.55)", "rgba(255,255,255,.35)"],
  ["gold", "Negro y dorado", "Premium y elegante", "#060606", "linear-gradient(90deg,#b8892e,#fff1c1)", "#e5c16b"],
  ["aurora", "Aurora neón", "Morado y turquesa", "#07060f", "linear-gradient(90deg,#7c3aed,#34f5c5)", "#06b6d4"],
  ["nieve", "Nieve", "Claro y limpio", "#f4f5f8", "linear-gradient(90deg,#111827,#ff5a1f)", "#ff5a1f"],
];
const THEME_COLOR = { ext: "#0a0c11", glass: "#0b1020", gold: "#060606", aurora: "#07060f", nieve: "#f4f5f8" };
function setTheme(t) {
  S.settings.theme = t; save("settings");
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = THEME_COLOR[t] || "#0a0c11";
  renderSettings(); setTimeout(renderAll, 50);
}
function renderSettings() {
  $("#themes").innerHTML = THEMES.map(([id, n, d, bg, bar, dot]) => `<button class="theme ${S.settings.theme === id ? "on" : ""}" data-theme-set="${id}"><div class="sw" style="background:${bg}"><i style="background:${bar}"></i><u style="background:${dot}"></u></div><b>${n}</b><small>${d}</small></button>`).join("");
  $$("[data-theme-set]").forEach((b) => (b.onclick = () => { setTheme(b.dataset.themeSet); toast("Estilo: " + THEMES.find((x) => x[0] === b.dataset.themeSet)[1]); }));
  $("#ghUser").value = S.settings.ghUser || ""; $("#autoMin").value = String(S.settings.autoMin);
  $("#hideB").checked = !!S.settings.hideB; $("#onlyShip").checked = !!S.settings.onlyShip;
}
$("#ghUser").onchange = (e) => { S.settings.ghUser = e.target.value.trim().replace(/^@/, "") || "ErYowi"; save("settings"); refreshCloud(true); };
$("#autoMin").onchange = (e) => { S.settings.autoMin = +e.target.value; save("settings"); schedule(); toast("Guardado"); };
$("#hideB").onchange = (e) => { S.settings.hideB = e.target.checked; save("settings"); renderAll(); };
$("#onlyShip").onchange = (e) => { S.settings.onlyShip = e.target.checked; save("settings"); renderAll(); };
$("#resetHidden").onclick = () => { S.hidden = []; save("hidden"); renderAll(); toast("Chollos descartados recuperados"); };

// ---------- importar / exportar (código CZ1) ----------
const b64u = { enc: (bytes) => { let s = ""; bytes.forEach((b) => (s += String.fromCharCode(b))); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }, dec: (str) => Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)) };
async function packCode(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (window.CompressionStream) { const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer(); return "CZ1." + b64u.enc(new Uint8Array(buf)); }
  return "CZ0." + b64u.enc(raw);
}
async function unpackCode(code) {
  const m = String(code).replace(/\s+/g, "").match(/CZ([01])\.([A-Za-z0-9_-]+)/);
  if (!m) throw new Error("No encuentro ningún código CZ1 en el texto");
  const bytes = b64u.dec(m[2]);
  const txt = m[1] === "1" ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text() : new TextDecoder().decode(bytes);
  return JSON.parse(txt);
}
function applyImport(p) {
  const out = [];
  if (p.sellerData) { S.sellerData = p.sellerData; save("sellerData"); out.push("tus anuncios, ventas y compras"); }
  if (p.sellerCosts) { S.sellerCosts = p.sellerCosts; save("sellerCosts"); }
  if (Array.isArray(p.inventory) && p.inventory.length) { S.inventory = p.inventory; save("inventory"); out.push(`${p.inventory.length} productos de tu stock`); }
  if (Array.isArray(p.watchlist) && p.watchlist.length) { const urls = new Set(S.watchlist.map((w) => w.url)); S.watchlist = [...p.watchlist.filter((w) => !urls.has(w.url)), ...S.watchlist]; save("watchlist"); out.push(`${p.watchlist.length} vigilados`); }
  if (Array.isArray(p.saved)) { S.saved = [...new Set([...p.saved, ...S.saved])]; save("saved"); }
  if (p.settings?.theme) setTheme(p.settings.theme);
  S.sellerAt = p.at || Date.now(); save("sellerAt");
  addLog("Importado del PC: " + (out.join(", ") || "datos"));
  return out;
}
function openImport() {
  openSheet(`<h3 style="margin:2px 2px 6px">Importar datos del PC</h3>
    <ol class="muted small" style="padding-left:18px;line-height:1.6;margin:0 0 12px"><li>En el PC abre la extensión → <b>Modo vendedor</b> → <b>📲 Enviar al móvil</b>.</li><li>Te llega un código por <b>Telegram</b> (empieza por <b>CZ1.</b>). Mantén pulsado → <b>Copiar</b>.</li><li>Vuelve aquí y pulsa <b>Pegar e importar</b>.</li></ol>
    <button class="btn primary block" id="pasteImp">📋 Pegar e importar</button>
    <textarea id="impTxt" class="input" rows="4" style="margin-top:10px;font-size:13px" placeholder="…o pega aquí el código CZ1."></textarea>
    <button class="btn block" id="doImp" style="margin-top:8px">Importar el texto pegado</button>`);
  const go = async (txt) => {
    try { const r = applyImport(await unpackCode(txt)); closeSheet(); toast("✅ Importado: " + (r[0] || "datos")); renderAll(); openTab("vendedor"); }
    catch (e) { toast("❌ " + e.message); }
  };
  $("#pasteImp").onclick = async () => { try { go(await navigator.clipboard.readText()); } catch { toast("Pega el código en el cuadro de abajo"); $("#impTxt").focus(); } };
  $("#doImp").onclick = () => go($("#impTxt").value);
}
$("#exportBtn").onclick = async () => {
  const code = await packCode({ v: 1, at: Date.now(), sellerData: S.sellerData, sellerCosts: S.sellerCosts, inventory: S.inventory, watchlist: S.watchlist, saved: S.saved, settings: { theme: S.settings.theme } });
  try { await navigator.clipboard.writeText(code); toast("Copia de seguridad copiada ✓"); } catch { openSheet(`<h3>Tu copia de seguridad</h3><textarea class="input" rows="8">${esc(code)}</textarea>`); }
};
async function hashImport() {
  const m = location.hash.match(/import=([^&]+)/);
  if (!m) return false;
  try { const r = applyImport(await unpackCode(decodeURIComponent(m[1]))); toast("✅ Importado: " + (r[0] || "datos")); history.replaceState(null, "", "#vendedor"); return true; }
  catch (e) { toast("❌ " + e.message); return false; }
}

// ---------- registro ----------
function renderLog() { $("#log").textContent = S.log.join("\n") || "Sin actividad todavía."; }

// ---------- render general ----------
function renderAll() {
  renderStatus(); renderResumen(); renderDeals(); renderShops(); renderWatch(); renderSeller(); renderProfit(); renderInventory(); renderCalc(); renderSearches(); renderLog();
  if (current === "mercado") renderMarket();
  $("#nDeals").textContent = visible().filter((d) => Date.now() - d.found < DAY).length || "";
}

// ---------- arranque ----------
(async () => {
  renderSettings();
  const imported = await hashImport();
  openTab(imported ? "vendedor" : (location.hash || "#resumen").slice(1).split("&")[0], false);
  renderAll();
  botSay("¡Hola Yoel! Soy tu Cazachollos 🔥 ¿Qué miramos?\n\n" + AYUDA);
  S.lastFetch = Date.now(); refreshCloud(false); schedule();
  setInterval(renderStatus, 30000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
