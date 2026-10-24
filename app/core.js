/* Desk Gadget core: shared by the web app (browser) and the iPhone widget (Scriptable).
 * Pure logic plus a small Google client. No page or widget code here.
 * Works as a browser global (window.DeskCore) and as a Scriptable/Node module (module.exports).
 */
(function (root) {
  "use strict";

  const SETTINGS = {
    mailDays: 14,
    mailMax: 15,
    calendarDays: 30,
    moodleDays: 14,
    excludeSenders: [
      "drushim.co.il", "linkedin.com", "alljobs.co.il", "jobmaster.co.il", "indeed.com",
      "glassdoor.com", "myworkday.com", "lever.co", "greenhouse.io", "comeet.co", "comeet.com",
      "smartrecruiters.com", "ashbyhq.com", "workablemail.com", "icims.com", "quality-ai.com",
    ],
    excludeSubjectWords: ["thank you for applying", "thanks for applying", "your application", "job alert", "משרה חדשה"],
    reminderMorning: "08:00",
    reminderEvening: "20:00",
    classReminderMinutes: 15,
  };
  const DATA_LIST = "Desk Gadget data"; // hidden-ish Google Tasks list that carries the timetable and class alerts
  const MARKER = "gmail-thread:";

  // ---------------------------------------------------------------- dates
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(new Date());
  const parseDay = s => new Date(s + "T12:00:00");
  function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return ymd(d); }
  function dayLabel(s) {
    const t = todayStr();
    if (s === t) return "Today";
    if (s === addDays(t, 1)) return "Tomorrow";
    if (s === addDays(t, -1)) return "Yesterday";
    return parseDay(s).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  const hm = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function ago(sec) {
    const m = Math.floor((Date.now() / 1000 - sec) / 60);
    if (m < 1) return "now"; if (m < 60) return m + "m";
    const h = Math.floor(m / 60); if (h < 24) return h + "h";
    return Math.floor(h / 24) + "d";
  }
  const at = (dayStr, hhmm) => new Date(`${dayStr}T${hhmm}:00`);

  // ---------------------------------------------------------------- text
  function clean(s) {
    return String(s || "")
      .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/[͏​-‍﻿­]/g, "").replace(/\s+/g, " ").trim();
  }
  function parseFrom(v) {
    v = String(v || "");
    const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim(), addr: m[2].trim().toLowerCase() };
    return { name: "", addr: v.trim().toLowerCase() };
  }
  const headersOf = m => Object.fromEntries(((m.payload || {}).headers || []).map(h => [h.name.toLowerCase(), h.value]));

  // ---------------------------------------------------------------- mail
  const BOT = /(no-?reply|do-?not-?reply|notifications?|alerts?|newsletter|mailer-daemon|postmaster|updates?|news|info|marketing|support|billing)@/i;

  function mailQuery() {
    const p = ["in:inbox", `newer_than:${SETTINGS.mailDays}d`, "-category:promotions", "-category:social", "-category:forums",
      "(is:important OR is:starred OR -category:updates)"];
    SETTINGS.excludeSenders.forEach(s => p.push(`-from:${s}`));
    SETTINGS.excludeSubjectWords.forEach(w => p.push(`-subject:"${w}"`));
    return p.join(" ");
  }

  function classifyThread(t) {
    const msgs = t.messages || [];
    if (!msgs.length) return null;
    const labels = m => m.labelIds || [];
    const last = msgs[msgs.length - 1];
    const theirs = [...msgs].reverse().find(m => !labels(m).includes("SENT"));
    if (!theirs) return null;
    const h = headersOf(theirs);
    const from = parseFrom(h.from);
    if (SETTINGS.excludeSenders.some(s => from.addr.includes(s))) return null;
    const subject = clean(headersOf(msgs[0]).subject) || "(no subject)";
    if (SETTINGS.excludeSubjectWords.some(w => subject.toLowerCase().includes(w))) return null;
    const important = msgs.some(m => labels(m).includes("IMPORTANT"));
    const starred = msgs.some(m => labels(m).includes("STARRED"));
    const bulk = "list-unsubscribe" in h || BOT.test(from.addr);
    if (bulk && !(important || starred)) return null;
    const unread = msgs.some(m => labels(m).includes("UNREAD"));
    let state, rank;
    if (bulk) [state, rank] = unread ? ["Unread", 0] : ["FYI", 3];
    else if (labels(last).includes("SENT")) [state, rank] = ["Their turn", 2];
    else if (unread) [state, rank] = ["Unread", 0];
    else [state, rank] = ["Your turn", 1];
    return {
      id: t.id, from: from.name || from.addr.split("@")[0], subject, snippet: clean(last.snippet),
      time: Math.floor(Number(last.internalDate || 0) / 1000), state, rank,
      url: `https://mail.google.com/mail/u/0/#inbox/${t.id}`,
    };
  }

  // ---------------------------------------------------------------- calendar + tasks
  function shapeEvent(ev, calName) {
    if (ev.status === "cancelled") return null;
    const s = ev.start || {}, e = ev.end || {};
    return {
      title: clean(ev.summary) || "(no title)", start: s.dateTime || s.date, end: e.dateTime || e.date,
      allDay: !s.dateTime, location: clean(ev.location), calendar: calName || "", url: ev.htmlLink || "",
    };
  }

  function shapeTask(t, listId) {
    if (t.status === "completed" || t.deleted || t.hidden) return null;
    const title = clean(t.title);
    if (!title) return null;
    const lines = String(t.notes || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const url = lines.find(l => l.startsWith("https://mail.google.com/")) || "";
    const shown = lines.filter(l => !l.startsWith("https://") && !l.startsWith(MARKER));
    return {
      id: t.id, listId, title, notes: clean(shown.join(" ")), due: (t.due || "").slice(0, 10), url,
      moodle: shown.length > 0 && shown[0].startsWith("From Moodle"),
    };
  }
  const sortTasks = tasks => tasks.sort((a, b) => (a.due ? 0 : 1) - (b.due ? 0 : 1) || (a.due || "").localeCompare(b.due || ""));

  // ---------------------------------------------------------------- Moodle homework detection
  const COURSE_RE = /^\s*[A-Z]\d{2}-\d{4}(?:-\d{2,4}-\d{3,5})?\s*:/;
  const TASK_WORDS = ["מטלה", "מטלות", "תרגיל", "תרגול", "הגשה", "להגיש", "הגישו", "שיעורי בית", "ש\"ב",
    "קריאה", "לקרוא", "מאמר", "בוחן", "פרויקט", "פרוייקט", "עבודה", "בחירת", "להירשם", "הרשמה",
    "assignment", "homework", "due", "submit", "submission", "deadline", "quiz", "exercise", "reading", "project", "paper"];
  const NOT_TASK = ["תשובה ל", "re:", "no seminar", "בוטל", "כניסה חדשה", "new login"];
  const MOODLE_SENDERS = ["moodle", "mw27.haifa.ac.il"];
  const FWD = /^\s*((fwd?|fw|הועבר|העברה)\s*:\s*)+/i;
  const POSTED_LINE = /^.*(על ידי .{0,60}?בתאריך|\bby\b .{0,60}? - ).*$/gm;
  const DUE_WORDS = /(עד|הגשה|להגיש|דדליין|\bdue\b|deadline|until|submit)/i;
  const HE_MONTHS = { "ינואר": 1, "פברואר": 2, "מרץ": 3, "מרס": 3, "אפריל": 4, "מאי": 5, "יוני": 6, "יולי": 7, "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12 };
  const EN_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const EN_MONTHS = {};
  EN_FULL.forEach((m, i) => { EN_MONTHS[m] = i + 1; EN_MONTHS[m.slice(0, 3)] = i + 1; });

  const normalizeSubject = s => String(s || "").replace(FWD, "");
  const courseTitle = s => (String(s || "").replace(/^\s*[A-Z]\d{2}-\d{4}(?:-\d{2,4}-\d{3,5})?\s*:\s*/, "").trim() || String(s || "").trim());
  const courseCode = s => { const m = String(s || "").match(/^\s*([A-Z]\d{2}-\d{4}(?:-\d{2,4}-\d{3,5})?)\s*:/); return m ? m[1] : ""; };
  function isCourseEmail(subject, sender, body) {
    if (COURSE_RE.test(subject || "")) return true;
    const t = `${sender} ${String(body || "").slice(0, 3000)}`.toLowerCase();
    return MOODLE_SENDERS.some(w => t.includes(w));
  }
  function isTaskEmail(subject, body) {
    const title = courseTitle(subject).toLowerCase();
    if (NOT_TASK.some(w => title.includes(w))) return false;
    const t = `${subject} ${String(body || "").slice(0, 4000)}`.toLowerCase();
    return TASK_WORDS.some(k => t.includes(k.toLowerCase()));
  }

  function validDate(y, m, d) {
    const x = new Date(y, m - 1, d, 12);
    return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? x : null;
  }
  function yearFor(m, d, ref) {
    const c = validDate(ref.getFullYear(), m, d);
    const back = new Date(ref); back.setDate(back.getDate() - 60);
    return c && c < back ? ref.getFullYear() + 1 : ref.getFullYear();
  }
  function findDates(text, ref) {
    const out = [], t = String(text || "");
    let m;
    const push = (pos, d) => { if (d) out.push([pos, d]); };
    const r1 = /(?<![\d-])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d-])/g;
    while ((m = r1.exec(t))) {
      const d = +m[1], mo = +m[2];
      if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : yearFor(mo, d, ref);
      push(m.index, validDate(y, mo, d));
    }
    const r2 = /(?<!\d)(\d{1,2})-(\d{1,2})-(\d{4})(?!\d)/g;
    while ((m = r2.exec(t))) push(m.index, validDate(+m[3], +m[2], +m[1]));
    const he = Object.keys(HE_MONTHS).join("|");
    const r3 = new RegExp(`(\\d{1,2})\\s*(?:ב|ל)?(${he})(?:\\s*,?\\s*(\\d{4}))?`, "g");
    while ((m = r3.exec(t))) { const mo = HE_MONTHS[m[2]], d = +m[1]; push(m.index, validDate(m[3] ? +m[3] : yearFor(mo, d, ref), mo, d)); }
    const en = Object.keys(EN_MONTHS).sort((a, b) => b.length - a.length).join("|");
    const r4 = new RegExp(`(\\d{1,2})\\s+(${en})\\b\\.?(?:\\s*,?\\s*(\\d{4}))?`, "gi");
    while ((m = r4.exec(t))) { const mo = EN_MONTHS[m[2].toLowerCase()], d = +m[1]; push(m.index, validDate(m[3] ? +m[3] : yearFor(mo, d, ref), mo, d)); }
    const r5 = new RegExp(`\\b(${en})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?`, "gi");
    while ((m = r5.exec(t))) { const mo = EN_MONTHS[m[1].toLowerCase()], d = +m[2]; push(m.index, validDate(m[3] ? +m[3] : yearFor(mo, d, ref), mo, d)); }
    return out.sort((a, b) => a[0] - b[0]);
  }
  function findDueDate(subject, body, received) {
    const text = `${subject}\n${String(body || "").replace(POSTED_LINE, " ")}`;
    const rec = ymd(received);
    const dates = findDates(text, received).filter(([, d]) => ymd(d) > rec);
    if (dates.length) {
      for (const [p, d] of dates) if (DUE_WORDS.test(text.slice(Math.max(0, p - 45), p))) return ymd(d);
      return ymd(dates[0][1]);
    }
    const low = text.toLowerCase();
    if (text.includes("לשבוע הבא") || text.includes("בשבוע הבא") || low.includes("next week")) return addDays(rec, 7);
    if (text.includes("מחר") || low.includes("tomorrow")) return addDays(rec, 1);
    return "";
  }

  // ---------------------------------------------------------------- timetable
  const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const weekStart = d => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return ymd(x); };
  function displayWeekStart(d) { const ws = weekStart(d); return d.getDay() >= 5 ? addDays(ws, 7) : ws; }
  function occurrences(tt, startStr, days) {
    const out = [], first = (tt && tt.semester_start) || "", last = (tt && tt.semester_end) || "";
    for (let i = 0; i < days; i++) {
      const ds = addDays(startStr, i);
      if ((first && ds < first) || (last && ds > last)) continue;
      const key = DAYS[parseDay(ds).getDay()];
      for (const c of (tt && tt.classes) || []) {
        if (String(c.day || "").toLowerCase().slice(0, 3) !== key) continue;
        out.push({ date: ds, name: c.name || "", type: c.type || "", start: c.start || "", end: c.end || "", room: c.room || "", place: c.place || "", code: c.code || "" });
      }
    }
    return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }
  function sameClass(a, o) {
    if (a.type && a.type !== o.type) return false;
    if (a.code && o.code) return a.code === o.code;
    return !!a.name && a.name === o.name;
  }
  function attachAlerts(occ, alerts) {
    occ.forEach(o => { o.alert = (alerts || []).find(a => a.date === o.date && sameClass(a, o)) || null; });
    return occ;
  }
  const CANCEL = /(בוטל|מבוטל|לא יתקיים|לא יתקיימו|אין שיעור|אין סמינר|אין תרגול|no seminar|no class|cancel)/i;
  const MOVE = /(יתקיים|יתקיימו|יועבר|הועבר|עבר|moved|will be held|room)/i;
  const ROOM = /(?:חדר|room)\s*([A-Za-z]?\d{2,4})/i;
  const EXERCISE = /(תרגול|תרגיל|exercise|recitation|tutorial|lab)/i, LECTURE = /(שיעור|הרצאה|lecture)/i;
  function detectChange(subject, body, received, tt, link) {
    const text = `${subject}\n${String(body || "").slice(0, 3000)}`;
    const kind = CANCEL.test(text) ? "cancelled" : (MOVE.test(text) && ROOM.test(text) ? "moved" : null);
    if (!kind) return null;
    const classes = (tt && tt.classes) || [];
    const c = classes.find(x => x.code && subject.includes(x.code)) || classes.find(x => x.name && text.includes(x.name)) || null;
    const rec = ymd(received);
    let when = (findDates(text, received).find(([, d]) => ymd(d) >= rec) || [])[1];
    when = when ? ymd(when) : "";
    if (c && !when) {
      const o = occurrences(tt, rec, 14).find(o => (o.code && o.code === c.code) || o.name === c.name);
      when = o ? o.date : "";
    }
    if (!when) return null;
    let type = "";
    if (c) {
      const same = classes.filter(x => x.name === c.name);
      if (same.length > 1) {
        if (EXERCISE.test(text)) type = (same.find(x => EXERCISE.test(x.type || "")) || {}).type || "";
        else if (LECTURE.test(text)) type = (same.find(x => LECTURE.test(x.type || "")) || {}).type || "";
      }
    }
    const room = text.match(ROOM);
    return { date: when, kind, name: c ? c.name : "", code: c ? c.code || "" : "", type,
      room: kind === "moved" && room ? room[1] : "", text: courseTitle(subject), url: link || "" };
  }
  function mergeAlerts(a, b) {
    const cutoff = addDays(todayStr(), -2), key = x => [x.date, x.name, x.code, x.type].join("|");
    const map = new Map();
    [...(a || []), ...(b || [])].forEach(x => { if (x && x.date >= cutoff) map.set(key(x), x); });
    return [...map.values()];
  }

  // ---------------------------------------------------------------- reminders (future times, for scheduling)
  function upcomingReminders(now, tasks, occ, hours = 48) {
    const out = [], end = new Date(now.getTime() + hours * 3600e3), lead = SETTINGS.classReminderMinutes;
    const roomOf = o => (o.alert && o.alert.kind === "moved" && o.alert.room) ? "moved to room " + o.alert.room : o.room;
    const short = list => list.slice(0, 3).map(t => t.title).join(", ") + (list.length > 3 ? ` +${list.length - 3} more` : "");
    const firstClass = ds => occ.find(o => o.date === ds && !(o.alert && o.alert.kind === "cancelled"));
    for (let i = 0; i <= Math.ceil(hours / 24); i++) {
      const ds = addDays(ymd(now), i), fc = firstClass(ds);
      // morning summary: earlier on days with an early class
      let mt = at(ds, SETTINGS.reminderMorning);
      if (fc) { const e = new Date(at(ds, fc.start).getTime() - (lead + 15) * 60000); if (e < mt) mt = e; }
      const due = tasks.filter(t => t.due === ds), late = tasks.filter(t => t.due && t.due < ds);
      const mLines = [];
      if (due.length) mLines.push("Due today: " + short(due));
      if (late.length) mLines.push(`Overdue: ${late.length} task${late.length > 1 ? "s" : ""}`);
      if (fc) mLines.push(`First class ${fc.start}: ${fc.name} · ${roomOf(fc)}`);
      if (mLines.length) out.push({ id: `dg-morning-${ds}`, when: mt, title: "Good morning", body: mLines.join("\n") });
      // evening before the next day
      const next = addDays(ds, 1), fcn = firstClass(next), dueN = tasks.filter(t => t.due === next), eLines = [];
      if (dueN.length) eLines.push("Due tomorrow: " + short(dueN));
      if (fcn) eLines.push(`Tomorrow ${fcn.start}: ${fcn.name} · ${roomOf(fcn)}`);
      if (eLines.length) out.push({ id: `dg-evening-${ds}`, when: at(ds, SETTINGS.reminderEvening), title: "For tomorrow", body: eLines.join("\n") });
      // before each class
      occ.filter(o => o.date === ds).forEach(o => {
        const w = new Date(at(ds, o.start).getTime() - lead * 60000);
        const cancelled = o.alert && o.alert.kind === "cancelled";
        out.push({ id: `dg-class-${ds}-${o.start}-${o.type}`, when: w, title: cancelled ? "Class cancelled" : `Class at ${o.start}`,
          body: cancelled ? `${o.name} (${o.start}) is cancelled today` : `${o.name} · ${roomOf(o)}` });
      });
    }
    return out.filter(r => r.when > now && r.when <= end).sort((a, b) => a.when - b.when);
  }

  // ---------------------------------------------------------------- Google client
  // http(url, {method, headers, body}) -> Promise<{status, json}> ; decode64(base64url) -> string
  function GoogleClient(creds, http, decode64) {
    let access = null;
    async function token() {
      if (access && access.exp > Date.now() + 60000) return access.token;
      const body = ["client_id=" + encodeURIComponent(creds.client_id), "client_secret=" + encodeURIComponent(creds.client_secret),
        "refresh_token=" + encodeURIComponent(creds.refresh_token), "grant_type=refresh_token"].join("&");
      let last;
      for (const url of ["https://oauth2.googleapis.com/token", "https://www.googleapis.com/oauth2/v4/token"]) {
        try {
          const r = await http(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
          const j = r.json || {};
          if (j.access_token) { access = { token: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 }; return access.token; }
          if (j.error === "invalid_grant") { const e = new Error("SIGNIN"); e.code = "SIGNIN"; throw e; }
          last = new Error(j.error_description || j.error || "Sign-in failed (" + r.status + ")");
        } catch (e) { if (e.code === "SIGNIN") throw e; last = e; }
      }
      throw last;
    }
    async function g(url, method = "GET", body = null) {
      const r = await http(url, { method, headers: { Authorization: "Bearer " + await token(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (r.status >= 400 || (r.json && r.json.error)) {
        const msg = (r.json && r.json.error && (r.json.error.message || r.json.error)) || "HTTP " + r.status;
        throw new Error(String(msg));
      }
      return r.json || {};
    }
    const T = "https://tasks.googleapis.com/tasks/v1", GM = "https://gmail.googleapis.com/gmail/v1/users/me", CAL = "https://www.googleapis.com/calendar/v3";

    async function taskLists() { return (await g(`${T}/users/@me/lists?maxResults=100`)).items || []; }
    async function listTasks(listId, completed) {
      const q = completed ? "showCompleted=true&showHidden=true" : "showCompleted=false&showHidden=false";
      return (await g(`${T}/lists/${encodeURIComponent(listId)}/tasks?${q}&maxResults=100`)).items || [];
    }
    async function tasks() {
      const lists = (await taskLists()).filter(l => l.title !== DATA_LIST);
      const per = await Promise.all(lists.map(l => listTasks(l.id, false).then(items => items.map(t => shapeTask(t, l.id)).filter(Boolean))));
      return sortTasks(per.flat());
    }
    const addTask = (title, due, notes) => {
      const body = { title };
      if (due) body.due = due + "T00:00:00.000Z";
      if (notes) body.notes = notes;
      return g(`${T}/lists/@default/tasks`, "POST", body);
    };
    const completeTask = (listId, id) => g(`${T}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`, "PATCH", { status: "completed" });

    async function events() {
      const now = new Date(), tMin = new Date(now - 12 * 3600e3).toISOString(), tMax = new Date(+now + SETTINGS.calendarDays * 86400e3).toISOString();
      const cals = ((await g(`${CAL}/users/me/calendarList`)).items || []).filter(c => c.selected || c.primary);
      const per = await Promise.all(cals.map(c => g(`${CAL}/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`)
        .then(r => (r.items || []).map(e => shapeEvent(e, c.primary ? "" : c.summary)).filter(Boolean))));
      return per.flat().filter(e => e.allDay ? e.end > todayStr() : new Date(e.end || e.start) > now)
        .sort((a, b) => String(a.start).localeCompare(String(b.start)));
    }

    async function mail(hidden) {
      const list = (await g(`${GM}/threads?maxResults=${SETTINGS.mailMax}&q=${encodeURIComponent(mailQuery())}`)).threads || [];
      const full = await Promise.all(list.map(t => g(`${GM}/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Unsubscribe`)));
      return full.map(classifyThread).filter(Boolean).filter(m => !(hidden && hidden[m.id] >= m.time))
        .sort((a, b) => a.rank - b.rank || b.time - a.time);
    }

    // timetable + class alerts live as notes on tasks in the "Desk Gadget data" list
    async function readData() {
      const l = (await taskLists()).find(x => x.title === DATA_LIST);
      if (!l) return { listId: null, timetable: null, alerts: [], items: {} };
      const items = {};
      (await listTasks(l.id, true)).forEach(t => { items[t.title] = t; });
      const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };
      return { listId: l.id, timetable: items.timetable ? parse(items.timetable.notes) : null,
        alerts: (items.class_alerts && parse(items.class_alerts.notes)) || [], items };
    }
    async function saveAlerts(data, alerts) {
      let listId = data.listId;
      if (!listId) listId = (await g(`${T}/users/@me/lists`, "POST", { title: DATA_LIST })).id;
      const notes = JSON.stringify(alerts);
      const t = data.items && data.items.class_alerts;
      if (t) return g(`${T}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(t.id)}`, "PATCH", { notes });
      return g(`${T}/lists/${encodeURIComponent(listId)}/tasks`, "POST", { title: "class_alerts", notes });
    }

    function messageText(msg) {
      const plain = [], html = [];
      (function walk(p) {
        const d = (p.body || {}).data;
        if (d && p.mimeType === "text/plain") plain.push(decode64(d));
        else if (d && p.mimeType === "text/html") html.push(decode64(d));
        (p.parts || []).forEach(walk);
      })(msg.payload || {});
      if (plain.length) return plain.join("\n");
      return clean(html.join("\n").replace(/<(br|\/p|\/div|\/li|\/tr)[^>]*>/gi, "\n").replace(/<[^>]+>/g, " "));
    }

    // Moodle: new homework -> task; cancellations/room changes -> alerts. seen = {messageId: true}
    async function moodleSync(seen, tt, data) {
      const list = (await g(`${GM}/messages?maxResults=60&q=${encodeURIComponent(`newer_than:${SETTINGS.moodleDays}d -in:sent -in:chats`)}`)).messages || [];
      const fresh = list.filter(m => !seen[m.id]);
      if (!fresh.length) return { added: 0, alerts: [] };
      // tasks already made from an email, on any device (open or ticked)
      const made = new Set();
      for (const l of await taskLists()) (await listTasks(l.id, true)).forEach(t => {
        const m = String(t.notes || "").match(/gmail-thread:(\S+)/); if (m) made.add(m[1]);
      });
      let added = 0; const alerts = [];
      for (const ref of fresh) {
        seen[ref.id] = true;
        if (made.has(ref.id)) continue;
        const meta = await g(`${GM}/messages/${ref.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
        const h = headersOf(meta), subject = normalizeSubject(h.subject), sender = h.from || "";
        const maybe = COURSE_RE.test(subject) || MOODLE_SENDERS.some(w => sender.toLowerCase().includes(w)) || /moodle/i.test(meta.snippet || "");
        if (!maybe) continue;
        const full = await g(`${GM}/messages/${ref.id}?format=full`);
        const body = messageText(full), received = new Date(Number(full.internalDate || 0));
        if (!isCourseEmail(subject, sender, body)) continue;
        const link = `https://mail.google.com/mail/u/0/#inbox/${full.threadId || ref.id}`;
        if (isTaskEmail(subject, body)) {
          const code = courseCode(subject);
          await addTask(courseTitle(subject), findDueDate(subject, body, received),
            "From Moodle" + (code ? " · " + code : "") + `\n${link}\n${MARKER}${ref.id}`);
          added++;
        } else if (tt) {
          const a = detectChange(subject, String(body).replace(POSTED_LINE, " "), received, tt, link);
          if (a) alerts.push(a);
        }
      }
      if (alerts.length) await saveAlerts(data, mergeAlerts(data.alerts, alerts));
      return { added, alerts };
    }

    return { token, tasks, addTask, completeTask, events, mail, readData, saveAlerts, moodleSync };
  }

  const api = {
    SETTINGS, DATA_LIST, pad, ymd, todayStr, addDays, dayLabel, hm, ago, clean, mailQuery, classifyThread,
    shapeEvent, shapeTask, normalizeSubject, courseTitle, courseCode, isCourseEmail, isTaskEmail, findDates, findDueDate,
    weekStart, displayWeekStart, occurrences, attachAlerts, detectChange, mergeAlerts, upcomingReminders, GoogleClient,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DeskCore = api;
})(this);
