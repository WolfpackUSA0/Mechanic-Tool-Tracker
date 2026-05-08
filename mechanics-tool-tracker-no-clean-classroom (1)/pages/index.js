
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import Barcode from "react-barcode";
import { Html5Qrcode } from "html5-qrcode";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const STORAGE_KEY = "tool-control-clean-v1";
const CHANNEL = "tool-control-clean-live";

const DEFAULT_USERS = [
  { id: 1, name: "Admin", role: "admin", pin: "9999", email: "admin@shop.local", active: true, qr: "USER:1" },
  { id: 2, name: "Supervisor", role: "supervisor", pin: "1234", email: "supervisor@shop.local", active: true, qr: "USER:2" },
  { id: 3, name: "Tech", role: "tech", pin: "0000", email: "tech@shop.local", active: true, qr: "USER:3" },
  { id: 4, name: "Tech 2", role: "tech", pin: "2222", email: "tech2@shop.local", active: true, qr: "USER:4" }
];

const DEFAULT_TOOLS = [
  { id: 1, name: "Ratchet", status: "OUT", tail: "N123AB", toolboxId: 1, checkedOutBy: "Tech", qr: "TOOL:1", uses: 4, lastKnown: { user: "Tech", aircraft: "N123AB", time: "Today" } },
  { id: 2, name: "Pliers", status: "IN", tail: "", toolboxId: 1, checkedOutBy: "", qr: "TOOL:2", uses: 1, lastKnown: null },
  { id: 3, name: "Mirror", status: "MISSING", tail: "N456CD", toolboxId: 2, checkedOutBy: "Tech 2", qr: "TOOL:3", uses: 2, lastKnown: { user: "Tech 2", aircraft: "N456CD", time: "Today" } },
  { id: 4, name: "Torque Wrench", status: "BROKEN", tail: "", toolboxId: 2, checkedOutBy: "", qr: "TOOL:4", uses: 3, lastKnown: { user: "Tech", aircraft: "N123AB", time: "Yesterday" } }
];

const DEFAULT_TOOLBOXES = [
  { id: 1, name: "Box A", status: "OUT", tail: "N123AB", checkedOutBy: "Tech", qr: "BOX:1" },
  { id: 2, name: "Box B", status: "IN", tail: "", checkedOutBy: "", qr: "BOX:2" }
];

const DEFAULT_CONSUMABLES = [
  { id: 1, name: "Safety Wire", type: "Wire", qty: 250, unit: "ft", min: 100, usedOn: ["N123AB"], qr: "CONSUMABLE:1" },
  { id: 2, name: "Engine Oil", type: "Liquid", qty: 20, unit: "qt", min: 5, usedOn: [], qr: "CONSUMABLE:2" }
];

const HANGARS = ["Hangar A", "Hangar B", "Line Maintenance", "Engine Shop"];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [theme, setTheme] = useState("dark");
  const [tabletMode, setTabletMode] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [time, setTime] = useState("");

  const [users, setUsers] = useState(DEFAULT_USERS);
  const [currentUser, setCurrentUser] = useState(null);
  const [pin, setPin] = useState("");
  const [newUser, setNewUser] = useState({ name: "", role: "tech", pin: "", email: "" });

  const [tools, setTools] = useState(DEFAULT_TOOLS);
  const [toolboxes, setToolboxes] = useState(DEFAULT_TOOLBOXES);
  const [consumables, setConsumables] = useState(DEFAULT_CONSUMABLES);
  const [discrepancies, setDiscrepancies] = useState([]);
  const [history, setHistory] = useState([]);
  const [scanHistory, setScanHistory] = useState([]);
  const [messages, setMessages] = useState([]);
  const [reportsArchive, setReportsArchive] = useState([]);

  const [aircraftCrew, setAircraftCrew] = useState({
    N123AB: { lead: "Supervisor", crew: ["Tech"] },
    N456CD: { lead: "", crew: ["Tech 2"] }
  });
  const [aircraftLogs, setAircraftLogs] = useState({
    N123AB: [{ id: 1, user: "System", msg: "Aircraft opened", date: new Date().toLocaleDateString(), time: "08:00 AM" }]
  });
  const [currentAircraft, setCurrentAircraft] = useState("");
  const [tail, setTail] = useState("N123AB");
  const [hangar, setHangar] = useState("Hangar A");

  const [newTool, setNewTool] = useState("");
  const [newToolbox, setNewToolbox] = useState("");
  const [newConsumable, setNewConsumable] = useState("");
  const [newConsumableType, setNewConsumableType] = useState("Hardware");
  const [newConsumableUnit, setNewConsumableUnit] = useState("pcs");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [restock, setRestock] = useState({});
  const [useAmount, setUseAmount] = useState({});
  const [scanValue, setScanValue] = useState("");
  const [scannerStatus, setScannerStatus] = useState("Ready");

  const [signName, setSignName] = useState("");
  const [signature, setSignature] = useState("");
  const [toolboxReturnApprovals, setToolboxReturnApprovals] = useState({});
  const [signoffs, setSignoffs] = useState({ supervisor: null });
  const [reportHash, setReportHash] = useState("");
  const [emailStatus, setEmailStatus] = useState("Not sent");

  const [historyLimit, setHistoryLimit] = useState(25);
  const [historySearch, setHistorySearch] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveTail, setArchiveTail] = useState("");
  const [archiveDate, setArchiveDate] = useState("");
  const [archiveLimit, setArchiveLimit] = useState(10);

  const [qrType, setQrType] = useState("TOOL");
  const [qrValue, setQrValue] = useState("");
  const [qrLabel, setQrLabel] = useState("");
  const [codeStyle, setCodeStyle] = useState("QR");

  const [onlineUsers, setOnlineUsers] = useState({});
  const [online, setOnline] = useState(true);
  const [syncQueue, setSyncQueue] = useState([]);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [ack, setAck] = useState({});

  const channelRef = useRef(null);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const playedAlerts = useRef(new Set());
  const scannerRef = useRef(null);

  const role = currentUser?.role || "guest";
  const isAdmin = role === "admin";
  const isSupervisor = role === "supervisor";
  const isTech = role === "tech";
  const isManager = isAdmin || isSupervisor;

  useEffect(() => {
    setMounted(true);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setUsers(s.users || DEFAULT_USERS);
        setTools(s.tools || DEFAULT_TOOLS);
        setToolboxes(s.toolboxes || DEFAULT_TOOLBOXES);
        setConsumables(s.consumables || DEFAULT_CONSUMABLES);
        setDiscrepancies(s.discrepancies || []);
        setHistory(s.history || []);
        setScanHistory(s.scanHistory || []);
        setMessages(s.messages || []);
        setReportsArchive(s.reportsArchive || []);
        setAircraftCrew(s.aircraftCrew || {});
        setAircraftLogs(s.aircraftLogs || {});
        setTheme(s.theme || "dark");
        setHangar(s.hangar || "Hangar A");
      } catch {}
    }

    const tick = () => setTime(new Date().toLocaleTimeString());
    tick();
    const int = setInterval(tick, 1000);

    setOnline(navigator.onLine);
    const onOnline = () => { setOnline(true); setSyncQueue([]); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if ("BroadcastChannel" in window) {
      channelRef.current = new BroadcastChannel(CHANNEL);
      channelRef.current.onmessage = (e) => {
        if (e.data?.type === "SYNC") loadState(e.data.payload, false);
        if (e.data?.type === "PRESENCE") setOnlineUsers((p) => ({ ...p, [e.data.userId]: e.data.payload }));
      };
    }

    return () => {
      clearInterval(int);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      channelRef.current?.close();
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!mounted) return;
    const payload = {
      users, tools, toolboxes, consumables, discrepancies, history, scanHistory, messages,
      reportsArchive, aircraftCrew, aircraftLogs, theme, hangar
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    channelRef.current?.postMessage({ type: "SYNC", payload });
  }, [mounted, users, tools, toolboxes, consumables, discrepancies, history, scanHistory, messages, reportsArchive, aircraftCrew, aircraftLogs, theme, hangar]);

  useEffect(() => {
    if (!currentUser || !channelRef.current) return;
    const post = () => {
      channelRef.current.postMessage({
        type: "PRESENCE",
        userId: currentUser.id,
        payload: { name: currentUser.name, role: currentUser.role, tab, time: new Date().toLocaleTimeString() }
      });
    };
    post();
    const int = setInterval(post, 5000);
    return () => clearInterval(int);
  }, [currentUser, tab]);

  const loadState = (s, full = true) => {
    if (!s) return;
    if (s.users) setUsers(s.users);
    if (s.tools) setTools(s.tools);
    if (s.toolboxes) setToolboxes(s.toolboxes);
    if (s.consumables) setConsumables(s.consumables);
    if (s.discrepancies) setDiscrepancies(s.discrepancies);
    if (s.history) setHistory(s.history);
    if (s.scanHistory) setScanHistory(s.scanHistory);
    if (s.messages) setMessages(s.messages);
    if (s.reportsArchive) setReportsArchive(s.reportsArchive);
    if (s.aircraftCrew) setAircraftCrew(s.aircraftCrew);
    if (s.aircraftLogs) setAircraftLogs(s.aircraftLogs);
    if (full && s.theme) setTheme(s.theme);
  };

  const addHistory = (msg) => {
    const h = { id: Date.now(), user: currentUser?.name || "System", msg, date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString() };
    setHistory((prev) => [h, ...prev].slice(0, 500));
    if (!navigator.onLine) setSyncQueue((q) => [{ id: Date.now(), action: msg, time: new Date().toISOString() }, ...q]);
  };

  const logAircraft = (tn, msg) => {
    if (!tn) return;
    const clean = tn.toUpperCase();
    const log = { id: Date.now(), user: currentUser?.name || "System", msg, date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString() };
    setAircraftLogs((p) => ({ ...p, [clean]: [log, ...(p[clean] || [])].slice(0, 200) }));
  };

  const logScan = (qr, type, action) => {
    setScanHistory((s) => [{ id: Date.now(), qr, type, action, user: currentUser?.name || "System", aircraft: currentAircraft || tail || "-", time: new Date().toLocaleString() }, ...s].slice(0, 500));
  };

  const analytics = useMemo(() => ({
    in: tools.filter((t) => t.status === "IN").length,
    out: tools.filter((t) => t.status === "OUT").length,
    missing: tools.filter((t) => t.status === "MISSING").length,
    broken: tools.filter((t) => t.status === "BROKEN").length,
    lowStock: consumables.filter((c) => c.qty <= c.min).length,
    openDiscrepancies: discrepancies.filter((d) => !d.resolved).length
  }), [tools, consumables, discrepancies]);

  const lossByAircraft = useMemo(() => {
    const map = {};
    tools.forEach((t) => {
      if (t.status === "MISSING" && t.lastKnown?.aircraft) map[t.lastKnown.aircraft] = (map[t.lastKnown.aircraft] || 0) + 1;
    });
    return map;
  }, [tools]);

  const offenderStats = useMemo(() => {
    const map = {};
    tools.forEach((t) => {
      if (t.status === "MISSING" && t.lastKnown?.user) map[t.lastKnown.user] = (map[t.lastKnown.user] || 0) + 1;
    });
    return map;
  }, [tools]);

  const aircraftStats = useMemo(() => {
    const map = {};
    tools.forEach((t) => {
      const ac = t.tail || t.lastKnown?.aircraft;
      if (!ac) return;
      if (!map[ac]) map[ac] = { tools: 0, boxes: 0, discrepancies: 0, risk: 0 };
      if (t.status === "OUT") map[ac].tools++;
      if (t.status === "MISSING") map[ac].risk += 2;
    });
    toolboxes.forEach((b) => {
      if (!b.tail) return;
      if (!map[b.tail]) map[b.tail] = { tools: 0, boxes: 0, discrepancies: 0, risk: 0 };
      if (b.status === "OUT") map[b.tail].boxes++;
    });
    discrepancies.forEach((d) => {
      if (!d.aircraft || d.aircraft === "N/A") return;
      if (!map[d.aircraft]) map[d.aircraft] = { tools: 0, boxes: 0, discrepancies: 0, risk: 0 };
      if (!d.resolved) { map[d.aircraft].discrepancies++; map[d.aircraft].risk += 3; }
    });
    return map;
  }, [tools, toolboxes, discrepancies]);

  const alerts = useMemo(() => {
    const list = [
      ...tools.filter((t) => t.status === "MISSING").map((t) => ({ id: `missing-${t.id}`, priority: "red", msg: `Missing tool: ${t.name}` })),
      ...tools.filter((t) => t.status === "BROKEN").map((t) => ({ id: `broken-${t.id}`, priority: "yellow", msg: `Broken tool: ${t.name}` })),
      ...discrepancies.filter((d) => !d.resolved).map((d) => ({ id: `disc-${d.id}`, priority: "yellow", msg: `Open discrepancy: ${d.tool}` })),
      ...messages.filter((m) => !(m.readBy || []).includes(currentUser?.name || "")).map((m) => ({ id: `msg-${m.id}`, priority: "info", msg: `Message for ${m.aircraft}: ${m.text}` }))
    ];
    if (isManager) {
      list.push(...consumables.filter((c) => c.qty <= c.min).map((c) => ({ id: `low-${c.id}`, priority: "info", msg: `Low stock: ${c.name}` })));
    }
    return list.filter((a) => !ack[a.id]);
  }, [tools, discrepancies, consumables, messages, currentUser, isManager, ack]);

  useEffect(() => {
    alerts.forEach((a) => {
      if (a.priority === "red" && !playedAlerts.current.has(a.id)) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 720;
          gain.gain.value = 0.035;
          osc.start();
          setTimeout(() => { osc.stop(); ctx.close(); }, 180);
        } catch {}
        playedAlerts.current.add(a.id);
      }
    });
  }, [alerts]);

  const filteredTools = tools.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()) && (filter === "ALL" || t.status === filter));
  const filteredHistory = history.filter((h) => {
    const searchOk = !historySearch || (h.msg + h.user).toLowerCase().includes(historySearch.toLowerCase());
    const dateOk = !historyDate || h.date === new Date(historyDate).toLocaleDateString();
    return searchOk && dateOk;
  });
  const filteredArchive = reportsArchive.filter((r) => {
    const text = JSON.stringify(r).toLowerCase();
    return (!archiveSearch || text.includes(archiveSearch.toLowerCase())) &&
      (!archiveTail || text.includes(archiveTail.toLowerCase())) &&
      (!archiveDate || (r.closedAt || "").startsWith(archiveDate));
  });

  const login = () => {
    const user = users.find((u) => u.pin === pin && u.active);
    if (!user) return alert("Invalid PIN");
    setCurrentUser(user);
    setPin("");
    addHistory(`${user.name} logged in`);
  };

  const createUser = () => {
    if (!isAdmin) return;
    if (!newUser.name || !newUser.pin) return alert("Name and PIN required");
    const id = Date.now();
    setUsers((u) => [...u, { ...newUser, id, active: true, qr: `USER:${id}` }]);
    setNewUser({ name: "", role: "tech", pin: "", email: "" });
    addHistory("Created user");
  };

  const deleteUser = (id) => { setUsers((u) => u.filter((x) => x.id !== id)); addHistory("Deleted user"); };
  const toggleUser = (id) => setUsers((u) => u.map((x) => x.id === id ? { ...x, active: !x.active } : x));

  const createTool = () => {
    if (!newTool.trim()) return;
    const id = Date.now();
    setTools((t) => [...t, { id, name: newTool.trim(), status: "IN", tail: "", toolboxId: null, checkedOutBy: "", qr: `TOOL:${id}`, uses: 0, lastKnown: null }]);
    setNewTool("");
    addHistory("Created tool");
  };

  const checkoutTool = (id) => {
    const ac = (currentAircraft || tail).toUpperCase();
    const tool = tools.find((t) => t.id === id);
    setTools((ts) => ts.map((t) => t.id === id ? { ...t, status: "OUT", tail: ac, checkedOutBy: currentUser.name, uses: (t.uses || 0) + 1, lastKnown: { user: currentUser.name, aircraft: ac, time: new Date().toLocaleString() } } : t));
    if (tool) {
      addHistory(`${tool.name} checked out to ${ac}`);
      logAircraft(ac, `Tool checked out: ${tool.name}`);
      logScan(tool.qr, "TOOL", "CHECKOUT");
    }
  };

  const returnTool = (id) => {
    const tool = tools.find((t) => t.id === id);
    setTools((ts) => ts.map((t) => t.id === id ? { ...t, status: "IN", tail: "", checkedOutBy: "" } : t));
    if (tool) {
      addHistory(`${tool.name} returned`);
      logScan(tool.qr, "TOOL", "RETURN");
    }
  };

  const markTool = (id, status) => {
    const tool = tools.find((t) => t.id === id);
    setTools((ts) => ts.map((t) => t.id === id ? { ...t, status, tail: status === "IN" ? "" : t.tail, checkedOutBy: status === "IN" ? "" : t.checkedOutBy } : t));
    if (tool && (status === "MISSING" || status === "BROKEN")) {
      setDiscrepancies((d) => [{ id: Date.now(), tool: tool.name, type: status, aircraft: tool.tail || tool.lastKnown?.aircraft || "N/A", reportedBy: currentUser.name, time: new Date().toLocaleString(), resolved: false }, ...d]);
      addHistory(`${tool.name} marked ${status}`);
    }
  };

  const deleteTool = (id) => { setTools((t) => t.filter((x) => x.id !== id)); addHistory("Deleted tool"); };


  const deleteToolbox = (id) => {
    if (!isManager) return;
    setToolboxes((b) => b.filter((x) => x.id !== id));
    setTools((ts) => ts.map((t) => t.toolboxId === id ? { ...t, toolboxId: null } : t));
    addHistory("Deleted toolbox");
  };

  const deleteConsumable = (id) => {
    if (!isManager) return;
    setConsumables((c) => c.filter((x) => x.id !== id));
    addHistory("Deleted consumable");
  };

  const createToolbox = () => {
    if (!newToolbox.trim()) return;
    const id = Date.now();
    setToolboxes((b) => [...b, { id, name: newToolbox.trim(), status: "IN", tail: "", checkedOutBy: "", qr: `BOX:${id}` }]);
    setNewToolbox("");
    addHistory("Created toolbox");
  };

  const checkoutBox = (id) => {
    const ac = (currentAircraft || tail).toUpperCase();
    setToolboxes((b) => b.map((x) => x.id === id ? { ...x, status: "OUT", tail: ac, checkedOutBy: currentUser.name } : x));
    logScan(`BOX:${id}`, "BOX", "CHECKOUT");
    logAircraft(ac, "Toolbox checked out");
  };

  const returnBox = (id) => {
    const approved = toolboxReturnApprovals[id];

    if (!approved && role === "tech") {
      return alert("Supervisor/Admin toolbox signoff required before return.");
    }

    setToolboxes((b) =>
      b.map((x) =>
        x.id === id
          ? { ...x, status: "IN", tail: "", checkedOutBy: "" }
          : x
      )
    );

    setToolboxReturnApprovals((a) => ({ ...a, [id]: false }));

    addHistory(`Toolbox returned`);
    logScan(`BOX:${id}`, "BOX", "RETURN");
  };

  const approveToolboxReturn = (id) => {
    if (!isManager) return;
    setToolboxReturnApprovals((a) => ({ ...a, [id]: true }));
    addHistory(`Supervisor approved toolbox return`);
  };

  const createConsumable = () => {
    if (!newConsumable.trim()) return;

    const id = Date.now();

    setConsumables((c) => [
      ...c,
      {
        id,
        name: newConsumable.trim(),
        type: newConsumableType,
        qty: 0,
        unit: newConsumableUnit,
        min: 10,
        usedOn: [],
        qr: `CONSUMABLE:${id}`
      }
    ]);

    setNewConsumable("");
  };

  const useConsumable = (id) => {
    const ac = (currentAircraft || tail).toUpperCase();
    const c = consumables.find((x) => x.id === id);
    const amount = Number(useAmount[id] || 1);

    setConsumables((cs) => cs.map((x) =>
      x.id === id
        ? {
            ...x,
            qty: Math.max(0, x.qty - amount),
            usedOn: [...(x.usedOn || []), ac]
          }
        : x
    ));

    setUseAmount((u) => ({ ...u, [id]: "" }));

    if (c) {
      addHistory(`Used ${amount} ${c.unit || "ea"} of ${c.name} (${c.type || "Consumable"}) on ${ac}`);
      logScan(c.qr, "CONSUMABLE", "USE");
    }
  };

  const restockConsumable = (id) => {
    if (!isManager) return alert("Supervisor/Admin only");
    const amount = Number(restock[id] || 0);
    if (amount <= 0) return;
    setConsumables((cs) => cs.map((x) => x.id === id ? { ...x, qty: x.qty + amount } : x));
    setRestock({ ...restock, [id]: "" });
  };

  const assignToAircraft = (tn) => {
    const ac = tn.trim().toUpperCase();
    if (!ac) return;
    setCurrentAircraft(ac);
    setTail(ac);
    setAircraftCrew((p) => {
      const current = p[ac] || { lead: "", crew: [] };
      return { ...p, [ac]: { ...current, crew: current.crew.includes(currentUser.name) ? current.crew : [...current.crew, currentUser.name] } };
    });
    logAircraft(ac, `${currentUser.name} joined aircraft`);
    logScan(`AIRCRAFT:${ac}`, "AIRCRAFT", "OPEN");
  };

  const setLead = (tn) => {
    if (!isManager) return;
    const ac = tn.toUpperCase();
    setAircraftCrew((p) => ({ ...p, [ac]: { ...(p[ac] || { crew: [] }), lead: currentUser.name } }));
  };

  const completeAircraft = () => {
    const ac = currentAircraft;
    setTools((ts) => ts.map((t) => t.tail === ac ? { ...t, status: "IN", tail: "", checkedOutBy: "" } : t));
    setToolboxes((bs) => bs.map((b) => b.tail === ac ? { ...b, status: "IN", tail: "", checkedOutBy: "" } : b));
    logAircraft(ac, "Aircraft completed");
    setCurrentAircraft("");
  };

  const sendMessage = (aircraft, text) => {
    if (!isManager || !text.trim()) return;
    setMessages((m) => [{ id: Date.now(), aircraft, text, from: currentUser.name, time: new Date().toLocaleString(), readBy: [] }, ...m]);
  };

  const readMessage = (id) => setMessages((m) => m.map((x) => x.id === id && !x.readBy.includes(currentUser.name) ? { ...x, readBy: [...x.readBy, currentUser.name] } : x));

  const handleScan = (value) => {
    const clean = String(value).trim();
    if (!clean) return;

    if (clean.toUpperCase().startsWith("AIRCRAFT:")) {
      assignToAircraft(clean.split(":")[1]);
      setTab("aircraft");
      return;
    }

    if (clean.toUpperCase().startsWith("USER:")) {
      const id = clean.split(":")[1];
      const user = users.find((u) => String(u.id) === id || u.name.toLowerCase() === id.toLowerCase());
      if (user) { setCurrentUser(user); addHistory(`Badge scanned: ${user.name}`); }
      return;
    }

    if (clean.toUpperCase().startsWith("BOX:")) {
      const id = Number(clean.split(":")[1]);
      const box = toolboxes.find((b) => b.id === id);
      if (!box) return alert("Box not found");
      box.status === "IN" ? checkoutBox(id) : returnBox(id);
      return;
    }

    if (clean.toUpperCase().startsWith("TOOL:")) {
      const id = clean.split(":")[1];
      const tool = tools.find((t) => String(t.id) === id || t.name.toLowerCase() === id.toLowerCase());
      if (!tool) return alert("Tool not found");
      if (tool.status === "IN") checkoutTool(tool.id);
      else if (tool.status === "OUT") returnTool(tool.id);
      else markTool(tool.id, "IN");
      return;
    }

    const tool = tools.find((t) => t.name.toLowerCase() === clean.toLowerCase() || String(t.id) === clean);
    if (!tool) return alert("Unknown code");
    tool.status === "IN" ? checkoutTool(tool.id) : returnTool(tool.id);
  };


  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
        setScannerStatus("Camera stopped");
      }
    } catch {
      setScannerStatus("Scanner already stopped");
    }
  };

  const startScanner = async () => {
    try {
      setScannerStatus("Starting camera...");
      scannerRef.current = new Html5Qrcode("reader");
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          setScannerStatus(`Scanned: ${decoded}`);
          handleScan(decoded);
          await scannerRef.current.stop();
          scannerRef.current.clear();
        }
      );
    } catch {
      setScannerStatus("Camera failed. Use localhost/HTTPS and allow camera.");
    }
  };

  const buildReport = () => ({ tools, toolboxes, consumables, discrepancies, aircraftCrew, aircraftLogs, history, scanHistory, signoffs, analytics, generated: new Date().toISOString() });

  const generateHash = async () => {
    const data = new TextEncoder().encode(JSON.stringify(buildReport()));
    const digest = await crypto.subtle.digest("SHA-256", data);
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    setReportHash(hash);
    return hash;
  };

  const signReport = async () => {
    if (!isManager) return alert("Supervisor/Admin only");
    if (!signName.trim()) return alert("Enter signer name");
    const hash = reportHash || await generateHash();
    setSignoffs({ supervisor: { name: signName, role, time: new Date().toLocaleString(), hash, signature } });
    setSignName("");
    addHistory("Report signed");
  };

  const generatePdfData = async () => {
    const el = document.getElementById("report-content");
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const w = 190;
    const h = canvas.height * w / canvas.width;
    let y = 10;
    pdf.addImage(img, "PNG", 10, y, w, h);
    let left = h - 277;
    while (left > 0) {
      pdf.addPage();
      y = 10 - (h - left);
      pdf.addImage(img, "PNG", 10, y, w, h);
      left -= 277;
    }
    return pdf.output("datauristring");
  };

  const downloadPdf = async () => {
    const data = await generatePdfData();
    const a = document.createElement("a");
    a.href = data;
    a.download = `Tool_Control_Report_${new Date().toISOString().slice(0,10)}.pdf`;
    a.click();
  };

  const closeReport = async () => {
    if (!signoffs.supervisor) return alert("Supervisor signoff required");
    const hash = reportHash || await generateHash();
    const pdf = await generatePdfData();
    setReportsArchive((r) => [{ id: Date.now(), closedBy: currentUser.name, closedAt: new Date().toISOString(), hash, pdf, snapshot: buildReport() }, ...r].slice(0, 100));
    setSignoffs({ supervisor: null });
    setSignature("");
    setReportHash("");
    setEmailStatus("Closed and archived");
    addHistory("Report closed and new report started");
  };

  const viewArchive = (r) => {
    if (!r.pdf) return alert("No PDF saved");
    const w = window.open();
    w.document.write(`<iframe width="100%" height="100%" src="${r.pdf}"></iframe>`);
  };

  const downloadArchive = (r) => {
    const a = document.createElement("a");
    a.href = r.pdf;
    a.download = `Archived_Report_${r.id}.pdf`;
    a.click();
  };

  const startDraw = (e) => { drawing.current = true; draw(e); };
  const stopDraw = () => { drawing.current = false; canvasRef.current?.getContext("2d")?.beginPath(); };
  const draw = (e) => {
    if (!drawing.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches?.[0];
    const x = (touch ? touch.clientX : e.clientX) - rect.left;
    const y = (touch ? touch.clientY : e.clientY) - rect.top;
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const saveDrawnSignature = () => setSignature(canvasRef.current?.toDataURL("image/png") || "");
  const clearDrawnSignature = () => { const ctx = canvasRef.current?.getContext("2d"); if (ctx) ctx.clearRect(0,0,320,150); setSignature(""); };

  const codeValue = qrValue.trim() ? `${qrType}:${qrValue.trim()}` : `${qrType}:`;
  const printCode = () => window.print();

  if (!mounted) return <div className="login">Loading...</div>;

  if (!currentUser) {
    return (
      <div className="login">
        <div className="login-card">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/mechanics-tool-tracker-logo.png"
            alt="Mechanics Tool Tracker Logo"
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
            }}
          />
          <div>
            <h1 style={{ margin: 0 }}>Mechanics Tool Tracker</h1>
            <p style={{ margin: 0, opacity: 0.8 }}>Real Shop Tool Control System</p>
          </div>
        </div>
          <p></p>
          <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Admin 9999 / Supervisor 1234 / Tech 0000" />
          <button onClick={login}>Login</button>
        </div>
      </div>
    );
  }

  const nav = [
    ["dashboard", "📊", "Dashboard"],
    ["aircraft", "✈️", "Aircraft"],
    ["tools", "🔧", "Tools"],
    ["toolboxes", "🧰", "Toolboxes"],
    ["consumables", "📦", "Consumables"],
    ["scanner", "📷", "Scanner"],
    ...(isManager || isAdmin ? [["codes", "🏷️", "Codes"]] : []),
    ["history", "📜", "History"],
    ...(isManager ? [["reports", "🧾", "Reports"], ["discrepancies", "⚠️", "Discrepancies"]] : []),
    ...(isAdmin ? [["admin", "👥", "Admin"], ["settings", "⚙️", "Settings"]] : [])
  ];

  return (
    <div className={`app ${tabletMode ? "tablet" : ""} ${quickMode ? "quick" : ""}`}>
      <aside className="sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/mechanics-tool-tracker-logo.png"
            alt="Mechanics Tool Tracker Logo"
            style={{
              width: 72,
              height: 72,
              borderRadius: 12,
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
            }}
          />
          <div>
            <h1 style={{ margin: 0 }}>Mechanics Tool Tracker</h1>
            <p style={{ margin: 0, opacity: 0.8 }}>Real Shop Tool Control System</p>
          </div>
        </div>
        <p>Clean Rebuild</p>
        <div className={`role ${role}`}>{role.toUpperCase()}</div>
        {nav.map(([key, icon, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)} title={label}>
            {tabletMode ? icon : label}
          </button>
        ))}
        <button onClick={() => setQuickMode(!quickMode)}>{tabletMode ? "⚡" : quickMode ? "Quick ON" : "Quick OFF"}</button>
        <button onClick={() => setTabletMode(!tabletMode)}>{tabletMode ? "🖥️" : "iPad Mode"}</button>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{tabletMode ? "🌗" : "Theme"}</button>
        <button onClick={() => setCurrentUser(null)}>{tabletMode ? "🚪" : "Logout"}</button>
      </aside>

      <main className="main">
        <header className="topbar">
          <b>{tab.toUpperCase()}</b>
          <div className="top-actions">
            <span onClick={() => setAlertsOpen(!alertsOpen)} className={alerts.length ? "alert-badge hot" : "alert-badge"}>🔔 {alerts.length}</span>
            <span>{online ? "🟢 Online" : "🔴 Offline"} {syncQueue.length ? `(${syncQueue.length})` : ""}</span>
            <span>{time}</span>
            <span>{currentUser.name}</span>
          </div>
        </header>

        {alertsOpen && <div className="alert-strip">{alerts.length === 0 ? "No active alerts" : alerts.map((a) => <span className={`mini-alert ${a.priority}`} key={a.id}>{a.msg}<button onClick={() => setAck({ ...ack, [a.id]: true })}>Clear</button></span>)}</div>}

        {tab === "dashboard" && <Dashboard analytics={analytics} isTech={isTech} isManager={isManager} currentAircraft={currentAircraft} tail={tail} setTail={setTail} assignToAircraft={assignToAircraft} completeAircraft={completeAircraft} lossByAircraft={lossByAircraft} offenderStats={offenderStats} aircraftStats={aircraftStats} onlineUsers={onlineUsers} />}
        {tab === "aircraft" && <AircraftPanel aircraftCrew={aircraftCrew} aircraftLogs={aircraftLogs} tail={tail} setTail={setTail} assignToAircraft={assignToAircraft} setLead={setLead} isManager={isManager} timelineLimit={25} messages={messages} sendMessage={sendMessage} readMessage={readMessage} />}
        {tab === "tools" && <ToolsPanel tools={filteredTools} allToolboxes={toolboxes} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} newTool={newTool} setNewTool={setNewTool} createTool={createTool} checkoutTool={checkoutTool} returnTool={returnTool} markTool={markTool} deleteTool={deleteTool} assignToToolbox={(toolId, boxId) => setTools((ts) => ts.map((t) => t.id === toolId ? { ...t, toolboxId: boxId } : t))} isAdmin={isAdmin} isManager={isManager} quickMode={quickMode} />}
        {tab === "toolboxes" && <ToolboxPanel toolboxes={toolboxes} tools={tools} newToolbox={newToolbox} setNewToolbox={setNewToolbox} createToolbox={createToolbox} checkoutBox={checkoutBox} returnBox={returnBox} approveToolboxReturn={approveToolboxReturn} toolboxReturnApprovals={toolboxReturnApprovals} isManager={isManager} deleteToolbox={deleteToolbox} />}
        {tab === "consumables" && <ConsumablesPanel consumables={consumables} newConsumable={newConsumable} setNewConsumable={setNewConsumable} createConsumable={createConsumable} useConsumable={useConsumable} restock={restock} setRestock={setRestock} restockConsumable={restockConsumable} isManager={isManager} useAmount={useAmount} setUseAmount={setUseAmount} newConsumableType={newConsumableType} setNewConsumableType={setNewConsumableType} newConsumableUnit={newConsumableUnit} setNewConsumableUnit={setNewConsumableUnit} deleteConsumable={deleteConsumable} />}
        {tab === "scanner" && <ScannerPanel scanValue={scanValue} setScanValue={setScanValue} handleScan={handleScan} startScanner={startScanner} stopScanner={stopScanner} scannerStatus={scannerStatus} scanHistory={scanHistory} />}
        {tab === "codes" && <CodesPanel qrType={qrType} setQrType={setQrType} qrValue={qrValue} setQrValue={setQrValue} qrLabel={qrLabel} setQrLabel={setQrLabel} codeStyle={codeStyle} setCodeStyle={setCodeStyle} codeValue={codeValue} printCode={printCode} tools={tools} toolboxes={toolboxes} users={users} />}
        {tab === "history" && <HistoryPanel history={filteredHistory} historySearch={historySearch} setHistorySearch={setHistorySearch} historyDate={historyDate} setHistoryDate={setHistoryDate} historyLimit={historyLimit} setHistoryLimit={setHistoryLimit} />}
        {tab === "discrepancies" && isManager && <DiscrepanciesPanel discrepancies={discrepancies} resolve={(id) => setDiscrepancies((d) => d.map((x) => x.id === id ? { ...x, resolved: true, resolvedBy: currentUser.name } : x))} />}
        {tab === "reports" && isManager && <ReportsPanel signoffs={signoffs} signName={signName} setSignName={setSignName} signReport={signReport} reportHash={reportHash} generateHash={generateHash} downloadPdf={downloadPdf} closeReport={closeReport} reportsArchive={filteredArchive} archiveSearch={archiveSearch} setArchiveSearch={setArchiveSearch} archiveTail={archiveTail} setArchiveTail={setArchiveTail} archiveDate={archiveDate} setArchiveDate={setArchiveDate} archiveLimit={archiveLimit} setArchiveLimit={setArchiveLimit} viewArchive={viewArchive} downloadArchive={downloadArchive} emailStatus={emailStatus} canvasRef={canvasRef} startDraw={startDraw} draw={draw} stopDraw={stopDraw} saveDrawnSignature={saveDrawnSignature} clearDrawnSignature={clearDrawnSignature} tools={tools} toolboxes={toolboxes} consumables={consumables} discrepancies={discrepancies} aircraftCrew={aircraftCrew} aircraftStats={aircraftStats} history={history} currentUser={currentUser} signature={signature} />}
        {tab === "admin" && isAdmin && <AdminPanel users={users} newUser={newUser} setNewUser={setNewUser} createUser={createUser} deleteUser={deleteUser} toggleUser={toggleUser} />}
        {tab === "settings" && isAdmin && <SettingsPanel hangar={hangar} setHangar={setHangar} HANGARS={HANGARS} theme={theme} setTheme={setTheme} syncQueue={syncQueue} setSyncQueue={setSyncQueue} />}
      </main>
    </div>
  );
}

function Dashboard({ analytics, isTech, isManager, currentAircraft, tail, setTail, assignToAircraft, completeAircraft, lossByAircraft, offenderStats, aircraftStats, onlineUsers }) {
  return <div className="grid">
    <Stat label="Total IN" value={analytics.in} color="green" />
    <Stat label="Checked OUT" value={analytics.out} color="yellow" />
    <Stat label="Missing" value={analytics.missing} color="red" />
    <Stat label="Broken" value={analytics.broken} color="red" />
    <Stat label="Open Disc." value={analytics.openDiscrepancies} color="orange" />
    {isTech && <div className="card wide"><h3>My Aircraft</h3><div className="controls"><input value={currentAircraft || tail} onChange={(e) => setTail(e.target.value.toUpperCase())} /><button onClick={() => assignToAircraft(tail)}>Join Aircraft</button>{currentAircraft && <button onClick={completeAircraft}>Complete</button>}</div><p>{currentAircraft ? `Working on ${currentAircraft}` : "No aircraft selected"}</p></div>}
    {isManager && <div className="card wide"><h3>Accountability</h3>{Object.entries(offenderStats).filter(([_, c]) => c >= 3).length === 0 ? <p>No repeat offender flags.</p> : Object.entries(offenderStats).filter(([_, c]) => c >= 3).map(([u,c]) => <div className="row red-flag" key={u}><span>{u}</span><span>{c} missing tools</span></div>)}<h4>Aircraft Heatmap</h4>{Object.entries(lossByAircraft).map(([ac,c]) => <div className="heat-row" key={ac} style={{background:`rgba(239,68,68,${Math.min(c/5,1)})`}}><span>{ac}</span><span>{c}</span></div>)}</div>}
    <div className="card wide"><h3>Aircraft Activity</h3>{Object.entries(aircraftStats).map(([ac,s]) => <div className="row" key={ac}><span>{ac}</span><span>Tools {s.tools}</span><span>Boxes {s.boxes}</span><span>Risk {s.risk}</span></div>)}</div>
    <div className="card side"><h3>Live Users</h3>{Object.values(onlineUsers).map((u,i) => <div className="row" key={i}><span>🟢 {u.name}</span><span>{u.tab}</span></div>)}</div>
  </div>
}

function Stat({ label, value, color }) { return <div className={`stat ${color}`}><span>{label}</span><strong>{value}</strong></div> }

function AircraftPanel({ aircraftCrew, aircraftLogs, tail, setTail, assignToAircraft, setLead, isManager, timelineLimit, messages, sendMessage, readMessage }) {
  return <div className="panel"><h3>Aircraft</h3><div className="controls"><input value={tail} onChange={(e)=>setTail(e.target.value.toUpperCase())}/><button onClick={()=>assignToAircraft(tail)}>Join</button>{isManager && <button onClick={()=>setLead(tail)}>Set Lead</button>}</div>{Object.entries(aircraftCrew).map(([ac,c]) => <div className="card" key={ac}><h3>{ac}</h3><p>Lead: {c.lead || "None"} | Crew: {(c.crew||[]).join(", ") || "None"}</p><h4>Timeline</h4>{(aircraftLogs[ac]||[]).slice(0,timelineLimit).map((l)=><div className="row" key={l.id}><span>{l.user}: {l.msg}</span><span>{l.time}</span></div>)}<Messages aircraft={ac} messages={messages} sendMessage={sendMessage} readMessage={readMessage} isManager={isManager}/></div>)}</div>
}

function Messages({ aircraft, messages, sendMessage, readMessage, isManager }) {
  const [text, setText] = useState("");
  const list = messages.filter((m) => m.aircraft === aircraft);
  return <div><h4>Messages</h4>{isManager && <div className="controls"><input value={text} onChange={(e)=>setText(e.target.value)} placeholder="Message to techs"/><button onClick={()=>{sendMessage(aircraft,text);setText("");}}>Send</button></div>}{list.map((m)=><div className="mini-alert info" key={m.id} onClick={()=>readMessage(m.id)}>{m.text} — {m.from}<div className="muted">Seen by: {(m.readBy||[]).join(", ") || "No one yet"}</div></div>)}</div>
}

function ToolsPanel({ tools, newTool, setNewTool, createTool, checkoutTool, returnTool, deleteTool, isManager }) {
  return (
    <div className="panel">
      <h3>Tools</h3>

      <div className="controls">
        <input
          value={newTool}
          onChange={(e)=>setNewTool(e.target.value)}
          placeholder="New tool"
        />
        <button onClick={createTool}>Add Tool</button>
      </div>

      {tools.map((t)=>(
        <div className="card" key={t.id}>
          <div className="row">
            <span>
              {t.name} — {t.status}
              {t.tail && ` — ${t.tail}`}
            </span>

            <span className="controls">
              {t.status==="IN"
                ? <button onClick={()=>checkoutTool(t.id)}>Checkout</button>
                : <button onClick={()=>returnTool(t.id)}>Return</button>
              }

              {isManager && (
                <button onClick={()=>deleteTool(t.id)}>
                  Delete
                </button>
              )}
            </span>
          </div>

          {t.toolboxId && (
            <div className="muted">
              Toolbox Assigned
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ToolboxPanel({ toolboxes, tools, newToolbox, setNewToolbox, createToolbox, checkoutBox, returnBox, approveToolboxReturn, toolboxReturnApprovals, isManager, deleteToolbox }) {
  return <div className="panel"><h3>Toolboxes</h3><div className="controls"><input value={newToolbox} onChange={(e)=>setNewToolbox(e.target.value)} placeholder="New toolbox"/><button onClick={createToolbox}>Create</button></div>{toolboxes.map((b)=>{const inBox=tools.filter((t)=>t.toolboxId===b.id);return <div className="card" key={b.id}><div className="row"><span>{b.name} — {b.status} {b.tail && `— ${b.tail}`}</span><span>{b.status==="IN"?<button onClick={()=>checkoutBox(b.id)}>Checkout</button>:<><button onClick={()=>returnBox(b.id)}>Return</button>{isManager && !toolboxReturnApprovals[b.id] && <button onClick={()=>approveToolboxReturn(b.id)}>Approve Return</button>}{toolboxReturnApprovals[b.id] && <span className="approved-tag">Approved</span>}</>}{isManager && <button onClick={()=>deleteToolbox(b.id)}>Delete</button>}</span></div>{inBox.map((t)=><div className="row" key={t.id}><span>{t.name}</span><span>{t.status}</span></div>)}</div>})}</div>
}

function ConsumablesPanel({ consumables, newConsumable, setNewConsumable, createConsumable, useConsumable, restock, setRestock, restockConsumable, isManager, useAmount, setUseAmount, newConsumableType, setNewConsumableType, newConsumableUnit, setNewConsumableUnit, deleteConsumable }) {
  return <div className="panel">
    <h3>Consumables</h3>

    {isManager && (
    <div className="controls">
      <input value={newConsumable} onChange={(e)=>setNewConsumable(e.target.value)} placeholder="New consumable" />

      <select value={newConsumableType} onChange={(e)=>{
        const type = e.target.value;
        setNewConsumableType(type);
        if(type==="Wire") setNewConsumableUnit("ft");
        else if(type==="Liquid") setNewConsumableUnit("qt");
        else setNewConsumableUnit("pcs");
      }}>
        <option>Wire</option>
        <option>Liquid</option>
        <option>Hardware</option>
      </select>

      <select value={newConsumableUnit} onChange={(e)=>setNewConsumableUnit(e.target.value)}>
        {newConsumableType==="Wire" && <><option value="ft">ft</option><option value="in">in</option></>}
        {newConsumableType==="Liquid" && <><option value="qt">qt</option><option value="gal">gal</option><option value="oz">oz</option></>}
        {newConsumableType==="Hardware" && <><option value="pcs">pcs</option><option value="ea">ea</option></>}
      </select>

      <button onClick={createConsumable}>Add</button>
    </div>
    )}

    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Qty</th>
          <th>Unit</th>
          <th>Min</th>
          <th>Last Aircraft</th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody>
        {consumables.map((c)=>
          <tr key={c.id}>
            <td>{c.name}</td>
            <td>{c.type || "Hardware"}</td>
            <td>{c.qty}</td>
            <td>{c.unit || "pcs"}</td>
            <td>{c.min}</td>
            <td>{c.usedOn?.[c.usedOn.length-1]||"-"}</td>

            <td>
              <div className="controls">
                <input className="small-input" value={useAmount[c.id]||""} onChange={(e)=>setUseAmount({...useAmount,[c.id]:e.target.value})} placeholder={`Used ${c.unit || "pcs"}`} />

                <button onClick={()=>useConsumable(c.id)}>Use</button>

                {isManager&&<>
                  <input className="small-input" value={restock[c.id]||""} onChange={(e)=>setRestock({...restock,[c.id]:e.target.value})} placeholder="Restock" />

                  <button onClick={()=>restockConsumable(c.id)}>Restock</button>

                  <button onClick={()=>deleteConsumable(c.id)}>Delete</button>
                </>}
              </div>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
}

function ScannerPanel({ scanValue, setScanValue, handleScan, startScanner, stopScanner, scannerStatus, scanHistory }) {
  return <div className="panel"><h3>Scanner</h3><div className="controls"><input value={scanValue} onChange={(e)=>setScanValue(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"){handleScan(scanValue);setScanValue("");}}} placeholder="TOOL:1 / BOX:1 / USER:1 / AIRCRAFT:N123AB"/><button onClick={()=>{handleScan(scanValue);setScanValue("");}}>Run Manual Scan</button><button onClick={startScanner}>Start Camera Scan</button><button onClick={stopScanner}>Stop Camera</button></div><p className="muted">{scannerStatus}</p><div id="reader" className="scanner-reader"></div><h3>Scan History</h3>{scanHistory.slice(0,25).map((s)=><div className="row" key={s.id}><span>{s.qr} — {s.action}</span><span>{s.user}</span><span>{s.time}</span></div>)}</div>
}

function CodesPanel({ qrType, setQrType, qrValue, setQrValue, qrLabel, setQrLabel, codeStyle, setCodeStyle, codeValue, printCode, tools, toolboxes, users }) {
  return <div className="panel"><h3>QR / Barcode Generator</h3><div className="controls"><select value={qrType} onChange={(e)=>setQrType(e.target.value)}><option>TOOL</option><option>BOX</option><option>USER</option><option>AIRCRAFT</option><option>CONSUMABLE</option></select><input value={qrValue} onChange={(e)=>setQrValue(e.target.value)} placeholder="ID or value"/><input value={qrLabel} onChange={(e)=>setQrLabel(e.target.value)} placeholder="Label"/><select value={codeStyle} onChange={(e)=>setCodeStyle(e.target.value)}><option value="QR">QR</option><option value="BARCODE">Barcode</option></select><button onClick={printCode}>Print</button></div><div className="printable-code card"><h2>{qrLabel || "Tool Control"}</h2><p>{codeValue}</p>{codeStyle==="QR"?<QRCode value={codeValue || "EMPTY"} size={180}/>:<Barcode value={codeValue || "EMPTY"} width={2} height={80}/>}</div><h3>Quick Print Sheets</h3><div className="grid">{tools.map((t)=><div className="qr-card card" key={t.id}><b>{t.name}</b><QRCode value={t.qr} size={80}/><small>{t.qr}</small></div>)}{toolboxes.map((b)=><div className="qr-card card" key={b.id}><b>{b.name}</b><QRCode value={b.qr} size={80}/><small>{b.qr}</small></div>)}{users.map((u)=><div className="qr-card card" key={u.id}><b>{u.name}</b><QRCode value={u.qr} size={80}/><small>{u.qr}</small></div>)}</div></div>
}

function HistoryPanel({ history, historySearch, setHistorySearch, historyDate, setHistoryDate, historyLimit, setHistoryLimit }) {
  return <div className="panel"><h3>History</h3><div className="controls"><input value={historySearch} onChange={(e)=>setHistorySearch(e.target.value)} placeholder="Search"/><input type="date" value={historyDate} onChange={(e)=>setHistoryDate(e.target.value)}/></div>{history.slice(0,historyLimit).map((h)=><div className="row" key={h.id}><span>{h.user}: {h.msg}</span><span>{h.date} {h.time}</span></div>)}<div className="controls">{historyLimit<history.length&&<button onClick={()=>setHistoryLimit(historyLimit+25)}>Show More</button>}{historyLimit>25&&<button onClick={()=>setHistoryLimit(25)}>Show Less</button>}</div></div>
}

function DiscrepanciesPanel({ discrepancies, resolve }) {
  return <div className="panel"><h3>Discrepancies</h3>{discrepancies.map((d)=><div className="row" key={d.id}><span>{d.tool} — {d.type} — {d.aircraft}</span><span>{d.resolved?"Resolved":"Open"}</span>{!d.resolved&&<button onClick={()=>resolve(d.id)}>Resolve</button>}</div>)}</div>
}

function ReportsPanel(props) {
  const { signoffs, signName, setSignName, signReport, reportHash, generateHash, downloadPdf, closeReport, reportsArchive, archiveSearch, setArchiveSearch, archiveTail, setArchiveTail, archiveDate, setArchiveDate, archiveLimit, setArchiveLimit, viewArchive, downloadArchive, emailStatus, canvasRef, startDraw, draw, stopDraw, saveDrawnSignature, clearDrawnSignature, tools, toolboxes, consumables, discrepancies, aircraftCrew, aircraftStats, history, currentUser, signature } = props;
  return <div className="panel report"><h3>{signoffs.supervisor ? "Report Signed" : "Report Unsigned"}</h3><div className={signoffs.supervisor?"alert-success":"alert-warning"}>{signoffs.supervisor ? `Signed by ${signoffs.supervisor.name}` : "Supervisor/Admin signoff required"}</div><div className="card"><h3>Electronic Signature</h3><input value={signName} onChange={(e)=>setSignName(e.target.value)} placeholder="Signer name"/><canvas ref={canvasRef} width="320" height="150" className="signature-canvas" onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}></canvas><div className="controls"><button onClick={saveDrawnSignature}>Save Signature</button><button onClick={clearDrawnSignature}>Clear</button><button onClick={signReport}>Sign Report</button><button onClick={generateHash}>Generate Hash</button><button onClick={downloadPdf}>Download PDF</button><button onClick={closeReport}>Close Report</button></div></div><p className="muted">Status: {emailStatus}</p><div className="card"><h3>Archive</h3><div className="controls"><input value={archiveSearch} onChange={(e)=>setArchiveSearch(e.target.value)} placeholder="Search"/><input value={archiveTail} onChange={(e)=>setArchiveTail(e.target.value.toUpperCase())} placeholder="Aircraft"/><input type="date" value={archiveDate} onChange={(e)=>setArchiveDate(e.target.value)}/></div>{reportsArchive.slice(0,archiveLimit).map((r)=><div className="archive-row" key={r.id}><span>{r.closedBy}<br/>{new Date(r.closedAt).toLocaleString()}</span><span>{r.hash?.slice(0,12)}...</span><span><button onClick={()=>viewArchive(r)}>View</button><button onClick={()=>downloadArchive(r)}>Download</button></span></div>)}<div className="controls">{archiveLimit<reportsArchive.length&&<button onClick={()=>setArchiveLimit(archiveLimit+10)}>Show More</button>}{archiveLimit>10&&<button onClick={()=>setArchiveLimit(10)}>Show Less</button>}</div></div><div id="report-content" className="report-paper"><h2>FAA-Style Tool Control Report</h2><p><b>Generated:</b> {new Date().toLocaleString()}</p><p><b>Generated By:</b> {currentUser.name} ({currentUser.role})</p><p><b>Hash:</b> {reportHash || "Not generated"}</p><h3>Approval</h3>{signoffs.supervisor?<div><p>{signoffs.supervisor.name} — {signoffs.supervisor.time}</p>{signature&&<img src={signature} className="signature-img"/>}</div>:<p>Pending</p>}<h3>Aircraft Summary</h3>{Object.entries(aircraftStats).map(([ac,s])=><p key={ac}>{ac}: Tools {s.tools}, Boxes {s.boxes}, Discrepancies {s.discrepancies}, Risk {s.risk}</p>)}<h3>Crew</h3>{Object.entries(aircraftCrew).map(([ac,c])=><p key={ac}>{ac}: Lead {c.lead||"None"} | Crew {(c.crew||[]).join(", ")}</p>)}<h3>Tools</h3><table><thead><tr><th>Tool</th><th>Status</th><th>Tail</th><th>User</th><th>Last Known</th></tr></thead><tbody>{tools.map((t)=><tr key={t.id}><td>{t.name}</td><td>{t.status}</td><td>{t.tail||"-"}</td><td>{t.checkedOutBy||"-"}</td><td>{t.lastKnown?`${t.lastKnown.user} @ ${t.lastKnown.aircraft}`:"-"}</td></tr>)}</tbody></table><h3>Toolboxes</h3><table><thead><tr><th>Box</th><th>Status</th><th>Tail</th><th>User</th></tr></thead><tbody>{toolboxes.map((b)=><tr key={b.id}><td>{b.name}</td><td>{b.status}</td><td>{b.tail||"-"}</td><td>{b.checkedOutBy||"-"}</td></tr>)}</tbody></table><h3>Consumables</h3><table><thead><tr><th>Name</th><th>Qty</th><th>Min</th><th>Last Used</th></tr></thead><tbody>{consumables.map((c)=><tr key={c.id}><td>{c.name}</td><td>{c.qty}</td><td>{c.min}</td><td>{c.usedOn?.[c.usedOn.length-1]||"-"}</td></tr>)}</tbody></table><h3>Discrepancies</h3>{discrepancies.map((d)=><p key={d.id}>{d.tool} — {d.type} — {d.aircraft} — {d.resolved?"Resolved":"Open"}</p>)}<h3>Recent Activity</h3>{history.slice(0,20).map((h)=><p key={h.id}>{h.user}: {h.msg} ({h.date} {h.time})</p>)}</div></div>
}

function AdminPanel({ users, newUser, setNewUser, createUser, deleteUser, toggleUser }) {
  return <div className="panel"><h3>Admin User Management</h3><div className="controls"><input value={newUser.name} onChange={(e)=>setNewUser({...newUser,name:e.target.value})} placeholder="Name"/><input value={newUser.email} onChange={(e)=>setNewUser({...newUser,email:e.target.value})} placeholder="Email"/><input value={newUser.pin} onChange={(e)=>setNewUser({...newUser,pin:e.target.value})} placeholder="PIN"/><select value={newUser.role} onChange={(e)=>setNewUser({...newUser,role:e.target.value})}><option value="tech">Tech</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select><button onClick={createUser}>Add</button></div>{users.map((u)=><div className="row" key={u.id}><span>{u.name} — {u.role} — {u.email}</span><span>{u.active?"Active":"Disabled"} <button onClick={()=>toggleUser(u.id)}>{u.active?"Disable":"Enable"}</button><button onClick={()=>deleteUser(u.id)}>Delete</button></span></div>)}</div>
}

function SettingsPanel({ hangar, setHangar, HANGARS, theme, setTheme, syncQueue, setSyncQueue }) {
  return <div className="panel"><h3>Settings</h3><div className="card"><h3>Hangar</h3><select value={hangar} onChange={(e)=>setHangar(e.target.value)}>{HANGARS.map((h)=><option key={h}>{h}</option>)}</select></div><div className="card"><h3>Theme</h3><button onClick={()=>setTheme(theme==="dark"?"light":"dark")}>{theme==="dark"?"Light Mode":"Dark Mode"}</button></div><div className="card"><h3>Offline Queue</h3><p>{syncQueue.length} pending</p><button onClick={()=>setSyncQueue([])}>Clear Queue</button></div></div>
}
