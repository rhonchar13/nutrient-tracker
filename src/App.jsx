import { useState, useMemo, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from "recharts";

const formatDate = (d) => new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
const today = () => new Date().toISOString().split("T")[0];

const INIT_FERTS = [
  { id: 1, name: "Азот (N)", unit: "мл" },
  { id: 2, name: "Фосфор (P)", unit: "мл" },
  { id: 3, name: "Калий (K)", unit: "мл" },
];

const TABS = [
  { id: "dashboard", label: "📊 Дашборд" },
  { id: "add",       label: "➕ Полив" },
  { id: "stock",     label: "📦 Склад" },
  { id: "fertilizers", label: "🧪 Удобрения" },
];

// Все возможные виджеты дашборда
const ALL_WIDGETS = [
  { id: "kpi",      label: "📈 Статистика" },
  { id: "stock",    label: "🧪 Остатки склада" },
  { id: "chart_ppm", label: "⚡ График PPM" },
  { id: "chart_ph",  label: "🧪 График pH" },
  { id: "chart_ec",  label: "🔋 График EC" },
  { id: "chart_vol", label: "💧 График литража" },
  { id: "history",   label: "📋 История поливов" },
];

const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

export default function App() {
  const [fertilizers, setFertilizers] = useState(() => load("ferts", INIT_FERTS));
  const [movements, setMovements]     = useState(() => load("movements", []));
  const [logs, setLogs]               = useState(() => load("logs", []));
  const [tab, setTab]                 = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saved, setSaved]             = useState(false);

  // Настройки дашборда: порядок и видимость виджетов
  const [widgetOrder,   setWidgetOrder]   = useState(() => load("widgetOrder",   ALL_WIDGETS.map(w => w.id)));
  const [hiddenWidgets, setHiddenWidgets] = useState(() => load("hiddenWidgets", []));
  const [editDash, setEditDash]           = useState(false);
  const dragItem    = useRef(null);
  const dragOverItem = useRef(null);

  // Настройки KPI карточек
  const ALL_KPI = [
    { id: "volume", label: "Всего внесено", icon: "💧" },
    { id: "ppm",    label: "Средний PPM",   icon: "⚡" },
    { id: "ph",     label: "Средний pH",    icon: "🧪" },
    { id: "ec",     label: "Средний EC",    icon: "🔋" },
    { id: "last",   label: "Последний полив", icon: "📅" },
    { id: "count",  label: "Кол-во поливов", icon: "🔢" },
  ];
  const [hiddenKpi, setHiddenKpi] = useState(() => load("hiddenKpi", []));
  const toggleKpi = (id) => {
    setHiddenKpi(prev => {
      const next = prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id];
      save("hiddenKpi", next); return next;
    });
  };
  const kpiSliderRef = useRef(null);

  const [logForm, setLogForm]   = useState({ date: today(), volume: "", ppm: "", ph: "", ec: "", notes: "", amounts: {} });
  const [mvForm, setMvForm]     = useState({ fertId: "", type: "in", amount: "", date: today(), note: "" });
  const [newFert, setNewFert]   = useState({ name: "", unit: "мл" });
  const [showFertForm, setShowFertForm] = useState(false);
  const [openHistory, setOpenHistory]   = useState(null);
  const [deletingId, setDeletingId]     = useState(null);

  useEffect(() => { save("ferts", fertilizers); }, [fertilizers]);
  useEffect(() => { save("movements", movements); }, [movements]);
  useEffect(() => { save("logs", logs); if (logs.length) { setSaved(true); setTimeout(() => setSaved(false), 1500); } }, [logs]);
  useEffect(() => { save("widgetOrder", widgetOrder); }, [widgetOrder]);
  useEffect(() => { save("hiddenWidgets", hiddenWidgets); }, [hiddenWidgets]);

  const stocks = useMemo(() => {
    const map = {};
    fertilizers.forEach(f => { map[f.id] = 0; });
    movements.forEach(m => {
      if (m.type === "in") map[m.fertId] = (map[m.fertId] || 0) + Number(m.amount);
      else map[m.fertId] = (map[m.fertId] || 0) - Number(m.amount);
    });
    return map;
  }, [movements, fertilizers]);

  const totalUsed = useMemo(() => {
    const map = {};
    fertilizers.forEach(f => { map[f.id] = 0; });
    movements.forEach(m => {
      if (m.type === "out") map[m.fertId] = (map[m.fertId] || 0) + Number(m.amount);
    });
    return map;
  }, [movements, fertilizers]);

  const addMovement = () => {
    if (!mvForm.fertId || !mvForm.amount || !mvForm.date) return;
    const updated = [...movements, { ...mvForm, id: Date.now(), amount: Number(mvForm.amount) }]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    setMovements(updated); save("movements", updated);
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    setMvForm(p => ({ ...p, amount: "", note: "" }));
  };

  const addLog = () => {
    if (!logForm.date || !logForm.ppm || !logForm.ph || !logForm.volume) return;
    const newMvs = [];
    Object.entries(logForm.amounts || {}).forEach(([id, amt]) => {
      if (amt && Number(amt) > 0)
        newMvs.push({ id: Date.now() + Math.random(), fertId: Number(id), type: "out", amount: Number(amt), date: logForm.date, note: "Полив" });
    });
    if (newMvs.length) {
      const updMvs = [...movements, ...newMvs].sort((a, b) => new Date(b.date) - new Date(a.date));
      setMovements(updMvs); save("movements", updMvs);
    }
    const updLogs = [{ ...logForm, id: Date.now(), ppm: Number(logForm.ppm), ph: Number(logForm.ph), ec: Number(logForm.ec) || 0, volume: Number(logForm.volume) }, ...logs]
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    setLogs(updLogs); save("logs", updLogs);
    setLogForm({ date: today(), volume: "", ppm: "", ph: "", ec: "", notes: "", amounts: {} });
  };

  const addFertilizer = () => {
    if (!newFert.name) return;
    const updated = [...fertilizers, { id: Date.now(), name: newFert.name, unit: newFert.unit }];
    setFertilizers(updated); save("ferts", updated);
    setNewFert({ name: "", unit: "мл" }); setShowFertForm(false);
  };

  const deleteFertilizer = (id) => {
    const updF = fertilizers.filter(f => f.id !== id);
    const updM = movements.filter(m => m.fertId !== id);
    setFertilizers(updF); save("ferts", updF);
    setMovements(updM); save("movements", updM);
    setDeletingId(null);
  };

  const chartData = useMemo(() => [...logs].reverse().slice(-20).map(l => ({
    date: formatDate(l.date), ppm: l.ppm, ph: l.ph, ec: l.ec || 0, volume: l.volume,
  })), [logs]);

  const totalVolume = logs.reduce((s, l) => s + l.volume, 0);
  const avgPPM = logs.length ? Math.round(logs.reduce((s, l) => s + l.ppm, 0) / logs.length) : 0;
  const avgPH  = logs.length ? (logs.reduce((s, l) => s + l.ph,  0) / logs.length).toFixed(1) : 0;
  const avgEC  = logs.length ? (logs.reduce((s, l) => s + (l.ec||0), 0) / logs.length).toFixed(2) : 0;
  const lastLog = logs[0];
  const fertMovements = (fertId) => movements.filter(m => m.fertId === fertId).sort((a, b) => new Date(b.date) - new Date(a.date));
  const navigate = (id) => { setTab(id); setSidebarOpen(false); };

  // Drag & drop для виджетов
  const onDragStart = (id) => { dragItem.current = id; };
  const onDragEnter = (id) => { dragOverItem.current = id; };
  const onDragEnd   = () => {
    const order = [...widgetOrder];
    const from = order.indexOf(dragItem.current);
    const to   = order.indexOf(dragOverItem.current);
    if (from === -1 || to === -1) return;
    order.splice(from, 1);
    order.splice(to, 0, dragItem.current);
    setWidgetOrder(order);
    dragItem.current = null; dragOverItem.current = null;
  };

  const toggleWidget = (id) => {
    setHiddenWidgets(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]);
  };

  const visibleWidgets = widgetOrder.filter(id => !hiddenWidgets.includes(id));

  // Рендер виджета по id
  const renderWidget = (id) => {
    switch(id) {
      case "kpi": {
        const kpiData = {
          volume: { label: "Всего внесено", val: `${totalVolume} л`,  icon: "💧", sub: `${logs.length} поливов` },
          ppm:    { label: "Средний PPM",   val: avgPPM || "—",       icon: "⚡", sub: lastLog ? `Посл: ${lastLog.ppm}` : "—" },
          ph:     { label: "Средний pH",    val: avgPH  || "—",       icon: "🧪", sub: lastLog ? `Посл: ${lastLog.ph}`  : "—" },
          ec:     { label: "Средний EC",    val: avgEC  || "—",       icon: "🔋", sub: lastLog ? `Посл: ${lastLog.ec || "—"}` : "—" },
          last:   { label: "Последний полив", val: lastLog ? formatDate(lastLog.date) : "—", icon: "📅", sub: lastLog ? `${lastLog.volume} л` : "—" },
          count:  { label: "Кол-во поливов", val: logs.length,        icon: "🔢", sub: `всего записей` },
        };
        const visibleKpi = ALL_KPI.filter(k => !hiddenKpi.includes(k.id));
        return (
          <div key="kpi">
            <div style={{ overflowX: "auto", paddingBottom: 8, cursor: "grab" }}
              ref={kpiSliderRef}
              onMouseDown={e => {
                const el = kpiSliderRef.current;
                el._startX = e.pageX - el.offsetLeft;
                el._scrollLeft = el.scrollLeft;
                el._down = true;
              }}
              onMouseLeave={e => { if(kpiSliderRef.current) kpiSliderRef.current._down = false; }}
              onMouseUp={e => { if(kpiSliderRef.current) kpiSliderRef.current._down = false; }}
              onMouseMove={e => {
                const el = kpiSliderRef.current;
                if (!el || !el._down) return;
                e.preventDefault();
                el.scrollLeft = el._scrollLeft - (e.pageX - el.offsetLeft - el._startX);
              }}
            >
              <div style={{ display: "flex", gap: 14, width: "max-content", paddingRight: 4 }}>
                {visibleKpi.map(k => {
                  const d = kpiData[k.id];
                  return (
                    <div key={k.id} className="card" style={{ minWidth: 180, userSelect: "none" }}>
                      <div style={{ fontSize: 20, marginBottom: 8 }}>{d.icon}</div>
                      <div className="stat-val" style={{ color: "#58a6ff", marginBottom: 4 }}>{d.val}</div>
                      <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 2 }}>{d.label}</div>
                      <div style={{ fontSize: 11, color: "#6e7681" }}>{d.sub}</div>
                    </div>
                  );
                })}
                {visibleKpi.length === 0 && (
                  <div style={{ fontSize: 13, color: "#6e7681", padding: "20px 0" }}>Все карточки скрыты. Нажми «Настроить дашборд» чтобы включить.</div>
                )}
              </div>
            </div>
          </div>
        );
      }
      case "stock": return (
        <div key="stock" className="card">
          <div className="section-title">Остатки на складе</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {fertilizers.map(f => {
              const stock = stocks[f.id] || 0;
              const empty = stock <= 0; const low = stock > 0 && stock < 50;
              return (
                <div key={f.id} style={{ background: "#0d1117", borderRadius: 8, padding: "14px 16px", borderLeft: `3px solid ${empty ? "#f85149" : low ? "#e3b341" : "#3fb950"}` }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{f.name}</div>
                  <div style={{ fontSize: 22, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: empty ? "#f85149" : low ? "#e3b341" : "#3fb950", marginBottom: 4 }}>
                    {Math.max(0, stock).toFixed(1)} <span style={{ fontSize: 13, fontWeight: 400 }}>{f.unit}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#6e7681" }}>Использовано: {totalUsed[f.id] || 0} {f.unit}</div>
                  {empty && <div className="tag-red" style={{ marginTop: 6, display: "inline-block" }}>Закончилось!</div>}
                  {low && !empty && <div className="tag-yellow" style={{ marginTop: 6, display: "inline-block" }}>Мало</div>}
                </div>
              );
            })}
          </div>
        </div>
      );
      case "chart_ppm": return logs.length > 0 ? (
        <div key="chart_ppm" className="card">
          <div className="section-title">⚡ PPM за время</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" tick={{ fill: "#6e7681", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6e7681", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} />
              <Line type="monotone" dataKey="ppm" stroke="#58a6ff" strokeWidth={2} dot={{ fill: "#58a6ff", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null;
      case "chart_ph": return logs.length > 0 ? (
        <div key="chart_ph" className="card">
          <div className="section-title">🧪 pH за время</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" tick={{ fill: "#6e7681", fontSize: 11 }} />
              <YAxis domain={[4, 9]} tick={{ fill: "#6e7681", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} />
              <ReferenceLine y={5.5} stroke="#3fb950" strokeDasharray="4 4" />
              <ReferenceLine y={6.5} stroke="#3fb950" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="ph" stroke="#e3b341" strokeWidth={2} dot={{ fill: "#e3b341", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null;
      case "chart_ec": return logs.length > 0 ? (
        <div key="chart_ec" className="card">
          <div className="section-title">🔋 EC за время</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" tick={{ fill: "#6e7681", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6e7681", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} />
              <Line type="monotone" dataKey="ec" stroke="#bc8cff" strokeWidth={2} dot={{ fill: "#bc8cff", r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null;
      case "chart_vol": return logs.length > 0 ? (
        <div key="chart_vol" className="card">
          <div className="section-title">💧 Литраж по дням</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="date" tick={{ fill: "#6e7681", fontSize: 11 }} />
              <YAxis tick={{ fill: "#6e7681", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#e6edf3" }} />
              <Bar dataKey="volume" fill="#238636" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null;
      case "history": return logs.length > 0 ? (
        <div key="history" className="card">
          <div className="section-title">📋 История поливов</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {logs.slice(0, 10).map(log => (
              <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#0d1117", borderRadius: 8, fontSize: 13 }}>
                <span style={{ color: "#8b949e", minWidth: 70 }}>{formatDate(log.date)}</span>
                <span style={{ color: "#58a6ff", minWidth: 55 }}>💧 {log.volume}л</span>
                <span style={{ minWidth: 75 }}>⚡ {log.ppm} ppm</span>
                <span style={{ minWidth: 55 }}>🧪 {log.ph}</span>
                <span style={{ minWidth: 65, color: "#bc8cff" }}>🔋 {log.ec || "—"}</span>
                {log.notes && <span style={{ color: "#6e7681", fontSize: 12 }}>{log.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : null;
      default: return null;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #161b22; } ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
        input, select, textarea { background: #161b22; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; padding: 8px 12px; font-family: inherit; font-size: 13px; outline: none; transition: border-color 0.2s; }
        input:focus, select:focus, textarea:focus { border-color: #58a6ff; }
        .btn { cursor: pointer; border: none; border-radius: 6px; padding: 9px 18px; font-family: inherit; font-size: 13px; font-weight: 600; transition: all 0.2s; }
        .btn-primary { background: #238636; color: #fff; } .btn-primary:hover { background: #2ea043; }
        .btn-blue { background: #1f6feb; color: #fff; } .btn-blue:hover { background: #388bfd; }
        .btn-red { background: #6e1010; color: #ffa198; border: 1px solid #6e1010; } .btn-red:hover { background: #8b1a1a; }
        .btn-ghost { background: transparent; color: #8b949e; border: 1px solid #30363d; } .btn-ghost:hover { color: #e6edf3; border-color: #8b949e; }
        .btn-icon { cursor: pointer; background: transparent; border: none; padding: 4px 8px; border-radius: 5px; font-size: 15px; color: #6e7681; transition: all 0.15s; }
        .btn-icon:hover { background: #3d0000; color: #f85149; }
        .card { background: #161b22; border: 1px solid #21262d; border-radius: 12px; padding: 20px; }
        .tag-yellow { background: #2d1f00; color: #e3b341; border-radius: 20px; padding: 2px 10px; font-size: 11px; font-weight: 600; }
        .tag-red { background: #3d0000; color: #f85149; border-radius: 20px; padding: 2px 10px; font-size: 11px; font-weight: 600; }
        .tag-blue { background: #0d2149; color: #58a6ff; border-radius: 20px; padding: 2px 10px; font-size: 11px; font-weight: 600; }
        .stat-val { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; line-height: 1; }
        .section-title { font-size: 11px; font-weight: 600; color: #8b949e; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 14px; }
        .mv-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 7px; font-size: 12px; }
        .mv-in { background: #0d2a0d; border-left: 3px solid #3fb950; }
        .mv-out { background: #1a0d00; border-left: 3px solid #e3b341; }
        .sidebar { position: fixed; top: 0; right: 0; height: 100vh; width: 220px; background: #161b22; border-left: 1px solid #21262d; z-index: 200; display: flex; flex-direction: column; padding: 20px 14px; gap: 6px; transform: translateX(100%); transition: transform 0.25s ease; }
        .sidebar.open { transform: translateX(0); }
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 190; display: none; }
        .overlay.open { display: block; }
        .sidebar-btn { cursor: pointer; padding: 10px 14px; border-radius: 8px; border: none; font-family: inherit; font-size: 14px; font-weight: 500; text-align: left; transition: all 0.15s; background: transparent; color: #8b949e; width: 100%; }
        .sidebar-btn:hover { background: #21262d; color: #e6edf3; }
        .sidebar-btn.active { background: #21262d; color: #58a6ff; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 300; display: flex; align-items: center; justify-content: center; }
        .modal { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%; }
        .save-toast { position: fixed; bottom: 24px; right: 24px; background: #0d4429; color: #3fb950; border: 1px solid #238636; border-radius: 8px; padding: 10px 18px; font-size: 13px; font-weight: 600; z-index: 400; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
        .save-toast.show { opacity: 1; }
        .widget-drag { cursor: grab; transition: opacity 0.2s; }
        .widget-drag:active { cursor: grabbing; opacity: 0.5; }
        .widget-scroll { display: flex; flex-direction: column; gap: 16px; }
      `}</style>

      <div className={`save-toast ${saved ? "show" : ""}`}>✓ Сохранено</div>
      <div className={`overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14 }}>Меню</span>
          <button className="btn-icon" style={{ fontSize: 18 }} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>
        {TABS.map(t => (
          <button key={t.id} className={`sidebar-btn ${tab === t.id ? "active" : ""}`} onClick={() => navigate(t.id)}>{t.label}</button>
        ))}
        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #21262d", fontSize: 11, color: "#6e7681" }}>
          💾 Данные сохраняются автоматически
        </div>
      </div>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #21262d", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d1117", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "linear-gradient(135deg, #238636, #56d364)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🌱</div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15 }}>NutrientLog</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#8b949e" }}>{TABS.find(t => t.id === tab)?.label}</span>
          <button onClick={() => setSidebarOpen(true)} style={{ cursor: "pointer", background: "#21262d", border: "1px solid #30363d", borderRadius: 8, padding: "7px 12px", color: "#e6edf3", display: "flex", flexDirection: "column", gap: 4, alignItems: "center", justifyContent: "center" }}>
            <span style={{ display: "block", width: 18, height: 2, background: "#e6edf3", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "#e6edf3", borderRadius: 1 }} />
            <span style={{ display: "block", width: 18, height: 2, background: "#e6edf3", borderRadius: 1 }} />
          </button>
        </div>
      </div>

      {/* Confirm delete modal */}
      {deletingId && (
        <div className="modal-overlay">
          <div className="modal">
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Удалить удобрение?</div>
            <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 20 }}>Будут также удалены все записи движений. Это действие нельзя отменить.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-red" onClick={() => deleteFertilizer(deletingId)}>Удалить</button>
              <button className="btn btn-ghost" onClick={() => setDeletingId(null)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit dashboard modal */}
      {editDash && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>⚙️ Настройка дашборда</div>
            <div style={{ fontSize: 12, color: "#6e7681", marginBottom: 14 }}>Перетаскивай для порядка. Нажми 👁 чтобы скрыть/показать.</div>

            <div style={{ fontSize: 11, fontWeight: 600, color: "#8b949e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Разделы</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {widgetOrder.map(id => {
                const w = ALL_WIDGETS.find(w => w.id === id);
                const hidden = hiddenWidgets.includes(id);
                return (
                  <div key={id} draggable
                    onDragStart={() => onDragStart(id)}
                    onDragEnter={() => onDragEnter(id)}
                    onDragEnd={onDragEnd}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: hidden ? "#0d1117" : "#21262d", borderRadius: 8, cursor: "grab", opacity: hidden ? 0.5 : 1, border: "1px solid #30363d" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "#6e7681" }}>⠿</span>
                      <span style={{ fontSize: 13 }}>{w?.label}</span>
                    </div>
                    <button className="btn-icon" onClick={() => toggleWidget(id)} style={{ fontSize: 16 }}>
                      {hidden ? "👁️" : "🙈"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, color: "#8b949e", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Карточки статистики</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 }}>
              {ALL_KPI.map(k => {
                const hidden = hiddenKpi.includes(k.id);
                return (
                  <div key={k.id} onClick={() => toggleKpi(k.id)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: hidden ? "#0d1117" : "#21262d", borderRadius: 8, cursor: "pointer", opacity: hidden ? 0.5 : 1, border: "1px solid #30363d" }}>
                    <span style={{ fontSize: 13 }}>{k.icon} {k.label}</span>
                    <span style={{ fontSize: 14 }}>{hidden ? "👁️" : "🙈"}</span>
                  </div>
                );
              })}
            </div>

            <button className="btn btn-primary" onClick={() => setEditDash(false)} style={{ width: "100%" }}>Готово</button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>

        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Toolbar */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setEditDash(true)} style={{ fontSize: 12 }}>⚙️ Настроить дашборд</button>
            </div>

            {/* Виджеты */}
            <div className="widget-scroll">
              {visibleWidgets.map(id => {
                const w = renderWidget(id);
                if (!w) return null;
                return (
                  <div key={id} className="widget-drag" draggable
                    onDragStart={() => onDragStart(id)}
                    onDragEnter={() => onDragEnter(id)}
                    onDragEnd={onDragEnd}>
                    {w}
                  </div>
                );
              })}
            </div>

            {logs.length === 0 && movements.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#6e7681" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🌱</div>
                <div style={{ fontSize: 14 }}>Начните с вкладки «Склад» — внесите начальные остатки удобрений.</div>
              </div>
            )}
          </div>
        )}

        {/* ── ПОЛИВ ── */}
        {tab === "add" && (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            <div className="card">
              <div className="section-title">Внести полив</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>Дата</div>
                    <input type="date" value={logForm.date} onChange={e => setLogForm(p => ({ ...p, date: e.target.value }))} style={{ width: "100%" }} /></div>
                  <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>Литраж (л)</div>
                    <input type="number" placeholder="напр. 10" value={logForm.volume} onChange={e => setLogForm(p => ({ ...p, volume: e.target.value }))} style={{ width: "100%" }} /></div>
                  <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>PPM</div>
                    <input type="number" placeholder="напр. 800" value={logForm.ppm} onChange={e => setLogForm(p => ({ ...p, ppm: e.target.value }))} style={{ width: "100%" }} /></div>
                  <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>pH</div>
                    <input type="number" step="0.1" placeholder="напр. 6.0" value={logForm.ph} onChange={e => setLogForm(p => ({ ...p, ph: e.target.value }))} style={{ width: "100%" }} /></div>
                  <div style={{ gridColumn: "1/-1" }}><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>EC (мСм/см)</div>
                    <input type="number" step="0.01" placeholder="напр. 1.8" value={logForm.ec} onChange={e => setLogForm(p => ({ ...p, ec: e.target.value }))} style={{ width: "100%" }} /></div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 10 }}>Расход удобрений <span style={{ color: "#6e7681" }}>(спишется со склада)</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {fertilizers.map(f => (
                      <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{f.name}</span>
                        <span style={{ fontSize: 12, color: (stocks[f.id] || 0) > 0 ? "#3fb950" : "#f85149" }}>ост. {Math.max(0, stocks[f.id] || 0).toFixed(1)} {f.unit}</span>
                        <input type="number" placeholder="0" value={logForm.amounts[f.id] || ""} onChange={e => setLogForm(p => ({ ...p, amounts: { ...p.amounts, [f.id]: e.target.value } }))} style={{ width: 90 }} />
                        <span style={{ fontSize: 12, color: "#6e7681", minWidth: 24 }}>{f.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 6 }}>Заметки</div>
                  <textarea placeholder="Любые наблюдения..." value={logForm.notes} onChange={e => setLogForm(p => ({ ...p, notes: e.target.value }))} style={{ width: "100%", resize: "vertical", minHeight: 60 }} /></div>
                <button className="btn btn-primary" onClick={addLog} style={{ alignSelf: "flex-start" }}>💧 Сохранить полив</button>
              </div>
            </div>
          </div>
        )}

        {/* ── СКЛАД ── */}
        {tab === "stock" && (
          <div style={{ maxWidth: 700, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <div className="section-title">Приход / Ручной расход</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 5 }}>Удобрение</div>
                  <select value={mvForm.fertId} onChange={e => setMvForm(p => ({ ...p, fertId: Number(e.target.value) }))} style={{ width: 170 }}>
                    <option value="">— выбрать —</option>
                    {fertilizers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select></div>
                <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 5 }}>Тип</div>
                  <select value={mvForm.type} onChange={e => setMvForm(p => ({ ...p, type: e.target.value }))} style={{ width: 130 }}>
                    <option value="in">➕ Приход</option>
                    <option value="out">➖ Расход</option>
                  </select></div>
                <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 5 }}>Количество</div>
                  <input type="number" placeholder="0" value={mvForm.amount} onChange={e => setMvForm(p => ({ ...p, amount: e.target.value }))} style={{ width: 100 }} /></div>
                <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 5 }}>Дата</div>
                  <input type="date" value={mvForm.date} onChange={e => setMvForm(p => ({ ...p, date: e.target.value }))} style={{ width: 140 }} /></div>
                <div style={{ flex: 1, minWidth: 140 }}><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 5 }}>Комментарий</div>
                  <input placeholder="напр. Купил 0.5л" value={mvForm.note} onChange={e => setMvForm(p => ({ ...p, note: e.target.value }))} style={{ width: "100%" }} /></div>
                <button className={`btn ${mvForm.type === "in" ? "btn-primary" : "btn-blue"}`} onClick={addMovement}>
                  {mvForm.type === "in" ? "➕ Оприходовать" : "➖ Списать"}
                </button>
              </div>
            </div>
            {fertilizers.map(f => {
              const stock = Math.max(0, stocks[f.id] || 0);
              const mvs = fertMovements(f.id);
              const isOpen = openHistory === f.id;
              const empty = stocks[f.id] <= 0 && mvs.length > 0;
              const low = stock > 0 && stock < 50;
              return (
                <div key={f.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpenHistory(isOpen ? null : f.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 4, height: 40, borderRadius: 2, background: empty ? "#f85149" : low ? "#e3b341" : "#3fb950" }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: "#6e7681" }}>{mvs.length} операций · {f.unit}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 22, color: empty ? "#f85149" : low ? "#e3b341" : "#3fb950" }}>
                          {stock.toFixed(1)} <span style={{ fontSize: 13, fontWeight: 400, color: "#8b949e" }}>{f.unit}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#6e7681" }}>остаток</div>
                      </div>
                      <span style={{ color: "#6e7681", fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: "1px solid #21262d", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                      {mvs.length === 0 && <div style={{ fontSize: 13, color: "#6e7681" }}>Нет операций</div>}
                      {mvs.map(m => (
                        <div key={m.id} className={`mv-row ${m.type === "in" ? "mv-in" : "mv-out"}`}>
                          <span style={{ color: "#6e7681", minWidth: 70, fontSize: 11 }}>{formatDate(m.date)}</span>
                          <span>{m.type === "in" ? "➕" : "➖"}</span>
                          <span style={{ fontWeight: 600, minWidth: 70, color: m.type === "in" ? "#3fb950" : "#e3b341" }}>
                            {m.type === "in" ? "+" : "-"}{m.amount} {f.unit}
                          </span>
                          <span style={{ color: "#8b949e", fontSize: 12 }}>{m.note || "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── УДОБРЕНИЯ ── */}
        {tab === "fertilizers" && (
          <div style={{ maxWidth: 580, margin: "0 auto" }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Список удобрений</div>
                <button className="btn btn-ghost" onClick={() => setShowFertForm(!showFertForm)}>+ Добавить</button>
              </div>
              {showFertForm && (
                <div style={{ background: "#0d1117", borderRadius: 8, padding: 14, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 5 }}>Название</div>
                    <input placeholder="напр. Кальций (Ca)" value={newFert.name} onChange={e => setNewFert(p => ({ ...p, name: e.target.value }))} style={{ width: 200 }} /></div>
                  <div><div style={{ fontSize: 12, color: "#8b949e", marginBottom: 5 }}>Единица</div>
                    <select value={newFert.unit} onChange={e => setNewFert(p => ({ ...p, unit: e.target.value }))} style={{ width: 80 }}>
                      {["мл", "л", "г", "кг"].map(u => <option key={u}>{u}</option>)}
                    </select></div>
                  <button className="btn btn-primary" onClick={addFertilizer}>Добавить</button>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {fertilizers.map(f => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#0d1117", borderRadius: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{f.name}</span>
                      <span className="tag-blue" style={{ marginLeft: 10 }}>{f.unit}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 13, color: "#3fb950", fontWeight: 600 }}>ост. {Math.max(0, stocks[f.id] || 0).toFixed(1)} {f.unit}</span>
                      <button className="btn-icon" title="Удалить" onClick={() => setDeletingId(f.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
