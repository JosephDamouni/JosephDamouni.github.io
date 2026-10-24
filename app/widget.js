// Desk Gadget widget for Scriptable. Loaded and kept up to date by the small "Desk Gadget" script on the phone.
// Shows tasks / calendar / mail / next class on the home screen and schedules the iPhone reminders.
module.exports = async function run(core) {
  const APP_URL = "https://josephdamouni.github.io/app/";
  const KC = "deskgadget.token";
  const { SETTINGS, ymd, todayStr, dayLabel, hm, ago } = core;

  const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
  const C = {
    bg: dyn("#F5F4EF", "#1F1E1D"), ink: dyn("#1F1E1C", "#ECEBE6"), muted: dyn("#6B6964", "#A3A19A"),
    accent: dyn("#B85A3C", "#D9805F"), bad: dyn("#B03A32", "#F0948B"), warn: dyn("#99640F", "#E5B567"), info: dyn("#2B5C9E", "#93B4E6"),
  };
  const fm = FileManager.local();
  const DIR = fm.joinPath(fm.documentsDirectory(), "DeskGadget");
  if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);
  const CACHE = fm.joinPath(DIR, "cache.json"), HIDDEN = fm.joinPath(DIR, "hidden-mail.json");
  const readJSON = (p, d) => { try { return fm.fileExists(p) ? JSON.parse(fm.readString(p)) : d; } catch (e) { return d; } };

  // ---------------------------------------------------------------- sign-in
  async function askForToken(message) {
    const a = new Alert();
    a.title = "Desk Gadget sign-in"; a.message = message;
    a.addTextField('{"refresh_token": ...}'); a.addAction("Save"); a.addCancelAction("Cancel");
    if ((await a.presentAlert()) === -1) return null;
    try {
      const j = JSON.parse(a.textFieldValue(0));
      if (!j.refresh_token || !j.client_id || !j.client_secret) throw new Error("missing fields");
      const creds = { client_id: j.client_id, client_secret: j.client_secret, refresh_token: j.refresh_token };
      Keychain.set(KC, JSON.stringify(creds));
      return creds;
    } catch (e) {
      const b = new Alert(); b.message = "That wasn't the whole token.json. Copy everything in it, including { and }."; b.addAction("OK"); await b.presentAlert();
      return null;
    }
  }
  let creds = Keychain.contains(KC) ? JSON.parse(Keychain.get(KC)) : null;
  if (!creds && !config.runsInWidget) creds = await askForToken("Paste the whole contents of token.json from your laptop.");

  // ---------------------------------------------------------------- data
  async function http(url, opt) {
    const r = new Request(url);
    r.method = opt.method || "GET";
    r.headers = opt.headers || {};
    if (opt.body) r.body = opt.body;
    let json = null; try { json = await r.loadJSON(); } catch (e) {}
    return { status: (r.response && r.response.statusCode) || 0, json };
  }
  async function loadData() {
    if (!creds) return { tasks: [], events: [], mail: [], data: null, error: "Open Scriptable and run Desk Gadget once to sign in." };
    const g = core.GoogleClient(creds, http, s => Data.fromBase64String(s.replace(/-/g, "+").replace(/_/g, "/")).toRawString());
    try {
      const [tasks, events, mail, d] = await Promise.all([g.tasks(), g.events(), g.mail(readJSON(HIDDEN, {})), g.readData()]);
      const out = { tasks, events, mail, data: { timetable: d.timetable, alerts: d.alerts }, updatedAt: Date.now(), error: null };
      fm.writeString(CACHE, JSON.stringify(out));
      return out;
    } catch (e) {
      const cached = readJSON(CACHE, { tasks: [], events: [], mail: [], data: null });
      return { ...cached, error: e.code === "SIGNIN" ? "Sign-in expired. Run Desk Gadget in Scriptable to paste a new token.json." : "Offline", errorCode: e.code };
    }
  }
  const data = await loadData();
  if (data.errorCode === "SIGNIN" && !config.runsInWidget) {
    Keychain.remove(KC);
    creds = await askForToken("Your Google sign-in expired. Paste a fresh token.json from your laptop.");
  }

  // classes for the next two weeks, with cancellations / room changes
  const tt = data.data && data.data.timetable;
  const occ = tt ? core.attachAlerts(core.occurrences(tt, todayStr(), 14), (data.data && data.data.alerts) || []) : [];

  // ---------------------------------------------------------------- reminders (real iPhone notifications)
  async function scheduleReminders() {
    if (data.error) return; // keep what's already scheduled until fresh data arrives
    try {
      const pending = await Notification.allPending();
      const ours = pending.map(n => n.identifier).filter(id => String(id).startsWith("dg-"));
      if (ours.length) Notification.removePending(ours);
      for (const r of core.upcomingReminders(new Date(), data.tasks, occ, 48)) {
        const n = new Notification();
        n.identifier = r.id; n.title = r.title; n.body = r.body; n.threadIdentifier = "desk-gadget";
        n.openURL = APP_URL;
        n.setTriggerDate(r.when);
        await n.schedule();
      }
    } catch (e) { /* notifications are best-effort */ }
  }
  await scheduleReminders();

  // ---------------------------------------------------------------- widget
  function addText(stack, text, size, color, weight = "regular", lines = 1) {
    const t = stack.addText(text);
    t.font = weight === "bold" ? Font.semiboldSystemFont(size) : weight === "mono" ? Font.regularMonospacedSystemFont(size) : Font.systemFont(size);
    t.textColor = color; t.lineLimit = lines; return t;
  }
  function sectionTitle(w, title, meta) {
    const row = w.addStack(); row.centerAlignContent();
    addText(row, title.toUpperCase(), 10, C.muted, "bold"); row.addSpacer();
    if (meta) addText(row, meta, 10, C.muted);
    w.addSpacer(3);
  }
  function taskRows(w, tasks, max) {
    const t0 = todayStr();
    if (!tasks.length) { addText(w, "No open tasks", 12, C.muted); return; }
    const more = tasks.length > max;
    tasks.slice(0, more ? Math.max(1, max - 1) : max).forEach(t => {
      const row = w.addStack(); row.centerAlignContent(); row.spacing = 6;
      const late = t.due && t.due < t0, today = t.due === t0;
      addText(row, "○", 12, late ? C.bad : today ? C.warn : C.muted);
      addText(row, t.title, 13, C.ink); row.addSpacer();
      if (t.due) addText(row, dayLabel(t.due), 10, late ? C.bad : today ? C.warn : C.muted, "bold");
      w.addSpacer(2);
    });
    if (more) addText(w, `+${tasks.length - Math.max(1, max - 1)} more`, 10, C.muted);
  }
  function eventRows(w, events, max) {
    if (!events.length) { addText(w, `Nothing in the next ${SETTINGS.calendarDays} days`, 12, C.muted); return; }
    const more = events.length > max;
    events.slice(0, more ? Math.max(1, max - 1) : max).forEach(e => {
      const day = e.allDay ? e.start.slice(0, 10) : ymd(new Date(e.start));
      const row = w.addStack(); row.centerAlignContent(); row.spacing = 6;
      const bar = row.addStack(); bar.size = new Size(3, 14); bar.cornerRadius = 1.5; bar.backgroundColor = e.allDay ? C.info : C.accent;
      addText(row, e.title, 13, C.ink); row.addSpacer();
      addText(row, dayLabel(day) + (e.allDay ? "" : " " + hm(e.start)), 10, day === todayStr() ? C.warn : C.muted, "mono");
      w.addSpacer(2);
    });
    if (more) addText(w, `+${events.length - Math.max(1, max - 1)} more`, 10, C.muted);
  }
  function mailRows(w, mail, max) {
    if (!mail.length) { addText(w, `Nothing important in ${SETTINGS.mailDays} days`, 12, C.muted); return; }
    mail.slice(0, max).forEach(m => {
      const row = w.addStack(); row.spacing = 6; row.centerAlignContent();
      const col = row.addStack(); col.layoutVertically();
      addText(col, m.subject, 12.5, C.ink, "bold");
      addText(col, m.from + (m.snippet ? " — " + m.snippet : ""), 11, C.muted);
      row.addSpacer();
      const side = row.addStack(); side.layoutVertically();
      addText(side, m.state, 10, m.state === "Unread" ? C.warn : m.state === "Your turn" ? C.info : C.muted, "bold");
      addText(side, ago(m.time), 10, C.muted, "mono");
      w.addSpacer(4);
    });
  }
  function nextClassLine(w) {
    const now = new Date(), live = occ.filter(o => !(o.alert && o.alert.kind === "cancelled"));
    const at = o => new Date(`${o.date}T${o.start}:00`), end = o => new Date(`${o.date}T${o.end}:00`);
    const cur = live.find(o => at(o) <= now && end(o) > now), nxt = cur || live.find(o => at(o) > now);
    if (!nxt) return false;
    const room = nxt.alert && nxt.alert.kind === "moved" && nxt.alert.room ? "room " + nxt.alert.room : nxt.room;
    const row = w.addStack(); row.centerAlignContent(); row.spacing = 6;
    addText(row, cur ? "NOW" : "NEXT", 10, C.accent, "bold");
    addText(row, nxt.name, 12.5, C.ink, "bold");
    row.addSpacer();
    addText(row, (cur ? "until " + nxt.end : dayLabel(nxt.date) + " " + nxt.start) + " · " + room, 10, C.muted, "mono");
    return true;
  }
  function allocateRows(parts, family, extra) {
    const budget = ({ small: 6, medium: 7, large: 18, extraLarge: 26 }[family] || 18) - extra;
    const need = { tasks: data.tasks.length, calendar: data.events.length, mail: data.mail.length };
    const cost = { tasks: 1, calendar: 1, mail: 2 };
    let left = budget - parts.length * 1.5;
    const alloc = {};
    parts.forEach(p => { alloc[p] = need[p] ? 1 : 0; left -= need[p] ? cost[p] : 1; });
    let grew = true;
    while (left > 0 && grew) {
      grew = false;
      for (const p of parts) if (alloc[p] < need[p] && left >= cost[p]) { alloc[p]++; left -= cost[p]; grew = true; }
    }
    return alloc;
  }

  function buildWidget(family, param) {
    const w = new ListWidget();
    w.backgroundColor = C.bg; w.setPadding(14, 14, 12, 14);
    w.refreshAfterDate = new Date(Date.now() + 15 * 60000);
    w.url = APP_URL;
    const show = (param || "").toLowerCase().trim() || (family === "medium" ? "mail" : family === "small" ? "summary" : "all");
    if (data.error && !data.tasks.length && !data.events.length && !data.mail.length) {
      addText(w, "Desk Gadget", 15, C.ink, "bold"); w.addSpacer(6); addText(w, data.error, 12, C.bad, "regular", 4); return w;
    }
    if (show === "summary") {
      const t0 = todayStr();
      const due = data.tasks.filter(t => t.due && t.due <= t0).length, yours = data.mail.filter(m => m.rank < 2).length;
      const classesToday = occ.filter(o => o.date === t0 && !(o.alert && o.alert.kind === "cancelled")).length;
      addText(w, new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }), 12, C.muted, "bold");
      w.addSpacer(6);
      [[due, "tasks due", due ? C.bad : C.ink], [classesToday, "classes today", C.ink], [yours, "emails for you", yours ? C.accent : C.ink]]
        .forEach(([n, l, col]) => { const r = w.addStack(); r.centerAlignContent(); r.spacing = 6; addText(r, String(n), 20, col, "bold"); addText(r, l, 11, C.muted); });
      w.addSpacer(); return w;
    }
    const head = w.addStack(); head.centerAlignContent();
    addText(head, new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }), 13, C.ink, "bold");
    head.addSpacer();
    addText(head, data.error ? "offline" : "updated " + new Date(data.updatedAt).toTimeString().slice(0, 5), 9, data.error ? C.bad : C.muted);
    w.addSpacer(6);
    const hasNext = family !== "small" && nextClassLine(w);
    if (hasNext) w.addSpacer(8);
    const parts = show === "all" ? ["tasks", "calendar", "mail"] : show.split("+");
    const alloc = allocateRows(parts, family, hasNext ? 1.5 : 0);
    parts.forEach((p, i) => {
      if (i) w.addSpacer(8);
      if (p === "tasks") {
        const due = data.tasks.filter(t => t.due && t.due <= todayStr()).length;
        sectionTitle(w, "Tasks", due ? `${due} due` : `${data.tasks.length} open`); taskRows(w, data.tasks, alloc.tasks);
      } else if (p === "calendar") { sectionTitle(w, "Calendar", `next ${SETTINGS.calendarDays} days`); eventRows(w, data.events, alloc.calendar); }
      else if (p === "mail") { sectionTitle(w, "Important mail", data.mail.filter(m => m.rank < 2).length + " for you"); mailRows(w, data.mail, alloc.mail); }
    });
    w.addSpacer();
    return w;
  }

  if (config.runsInWidget) {
    Script.setWidget(buildWidget(config.widgetFamily, args.widgetParameter));
  } else {
    // Run from the Scriptable app: confirm reminders are set and offer the useful actions.
    const pending = (await Notification.allPending()).filter(n => String(n.identifier).startsWith("dg-")).length;
    const a = new Alert();
    a.title = "Desk Gadget";
    a.message = data.error ? data.error : `Connected. ${pending} reminder${pending === 1 ? "" : "s"} scheduled for the next two days.`;
    a.addAction("Open Desk Gadget");
    a.addAction("Paste a new token.json");
    a.addAction("Preview widget");
    a.addCancelAction("Close");
    const i = await a.presentSheet();
    if (i === 0) Safari.open(APP_URL);
    if (i === 1) { Keychain.remove(KC); await askForToken("Paste the whole contents of token.json from your laptop."); }
    if (i === 2) await buildWidget("large", "").presentLarge();
  }
};
