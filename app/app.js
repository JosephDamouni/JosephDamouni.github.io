/* Desk Gadget web app for iPhone (add to Home Screen). Uses core.js for all logic. English / Hebrew. */
(() => {
  "use strict";
  const C = window.DeskCore;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text;
    if (/^(t|s|name|meta|txt|nx)$/.test(cls || "")) e.dir = "auto"; // Hebrew and English text each align naturally
    return e;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("dg." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("dg." + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem("dg." + k); } catch (e) {} },
  };

  // ------------------------------------------------------------ language
  const STR = {
    en: {
      today: "Today", week: "Week", tomorrow: "Tomorrow", yesterday: "Yesterday",
      nextClass: "Next class", inClass: "in class", nowUntil: "Now · until {t}", noMoreClasses: "No more classes in the next two weeks.",
      tasks: "Tasks", addPh: "Add a task", dueDate: "Due date (optional)", add: "Add", noTasks: "No open tasks.",
      nDue: "{n} due", nOpen: "{n} open", overdue: "Overdue", comingUp: "Coming up", noDate: "No date", markDone: "Mark done",
      calendar: "Calendar", next30: "next 30 days", noEvents: "Nothing scheduled in the next 30 days.", allDay: "all day",
      mail: "Important mail", forYou: "{n} for you", noMail: "Nothing important in the last 14 days.", hide: "Done",
      hiddenMsg: "Hidden here. It stays in Gmail.", undo: "Undo",
      Unread: "Unread", "Your turn": "Your turn", "Their turn": "Their turn", FYI: "FYI",
      thisWeek: "This week", nextWeek: "Next week", meetings: n => n === 1 ? "1 meeting" : `${n} meetings`, noClasses: "No classes this week.",
      ttMissing: "Your timetable appears here after the laptop gadget has run once with the latest update.",
      cancelled: "Cancelled", moved: "Moved", room: "Room {r}", roomChanged: "Room changed", movedTo: "moved to room {r}", now: "Now",
      updated: "Updated {t}", disconnect: "Disconnect", pull: "Release to refresh", retry: "Retry", ok: "OK", loading: "Loading…",
      offline: "Offline. Showing the last saved data.", partial: "Some sections couldn't refresh: {m}",
      markFail: "Couldn't mark it done: {m}", addFail: "Couldn't add the task: {m}",
      moodleAdded: n => n === 1 ? "Added 1 task from a course email" : `Added ${n} tasks from course emails`,
      changes: n => n === 1 ? "1 class change" : `${n} class changes`,
      inMin: "in {n} min", inHM: "in {h}h{m}", inDays: n => n === 1 ? "in 1 day" : `in ${n} days`,
      agoNow: "now", agoM: "{n}m", agoH: "{n}h", agoD: "{n}d",
      setupIntro: "Connect your Google account once. Paste the sign-in file from your laptop's Desk Gadget:",
      step1: "On the laptop, press Windows + R, type <code>%APPDATA%\\DeskGadget</code> and open <code>token.json</code> in Notepad.",
      step2: "Copy everything in it and get it to this phone (for example, email it to yourself, then delete that email).",
      step3: "Paste it below and tap Connect.",
      connect: "Connect", connecting: "Connecting…", privacy: "It stays on this phone only. Nothing is sent anywhere except to Google.",
      badFile: "That isn't the whole file. Copy everything in token.json, including { and }.",
      missingFields: "This file is missing refresh_token, client_id or client_secret.",
      expiredPaste: "Google says this sign-in has expired. Sign in again on the laptop gadget, then copy the new token.json.",
      expired: "Your Google sign-in has expired. Paste a fresh token.json from the laptop.",
      noReach: "Couldn't reach Google: {m}", langBtn: "עב", langLabel: "עברית",
    },
    he: {
      today: "היום", week: "שבוע", tomorrow: "מחר", yesterday: "אתמול",
      nextClass: "השיעור הבא", inClass: "בשיעור", nowUntil: "עכשיו · עד {t}", noMoreClasses: "אין שיעורים נוספים בשבועיים הקרובים.",
      tasks: "משימות", addPh: "הוספת משימה", dueDate: "תאריך יעד (לא חובה)", add: "הוספה", noTasks: "אין משימות פתוחות.",
      nDue: "{n} לביצוע", nOpen: "{n} פתוחות", nOpen1: "משימה אחת פתוחה", overdue: "באיחור", comingUp: "בהמשך", noDate: "ללא תאריך", markDone: "סימון כבוצע",
      calendar: "יומן", next30: "30 הימים הקרובים", noEvents: "אין אירועים ב־30 הימים הקרובים.", allDay: "כל היום",
      mail: "דואר חשוב", forYou: "{n} בשבילך", noMail: "אין דואר חשוב ב־14 הימים האחרונים.", hide: "הסתרה",
      hiddenMsg: "הוסתר כאן. המייל נשאר ב־Gmail.", undo: "ביטול",
      Unread: "לא נקרא", "Your turn": "תורך", "Their turn": "תורם", FYI: "לידיעה",
      thisWeek: "השבוע", nextWeek: "שבוע הבא", meetings: n => n === 1 ? "מפגש אחד" : `${n} מפגשים`, noClasses: "אין שיעורים השבוע.",
      ttMissing: "מערכת השעות תופיע כאן אחרי שהגאדג׳ט במחשב ירוץ פעם אחת עם העדכון האחרון.",
      cancelled: "בוטל", moved: "הועבר", room: "חדר {r}", roomChanged: "חדר הוחלף", movedTo: "הועבר לחדר {r}", now: "עכשיו",
      updated: "עודכן {t}", disconnect: "ניתוק", pull: "שחררו לרענון", retry: "נסו שוב", ok: "אישור", loading: "טוען…",
      offline: "אין חיבור. מוצגים הנתונים האחרונים שנשמרו.", partial: "חלק מהאזורים לא התעדכנו: {m}",
      markFail: "לא ניתן לסמן כבוצע: {m}", addFail: "לא ניתן להוסיף את המשימה: {m}",
      moodleAdded: n => n === 1 ? "נוספה משימה אחת ממייל של קורס" : `נוספו ${n} משימות ממיילים של קורסים`,
      changes: n => n === 1 ? "שינוי אחד בשיעור" : `${n} שינויים בשיעורים`,
      inMin: "בעוד {n} דק׳", inHM: "בעוד {h} ש׳{m}", inDays: n => n === 1 ? "בעוד יום" : `בעוד ${n} ימים`,
      agoNow: "עכשיו", agoM: "{n} ד׳", agoH: "{n} ש׳", agoD: "{n} י׳",
      setupIntro: "חיבור חשבון Google פעם אחת. הדביקו את קובץ ההתחברות מהגאדג׳ט במחשב:",
      step1: "במחשב, לחצו Windows + R, הקלידו <code>%APPDATA%\\DeskGadget</code> ופתחו את <code>token.json</code> ב־Notepad.",
      step2: "העתיקו את כל התוכן והעבירו אותו לטלפון (למשל במייל לעצמכם, ואז מחקו את המייל).",
      step3: "הדביקו כאן ולחצו התחברות.",
      connect: "התחברות", connecting: "מתחבר…", privacy: "הקובץ נשמר רק בטלפון הזה. שום דבר לא נשלח לשום מקום חוץ מ־Google.",
      badFile: "זה לא כל הקובץ. העתיקו את כל התוכן של token.json, כולל { ו־}.",
      missingFields: "בקובץ חסרים refresh_token, client_id או client_secret.",
      expiredPaste: "Google מודיעה שההתחברות הזו פגה. התחברו מחדש בגאדג׳ט במחשב והעתיקו את token.json החדש.",
      expired: "ההתחברות ל־Google פגה. הדביקו token.json חדש מהמחשב.",
      noReach: "אין גישה ל־Google: {m}", langBtn: "EN", langLabel: "English",
    },
  };
  let lang = store.get("lang", (navigator.language || "").toLowerCase().startsWith("he") ? "he" : "en");
  const locale = () => (lang === "he" ? "he-IL" : "en-GB");
  function t(key, vars) {
    const v = STR[lang][key] !== undefined ? STR[lang][key] : STR.en[key];
    if (typeof v === "function") return v(vars);
    return String(v).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : ""));
  }
  const ltr = s => "⁦" + s + "⁩"; // keeps times like 11:00–14:00 in the right order inside Hebrew text
  function applyLanguage() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n]").forEach(n => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll("[data-i18n-html]").forEach(n => { n.innerHTML = t(n.dataset.i18nHtml); });
    document.querySelectorAll("[data-i18n-ph]").forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
    document.querySelectorAll(".langbtn").forEach(b => { b.textContent = t("langBtn"); b.setAttribute("aria-label", t("langLabel")); });
  }
  function toggleLang() { lang = lang === "he" ? "en" : "he"; store.set("lang", lang); applyLanguage(); if (!$("appView").hidden) renderAll(); }
  document.querySelectorAll(".langbtn").forEach(b => { b.onclick = toggleLang; });

  // date words in the chosen language
  function dayLabel(s) {
    const t0 = C.todayStr();
    if (s === t0) return t("today");
    if (s === C.addDays(t0, 1)) return t("tomorrow");
    if (s === C.addDays(t0, -1)) return t("yesterday");
    return new Date(s + "T12:00:00").toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" });
  }
  function ago(sec) {
    const m = Math.floor((Date.now() / 1000 - sec) / 60);
    if (m < 1) return t("agoNow"); if (m < 60) return t("agoM", { n: m });
    const h = Math.floor(m / 60); if (h < 24) return t("agoH", { n: h });
    return t("agoD", { n: Math.floor(h / 24) });
  }
  function until(ms) {
    const m = Math.round(ms / 60000);
    if (m < 60) return t("inMin", { n: m });
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return t("inHM", { h, m: r ? " " + r + (lang === "he" ? " ד׳" : "m") : "" });
    return t("inDays", Math.round(h / 24));
  }

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
  function showSetup(key, vars) {
    $("appView").hidden = true; $("setup").hidden = false;
    $("setupErr").hidden = !key; $("setupErr").textContent = key ? t(key, vars) : "";
  }
  $("connectBtn").onclick = async () => {
    let j;
    try { j = JSON.parse($("tokenBox").value.trim()); }
    catch (e) { return showSetup("badFile"); }
    if (!j.refresh_token || !j.client_id || !j.client_secret) return showSetup("missingFields");
    store.set("creds", { client_id: j.client_id, client_secret: j.client_secret, refresh_token: j.refresh_token });
    G = null;
    $("connectBtn").disabled = true; $("connectBtn").textContent = t("connecting");
    try { await client().token(); start(); }
    catch (e) { store.del("creds"); e.code === "SIGNIN" ? showSetup("expiredPaste") : showSetup("noReach", { m: e.message }); }
    finally { $("connectBtn").disabled = false; $("connectBtn").textContent = t("connect"); }
  };

  // ------------------------------------------------------------ loading
  async function load(force) {
    if (busy || (!force && Date.now() - lastLoad < 60000)) return;
    busy = true; $("bRefresh").classList.add("spin");
    const g = client(), dismissed = store.get("hiddenMail", {});
    const results = await Promise.allSettled([g.tasks(), g.events(), g.mail(dismissed), g.readData()]);
    const [tk, ev, ml, dt] = results;
    const sign = results.find(r => r.status === "rejected" && r.reason && r.reason.code === "SIGNIN");
    if (sign) { busy = false; $("bRefresh").classList.remove("spin"); store.del("creds"); G = null; return showSetup("expired"); }
    if (tk.status === "fulfilled") state.tasks = tk.value;
    if (ev.status === "fulfilled") state.events = ev.value;
    if (ml.status === "fulfilled") state.mail = ml.value;
    if (dt.status === "fulfilled") state.data = { timetable: dt.value.timetable, alerts: dt.value.alerts };
    const failed = results.filter(r => r.status === "rejected");
    state.error = failed.length ? (failed.length === results.length ? { key: "offline" } : { key: "partial", m: failed[0].reason.message }) : null;
    state.updatedAt = failed.length === results.length ? state.updatedAt : Date.now();
    hidden.clear(); store.set("cache", state); lastLoad = Date.now();
    busy = false; $("bRefresh").classList.remove("spin");
    renderAll();
    if (dt.status === "fulfilled") moodle(dt.value);
  }

  async function moodle(data) {
    try {
      const seen = store.get("moodleSeen", {});
      const r = await client().moodleSync(seen, data.timetable, data);
      store.set("moodleSeen", seen);
      if (r.added || r.alerts.length) {
        const parts = [];
        if (r.added) parts.push(t("moodleAdded", r.added));
        if (r.alerts.length) parts.push(t("changes", r.alerts.length));
        banner(parts.join(" · ") + ".", false, t("ok"), () => banner(""));
        lastLoad = 0; load(true);
      }
    } catch (e) { /* homework detection is best-effort; the rest of the app keeps working */ }
  }

  // ------------------------------------------------------------ render helpers
  const today = C.todayStr, addDays = C.addDays;
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
    $("date").textContent = d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
  }

  // ------------------------------------------------------------ classes
  const occStart = o => new Date(o.date + "T" + o.start + ":00");
  const occEnd = o => new Date(o.date + "T" + (o.end || o.start) + ":00");
  const isCancelled = o => o.alert && o.alert.kind === "cancelled";
  const roomOf = o => (o.alert && o.alert.kind === "moved" && o.alert.room) ? t("movedTo", { r: o.alert.room }) : o.room;
  const typeCls = x => /תרגול|תרגיל|exercise|lab/i.test(x || "") ? "t-ex" : /סמינר|seminar/i.test(x || "") ? "t-sem" : "";
  const range = (a, b) => ltr(a + "–" + b);
  function classes() {
    const tt = state.data && state.data.timetable;
    if (!tt) return [];
    return C.attachAlerts(C.occurrences(tt, C.displayWeekStart(new Date()), 14), (state.data && state.data.alerts) || []);
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
      card.append(el("div", "name", nxt.name + (nxt.type ? " · " + nxt.type : "")));
      card.append(el("div", "meta", dayLabel(nxt.date) + " " + range(nxt.start, nxt.end) + " · " + roomOf(nxt)));
      card.append(el("div", "count", cur ? t("nowUntil", { t: ltr(cur.end) }) : until(occStart(nxt) - now)));
      frag.append(card);
    } else frag.append(el("div", "empty", t("noMoreClasses")));
    $("nextMeta").textContent = cur ? t("inClass") : "";
    const t0 = today(), t7 = addDays(t0, 7);
    occ.filter(o => o.alert && o.date >= t0 && o.date <= t7).forEach(o => {
      const line = el("div", "alertline");
      line.append(el("span", "chip " + (isCancelled(o) ? "bad" : "warn"), isCancelled(o) ? t("cancelled") : t("moved")));
      line.append(el("span", "txt", dayLabel(o.date) + " " + ltr(o.start) + (isCancelled(o) ? "" : " · " + t("room", { r: o.alert.room || "?" })) + " · " + o.name));
      if (o.alert.url) line.onclick = () => open(o.alert.url);
      frag.append(line);
    });
    $("next").replaceChildren(frag);
  }

  let weekOffset = 0;
  function renderWeek(occ) {
    const box = $("week");
    $("wkPrev").disabled = weekOffset === 0; $("wkNext").disabled = weekOffset === 1;
    $("hWeek").textContent = weekOffset === 0 ? t("thisWeek") : t("nextWeek");
    if (!(state.data && state.data.timetable)) { box.replaceChildren(el("div", "empty", t("ttMissing"))); $("weekMeta").textContent = ""; return; }
    const ws = addDays(C.displayWeekStart(new Date()), 7 * weekOffset), we = addDays(ws, 6);
    const mine = occ.filter(o => o.date >= ws && o.date <= we);
    const dm = x => new Date(x + "T12:00:00").toLocaleDateString(locale(), { day: "numeric", month: "short" });
    $("weekMeta").textContent = dm(ws) + " – " + dm(we) + " · " + t("meetings", mine.length);
    if (!mine.length) { box.replaceChildren(el("div", "empty", t("noClasses"))); return; }
    const frag = document.createDocumentFragment(), now = new Date(), t0 = today();
    let last = "";
    for (const o of mine) {
      if (o.date !== last) {
        frag.append(el("div", "group" + (o.date === t0 ? " today" : ""), (o.date === t0 ? t("today") + " · " : "") +
          new Date(o.date + "T12:00:00").toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "short" })));
        last = o.date;
      }
      const cancelled = isCancelled(o), past = occEnd(o) <= now, live = occStart(o) <= now && !past;
      const li = el("div", "item" + (past ? " past" : "") + (cancelled ? " cancelled" : ""));
      li.append(el("div", "daybar " + (cancelled ? "cancel" : typeCls(o.type))));
      const main = el("div", "main");
      main.append(el("div", "t", o.name));
      main.append(el("div", "s", [o.type, roomOf(o)].filter(Boolean).join(" · ")));
      const right = el("div", "right"); right.append(el("span", "when", range(o.start, o.end)));
      if (cancelled) right.append(el("span", "chip bad", t("cancelled")));
      else if (o.alert && o.alert.kind === "moved") right.append(el("span", "chip warn", o.alert.room ? t("room", { r: o.alert.room }) : t("roomChanged")));
      else if (live) right.append(el("span", "chip info", t("now")));
      li.append(main, right); frag.append(li);
    }
    box.replaceChildren(frag);
  }

  // ------------------------------------------------------------ tasks
  function renderTasks() {
    const tasks = (state.tasks || []).filter(x => !hidden.has(x.id)), t0 = today();
    const groups = [
      { k: "overdue", cls: "bad", items: tasks.filter(x => x.due && x.due < t0) },
      { k: "today", cls: "warn", items: tasks.filter(x => x.due === t0) },
      { k: "comingUp", cls: "", items: tasks.filter(x => x.due && x.due > t0) },
      { k: "noDate", cls: "", items: tasks.filter(x => !x.due) },
    ];
    const urgent = groups[0].items.length + groups[1].items.length;
    $("taskMeta").textContent = tasks.length ? (urgent ? t("nDue", { n: urgent }) : (tasks.length === 1 && lang === "he" ? t("nOpen1") : t("nOpen", { n: tasks.length }))) : "";
    const frag = document.createDocumentFragment();
    if (!tasks.length) frag.append(el("div", "empty", t("noTasks")));
    for (const g of groups) {
      if (!g.items.length) continue;
      frag.append(el("div", "group " + g.cls, t(g.k)));
      for (const task of g.items) {
        const li = el("div", "item");
        const cb = el("input", "check"); cb.type = "checkbox"; cb.setAttribute("aria-label", t("markDone") + ": " + task.title);
        cb.onchange = async () => {
          li.classList.add("done"); cb.disabled = true;
          try { await client().completeTask(task.listId, task.id); hidden.add(task.id); state.tasks = state.tasks.filter(x => x.id !== task.id); store.set("cache", state); setTimeout(renderTasks, 500); }
          catch (e) { li.classList.remove("done"); cb.checked = false; cb.disabled = false; banner(t("markFail", { m: e.message }), true, t("ok"), () => banner("")); }
        };
        const main = el("div", "main");
        const ttl = el("div", "t", task.title); main.append(ttl);
        if (task.url) ttl.onclick = () => open(task.url);
        if (task.notes) main.append(el("div", "s", task.notes));
        const right = el("div", "right");
        if (task.due) right.append(el("span", "chip " + g.cls, dayLabel(task.due)));
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
    } catch (err) { $("addErr").textContent = t("addFail", { m: err.message }); $("addErr").hidden = false; }
    finally { $("addBtn").disabled = false; }
  });

  // ------------------------------------------------------------ calendar + mail
  function renderCal() {
    const evs = state.events || [];
    if (!evs.length) { $("cal").replaceChildren(el("div", "empty", t("noEvents"))); return; }
    const frag = document.createDocumentFragment(); let last = "";
    for (const ev of evs) {
      const day = ev.allDay ? ev.start.slice(0, 10) : C.ymd(new Date(ev.start));
      if (day !== last) { frag.append(el("div", "group" + (day === today() ? " warn" : ""), dayLabel(day))); last = day; }
      const li = el("div", "item link"); li.onclick = () => open(ev.url);
      li.append(el("div", "daybar" + (ev.allDay ? " allday" : "")));
      const main = el("div", "main"); main.append(el("div", "t", ev.title));
      const sub = [ev.location, ev.calendar].filter(Boolean).join(" · ");
      if (sub) main.append(el("div", "s", sub));
      li.append(main, el("span", "when", ev.allDay ? t("allDay") : (ev.end ? range(C.hm(ev.start), C.hm(ev.end)) : ltr(C.hm(ev.start)))));
      frag.append(li);
    }
    $("cal").replaceChildren(frag);
  }
  function renderMail() {
    const rows = state.mail || [], yours = rows.filter(r => r.rank < 2).length;
    $("mailMeta").textContent = yours ? t("forYou", { n: yours }) : "";
    if (!rows.length) { $("mail").replaceChildren(el("div", "empty", t("noMail"))); return; }
    const frag = document.createDocumentFragment();
    for (const m of rows) {
      const li = el("div", "item link noicon"); li.onclick = () => open(m.url);
      const main = el("div", "main");
      main.append(el("div", "t", m.subject));
      main.append(el("div", "s", m.from + (m.snippet ? " — " + m.snippet : "")));
      const right = el("div", "right");
      right.append(el("span", "chip " + (m.state === "Unread" ? "warn" : m.state === "Your turn" ? "info" : ""), t(m.state)));
      const done = el("button", "done-btn", t("hide")); done.type = "button";
      done.onclick = e => {
        e.stopPropagation();
        const h = store.get("hiddenMail", {}); h[m.id] = m.time; store.set("hiddenMail", h);
        state.mail = state.mail.filter(x => x.id !== m.id); store.set("cache", state); renderMail();
        banner(t("hiddenMsg"), false, t("undo"), () => {
          const h2 = store.get("hiddenMail", {}); delete h2[m.id]; store.set("hiddenMail", h2); banner(""); lastLoad = 0; load(true);
        });
      };
      right.append(done, el("span", "when", ago(m.time)));
      li.append(main, right); frag.append(li);
    }
    $("mail").replaceChildren(frag);
  }

  function renderAll() {
    tick();
    const occ = classes();
    renderNext(occ); renderTasks(); renderCal(); renderMail(); renderWeek(occ);
    $("updated").textContent = state.updatedAt ? t("updated", { t: ltr(new Date(state.updatedAt).toTimeString().slice(0, 5)) }) : "";
    const err = state.error && typeof state.error === "object" ? t(state.error.key, state.error) : "";
    if (err && $("banner").hidden) banner(err, false, t("retry"), () => { banner(""); load(true); });
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

  applyLanguage();
  if (store.get("creds")) start(); else showSetup("");
})();
