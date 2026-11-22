// Cazachollos · Modo vendedor y Beneficio por mes.
// Todo se calcula con los datos que se leen solos de tus cuentas (sync.js). Nada se toca en Wallapop ni Vinted.
import { matchSearch } from "./scanner.js";

const DAY = 864e5;

// Familias de producto para cruzar compras con ventas
export const FAMILIES = [
  ["Switch", /switch/i],
  ["PS5", /\bps5\b|playstation\s*5/i],
  ["iPhone", /iphone/i],
  ["AirPods", /airpods/i],
  ["Reloj", /\breloj/i],
  ["Libros", /bachiller|\beso\b|libro|cambridge|lengua|filosof|historia|matem|econom|lat[ií]n|cultura cl/i],
];
export const familyOf = (t) => (FAMILIES.find(([, re]) => re.test(t || "")) || ["Otros"])[0];

// Lo que no aparece en las webs (compras en mano y costes por unidad). Se puede cambiar en el panel.
export const DEFAULT_COSTS = {
  unit: { Reloj: 4, Libros: 0 },
  extra: [
    { id: "x-laumuhe", title: "Nintendo Switch + 2 mandos Pro (laumuhe, en mano)", price: 80, date: Date.UTC(2026, 9, 31, 12), platform: "En mano", family: "Switch" },
  ],
  manual: {}, // coste puesto a mano para una venta concreta: { "Vinted:123": 50 }
};

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["de", "la", "el", "y", "con", "para", "en", "a", "1", "o", "the", "edition", "nuevo", "muy", "buen", "estado", "libre"]);
function keyOf(t) {
  const words = norm(t).split(" ").filter((w) => w.length > 1 && !STOP.has(w));
  return words.slice(0, 4).join(" ");
}
function similar(a, b) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((w) => B.has(w) && n++);
  return n / Math.min(A.size, B.size);
}

// Vinted no da la fecha de publicación: se estima con la foto más antigua y, si se editaron fotos, con el id (los ids van en orden)
function fixVintedDates(items) {
  const pts = items.filter((i) => i.created).map((i) => ({ id: +i.id, t: i.created })).sort((a, b) => a.id - b.id);
  return items.map((i) => {
    if (!i.created || pts.length < 3) return i;
    const id = +i.id;
    const lo = [...pts].reverse().find((p) => p.id < id), hi = pts.find((p) => p.id > id);
    if (!lo || !hi || hi.t <= lo.t) return i;
    const est = lo.t + ((id - lo.id) / (hi.id - lo.id)) * (hi.t - lo.t);
    return i.created > est + 2 * DAY ? { ...i, created: Math.round(est), estimated: true } : i;
  });
}

function marketFor(title, price, searches, market) {
  const s = matchSearch(title, searches || [], price);
  if (!s) return null;
  const last = [...(market?.[s.name] || [])].reverse().find((p) => p.w);
  return last ? { median: last.w, vinted: last.v || null, search: s.name, t: last.t } : null;
}

// ---------- MODO VENDEDOR ----------
export function sellerAnalysis(data, { searches, market } = {}, now = Date.now()) {
  const out = { listings: [], actions: [], groups: [], updated: { Wallapop: data?.wallapop?.at || 0, Vinted: data?.vinted?.at || 0 } };
  const w = (data?.wallapop?.items || []).map((i) => ({ ...i, platform: "Wallapop" }));
  const v = fixVintedDates((data?.vinted?.items || []).filter((i) => !i.closed && !i.draft)).map((i) => ({ ...i, platform: "Vinted" }));
  const all = [...w, ...v];

  for (const l of all) {
    const days = l.created ? Math.max(0, (now - l.created) / DAY) : null;
    const vpd = days != null && l.views != null ? l.views / Math.max(1, days) : null;
    const mk = marketFor(l.title, l.price, searches, market);
    const ref = mk ? (l.platform === "Vinted" && mk.vinted ? mk.vinted : mk.median) : null;
    const diff = ref ? Math.round((l.price / ref - 1) * 100) : null;
    const tags = [];
    let relist = false;
    if (l.review) tags.push({ k: "info", t: "En revisión" });
    else if (l.reserved || l.onHold) tags.push({ k: "info", t: "Reservado" });
    else if (days != null) {
      // Wallapop premia lo recién subido; Vinted también, pero tarda más en "morir"
      const limit = l.platform === "Wallapop" ? 7 : 10;
      if (days >= limit && (vpd == null || vpd < 3)) relist = true;
      if (days >= 21) relist = true;
      if (relist) tags.push({ k: "warn", t: "Resubir" });
    }
    if (diff != null && diff >= 15) tags.push({ k: "neg", t: `Caro +${diff}%` });
    if (diff != null && diff <= -15) tags.push({ k: "pos", t: `Barato ${diff}%` });
    if ((l.favs || 0) >= 10) tags.push({ k: "pos", t: "Mucho interés" });
    out.listings.push({ ...l, family: familyOf(l.title), days, vpd, market: ref, marketName: mk?.search || null, diff, relist, tags });
  }

  // agrupar el mismo producto en las dos webs
  // (emparejamiento global: primero las parejas que más se parecen, cada anuncio en un solo grupo)
  const groups = out.listings.filter((l) => l.platform === "Wallapop").map((l) => ({ key: keyOf(l.title), family: l.family, title: l.title, items: [l] }));
  const pairs = [];
  out.listings.filter((l) => l.platform === "Vinted").forEach((v) => groups.forEach((g) => {
    const w = g.items[0];
    if (w.family !== v.family) return;
    const sim = similar(w.title, v.title);
    if (sim < 0.75) return;
    pairs.push({ v, g, s: sim + (norm(w.title) === norm(v.title) ? 1 : 0) - (Math.abs(w.price - v.price) / Math.max(1, w.price)) * 0.5 });
  }));
  const usedV = new Set();
  pairs.sort((a, b) => b.s - a.s).forEach(({ v, g, s }) => { if (usedV.has(v) || g.items.length > 1) return; g.items.push(v); usedV.add(v); });
  out.listings.filter((l) => l.platform === "Vinted" && !usedV.has(l)).forEach((v) => groups.push({ key: keyOf(v.title), family: v.family, title: v.title, items: [v] }));
  out.groups = groups.map((g) => {
    const plats = new Set(g.items.map((i) => i.platform));
    return { ...g, onlyOn: plats.size === 1 ? [...plats][0] : null, price: Math.max(...g.items.map((i) => i.price || 0)) };
  });

  // acciones de hoy (ordenadas por importancia)
  const A = [];
  for (const l of out.listings.filter((x) => x.relist)) {
    A.push({ p: 3, icon: "🔁", text: `Resubir en ${l.platform}: ${l.title}`, why: `${Math.round(l.days)} días · ${l.vpd != null ? l.vpd.toFixed(1).replace(".", ",") + " visitas/día" : "sin datos de visitas"}`, url: l.url });
  }
  for (const l of out.listings.filter((x) => x.diff != null && x.diff >= 15 && !x.review)) {
    A.push({ p: 2, icon: "💸", text: `Precio alto en ${l.platform}: ${l.title} a ${l.price} €`, why: `mercado ~${l.market} € (+${l.diff}%)`, url: l.url });
  }
  for (const g of out.groups.filter((x) => x.onlyOn && !x.items.some((i) => i.reserved || i.review))) {
    const other = g.onlyOn === "Wallapop" ? "Vinted" : "Wallapop";
    // si en la otra web ya hay algo muy parecido (p. ej. el mismo reloj a otro precio), no lo propongas
    if (out.listings.some((l) => l.platform === other && l.family === g.family && similar(l.title, g.title) >= 0.6)) continue;
    if (!(other === "Vinted" ? data?.vinted : data?.wallapop)?.at) continue; // aún no se ha leído esa web
    A.push({ p: 1, icon: "➕", text: `Súbelo también a ${other}: ${g.title}`, why: `solo está en ${g.onlyOn}`, url: g.items[0].url });
  }
  // repetidos en la misma web
  for (const plat of ["Wallapop", "Vinted"]) {
    const seen = new Map();
    for (const l of out.listings.filter((x) => x.platform === plat)) {
      const k = norm(l.title);
      if (seen.has(k)) A.push({ p: 1, icon: "👯", text: `Repetido en ${plat}: ${l.title}`, why: "¿tienes 2 unidades? Si no, borra el más antiguo", url: l.url });
      else seen.set(k, l);
    }
  }
  for (const l of out.listings.filter((x) => (x.favs || 0) >= 10 && !x.reserved)) {
    A.push({ p: 1, icon: "⭐", text: `${l.title} tiene ${l.favs} favoritos en ${l.platform}`, why: "hay demanda: aguanta el precio o sube unidades", url: l.url });
  }
  out.actions = A.sort((a, b) => b.p - a.p);

  const active = out.listings.filter((l) => !l.review);
  out.kpi = {
    listings: out.listings.length,
    products: out.groups.length,
    relist: out.listings.filter((l) => l.relist).length,
    value: out.groups.reduce((a, g) => a + (g.price || 0), 0),
    views: active.reduce((a, l) => a + (l.views || 0), 0),
    favs: active.reduce((a, l) => a + (l.favs || 0), 0),
  };
  return out;
}

// ---------- BENEFICIO POR MES ----------
export function profitAnalysis(data, costs = DEFAULT_COSTS, listings = []) {
  const cfg = { ...DEFAULT_COSTS, ...(costs || {}), unit: { ...DEFAULT_COSTS.unit, ...(costs?.unit || {}) }, manual: { ...(costs?.manual || {}) } };
  const extra = cfg.extra || [];
  const sales = [
    ...(data?.vinted?.sold || []).filter((s) => !/cancel|refund|reembols/i.test(s.status)).map((s) => ({ ...s, platform: "Vinted", pending: s.status !== "completed" })),
    ...(data?.wallapop?.sold || []).map((s) => ({ ...s, platform: "Wallapop", pending: false })),
  ].filter((s) => s.date && s.price).map((s) => ({ ...s, key: s.platform + ":" + s.id, family: familyOf(s.title) })).sort((a, b) => a.date - b.date);

  const buys = [
    ...(data?.vinted?.bought || []).filter((b) => !/cancel|refund|reembols/i.test(b.status)).map((b) => ({ ...b, platform: "Vinted" })),
    ...(data?.wallapop?.bought || []).map((b) => ({ ...b, platform: "Wallapop" })),
    ...extra,
  ].filter((b) => b.date && b.price).map((b) => ({ ...b, key: (b.platform || "") + ":" + b.id, family: b.family || familyOf(b.title), used: false })).sort((a, b) => a.date - b.date);

  // cada venta se lleva la compra más antigua de su familia (FIFO)
  for (const s of sales) {
    if (cfg.manual[s.key] != null) { s.cost = +cfg.manual[s.key]; s.costFrom = "puesto a mano"; continue; }
    const b = buys.find((x) => !x.used && x.family === s.family && x.date <= s.date + DAY);
    if (b) { b.used = true; s.cost = b.price; s.costFrom = `${b.platform} · ${b.title}`; s.buyDate = b.date; continue; }
    if (cfg.unit[s.family] != null) { s.cost = cfg.unit[s.family]; s.costFrom = s.family === "Libros" ? "tuyo (sin coste)" : `coste por unidad (${cfg.unit[s.family]} €)`; continue; }
    s.cost = null; s.costFrom = "coste desconocido";
  }
  for (const s of sales) s.profit = s.cost == null ? null : Math.round((s.price - s.cost) * 100) / 100;

  const mKey = (t) => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  const months = {};
  const M = (k) => (months[k] ||= { key: k, income: 0, spent: 0, profit: 0, sales: 0, buys: 0, unknown: 0 });
  for (const s of sales) {
    const m = M(mKey(s.date)); m.income += s.price; m.sales++;
    if (s.profit != null) m.profit += s.profit; else m.unknown++;
    // los costes por unidad (relojes) se gastan cuando se venden
    if (!s.buyDate && s.cost) m.spent += s.cost;
  }
  for (const b of buys) { const m = M(mKey(b.date)); m.spent += b.price; m.buys++; }
  const list = Object.values(months).sort((a, b) => a.key.localeCompare(b.key)).map((m) => ({ ...m, income: r2(m.income), spent: r2(m.spent), profit: r2(m.profit), label: new Date(m.key + "-15").toLocaleDateString("es-ES", { month: "short", year: "2-digit" }) }));

  // stock: compras que aún no se han vendido, emparejadas con tus anuncios activos
  // un mismo producto puede estar en las dos webs: se cuenta una vez (el precio más alto)
  const products = [];
  for (const l of listings) {
    if (l.review && listings.some((o) => o !== l && o.family === l.family && similar(o.title, l.title) >= 0.75 && !o.review)) continue;
    const p = products.find((x) => x.family === l.family && similar(x.title, l.title) >= 0.75 && !x.plats.has(l.platform));
    if (p) { p.plats.add(l.platform); if (l.price > p.price) Object.assign(p, { price: l.price, url: l.url, platform: l.platform }); }
    else products.push({ title: l.title, price: l.price, platform: l.platform, url: l.url, family: l.family, plats: new Set([l.platform]) });
  }
  // cada compra sin vender se empareja con un anuncio distinto (la combinación que más se parece en total)
  const unsold = buys.filter((b) => !b.used);
  const link = new Map();
  for (const fam of new Set(unsold.map((b) => b.family))) {
    const B = unsold.filter((b) => b.family === fam), L = products.filter((p) => p.family === fam);
    if (!L.length) continue;
    let best = { score: -1, pick: [] };
    const walk = (i, used, pick, score) => {
      if (i === B.length) { if (score > best.score) best = { score, pick: [...pick] }; return; }
      if (B.length > 7) { pick.push(null); walk(i + 1, used, pick, score); pick.pop(); return; } // demasiadas: sin emparejar
      walk(i + 1, used, [...pick, null], score);
      L.forEach((l, j) => { if (!used.has(j)) { used.add(j); walk(i + 1, used, [...pick, l], score + 1 + similar(B[i].title, l.title)); used.delete(j); } });
    };
    walk(0, new Set(), [], 0);
    B.forEach((b, i) => best.pick[i] && link.set(b, best.pick[i]));
  }
  const stock = unsold.map((b) => {
    const l = link.get(b);
    return { ...b, listing: l ? { title: l.title, price: l.price, platform: l.platform, url: l.url } : null, expected: l ? r2(l.price - b.price) : null };
  });

  const thisMonth = list.find((m) => m.key === mKey(Date.now())) || { income: 0, spent: 0, profit: 0, sales: 0 };
  const known = sales.filter((s) => s.profit != null);
  return {
    sales: sales.slice().reverse(), buys, months: list, stock,
    kpi: {
      profit: r2(known.reduce((a, s) => a + s.profit, 0)),
      income: r2(sales.reduce((a, s) => a + s.price, 0)),
      month: thisMonth,
      invested: r2(stock.reduce((a, b) => a + b.price, 0)),
      expected: r2(stock.reduce((a, b) => a + (b.expected || 0), 0)),
      unknown: sales.filter((s) => s.profit == null).length,
      avgMargin: known.length ? Math.round((known.reduce((a, s) => a + s.profit, 0) / Math.max(1, known.reduce((a, s) => a + s.price, 0))) * 100) : null,
      sold: sales.length,
    },
  };
}
const r2 = (n) => Math.round(n * 100) / 100;

// Texto para Telegram (resumen diario)
export function sellerTelegramLines(sa, pa) {
  if (!sa || !sa.listings.length) return [];
  const relist = sa.listings.filter((l) => l.relist);
  const caro = sa.listings.filter((l) => l.diff != null && l.diff >= 15 && !l.review);
  const lines = [`🏷 <b>Modo vendedor</b>: ${sa.kpi.products} producto(s) · ${sa.kpi.views} visitas · ${sa.kpi.favs} favoritos`];
  if (relist.length) lines.push(`🔁 Resubir: ${relist.slice(0, 4).map((l) => `${l.title.slice(0, 28)} (${l.platform})`).join(", ")}${relist.length > 4 ? "…" : ""}`);
  if (caro.length) lines.push(`💸 Caros: ${caro.slice(0, 3).map((l) => `${l.title.slice(0, 24)} ${l.price}€ vs ~${l.market}€`).join(", ")}`);
  if (pa) lines.push(`💶 Este mes: ${eurTxt(pa.kpi.month.income)} vendidos · beneficio ${eurTxt(pa.kpi.month.profit)} · total ${eurTxt(pa.kpi.profit)}`);
  return lines;
}
const eurTxt = (n) => (Math.round(n || 0)).toLocaleString("es-ES") + " €";
