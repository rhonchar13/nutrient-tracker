import { useState, useMemo, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const fmt = (d) => new Date(d).toLocaleDateString("ru-RU", { day:"2-digit", month:"2-digit", year:"2-digit" });
const today = () => new Date().toISOString().split("T")[0];
const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const INIT_FERTS = [
  { id: 1, name: "Азот (N)", unit: "мл" },
  { id: 2, name: "Фосфор (P)", unit: "мл" },
  { id: 3, name: "Калий (K)", unit: "мл" },
];
const ALL_WIDGETS = [
  { id: "kpi",       label: "📈 Статистика" },
  { id: "stock",     label: "🧪 Остатки склада" },
  { id: "chart_ppm", label: "⚡ График PPM" },
  { id: "chart_ph",  label: "🧪 График pH" },
  { id: "chart_ec",  label: "🔋 График EC" },
  { id: "chart_vol", label: "💧 График литража" },
  { id: "history",   label: "📋 История поливов" },
];
const ALL_KPI = [
  { id: "count",     label: "Всего поливов",            icon: "🔢" },
  { id: "last_date", label: "Последний полив — дата",   icon: "📅" },
  { id: "last_ppm",  label: "Последний полив — ΔPPM",   icon: "⚡" },
  { id: "last_ph",   label: "Последний полив — ΔpH",    icon: "🧪" },
  { id: "last_ec",   label: "Последний полив — ΔEC",    icon: "🔋" },
  { id: "last_vol",  label: "Последний полив — литраж", icon: "💧" },
];
const TABS = [
  { id: "dashboard",    label: "📊 Дашборд" },
  { id: "add",          label: "➕ Полив" },
  { id: "history_page", label: "📋 История" },
  { id: "stock",        label: "📦 Склад" },
  { id: "fertilizers",  label: "🧪 Удобрения" },
  { id: "plants",       label: "🌿 Растения" },
];
const mkPlant = (name) => ({
  id: Date.now() + Math.random(), name,
  logs: [],
});

const delta = (a, b, dec = 0) => {
  if (a == null || b == null || isNaN(Number(a)) || isNaN(Number(b))) return null;
  const d = Number(b) - Number(a);
  return { val: dec ? d.toFixed(dec) : Math.round(d), pos: d > 0, zero: Math.abs(d) < 0.001 };
};
const DeltaBadge = ({ d, unit = "" }) => {
  if (!d) return <span style={{ color: "#6e7681", fontSize: 12 }}>нет дренажа</span>;
  if (d.zero) return <span style={{ color: "#8b949e", fontSize: 16, fontWeight: 700 }}>= 0{unit}</span>;
  return <span style={{ color: d.pos ? "#f85149" : "#3fb950", fontSize: 16, fontWeight: 700 }}>
    {d.pos ? "▲ +" : "▼ "}{d.val}{unit}
  </span>;
};

export default function App() {
  const [plants, setPlants] = useState(() => {
    const saved = load("plants", [mkPlant("Растение 1")]);
    // Миграция: удаляем старые настройки дашборда из каждого растения
    const migrated = saved.map(p => {
      const { widgetOrder, hiddenWidgets, kpiOrder, hiddenKpi, fertilizers, movements, ...rest } = p;
      return rest;
    });
    // Если данные изменились — сохраняем
    if (JSON.stringify(migrated) !== JSON.stringify(saved)) {
      try { localStorage.setItem("plants", JSON.stringify(migrated)); } catch {}
    }
    return migrated;
  });
  const [plantId, setPlantId]   = useState(() => { const p = load("plants", null); return load("activePlant", p?.[0]?.id); });
  // Глобальные склад и удобрения — общие для всех растений
  const [fertilizers, setFertilizers] = useState(() => load("g_ferts", INIT_FERTS));
  const [movements,   setMovements]   = useState(() => load("g_movements", []));
  // Глобальные настройки дашборда — одни для всех растений
  const [widgetOrder,   setWidgetOrder]   = useState(() => load("g_widgetOrder",   ALL_WIDGETS.map(w => w.id)));
  const [hiddenWidgets, setHiddenWidgets] = useState(() => load("g_hiddenWidgets", []));
  const [kpiOrder,      setKpiOrder]      = useState(() => load("g_kpiOrder",      ALL_KPI.map(k => k.id)));
  const [hiddenKpi,     setHiddenKpi]     = useState(() => load("g_hiddenKpi",     []));
  const [tab, setTab]           = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saved, setSaved]       = useState(false);
  const [editDash, setEditDash] = useState(false);
  const [showPlantMgr, setShowPlantMgr] = useState(false);
  const [newPlantName, setNewPlantName] = useState("");
  const [renamingId, setRenamingId]     = useState(null);
  const [renamingVal, setRenamingVal]   = useState("");
  const [deletingPlantId, setDeletingPlantId] = useState(null);
  const [deletingFertId,  setDeletingFertId]  = useState(null);
  const [logStep, setLogStep]   = useState(1);
  const emptyLog   = { date: today(), volume: "", ppm: "", ph: "", ec: "", notes: "", amounts: {}, fertModes: {} };
  const emptyDrain = { volume: "", ppm: "", ph: "", ec: "", notes: "" };
  const [logForm,   setLogForm]   = useState(emptyLog);
  const [drainForm, setDrainForm] = useState(emptyDrain);
  const [editingLog, setEditingLog] = useState(null);
  const [mvForm,    setMvForm]    = useState({ fertId: "", type: "in", amount: "", date: today(), note: "" });
  const [newFert,   setNewFert]   = useState({ name: "", unit: "мл" });
  const [showFertForm,  setShowFertForm]  = useState(false);
  const [openHistory,   setOpenHistory]   = useState(null);
  const [historyPlantId, setHistoryPlantId] = useState(null); // для страницы истории
  const [logPlantId, setLogPlantId] = useState(null); // растение для полива
  const kpiSliderRef = useRef(null);

  const plant = plants.find(p => p.id === plantId) || plants[0];

  const updPlant = (id, fn) => {
    setPlants(prev => { const next = prev.map(p => p.id === id ? fn(p) : p); save("plants", next); return next; });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  };
  const updFerts = (next) => { setFertilizers(next); save("g_ferts", next); setSaved(true); setTimeout(()=>setSaved(false),1500); };
  const updMovements = (next) => { setMovements(next); save("g_movements", next); setSaved(true); setTimeout(()=>setSaved(false),1500); };
  const updDash = (key, setter, storageKey) => (val) => { setter(val); save(storageKey, val); };
  const setWO  = updDash("widgetOrder",   setWidgetOrder,   "g_widgetOrder");
  const setHW  = updDash("hiddenWidgets", setHiddenWidgets, "g_hiddenWidgets");
  const setKO  = updDash("kpiOrder",      setKpiOrder,      "g_kpiOrder");
  const setHK  = updDash("hiddenKpi",     setHiddenKpi,     "g_hiddenKpi");

  useEffect(() => { save("activePlant", plantId); }, [plantId]);

  const { logs = [] } = plant || {};

  const stocks = useMemo(() => {
    const m = {}; fertilizers.forEach(f => { m[f.id] = 0; });
    movements.forEach(mv => { m[mv.fertId] = (m[mv.fertId] || 0) + (mv.type === "in" ? 1 : -1) * Number(mv.amount); });
    return m;
  }, [movements, fertilizers]);

  const totalUsed = useMemo(() => {
    const m = {}; fertilizers.forEach(f => { m[f.id] = 0; });
    movements.forEach(mv => { if (mv.type === "out") m[mv.fertId] = (m[mv.fertId] || 0) + Number(mv.amount); });
    return m;
  }, [movements, fertilizers]);

  const chartData = useMemo(() => [...logs].reverse().slice(-20).map(l => ({
    date: fmt(l.date), ppm: l.ppm, ph: l.ph, ec: l.ec || 0, volume: l.volume,
    drainPpm: l.drain?.ppm, drainPh: l.drain?.ph, drainEc: l.drain?.ec, drainVolume: l.drain?.volume,
  })), [logs]);

  const lastLog = logs[0];
  const fertMvs = (fid) => movements.filter(m => m.fertId === fid).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Actions
  const addMovement = () => {
    if (!mvForm.fertId || !mvForm.amount || !mvForm.date) return;
    updMovements([...movements, { ...mvForm, id: Date.now(), amount: Number(mvForm.amount) }].sort((a,b) => new Date(b.date)-new Date(a.date)));
    setMvForm(p => ({ ...p, amount: "", note: "" }));
  };
  const goToDrain = () => { if (!logForm.date || !logForm.ppm || !logForm.ph || !logForm.volume) return; setLogStep(2); };

  // Считаем реальное количество мл для склада
  const calcActualMl = (fId) => {
    const raw = Number(logForm.amounts[fId] || 0);
    const mode = logForm.fertModes?.[fId] || "total"; // "total" = мл на весь раствор, "per_l" = мл/л
    if (mode === "per_l") return raw * Number(logForm.volume || 0);
    return raw;
  };

  const saveLog = () => {
    const vol = Number(logForm.volume || 0);
    const targetId = logPlantId || plant.id; // растение для сохранения
    const targetPlant = plants.find(p => p.id === targetId) || plant;
    const newMvs = fertilizers
      .filter(f => logForm.amounts[f.id] && Number(logForm.amounts[f.id]) > 0)
      .map(f => ({ id: Date.now()+Math.random(), fertId: f.id, type:"out", amount: calcActualMl(f.id), date: logForm.date, note: editingLog ? "Полив (ред.)" : "Полив" }));

    const newLog = {
      id: editingLog || Date.now(),
      date: logForm.date, volume: vol,
      ppm: Number(logForm.ppm), ph: Number(logForm.ph), ec: Number(logForm.ec)||0,
      notes: logForm.notes,
      amounts: Object.fromEntries(fertilizers.map(f => [f.id, calcActualMl(f.id)])),
      fertModes: logForm.fertModes || {},
      fertRaw: logForm.amounts,
      drain: drainForm.volume ? { volume: Number(drainForm.volume), ppm: Number(drainForm.ppm), ph: Number(drainForm.ph), ec: Number(drainForm.ec)||0, notes: drainForm.notes } : null,
    };

    let updMvs = movements;
    if (editingLog) {
      const oldLog = targetPlant.logs.find(l => l.id === editingLog);
      if (oldLog) updMvs = updMvs.filter(m => !(m.note?.includes("Полив") && m.date === oldLog.date));
    }
    updMovements([...updMvs, ...newMvs].sort((a,b) => new Date(b.date)-new Date(a.date)));

    updPlant(targetId, p => {
      const updLogs = editingLog
        ? p.logs.map(l => l.id === editingLog ? newLog : l).sort((a,b)=>new Date(b.date)-new Date(a.date))
        : [newLog, ...p.logs].sort((a,b)=>new Date(b.date)-new Date(a.date));
      return { ...p, logs: updLogs };
    });
    setLogForm(emptyLog); setDrainForm(emptyDrain); setLogStep(1); setEditingLog(null); setLogPlantId(null);
  };

  const startEditLog = (log, targetPlantId) => {
    setEditingLog(log.id);
    setLogPlantId(targetPlantId || plant.id);
    setLogForm({
      date: log.date, volume: log.volume, ppm: log.ppm, ph: log.ph, ec: log.ec || "",
      notes: log.notes || "", amounts: log.fertRaw || log.amounts || {}, fertModes: log.fertModes || {},
    });
    setDrainForm(log.drain ? { volume: log.drain.volume, ppm: log.drain.ppm, ph: log.drain.ph, ec: log.drain.ec || "", notes: log.drain.notes || "" } : emptyDrain);
    setLogStep(1); setTab("add");
  };

  const cancelEdit = () => { setEditingLog(null); setLogForm(emptyLog); setDrainForm(emptyDrain); setLogStep(1); setLogPlantId(null); };
  const deleteLog = (logId, targetPlantId) => {
    updPlant(targetPlantId || plant.id, p => ({ ...p, logs: p.logs.filter(l => l.id !== logId) }));
  };
  const addFertilizer = () => {
    if (!newFert.name) return;
    updFerts([...fertilizers, { id: Date.now(), ...newFert }]);
    setNewFert({ name:"", unit:"мл" }); setShowFertForm(false);
  };
  const deleteFertilizer = (id) => {
    updFerts(fertilizers.filter(f => f.id !== id));
    updMovements(movements.filter(m => m.fertId !== id));
    setDeletingFertId(null);
  };
  const toggleWidget = (id) => setHW(hiddenWidgets.includes(id) ? hiddenWidgets.filter(w=>w!==id) : [...hiddenWidgets, id]);
  const toggleKpi    = (id) => setHK(hiddenKpi.includes(id) ? hiddenKpi.filter(k=>k!==id) : [...hiddenKpi, id]);
  const moveWidget = (order, from, to, key) => {
    const o = [...order]; o.splice(from, 1); o.splice(to, 0, order[from]);
    if (key === "widgetOrder") setWO(o);
    else setKO(o);
  };
  const addPlant = () => {
    if (!newPlantName.trim()) return;
    const p = mkPlant(newPlantName.trim());
    const next = [...plants, p]; setPlants(next); save("plants", next);
    setPlantId(p.id); save("activePlant", p.id); setNewPlantName(""); setShowPlantMgr(false);
  };
  const renamePlant = () => {
    if (!renamingVal.trim()) return;
    setPlants(prev => { const n = prev.map(p => p.id===renamingId ? {...p, name: renamingVal.trim()} : p); save("plants",n); return n; });
    setRenamingId(null); setRenamingVal("");
  };
  const deletePlant = (id) => {
    const next = plants.filter(p=>p.id!==id); setPlants(next); save("plants",next);
    if (plantId===id) { setPlantId(next[0]?.id); save("activePlant", next[0]?.id); }
    setDeletingPlantId(null);
  };
  const navigate = (id) => { setTab(id); setSidebarOpen(false); };

  // KPI Card renderer
  const renderKpiCard = (kid) => {
    const L = lastLog;
    const prev = logs[1]; // предпоследний полив для тренда

    // Тренд: сравниваем последний и предыдущий по нужному полю
    const trend = (getVal) => {
      if (!L || !prev) return null;
      const a = getVal(prev), b = getVal(L);
      if (a == null || b == null || isNaN(a) || isNaN(b)) return null;
      const d = Number(b) - Number(a);
      if (Math.abs(d) < 0.001) return { dir: 0 };
      return { dir: d > 0 ? 1 : -1, val: Math.abs(d) };
    };

    const TrendArrow = ({ t, invert = false }) => {
      if (!t || t.dir === 0) return <span style={{ fontSize:11, color:"#6e7681" }}>→ без изменений</span>;
      const up = t.dir === 1;
      // invert=true значит рост — плохо (например EC/PPM в дренаже выше нормы)
      const good = invert ? !up : up;
      return (
        <span style={{ fontSize:12, color: good ? "#3fb950" : "#f85149", fontWeight:600 }}>
          {up ? "↑" : "↓"} vs предыд.
        </span>
      );
    };

    // Общий стиль карточки
    const card = (content) => (
      <div key={kid} style={{
        minWidth: 170, userSelect:"none",
        background:"#080d13",
        border:"1px solid #1c2128",
        borderRadius:14, padding:"16px 18px",
        display:"flex", flexDirection:"column", gap:6,
      }}>{content}</div>
    );

    switch(kid) {
      case "count": return card(<>
        <div style={{ fontSize:10, fontWeight:700, color:"#6e7681", letterSpacing:1.5, textTransform:"uppercase" }}>Поливов всего</div>
        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:36, fontWeight:700, color:"#e6edf3", lineHeight:1 }}>{logs.length}</div>
        <div style={{ fontSize:11, color:"#6e7681" }}>{L ? `посл. ${fmt(L.date)}` : "нет данных"}</div>
      </>);

      case "last_date": return card(<>
        <div style={{ fontSize:10, fontWeight:700, color:"#6e7681", letterSpacing:1.5, textTransform:"uppercase" }}>Последний полив</div>
        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:24, fontWeight:700, color:"#e6edf3", lineHeight:1.1 }}>{L ? fmt(L.date) : "—"}</div>
        <div style={{ fontSize:12, color:"#58a6ff" }}>{L ? `${L.volume} л` : ""}</div>
        {L && prev && (() => {
          const days = Math.round((new Date(L.date) - new Date(prev.date)) / 86400000);
          return <div style={{ fontSize:11, color:"#6e7681" }}>интервал: {days} дн.</div>;
        })()}
      </>);

      case "last_ppm": {
        const d = L?.drain ? delta(L.ppm, L.drain.ppm) : null;
        const t = trend(l => l.ppm);
        return card(<>
          <div style={{ fontSize:10, fontWeight:700, color:"#6e7681", letterSpacing:1.5, textTransform:"uppercase" }}>PPM выход ← вход</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
            <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:28, fontWeight:700, color:"#58a6ff", lineHeight:1 }}>{L?.drain?.ppm ?? "—"}</span>
            {L?.ppm && <span style={{ fontSize:13, color:"#6e7681" }}>← {L.ppm}</span>}
          </div>
          <div>{d && <DeltaBadge d={d} unit=" ppm" />}</div>
          <TrendArrow t={t} />
        </>);
      }

      case "last_ph": {
        const d = L?.drain ? delta(L.ph, L.drain.ph, 1) : null;
        const t = trend(l => l.ph);
        return card(<>
          <div style={{ fontSize:10, fontWeight:700, color:"#6e7681", letterSpacing:1.5, textTransform:"uppercase" }}>pH выход ← вход</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
            <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:28, fontWeight:700, color:"#e3b341", lineHeight:1 }}>{L?.drain?.ph ?? "—"}</span>
            {L?.ph && <span style={{ fontSize:13, color:"#6e7681" }}>← {L.ph}</span>}
          </div>
          <div>{d && <DeltaBadge d={d} />}</div>
          <TrendArrow t={t} />
        </>);
      }

      case "last_ec": {
        const d = L?.drain && L.ec && L.drain?.ec ? delta(L.ec, L.drain.ec, 2) : null;
        const t = trend(l => l.ec);
        return card(<>
          <div style={{ fontSize:10, fontWeight:700, color:"#6e7681", letterSpacing:1.5, textTransform:"uppercase" }}>EC выход ← вход</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
            <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:28, fontWeight:700, color:"#bc8cff", lineHeight:1 }}>{L?.drain?.ec ?? "—"}</span>
            {L?.ec && <span style={{ fontSize:13, color:"#6e7681" }}>← {L.ec}</span>}
          </div>
          <div>{d && <DeltaBadge d={d} />}</div>
          <TrendArrow t={t} invert />
        </>);
      }

      case "last_vol": {
        const d = L?.drain?.volume ? delta(L.volume, L.drain.volume, 1) : null;
        const t = trend(l => l.volume);
        return card(<>
          <div style={{ fontSize:10, fontWeight:700, color:"#6e7681", letterSpacing:1.5, textTransform:"uppercase" }}>Литраж выход ← вход</div>
          <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
            <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:28, fontWeight:700, color:"#3fb950", lineHeight:1 }}>{L?.drain?.volume ?? "—"}</span>
            <span style={{ fontSize:13, color:"#6e7681" }}>л {L?.volume ? `← ${L.volume} л` : ""}</span>
          </div>
          <div>{d && <DeltaBadge d={d} unit=" л" />}</div>
          <TrendArrow t={t} />
        </>);
      }

      default: return null;
    }
  };

  // Widget renderer
  const renderWidget = (id) => {
    const tt = { contentStyle: { background:"#161b22", border:"1px solid #30363d", borderRadius:8, color:"#e6edf3" } };
    switch(id) {
      case "kpi": {
        const visible = kpiOrder.filter(k => !hiddenKpi.includes(k));
        return (
          <div key="kpi">
            <div style={{ overflowX:"auto", paddingBottom:8, WebkitOverflowScrolling:"touch", cursor:"grab" }}
              ref={kpiSliderRef}
              onMouseDown={e=>{const el=kpiSliderRef.current;el._sx=e.pageX-el.offsetLeft;el._sl=el.scrollLeft;el._dn=true;}}
              onMouseLeave={()=>{if(kpiSliderRef.current)kpiSliderRef.current._dn=false;}}
              onMouseUp={()=>{if(kpiSliderRef.current)kpiSliderRef.current._dn=false;}}
              onMouseMove={e=>{const el=kpiSliderRef.current;if(!el||!el._dn)return;e.preventDefault();el.scrollLeft=el._sl-(e.pageX-el.offsetLeft-el._sx);}}
              onTouchStart={e=>{const el=kpiSliderRef.current;el._sx=e.touches[0].pageX;el._sl=el.scrollLeft;}}
              onTouchMove={e=>{const el=kpiSliderRef.current;if(!el)return;el.scrollLeft=el._sl-(e.touches[0].pageX-el._sx);}}
            >
              <div style={{ display:"flex", gap:14, width:"max-content", paddingRight:4 }}>
                {visible.map(kid => renderKpiCard(kid))}
                {visible.length===0 && <div style={{ fontSize:13, color:"#6e7681", padding:"20px 0" }}>Все карточки скрыты.</div>}
              </div>
            </div>
          </div>
        );
      }
      case "stock": return (
        <div key="stock" className="card">
          <div className="section-title">Остатки на складе</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:12 }}>
            {fertilizers.map(f => {
              const s = stocks[f.id]||0; const empty=s<=0; const low=s>0&&s<50;
              return (
                <div key={f.id} style={{ background:"#0d1117", borderRadius:8, padding:"14px 16px", borderLeft:`3px solid ${empty?"#f85149":low?"#e3b341":"#3fb950"}` }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:6 }}>{f.name}</div>
                  <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:22, fontWeight:700, color:empty?"#f85149":low?"#e3b341":"#3fb950", marginBottom:4 }}>
                    {Math.max(0,s).toFixed(1)} <span style={{ fontSize:13, fontWeight:400 }}>{f.unit}</span>
                  </div>
                  <div style={{ fontSize:11, color:"#6e7681" }}>Использовано: {totalUsed[f.id]||0} {f.unit}</div>
                  {empty && <div className="tag-red" style={{ marginTop:6, display:"inline-block" }}>Закончилось!</div>}
                  {low&&!empty && <div className="tag-yellow" style={{ marginTop:6, display:"inline-block" }}>Мало</div>}
                </div>
              );
            })}
          </div>
        </div>
      );
      case "chart_ppm": return logs.length>0 ? (
        <div key="chart_ppm" className="card">
          <div className="section-title">⚡ PPM — вход и дренаж</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d"/>
              <XAxis dataKey="date" tick={{fill:"#6e7681",fontSize:11}}/>
              <YAxis tick={{fill:"#6e7681",fontSize:11}}/>
              <Tooltip {...tt}/>
              <Bar dataKey="ppm" fill="#58a6ff" radius={[4,4,0,0]} name="Вход PPM"/>
              <Bar dataKey="drainPpm" fill="#1f6feb" radius={[4,4,0,0]} name="Дренаж PPM"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null;
      case "chart_ph": return logs.length>0 ? (
        <div key="chart_ph" className="card">
          <div className="section-title">🧪 pH — вход и дренаж</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d"/>
              <XAxis dataKey="date" tick={{fill:"#6e7681",fontSize:11}}/>
              <YAxis domain={[4,9]} tick={{fill:"#6e7681",fontSize:11}}/>
              <Tooltip {...tt}/>
              <ReferenceLine y={5.5} stroke="#3fb950" strokeDasharray="4 4"/>
              <ReferenceLine y={6.5} stroke="#3fb950" strokeDasharray="4 4"/>
              <Bar dataKey="ph" fill="#e3b341" radius={[4,4,0,0]} name="Вход pH"/>
              <Bar dataKey="drainPh" fill="#b08800" radius={[4,4,0,0]} name="Дренаж pH"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null;
      case "chart_ec": return logs.length>0 ? (
        <div key="chart_ec" className="card">
          <div className="section-title">🔋 EC — вход и дренаж</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d"/>
              <XAxis dataKey="date" tick={{fill:"#6e7681",fontSize:11}}/>
              <YAxis tick={{fill:"#6e7681",fontSize:11}}/>
              <Tooltip {...tt}/>
              <Bar dataKey="ec" fill="#bc8cff" radius={[4,4,0,0]} name="Вход EC"/>
              <Bar dataKey="drainEc" fill="#7c3aed" radius={[4,4,0,0]} name="Дренаж EC"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null;
      case "chart_vol": return logs.length>0 ? (
        <div key="chart_vol" className="card">
          <div className="section-title">💧 Литраж — вход и дренаж</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d"/>
              <XAxis dataKey="date" tick={{fill:"#6e7681",fontSize:11}}/>
              <YAxis tick={{fill:"#6e7681",fontSize:11}}/>
              <Tooltip {...tt}/>
              <Bar dataKey="volume" fill="#238636" radius={[4,4,0,0]} name="Вход л"/>
              <Bar dataKey="drainVolume" fill="#0d4429" radius={[4,4,0,0]} name="Дренаж л"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null;
      case "history": return logs.length>0 ? (
        <div key="history" className="card">
          <div className="section-title">📋 История поливов</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {logs.slice(0,10).map(log => (
              <div key={log.id} style={{ background:"#0d1117", borderRadius:8, overflow:"hidden" }}>
                {/* Заголовок строки */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 12px" }}>
                  <span style={{ fontSize:11, color:"#6e7681", fontWeight:600, minWidth:65 }}>{fmt(log.date)}</span>
                  <div style={{ display:"flex", gap:8 }}>
                    <button style={{ cursor:"pointer", background:"transparent", border:"none", fontSize:14, padding:"0 2px", lineHeight:1 }} onClick={()=>startEditLog(log)}>✍️</button>
                    <button style={{ cursor:"pointer", background:"transparent", border:"none", fontSize:14, padding:"0 2px", lineHeight:1 }} onClick={()=>{ if(window.confirm("Удалить этот полив?")) deleteLog(log.id); }}>❌</button>
                  </div>
                </div>
                {/* Данные — сетка */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", padding:"2px 12px 7px", gap:"3px 0" }}>
                  {/* Заголовки */}
                  <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>Литраж</div>
                  <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>PPM</div>
                  <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>pH</div>
                  <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>EC</div>
                  {/* Вход */}
                  <div style={{ fontSize:13, fontWeight:600, color:"#58a6ff" }}>{log.volume}л</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#e6edf3" }}>{log.ppm}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#e6edf3" }}>{log.ph}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#bc8cff" }}>{log.ec||"—"}</div>
                  {/* Дренаж */}
                  {log.drain && <>
                    <div style={{ fontSize:11, color:"#3fb950" }}>↓ {log.drain.volume}л</div>
                    <div style={{ fontSize:11, color:"#3fb950" }}>↓ {log.drain.ppm}</div>
                    <div style={{ fontSize:11, color:"#3fb950" }}>↓ {log.drain.ph}</div>
                    <div style={{ fontSize:11, color:"#3fb950" }}>↓ {log.drain.ec||"—"}</div>
                  </>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null;
      default: return null;
    }
  };

  if (!plant) return <div style={{ color:"#e6edf3", padding:40 }}>Загрузка...</div>;
  const visibleWidgets = widgetOrder.filter(id => !hiddenWidgets.includes(id));

  return (
    <div style={{ minHeight:"100vh", background:"#0d1117", color:"#e6edf3", fontFamily:"'IBM Plex Mono',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#161b22}::-webkit-scrollbar-thumb{background:#30363d;border-radius:3px}
        input,select,textarea{background:#161b22;border:1px solid #30363d;color:#e6edf3;border-radius:6px;padding:8px 12px;font-family:inherit;font-size:13px;outline:none;transition:border-color .2s}
        input:focus,select:focus,textarea:focus{border-color:#58a6ff}
        .btn{cursor:pointer;border:none;border-radius:6px;padding:9px 18px;font-family:inherit;font-size:13px;font-weight:600;transition:all .2s}
        .btn-primary{background:#238636;color:#fff}.btn-primary:hover{background:#2ea043}
        .btn-blue{background:#1f6feb;color:#fff}.btn-blue:hover{background:#388bfd}
        .btn-red{background:#6e1010;color:#ffa198;border:1px solid #6e1010}.btn-red:hover{background:#8b1a1a}
        .btn-ghost{background:transparent;color:#8b949e;border:1px solid #30363d}.btn-ghost:hover{color:#e6edf3;border-color:#8b949e}
        .btn-icon{cursor:pointer;background:transparent;border:none;padding:4px 8px;border-radius:5px;font-size:15px;color:#6e7681;transition:all .15s}
        .btn-icon:hover{background:#3d0000;color:#f85149}
        .card{background:#161b22;border:1px solid #21262d;border-radius:12px;padding:20px}
        .tag-yellow{background:#2d1f00;color:#e3b341;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600}
        .tag-red{background:#3d0000;color:#f85149;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600}
        .tag-blue{background:#0d2149;color:#58a6ff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:600}
        .section-title{font-size:11px;font-weight:600;color:#8b949e;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px}
        .sidebar{position:fixed;top:0;right:0;height:100vh;width:220px;background:#161b22;border-left:1px solid #21262d;z-index:200;display:flex;flex-direction:column;padding:20px 14px;gap:6px;transform:translateX(100%);transition:transform .25s ease}
        .sidebar.open{transform:translateX(0)}
        .overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:190;display:none}
        .overlay.open{display:block}
        .sidebar-btn{cursor:pointer;padding:10px 14px;border-radius:8px;border:none;font-family:inherit;font-size:14px;font-weight:500;text-align:left;transition:all .15s;background:transparent;color:#8b949e;width:100%}
        .sidebar-btn:hover{background:#21262d;color:#e6edf3}
        .sidebar-btn.active{background:#21262d;color:#58a6ff}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;display:flex;align-items:flex-end;justify-content:center}
        @media(min-width:600px){.modal-overlay{align-items:center}}
        .modal{background:#161b22;border:1px solid #30363d;border-radius:12px 12px 0 0;padding:24px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto;-webkit-overflow-scrolling:touch}
        @media(min-width:600px){.modal{border-radius:12px}}
        .save-toast{position:fixed;bottom:24px;right:24px;background:#0d4429;color:#3fb950;border:1px solid #238636;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:600;z-index:400;opacity:0;transition:opacity .3s;pointer-events:none}
        .save-toast.show{opacity:1}
        .plant-tab{cursor:pointer;padding:6px 14px;border-radius:20px;border:1px solid #30363d;font-family:inherit;font-size:13px;font-weight:500;transition:all .15s;white-space:nowrap}
        .plant-tab.active{background:#238636;color:#fff;border-color:#238636}
        .plant-tab.inactive{background:transparent;color:#8b949e}
        .plant-tab.inactive:hover{color:#e6edf3;border-color:#8b949e}
        .step-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
        .mv-row{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:7px;font-size:12px}
        .mv-in{background:#0d2a0d;border-left:3px solid #3fb950}
        .mv-out{background:#1a0d00;border-left:3px solid #e3b341}
      `}</style>

      <div className={`save-toast ${saved?"show":""}`}>✓ Сохранено</div>
      <div className={`overlay ${sidebarOpen?"open":""}`} onClick={()=>setSidebarOpen(false)}/>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen?"open":""}`}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:14 }}>Меню</span>
          <button className="btn-icon" style={{ fontSize:18 }} onClick={()=>setSidebarOpen(false)}>✕</button>
        </div>
        {TABS.map(t => <button key={t.id} className={`sidebar-btn ${tab===t.id?"active":""}`} onClick={()=>navigate(t.id)}>{t.label}</button>)}
        <div style={{ marginTop:"auto", paddingTop:16, borderTop:"1px solid #21262d", fontSize:11, color:"#6e7681" }}>💾 Автосохранение</div>
      </div>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #21262d", padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0d1117", position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={()=>setTab("dashboard")}>
          <div style={{ width:28, height:28, background:"linear-gradient(135deg,#238636,#56d364)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>🌱</div>
          <span style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:15 }}>NutrientLog</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:12, color:"#8b949e" }}>{plant.name}</span>
          <button onClick={()=>setSidebarOpen(true)} style={{ cursor:"pointer", background:"#21262d", border:"1px solid #30363d", borderRadius:8, padding:"7px 12px", color:"#e6edf3", display:"flex", flexDirection:"column", gap:4, alignItems:"center" }}>
            <span style={{ display:"block", width:18, height:2, background:"#e6edf3", borderRadius:1 }}/>
            <span style={{ display:"block", width:18, height:2, background:"#e6edf3", borderRadius:1 }}/>
            <span style={{ display:"block", width:18, height:2, background:"#e6edf3", borderRadius:1 }}/>
          </button>
        </div>
      </div>

      {/* Вкладки растений — только на дашборде */}
      {tab==="dashboard" && (
        <div style={{ padding:"8px 20px", borderBottom:"1px solid #21262d", overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
          <div style={{ display:"flex", gap:8, width:"max-content" }}>
            {plants.map(p => (
              <button key={p.id} className={`plant-tab ${p.id===plantId?"active":"inactive"}`}
                onClick={()=>{ setPlantId(p.id); save("activePlant",p.id); }}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {deletingFertId && (
        <div className="modal-overlay"><div className="modal">
          <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Удалить удобрение?</div>
          <div style={{ fontSize:13, color:"#8b949e", marginBottom:20 }}>Все записи движений также удалятся.</div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn btn-red" onClick={()=>deleteFertilizer(deletingFertId)}>Удалить</button>
            <button className="btn btn-ghost" onClick={()=>setDeletingFertId(null)}>Отмена</button>
          </div>
        </div></div>
      )}
      {deletingPlantId && (
        <div className="modal-overlay"><div className="modal">
          <div style={{ fontSize:15, fontWeight:600, marginBottom:10 }}>Удалить растение?</div>
          <div style={{ fontSize:13, color:"#8b949e", marginBottom:20 }}>Все данные будут удалены. Нельзя отменить.</div>
          <div style={{ display:"flex", gap:10 }}>
            <button className="btn btn-red" onClick={()=>deletePlant(deletingPlantId)}>Удалить</button>
            <button className="btn btn-ghost" onClick={()=>setDeletingPlantId(null)}>Отмена</button>
          </div>
        </div></div>
      )}
      {editDash && (
        <div className="modal-overlay"><div className="modal">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div style={{ fontSize:15, fontWeight:600 }}>⚙️ Настройка дашборда</div>
            <button className="btn-icon" style={{ fontSize:18 }} onClick={()=>setEditDash(false)}>✕</button>
          </div>
          <div style={{ fontSize:11, fontWeight:600, color:"#8b949e", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Разделы</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
            {widgetOrder.map((wid,i,arr) => {
              const w = ALL_WIDGETS.find(x=>x.id===wid); const hidden=hiddenWidgets.includes(wid);
              return (
                <div key={wid} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:hidden?"#0d1117":"#21262d", borderRadius:8, opacity:hidden?0.5:1, border:"1px solid #30363d" }}>
                  <span style={{ fontSize:13, flex:1 }}>{w?.label}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <button className="btn-icon" style={{ fontSize:14, padding:"2px 6px" }} onClick={()=>i>0&&moveWidget(arr,i,i-1,"widgetOrder")} disabled={i===0}>▲</button>
                    <button className="btn-icon" style={{ fontSize:14, padding:"2px 6px" }} onClick={()=>i<arr.length-1&&moveWidget(arr,i,i+1,"widgetOrder")} disabled={i===arr.length-1}>▼</button>
                    <button className="btn-icon" onClick={()=>toggleWidget(wid)} style={{ fontSize:15 }}>{hidden?"👁️":"🙈"}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize:11, fontWeight:600, color:"#8b949e", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Карточки статистики</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
            {kpiOrder.map((kid,i,arr) => {
              const k = ALL_KPI.find(x=>x.id===kid); const hidden=hiddenKpi.includes(kid);
              return (
                <div key={kid} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 14px", background:hidden?"#0d1117":"#21262d", borderRadius:8, opacity:hidden?0.5:1, border:"1px solid #30363d" }}>
                  <span style={{ fontSize:13, flex:1 }}>{k?.icon} {k?.label}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <button className="btn-icon" style={{ fontSize:14, padding:"2px 6px" }} onClick={()=>i>0&&moveWidget(arr,i,i-1,"kpiOrder")} disabled={i===0}>▲</button>
                    <button className="btn-icon" style={{ fontSize:14, padding:"2px 6px" }} onClick={()=>i<arr.length-1&&moveWidget(arr,i,i+1,"kpiOrder")} disabled={i===arr.length-1}>▼</button>
                    <button className="btn-icon" onClick={()=>toggleKpi(kid)} style={{ fontSize:15 }}>{hidden?"👁️":"🙈"}</button>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn btn-primary" onClick={()=>setEditDash(false)} style={{ width:"100%" }}>Готово</button>
        </div></div>
      )}

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"20px 16px" }}>

        {/* DASHBOARD */}
        {tab==="dashboard" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button className="btn btn-ghost" onClick={()=>setEditDash(true)} style={{ fontSize:12 }}>⚙️ Настроить дашборд</button>
            </div>
            {visibleWidgets.map(id => { const w=renderWidget(id); return w ? <div key={id}>{w}</div> : null; })}
            {!logs.length && !movements.length && (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#6e7681" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🌱</div>
                <div style={{ fontSize:14 }}>Начните со вкладки «Склад» — внесите начальные остатки.</div>
              </div>
            )}
          </div>
        )}

        {/* ПОЛИВ */}
        {tab==="add" && (
          <div style={{ maxWidth:560, margin:"0 auto" }}>
            {editingLog && (
              <div style={{ background:"#2d1f00", border:"1px solid #e3b341", borderRadius:8, padding:"10px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:13, color:"#e3b341" }}>✏️ Режим редактирования полива</span>
                <button className="btn-icon" onClick={cancelEdit} style={{ color:"#e3b341" }}>✕ Отмена</button>
              </div>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
              <div className="step-dot" style={{ background: logStep===1?"#238636":"#0d4429", color: logStep===1?"#fff":"#3fb950" }}>1</div>
              <div style={{ flex:1, height:2, background: logStep===2?"#238636":"#21262d" }}/>
              <div className="step-dot" style={{ background: logStep===2?"#238636":"#21262d", color: logStep===2?"#fff":"#6e7681" }}>2</div>
              <span style={{ fontSize:12, color:"#8b949e", marginLeft:8 }}>{logStep===1?"Вход раствора":"Дренаж (выход)"}</span>
            </div>
            {logStep===1 && (
              <div className="card">
                <div className="section-title">💧 Вход раствора</div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                  {/* Выбор растения */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>🌱 Растение</span>
                    <select value={logPlantId || plant.id} onChange={e=>setLogPlantId(Number(e.target.value))}
                      style={{ flex:1, maxWidth:220, textAlign:"right" }}>
                      {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  {/* Дата */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>📅 Дата</span>
                    <input type="date" value={logForm.date} onChange={e=>setLogForm(p=>({...p,date:e.target.value}))} style={{ flex:1, maxWidth:180, textAlign:"right" }}/>
                  </div>

                  {/* Литраж */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>💧 Литраж</span>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <input type="number" placeholder="0" value={logForm.volume} onChange={e=>setLogForm(p=>({...p,volume:e.target.value}))} style={{ width:90, textAlign:"right" }}/>
                      <span style={{ fontSize:12, color:"#6e7681" }}>л</span>
                    </div>
                  </div>

                  {/* PPM */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>⚡ PPM</span>
                    <input type="number" placeholder="800" value={logForm.ppm} onChange={e=>setLogForm(p=>({...p,ppm:e.target.value}))} style={{ width:110, textAlign:"right" }}/>
                  </div>

                  {/* pH */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>🧪 pH</span>
                    <input type="number" step="0.1" placeholder="6.0" value={logForm.ph} onChange={e=>setLogForm(p=>({...p,ph:e.target.value}))} style={{ width:110, textAlign:"right" }}/>
                  </div>

                  {/* EC */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>🔋 EC</span>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <input type="number" step="0.01" placeholder="1.8" value={logForm.ec} onChange={e=>setLogForm(p=>({...p,ec:e.target.value}))} style={{ width:90, textAlign:"right" }}/>
                      <span style={{ fontSize:12, color:"#6e7681" }}>мСм/см</span>
                    </div>
                  </div>

                  {/* Удобрения */}
                  <div style={{ fontSize:11, fontWeight:600, color:"#8b949e", letterSpacing:1, textTransform:"uppercase", marginTop:4 }}>Удобрения</div>
                  <div style={{ fontSize:11, color:"#6e7681", marginTop:-8, marginBottom:4 }}>
                    Переключи режим: <b style={{ color:"#58a6ff" }}>мл/л</b> = на 1 литр раствора · <b style={{ color:"#3fb950" }}>мл</b> = на весь объём
                  </div>
                  {fertilizers.map(f => {
                    const mode = logForm.fertModes?.[f.id] || "total";
                    const raw = Number(logForm.amounts[f.id] || 0);
                    const actualMl = mode === "per_l" ? raw * Number(logForm.volume || 0) : raw;
                    const stockOk = (stocks[f.id]||0) > 0;
                    return (
                      <div key={f.id} style={{ background:"#0d1117", borderRadius:8, padding:"10px 14px" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                          <span style={{ fontSize:13, fontWeight:600 }}>{f.name}</span>
                          <span style={{ fontSize:11, color: stockOk?"#3fb950":"#f85149" }}>
                            склад: {Math.max(0,stocks[f.id]||0).toFixed(1)} {f.unit}
                          </span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          {/* Переключатель режима */}
                          <div style={{ display:"flex", borderRadius:4, overflow:"hidden", border:"1px solid #30363d", flexShrink:0 }}>
                            <button onClick={()=>setLogForm(p=>({...p,fertModes:{...p.fertModes,[f.id]:"per_l"}}))}
                              style={{ padding:"4px 8px", fontSize:10, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit", letterSpacing:0.3,
                                background: mode==="per_l"?"#1f6feb":"transparent", color: mode==="per_l"?"#fff":"#6e7681" }}>
                              мл/л
                            </button>
                            <div style={{ width:1, background:"#30363d" }}/>
                            <button onClick={()=>setLogForm(p=>({...p,fertModes:{...p.fertModes,[f.id]:"total"}}))}
                              style={{ padding:"4px 8px", fontSize:10, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit", letterSpacing:0.3,
                                background: mode==="total"?"#238636":"transparent", color: mode==="total"?"#fff":"#6e7681" }}>
                              мл
                            </button>
                          </div>
                          <input type="number" placeholder="0" value={logForm.amounts[f.id]||""}
                            onChange={e=>setLogForm(p=>({...p,amounts:{...p.amounts,[f.id]:e.target.value}}))}
                            style={{ flex:1, textAlign:"right" }}/>
                          <span style={{ fontSize:12, color:"#6e7681", minWidth:30 }}>{mode==="per_l"?"мл/л":"мл"}</span>
                        </div>
                        {mode==="per_l" && raw > 0 && logForm.volume && (
                          <div style={{ fontSize:11, color:"#8b949e", marginTop:6 }}>
                            → итого спишется: <span style={{ color:"#58a6ff", fontWeight:600 }}>{actualMl.toFixed(1)} мл</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Заметки */}
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <span style={{ fontSize:12, color:"#8b949e" }}>Заметки</span>
                    <textarea placeholder="Наблюдения..." value={logForm.notes} onChange={e=>setLogForm(p=>({...p,notes:e.target.value}))} style={{ width:"100%", resize:"vertical", minHeight:60 }}/>
                  </div>

                  <div style={{ display:"flex", gap:10 }}>
                    <button className="btn btn-primary" onClick={goToDrain}>Далее: дренаж →</button>
                    <button className="btn btn-ghost" onClick={saveLog}>{editingLog?"💾 Сохранить":"Сохранить без дренажа"}</button>
                  </div>
                </div>
              </div>
            )}
            {logStep===2 && (
              <div className="card">
                <div className="section-title">🔽 Дренаж (выход)</div>
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>💧 Литраж</span>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <input type="number" placeholder="0" value={drainForm.volume} onChange={e=>setDrainForm(p=>({...p,volume:e.target.value}))} style={{ width:90, textAlign:"right" }}/>
                      <span style={{ fontSize:12, color:"#6e7681" }}>л</span>
                    </div>
                  </div>

                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>⚡ PPM</span>
                    <input type="number" placeholder="1200" value={drainForm.ppm} onChange={e=>setDrainForm(p=>({...p,ppm:e.target.value}))} style={{ width:110, textAlign:"right" }}/>
                  </div>

                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>🧪 pH</span>
                    <input type="number" step="0.1" placeholder="6.5" value={drainForm.ph} onChange={e=>setDrainForm(p=>({...p,ph:e.target.value}))} style={{ width:110, textAlign:"right" }}/>
                  </div>

                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>🔋 EC</span>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <input type="number" step="0.01" placeholder="2.1" value={drainForm.ec} onChange={e=>setDrainForm(p=>({...p,ec:e.target.value}))} style={{ width:90, textAlign:"right" }}/>
                      <span style={{ fontSize:12, color:"#6e7681" }}>мСм/см</span>
                    </div>
                  </div>

                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <span style={{ fontSize:12, color:"#8b949e" }}>Заметки</span>
                    <textarea placeholder="Наблюдения..." value={drainForm.notes} onChange={e=>setDrainForm(p=>({...p,notes:e.target.value}))} style={{ width:"100%", resize:"vertical", minHeight:60 }}/>
                  </div>

                  <div style={{ display:"flex", gap:10 }}>
                    <button className="btn btn-primary" onClick={saveLog}>✓ Сохранить полив</button>
                    <button className="btn btn-ghost" onClick={()=>setLogStep(1)}>← Назад</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* СКЛАД */}
        {tab==="stock" && (
          <div style={{ maxWidth:600, margin:"0 auto", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Форма прихода/расхода */}
            <div className="card">
              <div className="section-title">Новая операция</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                  <span style={{ fontSize:13, color:"#8b949e", minWidth:100 }}>📦 Удобрение</span>
                  <select value={mvForm.fertId} onChange={e=>setMvForm(p=>({...p,fertId:Number(e.target.value)}))} style={{ flex:1, maxWidth:220, textAlign:"right" }}>
                    <option value="">— выбрать —</option>
                    {fertilizers.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                  <span style={{ fontSize:13, color:"#8b949e", minWidth:100 }}>↕️ Тип</span>
                  <div style={{ display:"flex", borderRadius:4, overflow:"hidden", border:"1px solid #30363d" }}>
                    <button onClick={()=>setMvForm(p=>({...p,type:"in"}))}
                      style={{ padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer", border:"none", fontFamily:"inherit",
                        background: mvForm.type==="in"?"#238636":"transparent", color: mvForm.type==="in"?"#fff":"#6e7681" }}>
                      ➕ Приход
                    </button>
                    <div style={{ width:1, background:"#30363d" }}/>
                    <button onClick={()=>setMvForm(p=>({...p,type:"out"}))}
                      style={{ padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer", border:"none", fontFamily:"inherit",
                        background: mvForm.type==="out"?"#1f6feb":"transparent", color: mvForm.type==="out"?"#fff":"#6e7681" }}>
                      ➖ Расход
                    </button>
                  </div>
                </div>

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                  <span style={{ fontSize:13, color:"#8b949e", minWidth:100 }}>🔢 Количество</span>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <input type="number" placeholder="0" value={mvForm.amount} onChange={e=>setMvForm(p=>({...p,amount:e.target.value}))} style={{ width:100, textAlign:"right" }}/>
                    <span style={{ fontSize:12, color:"#6e7681" }}>{fertilizers.find(f=>f.id===mvForm.fertId)?.unit || "ед."}</span>
                  </div>
                </div>

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                  <span style={{ fontSize:13, color:"#8b949e", minWidth:100 }}>📅 Дата</span>
                  <input type="date" value={mvForm.date} onChange={e=>setMvForm(p=>({...p,date:e.target.value}))} style={{ flex:1, maxWidth:180, textAlign:"right" }}/>
                </div>

                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                  <span style={{ fontSize:13, color:"#8b949e", minWidth:100 }}>💬 Комментарий</span>
                  <input placeholder="напр. Купил 0.5л" value={mvForm.note} onChange={e=>setMvForm(p=>({...p,note:e.target.value}))} style={{ flex:1, maxWidth:220, textAlign:"right" }}/>
                </div>

                <button className={`btn ${mvForm.type==="in"?"btn-primary":"btn-blue"}`} onClick={addMovement} style={{ alignSelf:"flex-start", marginTop:4 }}>
                  {mvForm.type==="in"?"➕ Оприходовать":"➖ Списать"}
                </button>
              </div>
            </div>

            {/* Карточки удобрений */}
            {fertilizers.map(f => {
              const s=Math.max(0,stocks[f.id]||0); const mvs=fertMvs(f.id); const isOpen=openHistory===f.id;
              const empty=(stocks[f.id]||0)<=0&&mvs.length>0; const low=s>0&&s<50;
              return (
                <div key={f.id} className="card" style={{ padding:0, overflow:"hidden" }}>
                  <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }} onClick={()=>setOpenHistory(isOpen?null:f.id)}>
                    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                      <div style={{ width:4, height:40, borderRadius:2, background:empty?"#f85149":low?"#e3b341":"#3fb950" }}/>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14, marginBottom:3 }}>{f.name}</div>
                        <div style={{ fontSize:11, color:"#6e7681" }}>{mvs.length} операций · {f.unit}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:22, color:empty?"#f85149":low?"#e3b341":"#3fb950" }}>
                          {s.toFixed(1)} <span style={{ fontSize:13, fontWeight:400, color:"#8b949e" }}>{f.unit}</span>
                        </div>
                        <div style={{ fontSize:11, color:"#6e7681" }}>остаток</div>
                      </div>
                      <span style={{ color:"#6e7681", fontSize:16 }}>{isOpen?"▲":"▼"}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop:"1px solid #21262d", padding:"14px 20px", display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
                      {mvs.length===0 && <div style={{ fontSize:13, color:"#6e7681" }}>Нет операций</div>}
                      {mvs.map(m => (
                        <div key={m.id} className={`mv-row ${m.type==="in"?"mv-in":"mv-out"}`}>
                          <span style={{ color:"#6e7681", minWidth:70, fontSize:11 }}>{fmt(m.date)}</span>
                          <span>{m.type==="in"?"➕":"➖"}</span>
                          <span style={{ fontWeight:600, minWidth:70, color:m.type==="in"?"#3fb950":"#e3b341" }}>{m.type==="in"?"+":"-"}{m.amount} {f.unit}</span>
                          <span style={{ color:"#8b949e", fontSize:12 }}>{m.note||"—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* УДОБРЕНИЯ */}
        {tab==="fertilizers" && (
          <div style={{ maxWidth:560, margin:"0 auto", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Форма добавления */}
            <div className="card">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: showFertForm ? 14 : 0 }}>
                <div className="section-title" style={{ marginBottom:0 }}>🧪 Удобрения</div>
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={()=>setShowFertForm(!showFertForm)}>
                  {showFertForm ? "✕ Отмена" : "+ Добавить"}
                </button>
              </div>
              {showFertForm && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>📝 Название</span>
                    <input placeholder="напр. Кальций (Ca)" value={newFert.name} onChange={e=>setNewFert(p=>({...p,name:e.target.value}))} style={{ flex:1, maxWidth:220, textAlign:"right" }}/>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1117", borderRadius:8 }}>
                    <span style={{ fontSize:13, color:"#8b949e", minWidth:80 }}>📏 Единица</span>
                    <div style={{ display:"flex", borderRadius:4, overflow:"hidden", border:"1px solid #30363d" }}>
                      {["мл","л","г","кг"].map(u => (
                        <button key={u} onClick={()=>setNewFert(p=>({...p,unit:u}))}
                          style={{ padding:"5px 10px", fontSize:11, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit",
                            background: newFert.unit===u?"#1f6feb":"transparent", color: newFert.unit===u?"#fff":"#6e7681" }}>
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={addFertilizer} style={{ alignSelf:"flex-start" }}>Добавить</button>
                </div>
              )}
            </div>

            {/* Список удобрений */}
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {fertilizers.map(f => {
                const s = Math.max(0, stocks[f.id]||0);
                const used = totalUsed[f.id]||0;
                const empty = (stocks[f.id]||0) <= 0;
                const low = s > 0 && s < 50;
                return (
                  <div key={f.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"#161b22", borderRadius:8, border:"1px solid #21262d" }}>
                    <div style={{ width:3, height:32, borderRadius:2, background:empty?"#f85149":low?"#e3b341":"#3fb950", flexShrink:0 }}/>
                    <span style={{ fontWeight:600, fontSize:13, flex:1 }}>{f.name}</span>
                    <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>Остаток</div>
                        <div style={{ fontSize:14, fontWeight:700, color:empty?"#f85149":low?"#e3b341":"#3fb950" }}>{s.toFixed(1)} <span style={{ fontSize:11, fontWeight:400, color:"#6e7681" }}>{f.unit}</span></div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>Исп.</div>
                        <div style={{ fontSize:14, fontWeight:700, color:"#8b949e" }}>{used} <span style={{ fontSize:11, fontWeight:400, color:"#6e7681" }}>{f.unit}</span></div>
                      </div>
                    </div>
                    <button className="btn-icon" style={{ fontSize:13 }} onClick={()=>setDeletingFertId(f.id)}>🗑</button>
                  </div>
                );
              })}
              {fertilizers.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 0", color:"#6e7681", fontSize:13 }}>
                  Нет удобрений. Нажми «+ Добавить».
                </div>
              )}
            </div>
          </div>
        )}

        {/* РАСТЕНИЯ */}
        {tab==="plants" && (
          <div style={{ maxWidth:520, margin:"0 auto", display:"flex", flexDirection:"column", gap:16 }}>

            {/* Список */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {plants.map(p => (
                <div key={p.id}>
                  {renamingId===p.id ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"14px 16px", background:"#161b22", borderRadius:10, border:"1px solid #58a6ff" }}>
                      <input value={renamingVal} onChange={e=>setRenamingVal(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&renamePlant()}
                        style={{ flex:1, background:"transparent", border:"none", color:"#e6edf3", fontSize:15, fontWeight:600, outline:"none" }} autoFocus/>
                      <button className="btn btn-primary" style={{ padding:"6px 14px" }} onClick={renamePlant}>✓</button>
                      <button className="btn btn-ghost" style={{ padding:"6px 12px" }} onClick={()=>setRenamingId(null)}>✕</button>
                    </div>
                  ) : (
                    <div onClick={()=>{ setPlantId(p.id); save("activePlant",p.id); setTab("dashboard"); }}
                      style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
                        background: p.id===plantId?"#0d2a0d":"#161b22",
                        borderRadius:10, border:`1px solid ${p.id===plantId?"#238636":"#21262d"}`,
                        cursor:"pointer" }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background: p.id===plantId?"#3fb950":"#30363d", flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:600, color: p.id===plantId?"#3fb950":"#e6edf3", marginBottom:2 }}>{p.name}</div>
                        <div style={{ fontSize:11, color:"#6e7681" }}>{(p.logs||[]).length} поливов</div>
                      </div>
                      <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                        <button className="btn-icon" style={{ fontSize:14 }} onClick={()=>{ setRenamingId(p.id); setRenamingVal(p.name); }}>✍️</button>
                        {plants.length>1 && <button className="btn-icon" style={{ fontSize:14 }} onClick={()=>setDeletingPlantId(p.id)}>❌</button>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Добавить */}
            <div className="card">
              <div className="section-title">Добавить растение</div>
              <div style={{ display:"flex", gap:8 }}>
                <input placeholder="Название..." value={newPlantName}
                  onChange={e=>setNewPlantName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addPlant()}
                  style={{ flex:1 }}/>
                <button className="btn btn-primary" onClick={addPlant}>+ Добавить</button>
              </div>
            </div>

          </div>
        )}

        {/* ИСТОРИЯ */}
        {tab==="history_page" && (() => {
          const hPlant = plants.find(p => p.id === (historyPlantId || plantId)) || plant;
          const hLogs = hPlant?.logs || [];
          const renderLogRow = (log) => (
            <div key={log.id} style={{ background:"#0d1117", borderRadius:8, overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"5px 12px" }}>
                <span style={{ fontSize:11, color:"#6e7681", fontWeight:600, minWidth:65 }}>{fmt(log.date)}</span>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ cursor:"pointer", background:"transparent", border:"none", fontSize:14, padding:"0 2px", lineHeight:1 }} onClick={()=>startEditLog(log, hPlant.id)}>✍️</button>
                  <button style={{ cursor:"pointer", background:"transparent", border:"none", fontSize:14, padding:"0 2px", lineHeight:1 }} onClick={()=>{ if(window.confirm("Удалить этот полив?")) deleteLog(log.id, hPlant.id); }}>❌</button>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", padding:"2px 12px 7px", gap:"3px 0" }}>
                <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>Литраж</div>
                <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>PPM</div>
                <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>pH</div>
                <div style={{ fontSize:10, color:"#6e7681", textTransform:"uppercase", letterSpacing:0.5 }}>EC</div>
                <div style={{ fontSize:13, fontWeight:600, color:"#58a6ff" }}>{log.volume}л</div>
                <div style={{ fontSize:13, fontWeight:600, color:"#e6edf3" }}>{log.ppm}</div>
                <div style={{ fontSize:13, fontWeight:600, color:"#e6edf3" }}>{log.ph}</div>
                <div style={{ fontSize:13, fontWeight:600, color:"#bc8cff" }}>{log.ec||"—"}</div>
                {log.drain && <>
                  <div style={{ fontSize:11, color:"#3fb950" }}>↓ {log.drain.volume}л</div>
                  <div style={{ fontSize:11, color:"#3fb950" }}>↓ {log.drain.ppm}</div>
                  <div style={{ fontSize:11, color:"#3fb950" }}>↓ {log.drain.ph}</div>
                  <div style={{ fontSize:11, color:"#3fb950" }}>↓ {log.drain.ec||"—"}</div>
                </>}
              </div>
            </div>
          );
          return (
            <div style={{ maxWidth:600, margin:"0 auto", display:"flex", flexDirection:"column", gap:14 }}>
              {/* Выбор растения */}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {plants.map(p => (
                  <button key={p.id} onClick={()=>setHistoryPlantId(p.id)}
                    style={{ padding:"6px 16px", fontSize:13, fontWeight:600, cursor:"pointer", border:"1px solid",
                      borderRadius:20, fontFamily:"inherit", transition:"all .15s",
                      borderColor: (historyPlantId||plantId)===p.id?"#238636":"#30363d",
                      background: (historyPlantId||plantId)===p.id?"#0d2a0d":"transparent",
                      color: (historyPlantId||plantId)===p.id?"#3fb950":"#8b949e" }}>
                    {p.name}
                  </button>
                ))}
              </div>
              {/* Записи */}
              <div className="card" style={{ padding:"16px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div className="section-title" style={{ marginBottom:0 }}>📋 {hPlant.name}</div>
                  <span style={{ fontSize:11, color:"#6e7681" }}>{hLogs.length} поливов</span>
                </div>
                {hLogs.length > 0 ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {hLogs.map(log => renderLogRow(log))}
                  </div>
                ) : (
                  <div style={{ textAlign:"center", padding:"30px 0", color:"#6e7681", fontSize:13 }}>
                    Нет поливов для этого растения
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
