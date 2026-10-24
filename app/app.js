/* Desk Gadget web app for iPhone (add to Home Screen). Uses core.js for all logic. */
(() => {
  "use strict";
  const C = window.DeskCore;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("dg." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("dg." + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem("dg." + k); } catch (e) {} },
  };

  // ------------------------------------------------------------ Google plumbing
  async function http(url, opt) {
    const r = await fetch(url, { method: opt.method || "GET", headers: opt.headers, body: opt.body });
    let json = null; try { json = await r.json(); } catch (e) {}
    return { status: r.status, json };
  }
  function decode64(s) {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  let G = null;
  const client = () => (G = G || C.GoogleClient(store.get("creds"), http, decode64));

  // ------------------------------------------------------------ state
  let state = store.get("cache", { tasks: [], events: [], mail: [], data: { timetable: null, alerts: [] } });
  let busy = false, lastLoad = 0;
  const hidden = new Set();

  // ------------------------------------------------------------ setup screen
  function showSetup(msg) {
    $("appView").hidden = true; $("setup").hidden = false;
    $("setupErr").hidden = !msg; $("setupErr").textContent = msg || "";
  }
  $("connectBtn").onclick = async () => {
    let j;
    try { j = JSON.parse($("tokenBox").value.trim()); }
    catch (e) { return showSetup("That isn't the whole file. Copy everything in token.json, including { and }."); }
    if (!j.refresh_token || !j.client_id || !j.client_secret) return showSetup("This file is missing refresh_token, client_id or client_secret.");
    store.set("creds", { client_id: j.client_id, client_secret: j.client_secret, refresh_token: j.refresh_token });
    G = null;
    $("connectBtn").disabled = true; $("connectBtn").textContent = "Connecting…";
    try { await client().token(); start(); }
    catch (e) { store.del("creds"); showSetup(e.code === "SIGNIN" ? "Google says this sign-in has expired. Sign in again on the laptop gadget, then copy the new token.json." : "Couldn't reach Google: " + e.message); }
    finally { $("connectBtn").disabled = false; $("connectBtn").textContent = "Connect"; }
  };

  // ------------------------------------------------------------ loading
  async function load(force) {
    if (busy || (!force && Date.now() - lastLoad < 60000)) return;
    busy = true; $("bRefresh").classList.add("spin");
    const g = client(), dismissed = store.get("hiddenMail", {});
    const results = await Promise.allSettled([g.tasks(), g.events(), g.mail(dismissed), g.readData()]);
    const [t, e, m, d] = results;
    const sign = results.find(r => r.status === "rejected" && r.reason && r.reason.code === "SIGNIN");
    if (sign) { busy = false; $("bRefresh").classList.remove("spin"); store.del("creds"); G = null; return showSetup("Your Google sign-in has expired. Paste a fresh token.json from the laptop."); }
    if (t.status === "fulfilled") state.tasks = t.value;
    if (e.status === "fulfilled") state.events = e.value;
    if (m.status === "fulfilled") state.mail = m.value;
    if (d.status === "fulfilled") state.data = { timetable: d.value.timetable, alerts: d.value.alerts };
    const failed = results.filter(r => r.status === "rejected");
    state.error = failed.length ? (failed.length === results.length ? "Offline. Showing the last saved data." : "Some sections couldn't refresh: " + failed[0].reason.message) : "";
    state.updatedAt = failed.length === results.length ? state.updatedAt : Date.now();
    hidden.clear(); store.set("cache", state); lastLoad = Date.now();
    busy = false; $("bRefresh").classList.remove("spin");
    renderAll();
    if (d.status === "fulfilled") moodle(d.value);
  }

  async function moodle(data) {
    try {
      const seen = store.get("moodleSeen", {});
      const r = await client().moodleSync(seen, data.timetable, data);
      store.set("moodleSeen", seen);
      if (r.added || r.alerts.length) {
        const parts = [];
        if (r.added) parts.push(`Added ${r.added} task${r.added > 1 ? "s" : ""} from course emails`);
        if (r.alerts.length) parts.push(`${r.alerts.length} class change${r.alerts.length > 1 ? "s" : ""}`);
        banner(parts.join(" · ") + ".", false, "OK", () => banner(""));
        lastLoad = 0; load(true);
      }
    } catch (e) { /* homework detection is best-effort; the rest of the app keeps working */ }
  }

  // ------------------------------------------------------------ render helpers
  const dayLabel = C.dayLabel, today = C.todayStr, addDays = C.addDays;
  let bannerTimer = null;
  function banner(text, bad, btn, onBtn) {
    clearTimeout(bannerTimer);
    $("bannerText").textContent = text; $("banner").className = "banner" + (bad ? " bad" : ""); $("banner").hidden = !text;
    $("bannerBtn").hidden = !btn; if (btn) { $("bannerBtn").textContent = btn; $("bannerBtn").onclick = onBtn; }
    if (text && !bad) bannerTimer = setTimeout(() => { $("banner").hidden = true; }, 8000); // info messages fade away
  }
  const syncDate = () => $("dateWrap").classList.toggle("has", !!$("taskDue").value);
  $("taskDue").addEventListener("input", syncDate); $("taskDue").addEventListener("change", syncDate);
  const open = url => { if (url) window.open(url, "_blank", "noopener"); };
  function tick() {
    const d = new Date();
    $("time").textContent = C.pad(d.getHours()) + ":" + C.pad(d.getMinutes());
    $("date").textContent = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  }

  // ------------------------------------------------------------ classes
  const occStart = o => new Date(o.date + "T" + o.start + ":00");
  const occEnd = o => new Date(o.date + "T" + (o.end || o.start) + ":00");
  const isCancelled = o => o.alert && o.alert.kind === "cancelled";
  const roomOf = o => (o.alert && o.alert.kind === "moved" && o.alert.room) ? "moved to room " + o.alert.room : o.room;
  const typeCls = t => /תרגול|תרגיל|exercise|lab/i.test(t || "") ? "t-ex" : /סמינר|seminar/i.test(t || "") ? "t-sem" : "";
  function classes() {
    const tt = state.data && state.data.timetable;
    if (!tt) return [];
    const ws = C.displayWeekStart(new Date());
    return C.attachAlerts(C.occurrences(tt, ws, 14), (state.data && state.data.alerts) || []);
  }
  function until(ms) {
    const m = Math.round(ms / 60000);
    if (m < 60) return "in " + m + " min";
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return "in " + h + "h" + (r ? " " + r + "m" : "");
    const d = Math.round(h / 24); return "in " + d + " day" + (d > 1 ? "s" : "");
  }

  function renderNext(occ) {
    const sec = $("nextSec");
    if (!occ.length) { sec.hidden = true; return; }
    sec.hidden = false;
    const now = new Date(), live = occ.filter(o => !isCancelled(o));
    const cur = live.find(o => occStart(o) <= now && occEnd(o) > now);
    const nxt = cur || live.find(o => occStart(o) > now);
    const frag = document.createDocumentFragment();
    if (nxt) {
      const card = el("div", "nx");
      const n = el("div", "name", nxt.name + (nxt.type ? " · " + nxt.type : "")); n.dir = "auto";
      const m = el("div", "meta", dayLabel(nxt.date) + " " + nxt.start + "–" + nxt.end + " · " + roomOf(nxt)); m.dir = "auto";
      card.append(n, m, el("div", "count", cur ? "Now · until " + cur.end : until(occStart(nxt) - now)));
      frag.append(card);
    } else frag.append(el("div", "empty", "No more classes in the next two weeks."));
    $("nextMeta").textContent = cur ? "in class" : "";
    const t0 = today(), t7 = addDays(t0, 7);
    occ.filter(o => o.alert && o.date >= t0 && o.date <= t7).forEach(o => {
      const line = el("div", "alertline");
      line.append(el("span", "chip " + (isCancelled(o) ? "bad" : "warn"), isCancelled(o) ? "Cancelled" : "Moved"));
      line.append(el("span", "txt", dayLabel(o.date) + " " + o.start + (isCancelled(o) ? "" : " · room " + (o.alert.room || "?")) + " · " + o.name));
      if (o.alert.url) line.onclick = () => open(o.alert.url);
      frag.append(line);
    });
    $("next").replaceChildren(frag);
  }

  let weekOffset = 0;
  function renderWeek(occ) {
    const box = $("week");
    $("wkPrev").disabled = weekOffset === 0; $("wkNext").disabled = weekOffset === 1;
    $("hWeek").textContent = weekOffset === 0 ? "This week" : "Next week";
    if (!(state.data && state.data.timetable)) {
      box.replaceChildren(el("div", "empty", "Your timetable appears here after the laptop gadget has run once with the latest update."));
      $("weekMeta").textContent = ""; return;
    }
    const ws = addDays(C.displayWeekStart(new Date()), 7 * weekOffset), we = addDays(ws, 6);
    const mine = occ.filter(o => o.date >= ws && o.date <= we);
    const dm = x => new Date(x + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    $("weekMeta").textContent = dm(ws) + " – " + dm(we) + " · " + mine.length + " meeting" + (mine.length === 1 ? "" : "s");
    if (!mine.length) { box.replaceChildren(el("div", "empty", "No classes this week.")); return; }
    const frag = document.createDocumentFragment(), now = new Date(), t0 = today();
    let last = "";
    for (const o of mine) {
      if (o.date !== last) {
        frag.append(el("div", "group" + (o.date === t0 ? " today" : ""), (o.date === t0 ? "Today · " : "") +
          new Date(o.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })));
        last = o.date;
      }
      const cancelled = isCancelled(o), past = occEnd(o) <= now, live = occStart(o) <= now && !past;
      const li = el("div", "item" + (past ? " past" : "") + (cancelled ? " cancelled" : ""));
      li.append(el("div", "daybar " + (cancelled ? "cancel" : typeCls(o.type))));
      const main = el("div", "main");
      const t = el("div", "t", o.name); t.dir = "auto"; main.append(t);
      const s = el("div", "s", [o.type, roomOf(o)].filter(Boolean).join(" · ")); s.dir = "auto"; main.append(s);
      const right = el("div", "right"); right.append(el("span", "when", o.start + "–" + o.end));
      if (cancelled) right.append(el("span", "chip bad", "Cancelled"));
      else if (o.alert && o.alert.kind === "moved") right.append(el("span", "chip warn", "Room " + (o.alert.room || "changed")));
      else if (live) right.append(el("span", "chip info", "Now"));
      li.append(main, right); frag.append(li);
    }
    box.replaceChildren(frag);
  }

  // ------------------------------------------------------------ tasks
  function renderTasks() {
    const tasks = (state.tasks || []).filter(t => !hidden.has(t.id)), t0 = today();
    const groups = [
      { k: "Overdue", cls: "bad", items: tasks.filter(t => t.due && t.due < t0) },
      { k: "Today", cls: "warn", items: tasks.filter(t => t.due === t0) },
      { k: "Coming up", cls: "", items: tasks.filter(t => t.due && t.due > t0) },
      { k: "No date", cls: "", items: tasks.filter(t => !t.due) },
    ];
    const urgent = groups[0].items.length + groups[1].items.length;
    $("taskMeta").textContent = tasks.length ? (urgent ? urgent + " due" : tasks.length + " open") : "";
    const frag = document.createDocumentFragment();
    if (!tasks.length) frag.append(el("div", "empty", "No open tasks."));
    for (const g of groups) {
      if (!g.items.length) continue;
      frag.append(el("div", "group " + g.cls, g.k));
      for (const t of g.items) {
        const li = el("div", "item");
        const cb = el("input", "check"); cb.type = "checkbox"; cb.setAttribute("aria-label", "Mark done: " + t.title);
        cb.onchange = async () => {
          li.classList.add("done"); cb.disabled = true;
          try { await client().completeTask(t.listId, t.id); hidden.add(t.id); state.tasks = state.tasks.filter(x => x.id !== t.id); store.set("cache", state); setTimeout(renderTasks, 500); }
          catch (e) { li.classList.remove("done"); cb.checked = false; cb.disabled = false; banner("Couldn't mark it done: " + e.message, true, "OK", () => banner("")); }
        };
        const main = el("div", "main");
        const ttl = el("div", "t", t.title); ttl.dir = "auto"; main.append(ttl);
        if (t.url) ttl.onclick = () => open(t.url);
        if (t.notes) { const s = el("div", "s", t.notes); s.dir = "auto"; main.append(s); }
        const right = el("div", "right");
        if (t.due) right.append(el("span", "chip " + g.cls, dayLabel(t.due)));
        li.append(cb, main, right); frag.append(li);
      }
    }
    $("tasks").replaceChildren(frag);
  }
  $("addForm").addEventListener("submit", async e => {
    e.preventDefault();
    const title = $("taskTitle").value.trim(); if (!title) return;
    $("addBtn").disabled = true; $("addErr").hidden = true;
    try {
      await client().addTask(title, $("taskDue").value || "");
      $("taskTitle").value = ""; $("taskDue").value = ""; syncDate(); $("taskTitle").blur();
      lastLoad = 0; await load(true);
    } catch (err) { $("addErr").textContent = "Couldn't add the task: " + err.message; $("addErr").hidden = false; }
    finally { $("addBtn").disabled = false; }
  });

  // ------------------------------------------------------------ calendar + mail
  function renderCal() {
    const evs = state.events || [];
    if (!evs.length) { $("cal").replaceChildren(el("div", "empty", "Nothing scheduled in the next 30 days.")); return; }
    const frag = document.createDocumentFragment(); let last = "";
    for (const ev of evs) {
      const day = ev.allDay ? ev.start.slice(0, 10) : C.ymd(new Date(ev.start));
      if (day !== last) { frag.append(el("div", "group" + (day === today() ? " warn" : ""), dayLabel(day))); last = day; }
      const li = el("div", "item link"); li.onclick = () => open(ev.url);
      li.append(el("div", "daybar" + (ev.allDay ? " allday" : "")));
      const main = el("div", "main"); const t = el("div", "t", ev.title); t.dir = "auto"; main.append(t);
      const sub = [ev.location, ev.calendar].filter(Boolean).join(" · ");
      if (sub) { const s = el("div", "s", sub); s.dir = "auto"; main.append(s); }
      li.append(main, el("span", "when", ev.allDay ? "all day" : C.hm(ev.start) + (ev.end ? "–" + C.hm(ev.end) : "")));
      frag.append(li);
    }
    $("cal").replaceChildren(frag);
  }
  function renderMail() {
    const rows = state.mail || [], yours = rows.filter(r => r.rank < 2).length;
    $("mailMeta").textContent = yours ? yours + " for you" : "";
    if (!rows.length) { $("mail").replaceChildren(el("div", "empty", "Nothing important in the last 14 days.")); return; }
    const frag = document.createDocumentFragment();
    for (const m of rows) {
      const li = el("div", "item link noicon"); li.onclick = () => open(m.url);
      const main = el("div", "main");
      const t = el("div", "t", m.subject); t.dir = "auto"; main.append(t);
      const s = el("div", "s", m.from + (m.snippet ? " — " + m.snippet : "")); s.dir = "auto"; main.append(s);
      const right = el("div", "right");
      right.append(el("span", "chip " + (m.state === "Unread" ? "warn" : m.state === "Your turn" ? "info" : ""), m.state));
      const done = el("button", "done-btn", "Done"); done.type = "button";
      done.onclick = ev => {
        ev.stopPropagation();
        const h = store.get("hiddenMail", {}); h[m.id] = m.time; store.set("hiddenMail", h);
        state.mail = state.mail.filter(x => x.id !== m.id); store.set("cache", state); renderMail();
        banner("Hidden here. It stays in Gmail.", false, "Undo", () => {
          const h2 = store.get("hiddenMail", {}); delete h2[m.id]; store.set("hiddenMail", h2); banner(""); lastLoad = 0; load(true);
        });
      };
      right.append(done, el("span", "when", C.ago(m.time)));
      li.append(main, right); frag.append(li);
    }
    $("mail").replaceChildren(frag);
  }

  function renderAll() {
    tick();
    const occ = classes();
    renderNext(occ); renderTasks(); renderCal(); renderMail(); renderWeek(occ);
    $("updated").textContent = state.updatedAt ? "Updated " + new Date(state.updatedAt).toTimeString().slice(0, 5) : "";
    if (state.error && $("banner").hidden) banner(state.error, false, "Retry", () => { banner(""); load(true); });
  }

  // ------------------------------------------------------------ tabs, refresh, pull-to-refresh
  function setTab(name) {
    const week = name === "week";
    $("viewToday").hidden = week; $("viewWeek").hidden = !week;
    $("tabToday").setAttribute("aria-selected", String(!week)); $("tabWeek").setAttribute("aria-selected", String(week));
    store.set("tab", name);
  }
  $("tabToday").onclick = () => setTab("today");
  $("tabWeek").onclick = () => setTab("week");
  $("wkPrev").onclick = () => { weekOffset = 0; renderWeek(classes()); };
  $("wkNext").onclick = () => { weekOffset = 1; renderWeek(classes()); };
  $("bRefresh").onclick = () => load(true);
  $("bSignOut").onclick = () => { store.del("creds"); store.del("cache"); G = null; showSetup(""); };

  let pullY = null;
  window.addEventListener("touchstart", e => { pullY = window.scrollY <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  window.addEventListener("touchmove", e => {
    if (pullY == null) return;
    const dy = e.touches[0].clientY - pullY;
    $("pull").style.height = dy > 20 ? Math.min(40, dy / 3) + "px" : "0";
  }, { passive: true });
  window.addEventListener("touchend", () => {
    if (pullY != null && parseFloat($("pull").style.height || "0") >= 30) load(true);
    $("pull").style.height = "0"; pullY = null;
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderAll(); load(false); } });

  function start() {
    $("setup").hidden = true; $("appView").hidden = false;
    setTab(store.get("tab", "today"));
    renderAll(); load(true);
  }
  setInterval(() => { if (!$("appView").hidden) { renderAll(); if (Date.now() - lastLoad > 5 * 60000) load(true); } }, 60000);
  setInterval(tick, 5000);
  window.__deskTest = s => { state = s; $("setup").hidden = true; $("appView").hidden = false; renderAll(); };

  if (store.get("creds")) start(); else showSetup("");
})();
