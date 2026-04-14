import { useState, useRef, useCallback, useEffect } from "react";

const DEFAULT_CATEGORIES = [
  { id: "work",     label: "Arbeit",     emoji: "💼", color: "#4F7CFF" },
  { id: "personal", label: "Persönlich", emoji: "🌿", color: "#27AE60" },
  { id: "health",   label: "Gesundheit", emoji: "🏃", color: "#EB5757" },
  { id: "finance",  label: "Finanzen",   emoji: "💳", color: "#2D9CDB" },
  { id: "learning", label: "Lernen",     emoji: "📚", color: "#9B51E0" },
  { id: "home",     label: "Zuhause",    emoji: "🏠", color: "#F2994A" },
  { id: "social",   label: "Soziales",   emoji: "👥", color: "#E8A020" },
  { id: "other",    label: "Sonstiges",  emoji: "✨", color: "#BDBDBD" },
];

const PALETTE = [
  "#4F7CFF", "#27AE60", "#EB5757", "#2D9CDB", "#9B51E0",
  "#F2994A", "#E8A020", "#E91E8C", "#00BCD4", "#FF7043",
  "#8BC34A", "#607D8B", "#795548", "#FF5722", "#3F51B5",
];

const EMOJIS = ["💼","🌿","🏃","💳","📚","🏠","👥","✨","🎯","🚀","🎨","🔧","📊","🌟","❤️","🎵","🏋️","✈️","🍕","💡"];

const PRIORITIES = [
  { id: "urgent", label: "Dringend", color: "#EB5757", score: 4 },
  { id: "high",   label: "Hoch",     color: "#F2994A", score: 3 },
  { id: "medium", label: "Mittel",   color: "#D4A017", score: 2 },
  { id: "low",    label: "Niedrig",  color: "#27AE60", score: 1 },
];

const TRASH_TTL   = 10  * 86400000;
const ARCHIVE_TTL = 365 * 86400000;
const LS_KEY = "taskmaster_v1";

const INITIAL_TASKS = [
  { id: 1, title: "Steuererklärung einreichen", category: "finance",  priority: "urgent", dueDate: "2026-04-20", description: "", createdAt: Date.now() - 86400000 },
  { id: 2, title: "Arzttermin vereinbaren",     category: "health",   priority: "high",   dueDate: "2026-04-18", description: "", createdAt: Date.now() - 43200000 },
  { id: 3, title: "React-Kurs abschließen",     category: "learning", priority: "medium", dueDate: "2026-04-30", description: "", createdAt: Date.now() - 3600000  },
  { id: 4, title: "Wohnung aufräumen",          category: "home",     priority: "low",    dueDate: "2026-04-15", description: "", createdAt: Date.now() - 7200000  },
  { id: 5, title: "Quartalsbericht schreiben",  category: "work",     priority: "high",   dueDate: "2026-04-22", description: "", createdAt: Date.now() - 3000000  },
  { id: 6, title: "Freunde zum Essen einladen", category: "social",   priority: "low",    dueDate: null,         description: "", createdAt: Date.now() - 1000000  },
];

// ── localStorage ──────────────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {}
}

// ── Scoring & smart list ──────────────────────────────────────────────────────
function scoreTask(task) {
  const pri = PRIORITIES.find(function(x) { return x.id === task.priority; });
  const p = pri ? pri.score : 1;
  const daysUntil = task.dueDate ? Math.max(0, (new Date(task.dueDate) - new Date()) / 86400000) : 30;
  const bonus = daysUntil < 3 ? 10 : daysUntil < 7 ? 5 : 0;
  return p * 3 + bonus;
}

function buildSmartList(tasks) {
  if (!tasks.length) return [];
  return tasks.slice().sort(function(a, b) { return scoreTask(b) - scoreTask(a); }).slice(0, 10);
}

function buildHeroList(tasks, filterCatId) {
  var pool = filterCatId ? tasks.filter(function(t) { return t.category === filterCatId; }) : tasks;
  if (!pool.length) return [];
  return pool.slice().sort(function(a, b) { return scoreTask(b) - scoreTask(a); }).slice(0, 5);
}

function sortByDateAndPriority(tasks) {
  return tasks.slice().sort(function(a, b) {
    // Overdue first, then by due date, then by priority score
    var aD = a.dueDate ? new Date(a.dueDate).getTime() : 9999999999999;
    var bD = b.dueDate ? new Date(b.dueDate).getTime() : 9999999999999;
    if (aD !== bD) return aD - bD;
    return scoreTask(b) - scoreTask(a);
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────
const NOTIF_RULES = {
  urgent: { daysBefore: [7, 3, 1, 0] },
  high:   { daysBefore: [5, 2, 0] },
  medium: { daysBefore: [3, 1] },
  low:    { daysBefore: [1] },
};

function shouldNotifyTask(task) {
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 21) return false;
  if (!task.dueDate) return false;
  const rule = NOTIF_RULES[task.priority] || NOTIF_RULES.low;
  const daysUntil = Math.ceil((new Date(task.dueDate) - new Date()) / 86400000);
  if (daysUntil < 0) {
    if (task.priority !== "urgent") return false;
    const daysOverdue = Math.abs(daysUntil);
    if (daysOverdue > 3) return false;
    const lastNotif = task.lastNotified || 0;
    return (Date.now() - lastNotif) > 86400000;
  }
  return rule.daysBefore.indexOf(daysUntil) !== -1;
}

function getNotifMessage(task) {
  if (!task.dueDate) return task.title + " wartet auf dich.";
  const days = Math.ceil((new Date(task.dueDate) - new Date()) / 86400000);
  if (days < 0) return "⚠️ " + task.title + " ist seit " + Math.abs(days) + " Tag(en) überfällig!";
  if (days === 0) return "⚡ " + task.title + " ist heute fällig!";
  if (days === 1) return "⏰ " + task.title + " ist morgen fällig.";
  return "📅 " + task.title + " ist in " + days + " Tagen fällig.";
}

function fireNotification(title, body) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body: body });
  } catch (e) {}
}

// ── Export / Import ───────────────────────────────────────────────────────────
function exportJSON(tasks, archive, trash, categories) {
  const data = {
    exportedAt: new Date().toISOString(),
    categories: categories,
    tasks: tasks,
    archive: archive,
    trash: trash,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "taskmaster_backup_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

function exportCSV(tasks, archive) {
  const all = tasks.map(function(t) { return Object.assign({}, t, { status: "offen" }); })
    .concat(archive.map(function(t) { return Object.assign({}, t, { status: "erledigt" }); }));
  const headers = ["status", "title", "category", "priority", "dueDate", "description", "createdAt", "completedAt"];
  const rows = all.map(function(t) {
    return headers.map(function(h) {
      const v = t[h] || "";
      const s = typeof v === "number" ? new Date(v).toLocaleString("de-DE") : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(",");
  });
  const csv = [headers.join(",")].concat(rows).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "taskmaster_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}

function makeCatId(label) {
  return label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_" + Date.now();
}

function daysUntilDate(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

// ── AI classify ───────────────────────────────────────────────────────────────
async function classifyWithAI(title, cats) {
  try {
    const catStr = cats.map(function(c) { return c.id + "(" + c.label + ")"; }).join(",");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: "Analysiere diese Aufgabe und gib NUR JSON zurück (keine Backticks, kein Text):\n\"" + title + "\"\n\nKategorien: " + catStr + "\nPrioritäten: urgent,high,medium,low\n\n{\"category\":\"...\",\"priority\":\"...\",\"dueDate\":\"YYYY-MM-DD oder null\",\"reason\":\"1 Satz DE\"}"
        }]
      })
    });
    const data = await res.json();
    const text = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : "{}";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    if (!cats.find(function(c) { return c.id === parsed.category; })) {
      parsed.category = "other";
    }
    return parsed;
  } catch (e) {
    return { category: "other", priority: "medium", dueDate: null, reason: "KI nicht verfügbar." };
  }
}

// ── Global CSS ────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
html { touch-action: manipulation; }
body { -webkit-text-size-adjust: 100%; touch-action: manipulation; overscroll-behavior: none; }
textarea, input { outline: none !important; -webkit-appearance: none; font-size: 16px; }
button { font-family: inherit; touch-action: manipulation; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: #D8D6D0; border-radius: 2px; }
.tr { transition: background 0.15s; }
.tr:hover { background: #fff !important; }
.chip { transition: all 0.16s; cursor: pointer; border: none; font-family: inherit; touch-action: manipulation; }
.navbtn { transition: all 0.18s; cursor: pointer; font-family: inherit; touch-action: manipulation; }
.pulse { animation: pu 1.2s infinite; }
@keyframes pu { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
.si { animation: si 0.22s ease; }
@keyframes si { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.drawer { animation: dr 0.22s ease; }
@keyframes dr { from { transform: translateX(100%); } to { transform: translateX(0); } }
.fab { animation: fabIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes fabIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.herocard { transition: box-shadow 0.2s, transform 0.15s; }
.herocard:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.13) !important; transform: translateY(-2px); }
.delbtn { color: #D8D6D0; background: transparent; border: none; cursor: pointer; transition: color 0.15s; }
.delbtn:hover { color: #EB5757 !important; }
.catbtn-long { user-select: none; -webkit-user-select: none; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// CategoryEditModal — edit or delete an existing category (long-press triggered)
// ─────────────────────────────────────────────────────────────────────────────
function CategoryEditModal(props) {
  var cat        = props.cat;
  var onSave     = props.onSave;
  var onDelete   = props.onDelete;
  var onClose    = props.onClose;
  var taskCount  = props.taskCount;

  const [label,     setLabel]     = useState(cat.label);
  const [emoji,     setEmoji]     = useState(cat.emoji);
  const [color,     setColor]     = useState(cat.color);
  const [showEmoji, setShowEmoji] = useState(false);
  const [confirmDel,setConfirmDel]= useState(false);

  function handleSave() {
    if (!label.trim()) return;
    onSave(Object.assign({}, cat, { label: label.trim(), emoji: emoji, color: color }));
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1100, background: "rgba(26,26,46,0.35)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: "0 0 24px 0" }} onClick={onClose}>
      <div className="si" onClick={function(e) { e.stopPropagation(); }} style={{ background: "#fff", borderRadius: 22, padding: 24, width: "92%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.16)" }}>
        <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 18, color: "#1A1A2E" }}>Kategorie bearbeiten</div>

        {/* Preview */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: color + "20", border: "1.5px solid " + color, borderRadius: 30, padding: "7px 16px", marginBottom: 18, fontSize: 14, fontWeight: 700, color: "#1A1A2E" }}>
          <span>{emoji}</span><span>{label || "Name…"}</span>
        </div>

        {/* Name */}
        <input value={label} onChange={function(e) { setLabel(e.target.value); }}
          style={{ width: "100%", padding: "11px 13px", border: "1.5px solid #E8E8E8", borderRadius: 10, fontSize: 15, color: "#1A1A2E", background: "#FAFAFA", fontFamily: "inherit", marginBottom: 14 }} />

        {/* Emoji */}
        <button onClick={function() { setShowEmoji(!showEmoji); }} style={{ padding: "9px 14px", border: "1.5px solid #E8E8E8", borderRadius: 10, background: "#FAFAFA", cursor: "pointer", fontSize: 20, marginBottom: 10 }}>{emoji} <span style={{ fontSize: 11, color: "#AAA" }}>▾</span></button>
        {showEmoji && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12, background: "#F8F8F8", borderRadius: 10, padding: 10 }}>
            {EMOJIS.map(function(e) {
              return <button key={e} onClick={function() { setEmoji(e); setShowEmoji(false); }} style={{ width: 34, height: 34, borderRadius: 8, border: emoji === e ? "2px solid " + color : "1.5px solid #E8E8E8", background: emoji === e ? color + "20" : "#fff", fontSize: 17, cursor: "pointer" }}>{e}</button>;
            })}
          </div>
        )}

        {/* Color */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 20 }}>
          {PALETTE.map(function(c) {
            return <button key={c} onClick={function() { setColor(c); }} style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: "none", cursor: "pointer", outline: color === c ? "3px solid " + c : "2px solid transparent", outlineOffset: 2, transform: color === c ? "scale(1.18)" : "scale(1)", transition: "all 0.12s" }} />;
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={handleSave} style={{ padding: 13, borderRadius: 12, border: "none", background: color, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Speichern ✓</button>

          {confirmDel ? (
            <div style={{ background: "#FFF8F8", border: "1.5px solid #FFD0D0", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>
                {taskCount > 0 ? taskCount + " Aufgaben werden zu „Sonstiges" verschoben." : "Kategorie wirklich löschen?"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onDelete} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: "#EB5757", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Ja, löschen</button>
                <button onClick={function() { setConfirmDel(false); }} style={{ padding: "11px 16px", borderRadius: 10, border: "1.5px solid #E8E8E8", background: "#fff", color: "#888", fontSize: 14, cursor: "pointer" }}>Abbrechen</button>
              </div>
            </div>
          ) : (
            <button onClick={function() { setConfirmDel(true); }} style={{ padding: 12, borderRadius: 12, border: "1.5px solid #FFE0E0", background: "#FFF8F8", color: "#EB5757", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              🗑 Kategorie löschen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InlineCatForm
// ─────────────────────────────────────────────────────────────────────────────
function InlineCatForm(props) {
  const onSave   = props.onSave;
  const onCancel = props.onCancel;

  const [label, setLabel] = useState("");
  const [emoji, setEmoji] = useState("🎯");
  const [color, setColor] = useState("#4F7CFF");
  const [showEmojis, setShowEmojis] = useState(false);

  function handleSave() {
    if (!label.trim()) return;
    onSave({ id: makeCatId(label), label: label.trim(), emoji: emoji, color: color });
  }

  return (
    <div style={{ background: "#F8F8F8", border: "1.5px solid #E0DFDA", borderRadius: 14, padding: 16, marginTop: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 10 }}>NEUE KATEGORIE</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: color + "22", border: "1.5px solid " + color, borderRadius: 30, padding: "6px 14px", marginBottom: 12, fontSize: 13, fontWeight: 700, color: "#1A1A2E" }}>
        <span>{emoji}</span>
        <span>{label || "Name…"}</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          autoFocus
          value={label}
          onChange={function(e) { setLabel(e.target.value); }}
          onKeyDown={function(e) { if (e.key === "Enter") handleSave(); }}
          placeholder="Name…"
          style={{ flex: 1, padding: "9px 12px", border: "1.5px solid #E8E8E8", borderRadius: 9, fontSize: 14, color: "#1A1A2E", background: "#fff", fontFamily: "inherit" }}
        />
        <button
          onClick={function() { setShowEmojis(!showEmojis); }}
          style={{ padding: "9px 12px", border: "1.5px solid #E8E8E8", borderRadius: 9, background: "#fff", cursor: "pointer", fontSize: 18 }}
        >{emoji}</button>
      </div>
      {showEmojis && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10, background: "#fff", borderRadius: 10, padding: 10, border: "1.5px solid #EBEBEB" }}>
          {EMOJIS.map(function(e) {
            return (
              <button key={e} onClick={function() { setEmoji(e); setShowEmojis(false); }} style={{ width: 34, height: 34, borderRadius: 8, border: emoji === e ? "2px solid " + color : "1.5px solid #E8E8E8", background: emoji === e ? color + "22" : "#fff", fontSize: 17, cursor: "pointer" }}>{e}</button>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {PALETTE.map(function(c) {
          return (
            <button key={c} onClick={function() { setColor(c); }} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: "none", cursor: "pointer", outline: color === c ? "3px solid " + c : "2px solid transparent", outlineOffset: 2, transform: color === c ? "scale(1.2)" : "scale(1)", transition: "all 0.12s" }} />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} style={{ flex: 1, padding: 9, borderRadius: 9, border: "none", background: label.trim() ? color : "#EBEBEB", color: label.trim() ? "#fff" : "#BDBDBD", fontWeight: 700, fontSize: 13, cursor: label.trim() ? "pointer" : "default" }}>Erstellen</button>
        <button onClick={onCancel} style={{ padding: "9px 14px", borderRadius: 9, border: "1.5px solid #E8E8E8", background: "#fff", color: "#AAA", fontSize: 13, cursor: "pointer" }}>Abbrechen</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskPanel (create + edit)
// ─────────────────────────────────────────────────────────────────────────────
function TaskPanel(props) {
  const mode          = props.mode;
  const task          = props.task;
  const categories    = props.categories;
  const onClose       = props.onClose;
  const onSave        = props.onSave;
  const onDelete      = props.onDelete;
  const onComplete    = props.onComplete;
  const onAddCategory = props.onAddCategory;

  const [title,      setTitle]      = useState(task ? task.title       : "");
  const [desc,       setDesc]       = useState(task ? task.description : "");
  const [priority,   setPriority]   = useState(task ? task.priority    : "medium");
  const [category,   setCategory]   = useState(task ? task.category    : "other");
  const [dueDate,    setDueDate]    = useState(task && task.dueDate ? task.dueDate : "");
  const [dirty,      setDirty]      = useState(false);
  const [aiReason,   setAiReason]   = useState(mode === "create" ? "Titel eingeben – KI schlägt alles vor." : null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const debounceRef = useRef(null);
  const recognitionRef = useRef(null);

  const cat = categories.find(function(c) { return c.id === category; }) || categories[categories.length - 1];
  const pri = PRIORITIES.find(function(p) { return p.id === priority; }) || PRIORITIES[2];

  useEffect(function() {
    if (mode !== "create") return;
    if (!title.trim()) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async function() {
      setAiLoading(true);
      const s = await classifyWithAI(title, categories);
      setPriority(s.priority || "medium");
      setCategory(s.category || "other");
      if (s.dueDate) setDueDate(s.dueDate);
      setAiReason(s.reason || "");
      setAiLoading(false);
    }, 900);
    return function() { clearTimeout(debounceRef.current); };
  }, [title]); // eslint-disable-line

  function change(fn) {
    fn();
    setDirty(true);
  }

  function handleSave() {
    if (!title.trim()) return;
    if (mode === "create") {
      onSave({ title: title.trim(), description: desc, priority: priority, category: category, dueDate: dueDate || null });
    } else {
      onSave(Object.assign({}, task, { title: title.trim(), description: desc, priority: priority, category: category, dueDate: dueDate || null }));
    }
    setDirty(false);
  }

  function handleAddCat(newCat) {
    onAddCategory(newCat);
    setCategory(newCat.id);
    setShowNewCat(false);
    setDirty(true);
  }

  function startDictation() {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      return;
    }
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR();
    rec.lang = "de-DE";
    rec.interimResults = false;
    rec.onresult = function(e) {
      var transcript = e.results[0][0].transcript;
      setTitle(transcript);
      setDirty(true);
      setIsListening(false);
    };
    rec.onerror = function() { setIsListening(false); };
    rec.onend   = function() { setIsListening(false); };
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 900, display: "flex" }} onClick={onClose}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.2)" }} />
      <div className="drawer" onClick={function(e) { e.stopPropagation(); }} style={{ width: "100%", maxWidth: 440, background: "#fff", height: "100%", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.13)", display: "flex", flexDirection: "column" }}>

        {/* Colored header */}
        <div style={{ background: cat.color, padding: "20px 20px 18px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.8)" }}>
              {mode === "create" ? "NEUE AUFGABE" : "AUFGABE"}
            </span>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: "#fff", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          <input
            value={title}
            onChange={function(e) { change(function() { setTitle(e.target.value); }); }}
            placeholder="Aufgabentitel…"
            style={{ width: "100%", background: "transparent", border: "none", color: "#fff", fontSize: 19, fontWeight: 700, fontFamily: "inherit", lineHeight: 1.35, borderBottom: "1.5px solid rgba(255,255,255,0.45)", paddingBottom: 5 }}
          />
          {mode === "create" && (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", gap: 6, minHeight: 18 }}>
              {aiLoading && <span className="pulse">🤖 KI analysiert…</span>}
              {!aiLoading && aiReason && <span>💭 {aiReason}</span>}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>

          {/* Priority */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 8 }}>PRIORITÄT</div>
            <div style={{ display: "flex", gap: 6 }}>
              {PRIORITIES.map(function(p) {
                return (
                  <button key={p.id} onClick={function() { change(function() { setPriority(p.id); }); }} style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: "1.5px solid " + (priority === p.id ? p.color : "#EBEBEB"), background: priority === p.id ? p.color + "22" : "#FAFAFA", color: priority === p.id ? p.color : "#BDBDBD", fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 8 }}>KATEGORIE</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {categories.map(function(c) {
                return (
                  <button key={c.id} className="chip" onClick={function() { change(function() { setCategory(c.id); }); }} style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid " + (category === c.id ? c.color : "#EBEBEB"), background: category === c.id ? c.color + "22" : "#FAFAFA", color: category === c.id ? c.color : "#AAAAAA", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {c.emoji} {c.label}
                  </button>
                );
              })}
              <button className="chip" onClick={function() { setShowNewCat(!showNewCat); }} style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px dashed #4F7CFF", background: "#F0F4FF", color: "#4F7CFF", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {showNewCat ? "✕" : "+ Neu"}
              </button>
            </div>
            {showNewCat && <InlineCatForm onSave={handleAddCat} onCancel={function() { setShowNewCat(false); }} />}
          </div>

          {/* Due date */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 8 }}>FÄLLIGKEITSDATUM</div>
            <input
              type="date"
              value={dueDate}
              onChange={function(e) { change(function() { setDueDate(e.target.value); }); }}
              style={{ padding: "10px 12px", border: "1.5px solid #EBEBEB", borderRadius: 10, fontSize: 14, color: "#1A1A2E", background: "#FAFAFA", fontFamily: "inherit", width: "100%" }}
            />
          </div>

          {/* Description */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 8 }}>BESCHREIBUNG / DETAILS</div>
            <textarea
              value={desc}
              onChange={function(e) { change(function() { setDesc(e.target.value); }); }}
              placeholder="Notizen, Links, Details…"
              rows={5}
              style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #EBEBEB", borderRadius: 12, fontSize: 14, color: "#1A1A2E", background: "#FAFAFA", resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }}
            />
          </div>

          {/* Meta (edit only) */}
          {mode === "edit" && task && (
            <div style={{ fontSize: 11, color: "#CCCCCC", lineHeight: 1.9 }}>
              <div>Erstellt: {fmt(task.createdAt)}</div>
              {task.completedAt && <div>Abgeschlossen: {fmt(task.completedAt)}</div>}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {mode === "create" && (
              <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                <button
                  onClick={startDictation}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    border: "1.5px solid " + (isListening ? "#EB5757" : "#EBEBEB"),
                    background: isListening ? "#FFF0F0" : "#FAFAFA",
                    color: isListening ? "#EB5757" : "#AAAAAA",
                    fontSize: 20,
                    cursor: "pointer",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: isListening ? "pu 1.2s infinite" : "none",
                  }}
                  title="Diktat starten"
                >
                  🎤
                </button>
                <button
                  onClick={handleSave}
                  style={{
                    flex: 1,
                    height: 52,
                    borderRadius: 12,
                    border: "none",
                    background: title.trim() ? cat.color : "#EBEBEB",
                    color: title.trim() ? "#fff" : "#BDBDBD",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: title.trim() ? "pointer" : "default",
                  }}
                >
                  Aufgabe erstellen ✓
                </button>
              </div>
            )}
            {mode === "edit" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dirty && (
                  <button onClick={handleSave} style={{ padding: 13, borderRadius: 12, border: "none", background: cat.color, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                    Speichern ✓
                  </button>
                )}
                <button onClick={function() { if (dirty) handleSave(); onComplete(task.id); onClose(); }} style={{ padding: 12, borderRadius: 12, border: "1.5px solid #27AE60", background: "#F0FBF4", color: "#27AE60", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  ✓ Als erledigt markieren
                </button>
                <button onClick={function() { onDelete(task.id); onClose(); }} style={{ padding: 12, borderRadius: 12, border: "1.5px solid #FFE0E0", background: "#FFF8F8", color: "#EB5757", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                  🗑 In den Papierkorb
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TaskRow
// ─────────────────────────────────────────────────────────────────────────────
function TaskRow(props) {
  const task           = props.task;
  const cat            = props.cat;
  const pri            = props.pri;
  const onComplete     = props.onComplete;
  const onOpen         = props.onOpen;
  const onCyclePri     = props.onCyclePri;
  const onDelete       = props.onDelete;

  const days      = daysUntilDate(task.dueDate);
  const isOverdue = days !== null && days < 0;
  const isSoon    = days !== null && days <= 2 && days >= 0;

  return (
    <div className="tr si" style={{ background: "#FAFAF8", border: "1.5px solid #EBEBEB", borderRadius: 14, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, borderLeft: "4px solid " + cat.color }}>
      <button
        onClick={onComplete}
        style={{ width: 22, height: 22, borderRadius: "50%", border: "none", background: "#fff", cursor: "pointer", flexShrink: 0, boxShadow: "inset 0 0 0 2px " + cat.color }}
      />
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onOpen}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 3, lineHeight: 1.35, color: "#1A1A2E" }}>{task.title}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: cat.color, fontWeight: 600 }}>{cat.emoji} {cat.label}</span>
          {task.description ? <span style={{ fontSize: 11, color: "#BDBDBD" }}>📝</span> : null}
          {days !== null && (
            <span style={{ fontSize: 11, fontWeight: 500, color: isOverdue ? "#EB5757" : isSoon ? "#F2994A" : "#BDBDBD" }}>
              {isOverdue ? "⚠ " + Math.abs(days) + "d überfällig" : days === 0 ? "⚡ Heute" : "📅 in " + days + "d"}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onCyclePri}
        style={{ background: pri.color + "22", color: pri.color, fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, letterSpacing: 0.5, whiteSpace: "nowrap", flexShrink: 0, border: "1px solid " + pri.color + "44", cursor: "pointer" }}
      >
        {pri.label.toUpperCase()}
      </button>
      <button className="delbtn" onClick={onDelete} style={{ fontSize: 15, padding: 4, flexShrink: 0 }}>✕</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SettingsPanel
// ─────────────────────────────────────────────────────────────────────────────
function SettingsPanel(props) {
  const onClose      = props.onClose;
  const tasks        = props.tasks;
  const archive      = props.archive;
  const trash        = props.trash;
  const categories   = props.categories;
  const notifPerm    = props.notifPerm;
  const onReqNotif   = props.onReqNotif;
  const onImport     = props.onImport;
  const fileRef = useRef(null);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 910, display: "flex" }} onClick={onClose}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.2)" }} />
      <div className="drawer" onClick={function(e) { e.stopPropagation(); }} style={{ width: "100%", maxWidth: 400, background: "#fff", height: "100%", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.13)" }}>
        <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #EBEBEB", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 800, color: "#1A1A2E" }}>Einstellungen</div>
          <button onClick={onClose} style={{ background: "#F5F4F0", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Notifications */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 12 }}>PUSH-BENACHRICHTIGUNGEN</div>
            <div style={{ background: "#F8F8FF", border: "1.5px solid #DDE5FF", borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E", marginBottom: 6 }}>🔔 Erinnerungslogik</div>
              <div style={{ fontSize: 12, color: "#888", lineHeight: 1.8 }}>
                <div>⚡ <strong>Dringend:</strong> 7d, 3d, 1d vorher, am Tag selbst</div>
                <div>🔶 <strong>Hoch:</strong> 5d, 2d vorher, am Tag selbst</div>
                <div>🟡 <strong>Mittel:</strong> 3d und 1d vorher</div>
                <div>🟢 <strong>Niedrig:</strong> 1d vorher</div>
                <div>🔕 Ruhezeit: 21:00 – 08:00 Uhr</div>
              </div>
            </div>
            {notifPerm === "granted" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F0FBF4", border: "1.5px solid #27AE60", borderRadius: 12, padding: "12px 16px" }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#27AE60" }}>Benachrichtigungen aktiv</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Die App erinnert dich automatisch.</div>
                </div>
              </div>
            )}
            {notifPerm === "denied" && (
              <div style={{ background: "#FFF8F8", border: "1.5px solid #EB5757", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#EB5757" }}>
                ⛔ Blockiert. Bitte in den Browser-Einstellungen erlauben.
              </div>
            )}
            {notifPerm !== "granted" && notifPerm !== "denied" && (
              <button onClick={onReqNotif} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "#4F7CFF", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                🔔 Benachrichtigungen erlauben
              </button>
            )}
          </div>

          {/* Export */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 12 }}>EXPORTIEREN</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={function() { exportJSON(tasks, archive, trash, categories); }} style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid #4F7CFF", background: "#F0F4FF", color: "#4F7CFF", fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>📦</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>JSON Backup</div>
                  <div style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>Alle Daten – zum Wiederherstellen</div>
                </div>
              </button>
              <button onClick={function() { exportCSV(tasks, archive); }} style={{ padding: "12px 16px", borderRadius: 12, border: "1.5px solid #27AE60", background: "#F0FBF4", color: "#27AE60", fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>CSV Export</div>
                  <div style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>Für Excel, Numbers usw.</div>
                </div>
              </button>
            </div>
          </div>

          {/* Import */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 12 }}>IMPORTIEREN</div>
            <input type="file" accept=".json" ref={fileRef} style={{ display: "none" }} onChange={function(e) { if (e.target.files[0]) onImport(e.target.files[0]); e.target.value = ""; }} />
            <button onClick={function() { fileRef.current && fileRef.current.click(); }} style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1.5px dashed #BDBDBD", background: "#FAFAFA", color: "#888", fontWeight: 600, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>📂</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>JSON Backup laden</div>
                <div style={{ fontSize: 11, color: "#BDBDBD", fontWeight: 400 }}>Stellt einen früheren Export wieder her</div>
              </div>
            </button>
          </div>

          {/* Stats */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", marginBottom: 12 }}>STATISTIK</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Offen",      val: tasks.length,      color: "#4F7CFF" },
                { label: "Erledigt",   val: archive.length,    color: "#27AE60" },
                { label: "Papierkorb", val: trash.length,      color: "#EB5757" },
                { label: "Kategorien", val: categories.length, color: "#9B51E0" },
              ].map(function(s) {
                return (
                  <div key={s.label} style={{ background: "#F8F8F8", borderRadius: 12, padding: "12px 14px", border: "1.5px solid " + s.color + "33" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: "#BDBDBD", fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SwipeableHeroStack — stacked cards, active on top, neighbours peek left/right
// ─────────────────────────────────────────────────────────────────────────────
function SwipeableHeroStack(props) {
  var tasks      = props.tasks;
  var getCat     = props.getCat;
  var getPri     = props.getPri;
  var onOpenTask = props.onOpenTask;

  const [activeIdx, setActiveIdx] = useState(0);
  const [dragX,     setDragX]     = useState(0);   // live finger delta in px
  const [isDragging, setIsDragging] = useState(false);

  var touchStartX = useRef(null);
  var touchStartY = useRef(null);
  var lockedAxis  = useRef(null); // "h" | "v" | null

  useEffect(function() { setActiveIdx(0); setDragX(0); }, [tasks.length]);

  if (!tasks.length) return null;

  var total  = tasks.length;
  var PEEK   = 28;   // px the neighbour card peeks out from behind active
  var THRESH = 0.4;  // fraction of card width to trigger slide

  function advance(dir) {
    setDragX(0);
    setIsDragging(false);
    setActiveIdx(function(i) { return (i + dir + total) % total; });
  }

  function goTo(i) { setActiveIdx(i); setDragX(0); setIsDragging(false); }

  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    lockedAxis.current  = null;
    setIsDragging(false);
  }

  function onTouchMove(e) {
    if (touchStartX.current === null) return;
    var dx = e.touches[0].clientX - touchStartX.current;
    var dy = e.touches[0].clientY - touchStartY.current;

    if (!lockedAxis.current) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // wait for clear intent
      lockedAxis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }

    if (lockedAxis.current === "v") return; // let page scroll

    e.preventDefault();
    setIsDragging(true);
    setDragX(dx);
  }

  function onTouchEnd(e) {
    if (touchStartX.current === null) return;
    var dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;

    // Use container width for threshold — approximate to 280px if not measurable
    var w = 280;
    if (Math.abs(dx) > w * THRESH) {
      advance(dx < 0 ? 1 : -1);
    } else {
      setDragX(0);
      setIsDragging(false);
    }
  }

  var activeCat = getCat(tasks[activeIdx].category);
  var activePri = getPri(tasks[activeIdx].priority);

  // Loop: prev and next always exist (wrap around)
  var prevIdx = (activeIdx - 1 + total) % total;
  var nextIdx = (activeIdx + 1) % total;
  // Only show neighbours if there are at least 2 tasks
  var showPrev = total > 1;
  var showNext = total > 1;

  // How far the active card has moved as a fraction (for neighbour reveal)
  // dragX > 0 means user dragged right → previous card reveals on left
  // dragX < 0 means user dragged left  → next card reveals on right
  var dragFrac = dragX / 280; // approximate

  function renderCard(task, role) {
    // role: "active" | "prev" | "next"
    var cat = getCat(task.category);
    var pri = getPri(task.priority);
    var isActive = role === "active";

    // --- positioning & transform for each role ---
    var translateX, scale, opacity, zIndex, pointerEvents;

    if (isActive) {
      // Active card: starts centred, moves with finger
      translateX = dragX;
      scale      = 1;
      opacity    = 1;
      zIndex     = 10;
      pointerEvents = "auto";
    } else if (role === "prev") {
      // Previous card peeks from left: normally hidden behind active,
      // reveals more as user drags right (dragX > 0)
      var revealFrac = Math.max(0, dragFrac); // 0..1
      translateX = -(100 - PEEK) + revealFrac * (100 - PEEK); // percentage of offset handled below
      // We'll use a pixel approach instead:
      // At rest: left edge of prev card = left edge of container - (containerW - PEEK)
      // i.e. only PEEK px stick out on left. We simulate with negative translateX:
      translateX = dragX > 0
        ? -280 + PEEK + dragX        // shifts right as user drags right
        : -280 + PEEK;               // rest: mostly off-screen left, only PEEK visible
      scale      = 0.88 + 0.12 * Math.min(1, Math.max(0, dragFrac));
      opacity    = 0.55 + 0.45 * Math.min(1, Math.max(0, dragFrac));
      zIndex     = 5;
      pointerEvents = "none";
    } else {
      // Next card peeks from right
      var revealFracN = Math.max(0, -dragFrac);
      translateX = dragX < 0
        ? 280 - PEEK + dragX        // shifts left as user drags left
        : 280 - PEEK;               // rest: mostly off-screen right, only PEEK visible
      scale      = 0.88 + 0.12 * Math.min(1, Math.max(0, -dragFrac));
      opacity    = 0.55 + 0.45 * Math.min(1, Math.max(0, -dragFrac));
      zIndex     = 5;
      pointerEvents = "none";
    }

    return (
      <div
        key={task.id + "-" + role}
        onClick={isActive ? function() { if (Math.abs(dragX) < 6) onOpenTask(task); } : undefined}
        style={{
          position:   "absolute",
          top:        0,
          left:       0,
          right:      0,
          bottom:     0,
          background: cat.color,
          borderRadius: 20,
          padding:    "18px 20px 16px",
          cursor:     isActive ? "pointer" : "default",
          boxShadow:  isActive
            ? "0 10px 32px " + cat.color + "60"
            : "0 4px 14px rgba(0,0,0,0.12)",
          transform:  "translateX(" + translateX + "px) scale(" + scale + ")",
          transformOrigin: "center center",
          opacity:    opacity,
          zIndex:     zIndex,
          pointerEvents: pointerEvents,
          transition: isDragging
            ? "transform 0.0s, opacity 0.0s"
            : "transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.38s ease",
          overflow:   "hidden",
          userSelect: "none",
          WebkitUserSelect: "none",
          display:    "flex",
          flexDirection: "column",
        }}
      >
        {isActive ? (
          // Full content for active card
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.7)", letterSpacing: 2, fontWeight: 700 }}>WICHTIGSTE AUFGABE</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", fontWeight: 600 }}>{cat.label}</div>
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.22)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 20, letterSpacing: 0.5, whiteSpace: "nowrap" }}>
                {pri.label.toUpperCase()}
              </div>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.2, marginBottom: 8, flex: 1, overflow: "hidden" }}>
              {task.title}
            </div>
            {task.description ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", lineHeight: 1.4, marginBottom: 8, overflow: "hidden", maxHeight: 36 }}>
                {task.description}
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>
                {task.dueDate ? (function() {
                  var d = Math.ceil((new Date(task.dueDate) - new Date()) / 86400000);
                  if (d < 0) return "⚠ " + Math.abs(d) + "d überfällig";
                  if (d === 0) return "⚡ Heute fällig";
                  return "📅 in " + d + " Tagen";
                })() : ""}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Tippen →</div>
            </div>
          </div>
        ) : (
          // Minimal content for neighbour cards
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.9)", fontFamily: "'Plus Jakarta Sans', sans-serif", lineHeight: 1.25, overflow: "hidden", maxHeight: 60 }}>
              {task.title}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{cat.emoji} {cat.label}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Card stage */}
      <div
        style={{ position: "relative", height: 200, overflow: "hidden", borderRadius: 20 }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {showPrev && renderCard(tasks[prevIdx], "prev")}
        {showNext && renderCard(tasks[nextIdx], "next")}
        {renderCard(tasks[activeIdx], "active")}
      </div>

      {/* Dots navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10 }}>
        {total > 1 && (
          <button onClick={function() { advance(-1); }} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "#BDBDBD", padding: "2px 6px", lineHeight: 1 }}>‹</button>
        )}
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {tasks.map(function(t, i) {
            return (
              <button key={t.id} onClick={function() { goTo(i); }} style={{
                width: i === activeIdx ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === activeIdx ? activeCat.color : "#D0CFCB",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "all 0.25s ease",
              }} />
            );
          })}
        </div>
        {total > 1 && (
          <button onClick={function() { advance(1); }} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: "#BDBDBD", padding: "2px 6px", lineHeight: 1 }}>›</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const saved = loadState();

  const [categories,   setCategories]   = useState(saved && saved.categories ? saved.categories : DEFAULT_CATEGORIES);
  const [tasks,        setTasks]        = useState(saved && saved.tasks      ? saved.tasks      : INITIAL_TASKS);
  const [trash,        setTrash]        = useState(saved && saved.trash      ? saved.trash      : []);
  const [archive,      setArchive]      = useState(saved && saved.archive    ? saved.archive    : []);
  const [view,         setView]         = useState("smart");
  const [filterCat,    setFilterCat]    = useState(null);
  const [notification, setNotif]        = useState(null);
  const [openTask,     setOpenTask]     = useState(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editCat,      setEditCat]      = useState(null); // category being edited
  const [notifPerm,    setNotifPerm]    = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const nextId        = useRef(Math.max(100, ...((saved && saved.tasks ? saved.tasks : INITIAL_TASKS).map(function(t) { return t.id + 1; }))));
  const notifInterval = useRef(null);

  // Persist
  useEffect(function() {
    saveState({ categories: categories, tasks: tasks, trash: trash, archive: archive });
  }, [categories, tasks, trash, archive]);

  // Purge expired
  useEffect(function() {
    const now = Date.now();
    setTrash(function(t) { return t.filter(function(x) { return now - x.deletedAt < TRASH_TTL; }); });
    setArchive(function(a) { return a.filter(function(x) { return now - x.completedAt < ARCHIVE_TTL; }); });
  }, []);

  // Notification check
  useEffect(function() {
    function check() {
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      const hour = new Date().getHours();
      if (hour < 8 || hour >= 21) return;
      const toNotify = tasks.filter(shouldNotifyTask);
      if (!toNotify.length) return;
      if (toNotify.length === 1) {
        fireNotification("📋 Task Master", getNotifMessage(toNotify[0]));
      } else if (toNotify.length <= 3) {
        toNotify.forEach(function(t) { fireNotification("📋 Task Master", getNotifMessage(t)); });
      } else {
        fireNotification("📋 Task Master", getNotifMessage(toNotify[0]));
        fireNotification("📋 +" + (toNotify.length - 1) + " weitere fällige Aufgaben", "Öffne Task Master für eine Übersicht.");
      }
      const ids = {};
      toNotify.forEach(function(t) { ids[t.id] = true; });
      setTasks(function(prev) {
        return prev.map(function(t) { return ids[t.id] ? Object.assign({}, t, { lastNotified: Date.now() }) : t; });
      });
    }
    check();
    notifInterval.current = setInterval(check, 30 * 60 * 1000);
    return function() { clearInterval(notifInterval.current); };
  }, []); // eslint-disable-line

  const showNotif = useCallback(function(msg, type) {
    setNotif({ msg: msg, type: type || "success" });
    setTimeout(function() { setNotif(null); }, 3500);
  }, []);

  function getCat(id) {
    return categories.find(function(c) { return c.id === id; }) || categories[categories.length - 1];
  }

  function getPri(id) {
    return PRIORITIES.find(function(p) { return p.id === id; }) || PRIORITIES[2];
  }

  // CRUD
  function addTask(d) {
    setTasks(function(prev) { return prev.concat([Object.assign({ id: nextId.current++, createdAt: Date.now() }, d)]); });
    setShowCreate(false);
    showNotif("Aufgabe erstellt ✓");
  }

  function updateTask(updated) {
    setTasks(function(prev) { return prev.map(function(t) { return t.id === updated.id ? updated : t; }); });
    if (openTask && openTask.id === updated.id) setOpenTask(updated);
    showNotif("Gespeichert ✓");
  }

  function completeTask(id) {
    const t = tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    setArchive(function(prev) { return prev.concat([Object.assign({}, t, { completedAt: Date.now() })]); });
    setTasks(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
    showNotif("Erledigt ✓");
  }

  function deleteTask(id) {
    const t = tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    setTrash(function(prev) { return prev.concat([Object.assign({}, t, { deletedAt: Date.now() })]); });
    setTasks(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
    showNotif("In den Papierkorb 🗑");
  }

  function restoreTask(id) {
    const t = trash.find(function(x) { return x.id === id; });
    if (!t) return;
    const restored = Object.assign({}, t);
    delete restored.deletedAt;
    setTasks(function(prev) { return prev.concat([restored]); });
    setTrash(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
    showNotif("Wiederhergestellt ✓");
  }

  function purgeTask(id) {
    setTrash(function(prev) { return prev.filter(function(x) { return x.id !== id; }); });
    showNotif("Endgültig gelöscht.");
  }

  function addCategory(cat) {
    setCategories(function(prev) { return prev.slice(0, -1).concat([cat, prev[prev.length - 1]]); });
    showNotif("Kategorie erstellt ✓");
  }

  function updateCategory(updated) {
    setCategories(function(prev) { return prev.map(function(c) { return c.id === updated.id ? updated : c; }); });
    setEditCat(null);
    showNotif("Kategorie gespeichert ✓");
  }

  function deleteCategory(catId) {
    // Move tasks in this category to "other"
    setTasks(function(prev) { return prev.map(function(t) { return t.category === catId ? Object.assign({}, t, { category: "other" }) : t; }); });
    setCategories(function(prev) { return prev.filter(function(c) { return c.id !== catId; }); });
    if (filterCat === catId) setFilterCat(null);
    setEditCat(null);
    showNotif("Kategorie gelöscht.");
  }

  function cyclePriority(task) {
    const idx  = PRIORITIES.findIndex(function(p) { return p.id === task.priority; });
    const next = PRIORITIES[(idx + 1) % PRIORITIES.length];
    updateTask(Object.assign({}, task, { priority: next.id }));
  }

  async function handleRequestNotif() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === "granted") showNotif("🔔 Benachrichtigungen aktiviert!");
    else showNotif("Benachrichtigungen blockiert.", "error");
  }

  function handleImport(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.tasks) throw new Error("Ungültiges Format");
        if (data.categories) setCategories(data.categories);
        if (data.tasks)      setTasks(data.tasks);
        if (data.archive)    setArchive(data.archive);
        if (data.trash)      setTrash(data.trash);
        setShowSettings(false);
        showNotif("Backup importiert ✓");
      } catch (err) {
        showNotif("Import fehlgeschlagen", "error");
      }
    };
    reader.readAsText(file);
  }

  // Derived
  const smartTasks   = buildSmartList(tasks);
  const heroTasks    = buildHeroList(tasks, filterCat);
  const displayTasks = view === "smart"
    ? smartTasks
    : view === "category" && filterCat
    ? sortByDateAndPriority(tasks.filter(function(t) { return t.category === filterCat; }))
    : sortByDateAndPriority(tasks);

  const archiveByDate = archive.slice().sort(function(a, b) { return b.completedAt - a.completedAt; }).reduce(function(acc, t) {
    const k = fmtDay(t.completedAt);
    if (!acc[k]) acc[k] = [];
    acc[k].push(t);
    return acc;
  }, {});

  function trashDaysLeft(t) {
    return Math.ceil((TRASH_TTL - (Date.now() - t.deletedAt)) / 86400000);
  }

  const NAV = [
    { id: "smart",   label: "Offen",      count: tasks.length,   accent: "#4F7CFF" },
    { id: "archive", label: "Erledigt",   count: archive.length, accent: "#27AE60" },
    { id: "trash",   label: "Papierkorb", count: trash.length,   accent: "#EB5757" },
  ];

  const isTaskView = view === "smart" || view === "all" || view === "category";

  return (
    <div style={{ minHeight: "100vh", background: "#F5F4F0", fontFamily: "'DM Sans', sans-serif", color: "#1A1A2E" }}>
      <style>{CSS}</style>

      {/* Toast */}
      {notification && (
        <div className="si" style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: notification.type === "error" ? "#EB5757" : "#fff", border: "1.5px solid " + (notification.type === "error" ? "#EB5757" : "#27AE60"), color: notification.type === "error" ? "#fff" : "#27AE60", padding: "12px 20px", borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
          {notification.msg}
        </div>
      )}

      {/* Drawers */}
      {openTask && !showCreate && (
        <TaskPanel mode="edit" task={openTask} categories={categories}
          onClose={function() { setOpenTask(null); }}
          onSave={updateTask}
          onDelete={function(id) { deleteTask(id); setOpenTask(null); }}
          onComplete={function(id) { completeTask(id); setOpenTask(null); }}
          onAddCategory={addCategory}
        />
      )}
      {showCreate && (
        <TaskPanel mode="create" task={{ title: "", description: "", priority: "medium", category: "other", dueDate: "" }}
          categories={categories}
          onClose={function() { setShowCreate(false); }}
          onSave={addTask}
          onDelete={function() {}}
          onComplete={function() {}}
          onAddCategory={addCategory}
        />
      )}
      {showSettings && (
        <SettingsPanel
          onClose={function() { setShowSettings(false); }}
          tasks={tasks} archive={archive} trash={trash} categories={categories}
          notifPerm={notifPerm} onReqNotif={handleRequestNotif} onImport={handleImport}
        />
      )}
      {editCat && (
        <CategoryEditModal
          cat={editCat}
          taskCount={tasks.filter(function(t) { return t.category === editCat.id; }).length}
          onSave={updateCategory}
          onDelete={function() { deleteCategory(editCat.id); }}
          onClose={function() { setEditCat(null); }}
        />
      )}

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EBEBEB", padding: "24px 24px 18px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#BDBDBD", fontWeight: 700, marginBottom: 4 }}>TASK MASTER</div>
              <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: -0.5, color: "#1A1A2E" }}>To-Dos</h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 4 }}>
              {notifPerm === "granted" && <span title="Benachrichtigungen aktiv" style={{ fontSize: 18 }}>🔔</span>}
              <button onClick={function() { setShowSettings(true); }} style={{ padding: "8px 14px", borderRadius: 12, border: "1.5px solid #EBEBEB", background: "#FAFAFA", color: "#888", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                ⚙️
              </button>
            </div>
          </div>

          {/* Nav buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            {NAV.map(function(n) {
              const active = n.id === "smart" ? isTaskView : view === n.id;
              return (
                <button key={n.id} className="navbtn" onClick={function() { setView(n.id); }} style={{ flex: 1, padding: "12px 8px", borderRadius: 14, border: "none", background: active ? n.accent : "#F0EFEB", color: active ? "#fff" : "#888", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: active ? "0 4px 14px " + n.accent + "55" : "0 1px 3px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{n.count || "—"}</span>
                  <span style={{ fontSize: 11, letterSpacing: 0.5 }}>{n.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "20px 24px 100px" }}>

        {/* Archive */}
        {view === "archive" && (
          archive.length === 0 ? (
            <div style={{ textAlign: "center", color: "#CCCCCC", padding: "60px 0", fontSize: 15 }}>Noch nichts abgeschlossen.</div>
          ) : (
            Object.entries(archiveByDate).map(function(entry) {
              const date  = entry[0];
              const items = entry[1];
              return (
                <div key={date} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "#BDBDBD", margin: "20px 0 8px", paddingBottom: 4, borderBottom: "1px solid #EBEBEB" }}>{date}</div>
                  {items.map(function(task) {
                    const cat = getCat(task.category);
                    return (
                      <div key={task.id} style={{ background: "#FAFAF8", border: "1.5px solid #EBEBEB", borderRadius: 14, padding: "12px 16px", marginBottom: 6, display: "flex", alignItems: "center", gap: 12, borderLeft: "4px solid " + cat.color, opacity: 0.72 }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: cat.color, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, textDecoration: "line-through", color: "#888", marginBottom: 2 }}>{task.title}</div>
                          <div style={{ fontSize: 11, color: "#BDBDBD" }}>{cat.emoji} {cat.label} · {new Date(task.completedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )
        )}

        {/* Trash */}
        {view === "trash" && (
          trash.length === 0 ? (
            <div style={{ textAlign: "center", color: "#CCCCCC", padding: "60px 0", fontSize: 15 }}>Papierkorb ist leer 🗑</div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "#BDBDBD", marginBottom: 14, textAlign: "center" }}>Aufgaben werden nach 10 Tagen automatisch gelöscht.</div>
              {trash.slice().sort(function(a, b) { return b.deletedAt - a.deletedAt; }).map(function(task) {
                const cat = getCat(task.category);
                const dl  = trashDaysLeft(task);
                return (
                  <div key={task.id} style={{ background: "#FAFAF8", border: "1.5px solid #FFE8E8", borderRadius: 14, padding: "14px 16px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, borderLeft: "4px solid #EB5757" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: "#555", marginBottom: 3 }}>{task.title}</div>
                      <div style={{ fontSize: 11, color: "#BDBDBD" }}>{cat.emoji} {cat.label} · noch {dl}d</div>
                    </div>
                    <button onClick={function() { restoreTask(task.id); }} style={{ background: "#F0FBF4", color: "#27AE60", border: "1.5px solid #27AE60", borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>↩ Wiederherstellen</button>
                    <button className="delbtn" onClick={function() { purgeTask(task.id); }} style={{ fontSize: 15, padding: 4, flexShrink: 0 }}>✕</button>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Task views */}
        {isTaskView && (
          <div>
            {/* Swipeable Hero Stack */}
            {heroTasks.length > 0 && (
              <SwipeableHeroStack
                tasks={heroTasks}
                getCat={getCat}
                getPri={getPri}
                onOpenTask={function(task) { setOpenTask(task); }}
              />
            )}

            {/* Sub-tabs */}
            <div style={{ display: "flex", gap: 3, background: "#ECEAE5", borderRadius: 12, padding: 4, marginBottom: 14 }}>
              {[
                { id: "smart",    label: "⚡ Smart" },
                { id: "all",      label: "📋 Alle" },
                { id: "category", label: "🏷 Kategorien" },
              ].map(function(tab) {
                return (
                  <button key={tab.id} className="chip" onClick={function() { setView(tab.id); if (tab.id !== "category") setFilterCat(null); }} style={{ flex: 1, padding: "8px 10px", borderRadius: 9, fontSize: 13, fontWeight: 600, background: view === tab.id ? "#fff" : "transparent", color: view === tab.id ? "#1A1A2E" : "#AAAAAA", border: view === tab.id ? "1px solid #E0DFDA" : "1px solid transparent", boxShadow: view === tab.id ? "0 1px 4px rgba(0,0,0,0.07)" : "none" }}>
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Category chips with long-press to edit */}
            {view === "category" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {categories.map(function(cat) {
                  const count = tasks.filter(function(t) { return t.category === cat.id; }).length;
                  if (!count && cat.id !== "other") return null;
                  var longPressTimer = null;
                  return (
                    <button
                      key={cat.id}
                      className="chip catbtn-long"
                      onTouchStart={function() {
                        longPressTimer = setTimeout(function() { setEditCat(cat); }, 600);
                      }}
                      onTouchEnd={function() { clearTimeout(longPressTimer); }}
                      onTouchMove={function() { clearTimeout(longPressTimer); }}
                      onClick={function() { setFilterCat(filterCat === cat.id ? null : cat.id); }}
                      style={{ background: filterCat === cat.id ? cat.color : "#fff", color: filterCat === cat.id ? "#fff" : "#555", border: "1.5px solid " + (filterCat === cat.id ? cat.color : "#E0DFDA"), borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, boxShadow: filterCat === cat.id ? "0 2px 10px " + cat.color + "55" : "none" }}
                    >
                      {cat.emoji} {cat.label} {count > 0 ? "(" + count + ")" : ""}
                    </button>
                  );
                })}
                <div style={{ fontSize: 10, color: "#BDBDBD", alignSelf: "center", marginLeft: 4 }}>Lang drücken zum Bearbeiten</div>
              </div>
            )}

            {/* Task list */}
            {displayTasks.length === 0 && <div style={{ textAlign: "center", color: "#CCCCCC", padding: "40px 0", fontSize: 15 }}>Keine Aufgaben 🎉</div>}
            {displayTasks.map(function(task) {
              const cat = getCat(task.category);
              const pri = getPri(task.priority);
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  cat={cat}
                  pri={pri}
                  onComplete={function() { completeTask(task.id); }}
                  onOpen={function() { setOpenTask(task); }}
                  onCyclePri={function() { cyclePriority(task); }}
                  onDelete={function() { deleteTask(task.id); }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* FAB */}
      {isTaskView && !showCreate && !openTask && !showSettings && (
        <button className="fab" onClick={function() { setShowCreate(true); }} style={{ position: "fixed", bottom: 32, right: 28, zIndex: 200, width: 60, height: 60, borderRadius: "50%", border: "none", background: "#4F7CFF", color: "#fff", fontSize: 30, cursor: "pointer", boxShadow: "0 6px 24px rgba(79,124,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
          +
        </button>
      )}
    </div>
  );
}
