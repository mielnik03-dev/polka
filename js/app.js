/* Полка — личный дневник кино, сериалов, книг и игр.
   Статическое приложение: данные лежат в localStorage на устройстве,
   друзья сравниваются через ссылку/файл со снимком полки. */
(() => {
  "use strict";

  /* ───────── справочники ───────── */
  const KINDS = [
    { id: "movie", label: "Фильм", plural: "Фильмы", icon: "🎬", done: "Посмотрел" },
    { id: "series", label: "Сериал", plural: "Сериалы", icon: "📺", done: "Посмотрел" },
    { id: "book", label: "Книга", plural: "Книги", icon: "📖", done: "Прочитал" },
    { id: "game", label: "Игра", plural: "Игры", icon: "🎮", done: "Прошёл" },
  ];
  const TONES = {
    amber: ["#2b1a0b", "#7d4a13", "#e0a244"],
    violet: ["#1b1230", "#4a2a7a", "#9d7bf0"],
    rose: ["#2c101c", "#7b223f", "#ef7c9d"],
    teal: ["#08211f", "#0f5d54", "#4fd1bb"],
    sky: ["#0a1c2e", "#124a75", "#62b9f5"],
    lime: ["#1a2408", "#4c6b12", "#c4e955"],
  };
  const TONE_IDS = Object.keys(TONES);
  const EMOJIS = ["🍿", "🎬", "📺", "🎧", "🚀", "🌙", "🕯️", "🔥", "🧠", "🎲", "📖", "🎮", "🌸", "🍒", "☕", "🐈", "🦊", "🌊", "🪐", "🖤", "⚡", "🪩", "🍄", "🦋"];
  const PRESET_TAGS = ["пересмотрю", "шедевр", "плакал", "не зашло", "атмосфера", "сюжетный поворот", "для настроения", "затянуто", "любимое"];
  const STATUS_IDS = ["want", "watched", "dropped"];
  const STATUS_CODE = { want: "w", watched: "d", dropped: "x" };
  const CODE_STATUS = { w: "want", d: "watched", x: "dropped" };
  const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[0];
  const statusLabel = (status, kind) =>
    status === "want" ? "В планах" : status === "dropped" ? "Брошено" : kindOf(kind).done;

  /* ───────── утилиты ───────── */
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clip = (s, n) => String(s ?? "").trim().slice(0, n);
  const toneStyle = (tone) => {
    const t = TONES[tone] || TONES.violet;
    return `--c1:${t[0]};--c2:${t[1]};--c3:${t[2]}`;
  };
  const fmtAvg = (v) => (v ? v.toFixed(1).replace(".", ",") : "—");
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const plural = (n, [one, few, many]) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };
  const keyOf = (kind, title) =>
    kind + "|" + String(title).toLowerCase().replace(/ё/g, "е").replace(/[^a-z0-9а-я]+/g, "");
  const toneFromText = (text) => {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return TONE_IDS[h % TONE_IDS.length];
  };

  let toastTimer;
  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
      return ok;
    }
  }

  function download(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ───────── хранилище ───────── */
  const LS_KEY = "polka.v1";
  let S = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY));
      if (raw && Array.isArray(raw.items)) {
        return { me: raw.me || null, items: raw.items, friends: Array.isArray(raw.friends) ? raw.friends : [] };
      }
    } catch { /* пусто или повреждено */ }
    return { me: null, items: [], friends: [] };
  }
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(S));
    } catch {
      toast("Не удалось сохранить: нет места в хранилище");
    }
  }

  /* ───────── обмен полкой: кодирование ───────── */
  const b64url = {
    enc(bytes) {
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    dec(str) {
      const s = str.replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    },
  };

  async function pipe(bytes, stream) {
    const out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }

  async function encodeShare(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === "function") {
      try {
        return "z" + b64url.enc(await pipe(bytes, new CompressionStream("deflate-raw")));
      } catch { /* падаем в несжатый вариант */ }
    }
    return "p" + b64url.enc(bytes);
  }

  async function decodeShare(code) {
    const mode = code[0];
    const body = b64url.dec(code.slice(1));
    let bytes;
    if (mode === "z") bytes = await pipe(body, new DecompressionStream("deflate-raw"));
    else if (mode === "p") bytes = body;
    else throw new Error("format");
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function buildShare(includeReviews) {
    return {
      kind: "polka-share",
      v: 1,
      id: S.me.id,
      name: S.me.name,
      emoji: S.me.emoji,
      tone: S.me.tone,
      items: S.items.map((i) => ({
        t: i.title, k: i.kind, y: i.year || undefined, c: i.creator || undefined, g: i.genres || undefined,
        e: i.emoji, o: i.tone, s: STATUS_CODE[i.status], r: i.rating || undefined,
        v: includeReviews && i.review ? i.review : undefined,
        tg: i.tags && i.tags.length ? i.tags : undefined, f: i.favorite ? 1 : undefined,
      })),
    };
  }

  /** Строго приводит чужие данные к нашей схеме. */
  function sanitizeShare(p) {
    if (!p || p.kind !== "polka-share" || !Array.isArray(p.items) || typeof p.id !== "string") throw new Error("shape");
    const items = p.items.slice(0, 3000).map((x) => {
      const kind = KINDS.some((k) => k.id === x.k) ? x.k : "movie";
      const r = Math.round(Number(x.r));
      const status = CODE_STATUS[x.s] || "watched";
      return {
        title: clip(x.t, 140),
        kind,
        year: Number.isFinite(+x.y) && +x.y > 1800 && +x.y < 2200 ? Math.round(+x.y) : null,
        creator: clip(x.c, 120),
        genres: clip(x.g, 120),
        emoji: EMOJIS.includes(x.e) ? x.e : kindOf(kind).icon,
        tone: TONES[x.o] ? x.o : toneFromText(String(x.t)),
        status,
        rating: status !== "want" && r >= 1 && r <= 10 ? r : null,
        review: clip(x.v, 2000),
        tags: Array.isArray(x.tg) ? x.tg.slice(0, 6).map((t) => clip(t, 30)).filter(Boolean) : [],
        favorite: !!x.f,
      };
    }).filter((i) => i.title);
    return {
      id: clip(p.id, 40),
      name: clip(p.name, 40) || "Друг",
      emoji: EMOJIS.includes(p.emoji) ? p.emoji : "🍿",
      tone: TONES[p.tone] ? p.tone : "violet",
      items,
    };
  }

  /* ───────── сравнение вкусов ───────── */
  function compare(friend) {
    const theirs = new Map(friend.items.map((i) => [keyOf(i.kind, i.title), i]));
    const mine = new Map(S.items.map((i) => [keyOf(i.kind, i.title), i]));
    const common = [];
    for (const m of S.items) {
      const t = theirs.get(keyOf(m.kind, m.title));
      if (t && m.rating && t.rating) common.push({ mine: m, theirs: t, diff: Math.abs(m.rating - t.rating) });
    }
    common.sort((a, b) => a.diff - b.diff || b.mine.rating - a.mine.rating);
    const raw = common.length ? 100 - avg(common.map((c) => c.diff)) * 11 : null;
    return {
      score: raw === null ? null : Math.max(12, Math.min(100, Math.round(raw))),
      common,
      unison: common.filter((c) => c.diff <= 1),
      clashes: common.filter((c) => c.diff >= 3).sort((a, b) => b.diff - a.diff),
      rest: common.filter((c) => c.diff > 1 && c.diff < 3),
      onlyTheirs: friend.items
        .filter((t) => !mine.has(keyOf(t.kind, t.title)) && t.status !== "want")
        .sort((a, b) => (b.rating || 0) - (a.rating || 0)),
      onlyMine: S.items.filter((m) => !theirs.has(keyOf(m.kind, m.title)) && m.status !== "want"),
    };
  }

  function scoreMeta(score) {
    if (score === null) return { label: "нет общих оценок", hint: "Оцените что-то из того же, что и друг", color: "rgba(255,255,255,.4)" };
    if (score >= 85) return { label: "вкусы почти совпадают", hint: "вам стоит ходить в кино вместе", color: "#d8ff4f" };
    if (score >= 70) return { label: "сильное совпадение", hint: "рекомендации друг друга работают", color: "#d8ff4f" };
    if (score >= 50) return { label: "часто соглашаетесь", hint: "есть точки расхождения", color: "#9d7bf0" };
    if (score >= 30) return { label: "разные вкусы", hint: "интересно сравнивать", color: "#ff8fa8" };
    return { label: "полярные вкусы", hint: "вам есть о чём поспорить", color: "#ff8fa8" };
  }

  function ring(score, size = 60) {
    const meta = scoreMeta(score);
    const stroke = 5, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const p = score === null ? 0 : Math.max(0.04, Math.min(1, score / 100));
    return `<div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${meta.color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/>
      </svg><b style="font-size:${size / 3.6}px;color:${meta.color}">${score === null ? "—" : score + "%"}</b></div>`;
  }

  /* ───────── представление ───────── */
  const F = { q: "", kind: "all", status: "all", sort: "recent" };
  let pendingImport = null;
  const app = $("#app");

  const navHtml = (active) => `
    <nav class="nav"><div class="nav-in">
      ${[["shelf", "/", "📚", "Полка"], ["add", "/add", "➕", "Добавить"], ["friends", "/friends", "👥", "Друзья"], ["me", "/me", "🙂", "Я"]]
        .map(([id, href, icon, label]) => `<a href="#${href}" class="${active === id ? "on" : ""}"><span>${icon}</span>${label}</a>`)
        .join("")}
    </div></nav>`;

  const page = (active, body) => `<main class="wrap">${body}</main>${navHtml(active)}`;

  function cover(item, cls = "s56") {
    return `<div class="cover ${cls}" style="${toneStyle(item.tone)}">${esc(item.emoji)}</div>`;
  }

  function badge(item) {
    if (item.status === "want") return `<div class="badge none">🔖</div>`;
    if (!item.rating) return `<div class="badge none">—</div>`;
    return `<div class="badge ${item.status === "dropped" ? "drop" : ""}">${item.rating}</div>`;
  }

  /* — полка — */
  function filteredItems() {
    const q = F.q.trim().toLowerCase();
    let list = S.items.filter(
      (i) =>
        (F.kind === "all" || i.kind === F.kind) &&
        (F.status === "all" || i.status === F.status) &&
        (!q || `${i.title} ${i.creator} ${i.genres} ${i.tags.join(" ")}`.toLowerCase().includes(q)),
    );
    const sorters = {
      recent: (a, b) => b.updatedAt - a.updatedAt,
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || b.updatedAt - a.updatedAt,
      title: (a, b) => a.title.localeCompare(b.title, "ru"),
      year: (a, b) => (b.year || 0) - (a.year || 0),
    };
    return list.sort(sorters[F.sort]);
  }

  function itemCard(i) {
    const meta = [kindOf(i.kind).label, i.year, i.creator].filter(Boolean).map(esc).join(" · ");
    return `<a class="card" href="#/item/${esc(i.id)}">
      ${cover(i)}
      <div class="grow">
        <h3 class="clip">${i.favorite ? "❤️ " : ""}${esc(i.title)}</h3>
        <div class="small muted clip">${meta}</div>
        <div class="tiny" style="margin-top:3px">${esc(statusLabel(i.status, i.kind))}</div>
        ${i.review ? `<div class="quote">«${esc(i.review)}»</div>` : ""}
      </div>${badge(i)}</a>`;
  }

  function listHtml() {
    const list = filteredItems();
    if (!S.items.length)
      return `<div class="empty"><div class="big">📚</div><p>Полка пока пустая.</p><p class="small" style="margin:6px 0 16px">Добавьте первый фильм, книгу или игру.</p><a class="btn primary" href="#/add">Добавить</a></div>`;
    if (!list.length) return `<div class="empty"><div class="big">🔎</div><p>Ничего не найдено</p></div>`;
    return `<div class="stack">${list.map(itemCard).join("")}</div>`;
  }

  function viewShelf() {
    const rated = S.items.filter((i) => i.rating).map((i) => i.rating);
    const done = S.items.filter((i) => i.status === "watched").length;
    const wants = S.items.filter((i) => i.status === "want").length;
    return page("shelf", `
      <div class="top"><h1>Полка ${esc(S.me.emoji)}</h1>
        <button class="icon-btn" data-act="random" title="Что выбрать из планов?" aria-label="Случайный выбор из планов">🎲</button></div>
      <div class="stats" style="margin-bottom:14px">
        <div class="surface stat"><b>${S.items.length}</b><span>всего</span></div>
        <div class="surface stat"><b>${done}</b><span>освоено</span></div>
        <div class="surface stat"><b class="acid">${fmtAvg(avg(rated))}</b><span>ср. оценка</span></div>
      </div>
      <div class="stack">
        <input class="input" id="q" type="search" placeholder="Поиск по названию, автору, тегам" value="${esc(F.q)}" autocomplete="off">
        <div class="chips" data-filter="kind">
          <button class="chip ${F.kind === "all" ? "on" : ""}" data-v="all">Всё</button>
          ${KINDS.map((k) => `<button class="chip ${F.kind === k.id ? "on" : ""}" data-v="${k.id}">${k.icon} ${k.plural}</button>`).join("")}
        </div>
        <div class="chips" data-filter="status">
          <button class="chip ${F.status === "all" ? "on" : ""}" data-v="all">Любой статус</button>
          <button class="chip ${F.status === "watched" ? "on" : ""}" data-v="watched">✅ Освоено</button>
          <button class="chip ${F.status === "want" ? "on" : ""}" data-v="want">🔖 В планах${wants ? " · " + wants : ""}</button>
          <button class="chip ${F.status === "dropped" ? "on" : ""}" data-v="dropped">💤 Брошено</button>
        </div>
        <select class="select" id="sort" aria-label="Сортировка">
          ${[["recent", "Недавно изменённые"], ["rating", "По оценке"], ["title", "По названию"], ["year", "По году"]]
            .map(([v, l]) => `<option value="${v}" ${F.sort === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
        <div id="list">${listHtml()}</div>
      </div>`);
  }

  /* — форма записи — */
  function viewItem(id) {
    const item = id ? S.items.find((i) => i.id === id) : null;
    if (id && !item) return page("shelf", `<div class="empty"><div class="big">🤷</div><p>Запись не найдена</p><a class="btn" style="margin-top:14px" href="#/">К полке</a></div>`);
    const d = item || { title: "", kind: "movie", year: "", creator: "", genres: "", emoji: "🎬", tone: "violet", status: "want", rating: null, review: "", tags: [], favorite: false };
    const tags = [...new Set([...PRESET_TAGS, ...d.tags])];
    return page(id ? "shelf" : "add", `
      <div class="top"><div class="row">${id ? `<a class="back icon-btn" href="#/" aria-label="Назад">←</a>` : ""}<h1>${id ? "Запись" : "Добавить"}</h1></div>
        ${id ? `<button class="icon-btn" data-act="delete" aria-label="Удалить">🗑</button>` : ""}</div>
      <form id="itemForm" class="stack" data-id="${esc(id || "")}" data-status="${esc(d.status)}" autocomplete="off">
        <label class="field"><span class="tiny">Название</span>
          <input class="input" name="title" required maxlength="140" placeholder="Например, «Интерстеллар»" value="${esc(d.title)}"></label>
        <div><span class="tiny" style="display:block;margin:0 0 6px 2px">Тип</span>
          <div class="seg" data-name="kind">${KINDS.map((k) => `<button type="button" data-v="${k.id}" class="${d.kind === k.id ? "on" : ""}">${k.icon} ${k.label}</button>`).join("")}</div></div>

        <div><span class="tiny" style="display:block;margin:0 0 6px 2px">Статус</span>
          <div class="seg" data-name="status">${STATUS_IDS.map((s) => `<button type="button" data-v="${s}" class="${d.status === s ? "on" : ""}" data-label-status="${s}">${esc(statusLabel(s, d.kind))}</button>`).join("")}</div></div>

        <div class="rate-only"><span class="tiny" style="display:block;margin:0 0 6px 2px">Оценка <span id="ratingVal" class="acid">${d.rating ? d.rating + "/10" : ""}</span></span>
          <div class="rating" data-name="rating">${Array.from({ length: 10 }, (_, n) => `<button type="button" data-v="${n + 1}" class="${d.rating === n + 1 ? "on" : ""}">${n + 1}</button>`).join("")}</div></div>

        <label class="field"><span class="tiny">Мини-отзыв</span>
          <textarea class="textarea" name="review" maxlength="2000" placeholder="Насколько понравилось? Что запомнилось?">${esc(d.review)}</textarea></label>

        <div><span class="tiny" style="display:block;margin:0 0 6px 2px">Теги</span>
          <div class="chips" style="flex-wrap:wrap" id="tagBox">${tags.map((t) => `<button type="button" class="chip ${d.tags.includes(t) ? "on" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>
          <div class="row" style="margin-top:8px"><input class="input" id="newTag" maxlength="30" placeholder="Свой тег"><button type="button" class="btn" data-act="addTag">+</button></div></div>

        <button type="button" class="fav ${d.favorite ? "on" : ""}" id="favBtn" aria-pressed="${d.favorite}">${d.favorite ? "❤️" : "🤍"} <span>Любимое</span></button>

        <details class="surface" ${id ? "" : "open"}><summary>Детали</summary><div class="body stack">
          <div class="cols">
            <label class="field"><span class="tiny">Год</span><input class="input" name="year" inputmode="numeric" maxlength="4" value="${esc(d.year || "")}"></label>
            <label class="field"><span class="tiny">Режиссёр / автор</span><input class="input" name="creator" maxlength="120" value="${esc(d.creator)}"></label>
          </div>
          <label class="field"><span class="tiny">Жанры</span><input class="input" name="genres" maxlength="120" placeholder="фантастика, драма" value="${esc(d.genres)}"></label>
          <div><span class="tiny" style="display:block;margin:0 0 6px 2px">Иконка</span>
            <div class="emojis" data-name="emoji">${EMOJIS.map((e) => `<button type="button" data-v="${e}" class="${d.emoji === e ? "on" : ""}">${e}</button>`).join("")}</div></div>
          <div><span class="tiny" style="display:block;margin:0 0 6px 2px">Цвет обложки</span>
            <div class="tones" data-name="tone">${TONE_IDS.map((t) => `<button type="button" data-v="${t}" class="${d.tone === t ? "on" : ""}" style="background:${TONES[t][2]}" aria-label="${t}"></button>`).join("")}</div></div>
        </div></details>

        <button class="btn primary block" type="submit">${id ? "Сохранить" : "Добавить на полку"}</button>
      </form>`);
  }

  function readForm(form) {
    const val = (name) => form.elements[name]?.value ?? "";
    const pick = (name) => $(`[data-name="${name}"] .on`, form)?.dataset.v;
    const status = pick("status") || "want";
    return {
      title: clip(val("title"), 140),
      kind: pick("kind") || "movie",
      year: (() => { const y = parseInt(val("year"), 10); return y > 1800 && y < 2200 ? y : null; })(),
      creator: clip(val("creator"), 120),
      genres: clip(val("genres"), 120),
      emoji: pick("emoji") || "🎬",
      tone: pick("tone") || "violet",
      status,
      rating: status === "want" ? null : parseInt(pick("rating"), 10) || null,
      review: clip(val("review"), 2000),
      tags: $$("#tagBox .chip.on", form).map((b) => b.dataset.tag).slice(0, 6),
      favorite: $("#favBtn", form).classList.contains("on"),
    };
  }

  /* — друзья — */
  function viewFriends() {
    const rows = S.friends.map((f) => ({ f, c: compare(f) })).sort((a, b) => (b.c.score ?? -1) - (a.c.score ?? -1));
    return page("friends", `
      <div class="top"><h1>Друзья</h1></div>
      <div class="stack">
        ${rows.length
          ? rows.map(({ f, c }) => `<a class="card" href="#/friend/${esc(f.id)}">
              <div class="cover s44" style="${toneStyle(f.tone)}">${esc(f.emoji)}</div>
              <div class="grow"><h3 class="clip">${esc(f.name)}</h3>
                <div class="small muted">${f.items.length} ${plural(f.items.length, ["запись", "записи", "записей"])} · ${c.common.length} общих</div>
                <div class="tiny" style="margin-top:3px;color:${scoreMeta(c.score).color}">${scoreMeta(c.score).label}</div></div>
              ${ring(c.score, 52)}</a>`).join("")
          : `<div class="empty"><div class="big">👥</div><p>Пока никого.</p><p class="small" style="margin-top:6px">Попросите друга прислать ссылку на его полку — и вставьте её ниже.</p></div>`}
        <div class="surface stack">
          <h3>Добавить друга</h3>
          <p class="small muted">Вставьте ссылку или код, который друг скопировал в разделе «Я → Поделиться полкой». Повторная вставка обновит его полку.</p>
          <textarea class="textarea" id="importText" style="min-height:80px" placeholder="Ссылка или код полки друга"></textarea>
          <div class="cols"><button class="btn primary" data-act="importText">Добавить</button>
            <label class="btn" style="cursor:pointer">Из файла<input type="file" id="importFile" accept=".json,.polka,application/json,text/plain" hidden></label></div>
        </div>
        ${S.items.length ? "" : `<p class="small faint" style="text-align:center">Чтобы было с чем сравнивать, сначала оцените что-нибудь на своей полке.</p>`}
      </div>`);
  }

  function cmpRow(c, friend) {
    const m = c.mine, t = c.theirs;
    return `<div class="cmp"><div class="row">
      ${cover(m, "s44")}
      <div class="grow"><h3 class="clip" style="font-size:15px">${esc(m.title)}</h3><div class="tiny" style="margin-top:2px">${esc(kindOf(m.kind).label)}${m.year ? " · " + esc(m.year) : ""}</div></div>
      <div class="vs"><span class="me">${m.rating}</span><span class="faint">·</span><span class="fr">${t.rating}</span></div></div>
      ${m.review ? `<div class="review"><i>Вы</i>${esc(m.review)}</div>` : ""}
      ${t.review ? `<div class="review"><i>${esc(friend.name)}</i>${esc(t.review)}</div>` : ""}</div>`;
  }

  function viewFriend(id) {
    const f = S.friends.find((x) => x.id === id);
    if (!f) return page("friends", `<div class="empty"><div class="big">🤷</div><p>Друг не найден</p><a class="btn" style="margin-top:14px" href="#/friends">К друзьям</a></div>`);
    const c = compare(f);
    const meta = scoreMeta(c.score);
    const sect = (title, rows, render) =>
      rows.length ? `<section class="sect"><span class="tiny">${title} · ${rows.length}</span><div class="stack">${rows.map(render).join("")}</div></section>` : "";
    return page("friends", `
      <div class="top"><div class="row"><a class="back icon-btn" href="#/friends" aria-label="Назад">←</a><h1 class="clip">${esc(f.name)}</h1></div>
        <button class="icon-btn" data-act="deleteFriend" data-id="${esc(f.id)}" aria-label="Удалить друга">🗑</button></div>
      <div class="surface row" style="gap:16px">${ring(c.score, 84)}
        <div class="grow"><div style="font-weight:700;font-size:18px">${meta.label}</div><div class="small muted">${meta.hint}</div>
          <div class="small faint" style="margin-top:6px">${c.common.length} ${plural(c.common.length, ["общая оценка", "общие оценки", "общих оценок"])} · полка ${f.items.length}</div></div></div>
      ${sect("🤝 Совпали во мнении", c.unison, (r) => cmpRow(r, f))}
      ${sect("⚡ Спорные", c.clashes, (r) => cmpRow(r, f))}
      ${sect("Остальные общие", c.rest, (r) => cmpRow(r, f))}
      ${sect(`Стоит посмотреть: ${esc(f.name)} уже освоил(а)`, c.onlyTheirs, (t) => `<div class="cmp"><div class="row">${cover(t, "s44")}
          <div class="grow"><h3 class="clip" style="font-size:15px">${esc(t.title)}</h3><div class="tiny" style="margin-top:2px">${esc(kindOf(t.kind).label)}${t.year ? " · " + esc(t.year) : ""}</div></div>
          ${t.rating ? `<div class="vs"><span class="fr">${t.rating}</span></div>` : ""}
          <button class="btn sm" data-act="wantFromFriend" data-fid="${esc(f.id)}" data-key="${esc(keyOf(t.kind, t.title))}">🔖</button></div>
          ${t.review ? `<div class="review"><i>${esc(f.name)}</i>${esc(t.review)}</div>` : ""}</div>`)}
      ${sect("Только у вас", c.onlyMine, (m) => `<a class="card" href="#/item/${esc(m.id)}">${cover(m, "s44")}<div class="grow"><h3 class="clip" style="font-size:15px">${esc(m.title)}</h3><div class="tiny">${esc(kindOf(m.kind).label)}</div></div>${badge(m)}</a>`)}
      ${c.common.length === 0 && !c.onlyTheirs.length ? `<div class="empty"><p>Пока нечего сравнивать — нужны одинаковые названия с оценками у обоих.</p></div>` : ""}`);
  }

  /* — подтверждение импорта — */
  function viewImport() {
    if (!pendingImport) return viewFriends();
    const p = pendingImport;
    const exists = S.friends.some((f) => f.id === p.id);
    const c = compare(p);
    return page("friends", `
      <div class="top"><h1>Полка друга</h1></div>
      <div class="surface stack" style="text-align:center">
        <div class="cover s72" style="${toneStyle(p.tone)};margin:0 auto">${esc(p.emoji)}</div>
        <h2>${esc(p.name)}</h2>
        <p class="muted">${p.items.length} ${plural(p.items.length, ["запись", "записи", "записей"])}${S.items.length ? `, общих оценок с вами: ${c.common.length}` : ""}</p>
        ${exists ? `<p class="small acid">Этот друг уже добавлен — полка будет обновлена.</p>` : ""}
        <button class="btn primary block" data-act="confirmImport">${exists ? "Обновить" : "Добавить в друзья"}</button>
        <button class="btn block" data-act="cancelImport">Отмена</button>
      </div>`);
  }

  /* — профиль и данные — */
  let shareState = { reviews: true, link: "", code: "" };

  function viewMe() {
    const m = S.me;
    return page("me", `
      <div class="top"><h1>Я</h1></div>
      <div class="stack">
        <form id="profileForm" class="surface stack" autocomplete="off">
          <div class="row"><div class="cover s72" style="${toneStyle(m.tone)}" id="profilePreview">${esc(m.emoji)}</div>
            <label class="field grow"><span class="tiny">Имя</span><input class="input" name="name" maxlength="40" required value="${esc(m.name)}"></label></div>
          <div class="emojis" data-name="emoji">${EMOJIS.map((e) => `<button type="button" data-v="${e}" class="${m.emoji === e ? "on" : ""}">${e}</button>`).join("")}</div>
          <div class="tones" data-name="tone">${TONE_IDS.map((t) => `<button type="button" data-v="${t}" class="${m.tone === t ? "on" : ""}" style="background:${TONES[t][2]}" aria-label="${t}"></button>`).join("")}</div>
          <button class="btn primary" type="submit">Сохранить профиль</button>
        </form>

        <div class="surface stack">
          <h3>📤 Поделиться полкой</h3>
          <p class="small muted">Друг откроет ссылку у себя — и вы сможете сравнить вкусы. Данные остаются в самой ссылке, никуда на сервер не отправляются.</p>
          <label class="row small"><input type="checkbox" id="shareReviews" ${shareState.reviews ? "checked" : ""}> Показывать мои отзывы</label>
          <div class="cols"><button class="btn primary" data-act="shareLink">🔗 Ссылка</button><button class="btn" data-act="shareCode">📋 Код</button></div>
          <button class="btn" data-act="shareFile">⬇️ Скачать файл полки</button>
        </div>

        <div class="surface stack">
          <h3>💾 Резервная копия</h3>
          <p class="small muted">Всё хранится в браузере этого устройства. Чтобы не потерять записи или перенести их на другой телефон — сохраните копию.</p>
          <div class="cols"><button class="btn" data-act="backup">Сохранить копию</button>
            <label class="btn" style="cursor:pointer">Восстановить<input type="file" id="restoreFile" accept=".json,application/json" hidden></label></div>
          <button class="btn danger" data-act="wipe">Стереть все данные</button>
        </div>
        <p class="tiny" style="text-align:center">Полка · ${S.items.length} ${plural(S.items.length, ["запись", "записи", "записей"])} · ${S.friends.length} ${plural(S.friends.length, ["друг", "друга", "друзей"])}</p>
      </div>`);
  }

  /* — первый запуск — */
  function viewWelcome() {
    return `<main class="wrap">
      <div class="hero"><img class="logo" src="icons/icon.svg" alt=""><h1>Полка</h1>
        <p class="muted" style="margin-top:8px">Дневник кино, сериалов, книг и игр.<br>Оценки, мини-отзывы и сравнение вкусов с друзьями.</p></div>
      <form id="welcomeForm" class="surface stack" style="margin-top:22px" autocomplete="off">
        <label class="field"><span class="tiny">Как вас зовут?</span><input class="input" name="name" maxlength="40" required placeholder="Имя, которое увидят друзья" autofocus></label>
        <div class="emojis" data-name="emoji">${EMOJIS.map((e, i) => `<button type="button" data-v="${e}" class="${i === 0 ? "on" : ""}">${e}</button>`).join("")}</div>
        <div class="tones" data-name="tone">${TONE_IDS.map((t, i) => `<button type="button" data-v="${t}" class="${i === 1 ? "on" : ""}" style="background:${TONES[t][2]}" aria-label="${t}"></button>`).join("")}</div>
        <button class="btn primary block" type="submit">Начать</button>
        <p class="small faint" style="text-align:center">Данные хранятся только на вашем устройстве.</p>
      </form></main>`;
  }

  /* ───────── маршрутизация ───────── */
  async function route() {
    const hash = location.hash.replace(/^#/, "") || "/";
    // ссылка-приглашение: разбираем один раз и сразу убираем из адреса
    const imp = hash.match(/^\/import\/(.+)$/);
    if (imp) {
      history.replaceState(null, "", location.pathname + location.search + "#/import");
      await startImport(imp[1]);
      return;
    }
    if (!S.me) {
      app.innerHTML = viewWelcome();
      return;
    }
    const parts = hash.split("/").filter(Boolean);
    let html;
    switch (parts[0]) {
      case undefined: html = viewShelf(); break;
      case "add": html = viewItem(null); break;
      case "item": html = viewItem(parts[1]); break;
      case "friends": html = viewFriends(); break;
      case "friend": html = viewFriend(parts[1]); break;
      case "import": html = viewImport(); break;
      case "me": html = viewMe(); break;
      default: html = viewShelf();
    }
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  async function startImport(text) {
    try {
      const code = extractCode(text);
      const payload = typeof code === "object" ? code : await decodeShare(code);
      const clean = sanitizeShare(payload);
      if (S.me && clean.id === S.me.id) {
        toast("Это ваша собственная полка");
        location.hash = "#/friends";
        return;
      }
      pendingImport = clean;
      if (location.hash !== "#/import") location.hash = "#/import";
      else route();
    } catch {
      toast("Не получилось прочитать ссылку или код");
      if (location.hash.startsWith("#/import")) location.hash = "#/friends";
    }
    if (!S.me) {
      // человек пришёл по ссылке, но ещё не завёл профиль
      app.innerHTML = viewWelcome();
    }
  }

  /** Принимает ссылку, голый код или JSON-текст. */
  function extractCode(text) {
    const t = String(text).trim();
    if (t.startsWith("{")) return JSON.parse(t);
    const m = t.match(/#\/import\/([A-Za-z0-9_-]+)/);
    const code = (m ? m[1] : t).replace(/\s+/g, "");
    if (!/^[zp][A-Za-z0-9_-]+$/.test(code)) throw new Error("format");
    return code;
  }

  /* ───────── события ───────── */
  function toggleGroup(btn) {
    $$("button", btn.parentElement).forEach((b) => b.classList.toggle("on", b === btn));
  }

  app.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const group = btn.parentElement;
    const name = group?.dataset?.name;

    // фильтры полки
    if (group?.dataset?.filter) {
      F[group.dataset.filter] = btn.dataset.v;
      route();
      return;
    }

    // выбор в формах (тип/статус/иконка/цвет/оценка)
    if (name) {
      const form = btn.closest("form");
      if (name === "rating") {
        const already = btn.classList.contains("on");
        $$("button", group).forEach((b) => b.classList.remove("on"));
        if (!already) btn.classList.add("on");
        $("#ratingVal").textContent = already ? "" : btn.dataset.v + "/10";
        return;
      }
      toggleGroup(btn);
      if (name === "status" && form) {
        form.dataset.status = btn.dataset.v;
        // новая оценка по умолчанию не ставится: пусть осознанно выберет
      }
      if (name === "kind" && form) {
        $$('[data-label-status]', form).forEach((b) => (b.textContent = statusLabel(b.dataset.labelStatus, btn.dataset.v)));
      }
      if (form?.id === "profileForm" || form?.id === "welcomeForm") {
        const em = $('[data-name="emoji"] .on', form)?.dataset.v;
        const tn = $('[data-name="tone"] .on', form)?.dataset.v;
        const prev = $("#profilePreview");
        if (prev) { prev.textContent = em; prev.setAttribute("style", toneStyle(tn)); }
      }
      return;
    }

    if (btn.dataset.tag !== undefined) {
      const on = $$("#tagBox .chip.on").length;
      if (!btn.classList.contains("on") && on >= 6) return toast("Не больше 6 тегов");
      btn.classList.toggle("on");
      return;
    }

    if (btn.id === "favBtn") {
      const on = btn.classList.toggle("on");
      btn.firstChild.textContent = on ? "❤️ " : "🤍 ";
      btn.setAttribute("aria-pressed", on);
      return;
    }

    const act = btn.dataset.act;
    if (!act) return;

    switch (act) {
      case "addTag": {
        const input = $("#newTag");
        const tag = clip(input.value, 30).toLowerCase();
        if (!tag) return;
        const existing = $$("#tagBox .chip").find((c) => c.dataset.tag === tag);
        if (existing) existing.classList.add("on");
        else $("#tagBox").insertAdjacentHTML("beforeend", `<button type="button" class="chip on" data-tag="${esc(tag)}">${esc(tag)}</button>`);
        input.value = "";
        break;
      }
      case "delete": {
        const form = $("#itemForm");
        if (confirm("Удалить запись с полки?")) {
          S.items = S.items.filter((i) => i.id !== form.dataset.id);
          save();
          toast("Запись удалена");
          location.hash = "#/";
        }
        break;
      }
      case "random": {
        const pool = S.items.filter((i) => i.status === "want" && (F.kind === "all" || i.kind === F.kind));
        if (!pool.length) return toast("В планах пусто — добавьте что-нибудь со статусом «В планах»");
        location.hash = "#/item/" + pool[Math.floor(Math.random() * pool.length)].id;
        break;
      }
      case "importText": {
        const v = $("#importText").value;
        if (!v.trim()) return toast("Вставьте ссылку или код");
        startImport(v);
        break;
      }
      case "confirmImport": {
        const p = pendingImport;
        if (!p) return;
        const idx = S.friends.findIndex((f) => f.id === p.id);
        const friend = { ...p, importedAt: Date.now() };
        if (idx >= 0) S.friends[idx] = friend; else S.friends.push(friend);
        save();
        pendingImport = null;
        toast(idx >= 0 ? "Полка друга обновлена" : "Друг добавлен");
        location.hash = "#/friend/" + p.id;
        break;
      }
      case "cancelImport":
        pendingImport = null;
        location.hash = "#/friends";
        break;
      case "deleteFriend":
        if (confirm("Убрать друга из списка? Ваши данные не пострадают.")) {
          S.friends = S.friends.filter((f) => f.id !== btn.dataset.id);
          save();
          location.hash = "#/friends";
        }
        break;
      case "wantFromFriend": {
        const f = S.friends.find((x) => x.id === btn.dataset.fid);
        const t = f?.items.find((x) => keyOf(x.kind, x.title) === btn.dataset.key);
        if (!t) return;
        if (S.items.some((i) => keyOf(i.kind, i.title) === btn.dataset.key)) return toast("Уже на вашей полке");
        S.items.push({ ...t, id: uid(), status: "want", rating: null, review: "", tags: [], favorite: false, createdAt: Date.now(), updatedAt: Date.now() });
        save();
        btn.disabled = true;
        btn.textContent = "✓";
        toast("Добавлено в планы");
        break;
      }
      case "shareLink":
      case "shareCode":
      case "shareFile": {
        const payload = buildShare(shareState.reviews);
        if (act === "shareFile") {
          download(`polka-${S.me.name.replace(/[^\wа-яё-]+/gi, "_") || "shelf"}.polka`, JSON.stringify(payload));
          toast("Файл сохранён — отправьте его другу");
          break;
        }
        const code = await encodeShare(payload);
        const text = act === "shareLink" ? `${location.origin}${location.pathname}#/import/${code}` : code;
        if (act === "shareLink" && navigator.share) {
          try {
            await navigator.share({ title: "Моя полка", text: `Сравним вкусы? Моя полка — ${S.items.length} записей`, url: text });
            break;
          } catch (err) {
            if (err && err.name === "AbortError") break;
          }
        }
        toast((await copyText(text)) ? (act === "shareLink" ? "Ссылка скопирована" : "Код скопирован") : "Не удалось скопировать");
        break;
      }
      case "backup":
        download(`polka-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ kind: "polka-backup", v: 1, data: S }));
        toast("Копия сохранена");
        break;
      case "wipe":
        if (confirm("Стереть ВСЕ данные (полку, друзей, профиль) на этом устройстве? Это нельзя отменить.") && confirm("Точно стереть?")) {
          S = { me: null, items: [], friends: [] };
          try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
          location.hash = "#/";
          route();
        }
        break;
    }
  });

  app.addEventListener("input", (e) => {
    if (e.target.id === "q") {
      F.q = e.target.value;
      $("#list").innerHTML = listHtml();
    }
  });

  app.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id === "sort") { F.sort = t.value; $("#list").innerHTML = listHtml(); }
    if (t.id === "shareReviews") shareState.reviews = t.checked;
    if (t.id === "importFile" || t.id === "restoreFile") {
      const file = t.files[0];
      t.value = "";
      if (!file) return;
      if (file.size > 8_000_000) return toast("Файл слишком большой");
      const text = await file.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* возможно, это код */ }
      if (json && json.kind === "polka-backup" && json.data && Array.isArray(json.data.items)) {
        if (confirm(`Заменить текущие данные копией (${json.data.items.length} записей)?`)) {
          S = { me: json.data.me || S.me, items: json.data.items, friends: Array.isArray(json.data.friends) ? json.data.friends : [] };
          save();
          toast("Данные восстановлены");
          location.hash = "#/";
          route();
        }
      } else if (t.id === "restoreFile") {
        toast("Это не файл резервной копии");
      } else {
        startImport(text);
      }
    }
  });

  app.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;

    if (form.id === "welcomeForm" || form.id === "profileForm") {
      const name = clip(form.elements.name.value, 40);
      if (name.length < 2) return toast("Имя — хотя бы 2 символа");
      const emoji = $('[data-name="emoji"] .on', form)?.dataset.v || "🍿";
      const tone = $('[data-name="tone"] .on', form)?.dataset.v || "violet";
      S.me = { id: S.me?.id || uid() + uid(), name, emoji, tone };
      save();
      toast(form.id === "welcomeForm" ? "Добро пожаловать!" : "Профиль сохранён");
      if (form.id === "welcomeForm") {
        if (pendingImport) location.hash = "#/import"; else { location.hash = "#/"; }
        route();
      } else route();
      return;
    }

    if (form.id === "itemForm") {
      const data = readForm(form);
      if (!data.title) return toast("Добавьте название");
      const id = form.dataset.id;
      const now = Date.now();
      if (id) {
        const item = S.items.find((i) => i.id === id);
        Object.assign(item, data, { updatedAt: now });
        save();
        toast("Сохранено");
        location.hash = "#/";
      } else {
        const dup = S.items.find((i) => keyOf(i.kind, i.title) === keyOf(data.kind, data.title));
        if (dup) {
          toast("Такая запись уже есть — открыл её");
          location.hash = "#/item/" + dup.id;
          return;
        }
        if (data.emoji === "🎬" && data.kind !== "movie") data.emoji = kindOf(data.kind).icon;
        S.items.push({ ...data, id: uid(), createdAt: now, updatedAt: now });
        save();
        toast("Добавлено на полку");
        location.hash = "#/";
      }
    }
  });

  window.addEventListener("hashchange", route);
  window.addEventListener("storage", (e) => {
    if (e.key === LS_KEY) { S = load(); route(); }
  });

  // эмодзи по умолчанию следует за типом, пока человек не выбрал свою иконку
  app.addEventListener("click", (e) => {
    const b = e.target.closest('[data-name="kind"] button');
    if (!b) return;
    const form = b.closest("form");
    if (!form || form.dataset.id) return;
    const cur = $('[data-name="emoji"] .on', form)?.dataset.v;
    if (!cur || KINDS.some((k) => k.icon === cur)) {
      const icon = kindOf(b.dataset.v).icon;
      $$('[data-name="emoji"] button', form).forEach((x) => x.classList.toggle("on", x.dataset.v === icon));
    }
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  route();
})();
