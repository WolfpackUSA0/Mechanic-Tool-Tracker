import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import Barcode from "react-barcode";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

const STORAGE_KEY = "mechanics-tool-tracker-vnext-state";
const CLOUD_ROW_ID = 1;

const DEFAULT_USERS = [
  { id: 1, name: "Admin", role: "admin", pin: "9999", active: true },
  { id: 2, name: "Supervisor", role: "supervisor", pin: "1234", active: true },
  { id: 3, name: "Tech", role: "tech", pin: "0000", active: true },
  { id: 4, name: "Tech 2", role: "tech", pin: "2222", active: true }
];

const DEFAULT_TOOLS = [
  { id: 1, name: "Torque Wrench", type: "tool", status: "IN", toolboxId: 1, checkedOutBy: "", tail: "", calibrated: true, calibrationDate: "2026-01-01", calibrationDue: "2026-07-01", calibrationStatus: "current", sentOut: false, notes: "" },
  { id: 2, name: "Ratchet", type: "tool", status: "OUT", toolboxId: 1, checkedOutBy: "Tech", tail: "N123AB", calibrated: false, calibrationDate: "", calibrationDue: "", calibrationStatus: "not_required", sentOut: false, notes: "" },
  { id: 3, name: "Borescope", type: "tool", status: "IN", toolboxId: 2, checkedOutBy: "", tail: "", calibrated: true, calibrationDate: "2025-11-01", calibrationDue: "2026-05-20", calibrationStatus: "due_soon", sentOut: false, notes: "" }
];

const DEFAULT_TOOLBOXES = [
  { id: 1, name: "Box A", status: "IN", checkedOutBy: "", tail: "" },
  { id: 2, name: "Box B", status: "IN", checkedOutBy: "", tail: "" }
];

const DEFAULT_ASSIGNMENTS = [
  { id: 1, tail: "N123AB", aircraftType: "Cessna 172", techIds: [3], task: "100-hour inspection prep", priority: "High", status: "Assigned", notes: "Check tool accountability before closing panels.", assignedBy: "Supervisor", createdAt: new Date().toISOString(), completedAt: "" },
  { id: 2, tail: "N456CD", aircraftType: "Piper Archer", techIds: [4], task: "Oil service and cowling inspection", priority: "Normal", status: "In Progress", notes: "", assignedBy: "Supervisor", createdAt: new Date().toISOString(), completedAt: "" }
];

const DEFAULT_PREFS = { theme: "dark", largeText: false, compactCards: false };

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysUntil(date) {
  if (!date) return null;
  const due = new Date(date + "T00:00:00");
  const now = new Date();
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
}
function calibrationState(tool) {
  if (!tool.calibrated) return { label: "Not Required", cls: "muted", locked: false };
  if (tool.sentOut) return { label: "Sent Out", cls: "warn", locked: true };
  const days = daysUntil(tool.calibrationDue);
  if (days === null) return { label: "Needs Date", cls: "warn", locked: true };
  if (days < 0) return { label: "Overdue", cls: "danger", locked: true };
  if (days <= 30) return { label: `Due Soon (${days}d)`, cls: "warn", locked: false };
  return { label: "Current", cls: "good", locked: false };
}
function uid(list) { return Math.max(0, ...list.map(x => Number(x.id) || 0)) + 1; }

export default function Home() {
  const [loaded, setLoaded] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("Local mode");
  const [currentUser, setCurrentUser] = useState(null);
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [users, setUsers] = useState(DEFAULT_USERS);
  const [tools, setTools] = useState(DEFAULT_TOOLS);
  const [toolboxes, setToolboxes] = useState(DEFAULT_TOOLBOXES);
  const [assignments, setAssignments] = useState(DEFAULT_ASSIGNMENTS);
  const [history, setHistory] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  const [newTool, setNewTool] = useState({ name: "", toolboxId: 1, calibrated: false, calibrationDate: todayISO(), calibrationDue: "" });
  const [newBox, setNewBox] = useState("");
  const [newAssignment, setNewAssignment] = useState({ tail: "", aircraftType: "", techIds: [], task: "", priority: "Normal", status: "Assigned", notes: "" });
  const [scannerValue, setScannerValue] = useState("TOOL:1");
  const [codeMode, setCodeMode] = useState("QR");
  const [search, setSearch] = useState("");

  const role = currentUser?.role || "guest";
  const isManager = role === "admin" || role === "supervisor";
  const isAdmin = role === "admin";
  const isTech = role === "tech";

  const nav = isManager
    ? [
        ["dashboard", "Dashboard"],
        ["aircraft", "Aircraft Control"],
        ["tools", "Tools & Toolboxes"],
        ["scanner", "Scanner & Codes"],
        ["reports", "Reports"],
        ["history", "History"],
        ["preferences", "Preferences"]
      ]
    : [
        ["dashboard", "Dashboard"],
        ["aircraft", "Aircraft Assignments"],
        ["tools", "Tools & Toolboxes"],
        ["history", "History"],
        ["preferences", "Preferences"]
      ];

  const stat = useMemo(() => {
    const cal = tools.filter(t => t.calibrated);
    return {
      totalTools: tools.length,
      boxes: toolboxes.length,
      out: tools.filter(t => t.status === "OUT").length,
      missing: tools.filter(t => t.status === "MISSING").length,
      overdue: cal.filter(t => calibrationState(t).cls === "danger").length,
      sentOut: tools.filter(t => t.sentOut).length,
      activeAircraft: new Set(assignments.filter(a => a.status !== "Completed").map(a => a.tail)).size,
      completed: assignments.filter(a => a.status === "Completed").length
    };
  }, [tools, toolboxes, assignments]);

  function log(msg) {
    const entry = { id: Date.now(), user: currentUser?.name || "System", msg, time: new Date().toLocaleString() };
    setHistory(h => [entry, ...h].slice(0, 300));
  }

  useEffect(() => {
    async function start() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const s = JSON.parse(saved);
          setUsers(s.users || DEFAULT_USERS);
          setTools(s.tools || DEFAULT_TOOLS);
          setToolboxes(s.toolboxes || DEFAULT_TOOLBOXES);
          setAssignments(s.assignments || DEFAULT_ASSIGNMENTS);
          setHistory(s.history || []);
          setPrefs(s.prefs || DEFAULT_PREFS);
        } catch {}
      }
      if (isSupabaseConfigured && supabase) {
        try {
          setCloudStatus("Checking cloud...");
          const { data, error } = await supabase.from("app_state").select("data").eq("id", CLOUD_ROW_ID).single();
          if (!error && data?.data) {
            const s = data.data;
            setUsers(s.users || DEFAULT_USERS);
            setTools(s.tools || DEFAULT_TOOLS);
            setToolboxes(s.toolboxes || DEFAULT_TOOLBOXES);
            setAssignments(s.assignments || DEFAULT_ASSIGNMENTS);
            setHistory(s.history || []);
            setPrefs(s.prefs || DEFAULT_PREFS);
            setCloudStatus("Cloud connected");
          } else {
            setCloudStatus("Cloud connected - waiting for first save");
          }
        } catch (e) {
          setCloudStatus("Cloud table missing or blocked");
        }
      }
      setLoaded(true);
    }
    start();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const state = { users, tools, toolboxes, assignments, history, prefs };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const timer = setTimeout(async () => {
      if (isSupabaseConfigured && supabase) {
        try {
          const { error } = await supabase.from("app_state").upsert({ id: CLOUD_ROW_ID, data: state, updated_at: new Date().toISOString() });
          setCloudStatus(error ? "Cloud save failed - check SQL/RLS" : "Cloud connected");
        } catch {
          setCloudStatus("Cloud save failed - check SQL/RLS");
        }
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [loaded, users, tools, toolboxes, assignments, history, prefs]);

  function login() {
    const user = users.find(u => u.pin === pin && u.active);
    if (user) { setCurrentUser(user); setPin(""); setTab("dashboard"); log(`${user.name} logged in`); }
    else alert("Wrong PIN");
  }

  function addTool() {
    if (!newTool.name.trim()) return;
    const tool = {
      id: uid(tools), name: newTool.name.trim(), type: "tool", status: "IN", toolboxId: Number(newTool.toolboxId) || null,
      checkedOutBy: "", tail: "", calibrated: Boolean(newTool.calibrated), calibrationDate: newTool.calibrated ? newTool.calibrationDate : "",
      calibrationDue: newTool.calibrated ? newTool.calibrationDue : "", sentOut: false, notes: ""
    };
    setTools(t => [...t, tool]); setNewTool({ name: "", toolboxId: 1, calibrated: false, calibrationDate: todayISO(), calibrationDue: "" }); log(`Created tool: ${tool.name}`);
  }
  function addToolbox() { if (!newBox.trim()) return; const box={id:uid(toolboxes),name:newBox.trim(),status:"IN",checkedOutBy:"",tail:""}; setToolboxes(b=>[...b,box]); setNewBox(""); log(`Created toolbox: ${box.name}`); }
  function deleteTool(id) { if (!isManager) return; const tool=tools.find(t=>t.id===id); setTools(t=>t.filter(x=>x.id!==id)); log(`Deleted tool: ${tool?.name || id}`); }
  function deleteBox(id) { if (!isManager) return; const box=toolboxes.find(b=>b.id===id); setToolboxes(b=>b.filter(x=>x.id!==id)); log(`Deleted toolbox: ${box?.name || id}`); }
  function updateTool(id, patch) { setTools(t => t.map(tool => tool.id === id ? { ...tool, ...patch } : tool)); }
  function sendForCal(id) { const tool=tools.find(t=>t.id===id); updateTool(id,{sentOut:true,status:"CALIBRATION",checkedOutBy:"Calibration Vendor",tail:""}); log(`${tool?.name} sent out for recalibration`); }
  function returnCal(id) { const due = prompt("New calibration due date YYYY-MM-DD", "2027-01-01") || ""; const tool=tools.find(t=>t.id===id); updateTool(id,{sentOut:false,status:"IN",checkedOutBy:"",calibrationDate:todayISO(),calibrationDue:due}); log(`${tool?.name} returned from calibration`); }
  function checkoutTool(tool) { const cal = calibrationState(tool); if (cal.locked) { alert("This tool is locked because of calibration status."); return; } const tail = prompt("Aircraft tail number", tool.tail || "N123AB") || ""; updateTool(tool.id,{status:"OUT",checkedOutBy:currentUser.name,tail}); log(`${tool.name} checked out to ${currentUser.name} for ${tail}`); }
  function checkinTool(tool) { updateTool(tool.id,{status:"IN",checkedOutBy:"",tail:""}); log(`${tool.name} checked in`); }

  function createAssignment() {
    if (!newAssignment.tail.trim() || !newAssignment.task.trim()) return;
    const a = { ...newAssignment, id: uid(assignments), techIds: newAssignment.techIds.map(Number), assignedBy: currentUser.name, createdAt: new Date().toISOString(), completedAt: "" };
    setAssignments(x => [a, ...x]); setNewAssignment({ tail: "", aircraftType: "", techIds: [], task: "", priority: "Normal", status: "Assigned", notes: "" }); log(`Assigned ${a.tail} to techs`);
  }
  function updateAssignment(id, patch) { setAssignments(a => a.map(x => x.id === id ? { ...x, ...patch } : x)); }
  function completeAssignment(id) { updateAssignment(id, { status: "Completed", completedAt: new Date().toISOString() }); log(`Completed aircraft assignment #${id}`); }
  function selfAssign(id) { if (!currentUser) return; const a=assignments.find(x=>x.id===id); const ids = Array.from(new Set([...(a?.techIds || []), currentUser.id])); updateAssignment(id,{techIds:ids,status:"In Progress"}); log(`${currentUser.name} joined assignment ${a?.tail}`); }
  function reassignSelf(id) { const tail = prompt("Move yourself to aircraft tail number", "") || ""; const task = prompt("Task", "Assist with maintenance task") || "Task"; if (!tail) return; const a = { id: uid(assignments), tail, aircraftType: "", techIds: [currentUser.id], task, priority: "Normal", status: "In Progress", notes: "Self-assigned while supervisor was busy", assignedBy: currentUser.name, createdAt: new Date().toISOString(), completedAt: "" }; setAssignments(x => [a, ...x]); log(`${currentUser.name} self-assigned to ${tail}`); }

  const visibleAssignments = assignments.filter(a => isManager || a.techIds.includes(currentUser?.id));
  const filteredTools = tools.filter(t => !search || `${t.name} ${t.status} ${t.tail} ${t.checkedOutBy}`.toLowerCase().includes(search.toLowerCase()));

  if (!currentUser) return <main className={`app ${prefs.theme} ${prefs.largeText ? "large" : ""}`}><div className="login-card"><img src="/mechanics-tool-tracker-logo.png" alt="logo" className="login-logo"/><h1>Mechanics Tool Tracker</h1><p>Real Shop Tool Control • Aircraft Assignments • Calibration Tracking</p><input value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="Enter PIN" type="password"/><button onClick={login}>Log In</button><div className="hint">Demo PINs: Admin 9999 • Supervisor 1234 • Tech 0000</div></div></main>;

  return <main className={`app ${prefs.theme} ${prefs.largeText ? "large" : ""}`}>
    <header className="topbar"><div className="brand"><img src="/mechanics-tool-tracker-logo.png" alt="logo"/><div><h1>Mechanics Tool Tracker</h1><p>{cloudStatus} • {currentUser.name} ({currentUser.role})</p></div></div><button className="ghost" onClick={()=>setCurrentUser(null)}>Log Out</button></header>
    <nav className="tabs">{nav.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={tab===id?"active":""}>{label}</button>)}</nav>

    {tab === "dashboard" && <section className="grid"><Card title="Tools" value={stat.totalTools}/><Card title="Toolboxes" value={stat.boxes}/><Card title="Tools Out" value={stat.out}/><Card title="Missing" value={stat.missing} danger/><Card title="Cal Overdue" value={stat.overdue} danger/><Card title="Sent Out Cal" value={stat.sentOut} warn/><Card title="Active Aircraft" value={stat.activeAircraft}/><Card title="Completed Tasks" value={stat.completed}/><Panel title="Current Aircraft Work"><AssignmentList assignments={visibleAssignments} users={users} onComplete={completeAssignment} onJoin={selfAssign} onSelfMove={reassignSelf} isManager={isManager}/></Panel><Panel title="Calibration Alerts"><div className="cards">{tools.filter(t=>t.calibrated && calibrationState(t).cls !== 'good').map(t=><ToolCard key={t.id} tool={t} isManager={isManager} onSend={sendForCal} onReturn={returnCal} onDelete={deleteTool} onCheckout={checkoutTool} onCheckin={checkinTool}/>)}</div></Panel></section>}

    {tab === "aircraft" && <section className="stack">{isManager && <Panel title="Assign Aircraft to Techs"><div className="form-row"><input placeholder="Tail number" value={newAssignment.tail} onChange={e=>setNewAssignment({...newAssignment,tail:e.target.value.toUpperCase()})}/><input placeholder="Aircraft type" value={newAssignment.aircraftType} onChange={e=>setNewAssignment({...newAssignment,aircraftType:e.target.value})}/><select value={newAssignment.priority} onChange={e=>setNewAssignment({...newAssignment,priority:e.target.value})}><option>Low</option><option>Normal</option><option>High</option><option>AOG</option></select></div><textarea placeholder="Task description" value={newAssignment.task} onChange={e=>setNewAssignment({...newAssignment,task:e.target.value})}/><div className="checkgrid">{users.filter(u=>u.role==='tech').map(u=><label key={u.id}><input type="checkbox" checked={newAssignment.techIds.includes(u.id)} onChange={e=>setNewAssignment({...newAssignment,techIds:e.target.checked?[...newAssignment.techIds,u.id]:newAssignment.techIds.filter(id=>id!==u.id)})}/> {u.name}</label>)}</div><textarea placeholder="Notes" value={newAssignment.notes} onChange={e=>setNewAssignment({...newAssignment,notes:e.target.value})}/><button onClick={createAssignment}>Assign Aircraft</button></Panel>}<Panel title={isManager ? "All Aircraft Assignments" : "My Aircraft Assignments"}><AssignmentList assignments={visibleAssignments} users={users} onComplete={completeAssignment} onJoin={selfAssign} onSelfMove={reassignSelf} isManager={isManager}/></Panel>{isTech && <Panel title="Tech Backup Control"><p>When a supervisor is busy, techs can join an existing assignment or self-assign to a different aircraft. Every action is logged.</p><button onClick={()=>reassignSelf()}>Assign Myself to Different Aircraft</button></Panel>}</section>}

    {tab === "tools" && <section className="stack"><Panel title="Tools & Toolboxes"><div className="form-row"><input placeholder="Search tools" value={search} onChange={e=>setSearch(e.target.value)}/></div>{isManager && <div className="form-row"><input placeholder="New tool name" value={newTool.name} onChange={e=>setNewTool({...newTool,name:e.target.value})}/><select value={newTool.toolboxId} onChange={e=>setNewTool({...newTool,toolboxId:e.target.value})}>{toolboxes.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><label className="inline"><input type="checkbox" checked={newTool.calibrated} onChange={e=>setNewTool({...newTool,calibrated:e.target.checked})}/> Requires Calibration</label>{newTool.calibrated && <><input type="date" value={newTool.calibrationDate} onChange={e=>setNewTool({...newTool,calibrationDate:e.target.value})}/><input type="date" value={newTool.calibrationDue} onChange={e=>setNewTool({...newTool,calibrationDue:e.target.value})}/></>}<button onClick={addTool}>Add Tool</button></div>}<div className="cards">{filteredTools.map(t=><ToolCard key={t.id} tool={t} isManager={isManager} onSend={sendForCal} onReturn={returnCal} onDelete={deleteTool} onCheckout={checkoutTool} onCheckin={checkinTool}/>)}</div></Panel><Panel title="Toolboxes">{isManager && <div className="form-row"><input placeholder="New toolbox name" value={newBox} onChange={e=>setNewBox(e.target.value)}/><button onClick={addToolbox}>Add Toolbox</button></div>}<div className="cards">{toolboxes.map(b=><div className="card" key={b.id}><h3>{b.name}</h3><p>Status: <b>{b.status}</b></p><p>Checked out by: {b.checkedOutBy || "None"}</p><p>Aircraft: {b.tail || "None"}</p>{isManager && <button className="dangerBtn" onClick={()=>deleteBox(b.id)}>Delete Toolbox</button>}</div>)}</div></Panel></section>}

    {tab === "scanner" && isManager && <section className="stack"><Panel title="Scanner & Codes"><p>Scanner and QR/barcode controls are combined here to keep the supervisor/admin tabs cleaner.</p><div className="form-row"><input value={scannerValue} onChange={e=>setScannerValue(e.target.value)} placeholder="Example: TOOL:1 or BOX:1"/><select value={codeMode} onChange={e=>setCodeMode(e.target.value)}><option>QR</option><option>Barcode</option></select></div><div className="codebox">{codeMode === "QR" ? <QRCode value={scannerValue || "EMPTY"} size={180}/> : <Barcode value={scannerValue || "EMPTY"}/>}<button onClick={()=>log(`Scanned/code generated: ${scannerValue}`)}>Log Scan</button></div></Panel></section>}

    {tab === "reports" && isManager && <section className="stack"><Panel title="Shop Report"><div className="report"><p>Total tools: {stat.totalTools}</p><p>Tools out: {stat.out}</p><p>Missing tools: {stat.missing}</p><p>Overdue calibration: {stat.overdue}</p><p>Active aircraft: {stat.activeAircraft}</p><p>Completed assignments: {stat.completed}</p></div><button onClick={()=>window.print()}>Print / Save PDF</button></Panel></section>}

    {tab === "history" && <section className="stack"><Panel title="History"><div className="history">{history.map(h=><div key={h.id} className="history-row"><b>{h.time}</b> — {h.user}: {h.msg}</div>)}</div></Panel></section>}

    {tab === "preferences" && <section className="stack"><Panel title="Preferences"><div className="form-row"><label className="inline">Theme <select value={prefs.theme} onChange={e=>setPrefs({...prefs,theme:e.target.value})}><option value="dark">Dark Hangar</option><option value="light">Light Shop</option></select></label><label className="inline"><input type="checkbox" checked={prefs.largeText} onChange={e=>setPrefs({...prefs,largeText:e.target.checked})}/> Large Text Mode</label><label className="inline"><input type="checkbox" checked={prefs.compactCards} onChange={e=>setPrefs({...prefs,compactCards:e.target.checked})}/> Compact Cards</label></div><p>Quick tab has been removed. Theme and large text settings now live here to free up the main navigation.</p></Panel>{isAdmin && <Panel title="Admin Users"><div className="cards">{users.map(u=><div className="card" key={u.id}><h3>{u.name}</h3><p>{u.role} • PIN {u.pin}</p></div>)}</div></Panel>}</section>}
  </main>;
}

function Card({ title, value, danger, warn }) { return <div className={`stat ${danger?'danger':warn?'warn':''}`}><span>{title}</span><strong>{value}</strong></div>; }
function Panel({ title, children }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function ToolCard({ tool, isManager, onSend, onReturn, onDelete, onCheckout, onCheckin }) {
  const cal = calibrationState(tool);
  return <div className="card"><div className="row"><h3>{tool.name}</h3><span className={`pill ${cal.cls}`}>{cal.label}</span></div><p>Status: <b>{tool.status}</b></p><p>Toolbox: {tool.toolboxId || "None"}</p><p>Checked out by: {tool.checkedOutBy || "None"}</p><p>Aircraft: {tool.tail || "None"}</p>{tool.calibrated && <p>Cal Due: {tool.calibrationDue || "Not set"}</p>}<div className="actions">{tool.status === "IN" ? <button onClick={()=>onCheckout(tool)}>Check Out</button> : <button onClick={()=>onCheckin(tool)}>Check In</button>}{isManager && tool.calibrated && (!tool.sentOut ? <button onClick={()=>onSend(tool.id)}>Send For Recal</button> : <button onClick={()=>onReturn(tool.id)}>Returned Cal</button>)}{isManager && <button className="dangerBtn" onClick={()=>onDelete(tool.id)}>Delete</button>}</div></div>;
}
function AssignmentList({ assignments, users, onComplete, onJoin, onSelfMove, isManager }) {
  if (!assignments.length) return <p>No aircraft assignments.</p>;
  return <div className="cards">{assignments.map(a=>{ const techs=a.techIds.map(id=>users.find(u=>u.id===id)?.name).filter(Boolean).join(", "); return <div className="card" key={a.id}><div className="row"><h3>{a.tail}</h3><span className="pill">{a.status}</span></div><p>{a.aircraftType || "Aircraft type not set"}</p><p><b>Task:</b> {a.task}</p><p><b>Techs:</b> {techs || "Unassigned"}</p><p><b>Priority:</b> {a.priority}</p>{a.notes && <p><b>Notes:</b> {a.notes}</p>}<div className="actions"><button onClick={()=>onComplete(a.id)}>Complete Task</button>{!isManager && <button onClick={()=>onJoin(a.id)}>Join Aircraft</button>}{!isManager && <button onClick={()=>onSelfMove(a.id)}>Assign Different Aircraft</button>}{isManager && <select value={a.status} onChange={e=>onComplete && e.target.value==='Completed' ? onComplete(a.id) : null}><option>{a.status}</option><option>Assigned</option><option>In Progress</option><option>Waiting Parts</option><option>Inspection Required</option><option>Completed</option></select>}</div></div>})}</div>;
}
