import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Mail, Calendar, Settings, CheckCircle, Clock, Users, Plus, X, Download, MapPin, Edit2, Trash2, AlertTriangle, Loader2, Info, Building2, Menu, MessageSquare, Send, ChevronRight } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query, setDoc } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCYUHfKcsOZDu8nBwRbtUyEYTsVZns052I",
  authDomain: "machine-birthday-crm.firebaseapp.com",
  projectId: "machine-birthday-crm",
  storageBucket: "machine-birthday-crm.firebasestorage.app",
  messagingSenderId: "696470180088",
  appId: "1:696470180088:web:5b49d4507dd9883efd6b0d",
  measurementId: "G-4ZSN67XMQH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const getAppId = () => {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const fleetId = params.get('fleet');
    if (fleetId) return fleetId.replace(/[^a-zA-Z0-9]/g, '_');
  }
  const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'machine_bday_crm';
  return String(rawAppId).split('/').filter(Boolean).pop().replace(/[^a-zA-Z0-9]/g, '_');
};

const appId = getAppId();

// --- BRAND LOGO COMPONENT ---
const MachineBirthdayLogo = ({ className, colorized = false, showText = false }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <svg viewBox="0 0 400 400" className={`${showText ? 'w-10 h-10' : 'w-full h-full'}`}>
      <circle cx="200" cy="200" r="70" fill="none" stroke={colorized ? "#6366f1" : "currentColor"} strokeWidth="24" strokeDasharray="36 10" />
      <circle cx="200" cy="200" r="45" fill={colorized ? "#6366f1" : "currentColor"} />
      <path d="M200 175l7 15h16l-13 10 5 15-15-9-15 9 5-15-13-10h16z" fill="white" />
      <path d="M160 120c-10-20 10-30 0-50M240 120c10-20-10-30 0-50M200 110v-40" stroke={colorized ? "#ec4899" : "currentColor"} strokeWidth="8" strokeLinecap="round" fill="none" />
      <circle cx="140" cy="90" r="6" fill={colorized ? "#10b981" : "currentColor"} />
      <circle cx="260" cy="90" r="6" fill={colorized ? "#f59e0b" : "currentColor"} />
    </svg>
    {showText && (
      <div className="flex flex-col leading-none">
        <span className="text-xl font-black tracking-tighter uppercase italic">Machine</span>
        <span className="text-xl font-black tracking-tighter uppercase italic text-pink-500">Birthday</span>
      </div>
    )}
  </div>
);

// --- HELPER FUNCTIONS ---
const calculateMachineAge = (purchaseDate, lifespanYears) => {
  if (!purchaseDate) return { humanEquivalentYears: 0, stage: "Newborn" };
  let purchase = purchaseDate && typeof purchaseDate.toDate === 'function' ? purchaseDate.toDate() : new Date(purchaseDate);
  const now = new Date();
  if (isNaN(purchase.getTime())) return { humanEquivalentYears: 0, stage: "Newborn" };
  const monthsPassed = (now.getFullYear() - purchase.getFullYear()) * 12 + (now.getMonth() - purchase.getMonth());
  const totalLifespanMonths = (Number(lifespanYears) || 5) * 12;
  const humanEquivalentYears = Math.round((monthsPassed / totalLifespanMonths) * 80);
  let stage = "Newborn";
  if (humanEquivalentYears >= 74) stage = "Retiring";
  else if (humanEquivalentYears >= 64) stage = "Golden Years";
  else if (humanEquivalentYears >= 53) stage = "Veteran";
  else if (humanEquivalentYears >= 37) stage = "Prime / Mid-Life";
  else if (humanEquivalentYears >= 21) stage = "Young Adult";
  else if (humanEquivalentYears >= 10) stage = "Teen";
  else if (humanEquivalentYears >= 5) stage = "Child";
  else if (humanEquivalentYears >= 2) stage = "Toddler";
  return { humanEquivalentYears, stage };
};

const SafeVal = ({ value }) => {
  if (value === null || value === undefined) return "";
  return <span>{String(value)}</span>;
};

// --- CHATBOT LOGIC ---
const FAQ_DATA = {
  "initial": {
    text: "Hi! I'm your Machine Birthday assistant. How can I help you today?",
    options: [
      { label: "How does the 'Birthday' logic work?", next: "logic" },
      { label: "How do I add a new machine?", next: "add" },
      { label: "How do I export mailing labels?", next: "export" },
      { label: "I need to contact SpearPoint.", next: "contact" }
    ]
  },
  "logic": {
    text: "We use 'Machine Dog Years'. Based on a typical 5-year lifespan, we calculate how old a machine is in human years. When they hit milestones (like 'Teen' or 'Veteran'), they appear in your Mail Queue so you can send a celebration card!",
    options: [{ label: "Back to main menu", next: "initial" }]
  },
  "add": {
    text: "Click the big indigo 'Add Machine' button in the header. Fill in the customer name, purchase date, and address. Once saved, the machine will automatically start its journey from 'Newborn'!",
    options: [{ label: "Back to main menu", next: "initial" }]
  },
  "export": {
    text: "When machines are due for a card, they appear in 'Requires Action'. Click 'Export Labels' to download a CSV file ready for your printer or mail house.",
    options: [{ label: "Back to main menu", next: "initial" }]
  },
  "contact": {
    text: "You can reach the SpearPoint Solutions team at support@SpearPointOnline.com for technical support or for inquiries about creating a custom business strategy for your organization.",
    options: [{ label: "Back to main menu", next: "initial" }]
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("Syncing Fleet...");
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [subscriberLogo, setSubscriberLogo] = useState('');
  
  // Chatbot State
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([FAQ_DATA.initial]);
  const chatEndRef = useRef(null);

  const [formData, setFormData] = useState({
    customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5,
    address: '', city: '', state: '', zip: ''
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { setStatusMsg("Auth error."); setLoading(false); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => { if (u) setUser(u); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const machinesRef = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
    const unsubMachines = onSnapshot(machinesRef, (snapshot) => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      setStatusMsg("Permission Denied.");
      setLoading(false);
    });

    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'branding');
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) setSubscriberLogo(docSnap.data().logoUrl || '');
    }, (err) => {
      console.warn("Branding restricted.");
    });
    return () => { unsubMachines(); unsubSettings(); };
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const dashboardData = useMemo(() => {
    let toSend = []; let completed = [];
    machines.forEach(m => {
      const ageData = calculateMachineAge(m.purchaseDate, m.lifespanYears);
      if (ageData.stage !== "Newborn" && m.lastCardSent !== ageData.stage) toSend.push({ ...m, ...ageData });
      else completed.push({ ...m, ...ageData });
    });
    return { toSend, completed };
  }, [machines]);

  const handleChatOption = (nextKey) => {
    const nextStep = FAQ_DATA[nextKey];
    setChatHistory([...chatHistory, { type: 'user', text: chatHistory[chatHistory.length-1].options.find(o => o.next === nextKey).label }, nextStep]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
      const payload = { ...formData, lifespanYears: Number(formData.lifespanYears) || 5, updatedAt: new Date().toISOString() };
      if (editingId) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', editingId), payload);
      else await addDoc(colRef, { ...payload, lastCardSent: null, createdAt: new Date().toISOString() });
      setShowModal(false); setEditingId(null);
      setFormData({ customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5, address: '', city: '', state: '', zip: '' });
    } catch (err) { alert("Save error."); } 
    finally { setSubmitting(false); }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'branding'), { logoUrl: subscriberLogo }, { merge: true });
      setShowSettings(false);
    } catch (err) { alert("Save error."); }
  };

  const handleMarkSent = async (id, stage) => {
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', id), { lastCardSent: stage }); }
    catch (err) { console.error(err); }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) { console.error(err); }
  };

  const handleExportCSV = () => {
    if (dashboardData.toSend.length === 0) return alert("No cards currently due for export.");
    const headers = ["Customer", "Contact", "Address", "City", "State", "Zip", "Machine", "Stage", "Human Years"];
    const csvRows = [headers.join(",")];
    dashboardData.toSend.forEach(item => {
      const row = [`"${item.customer || ''}"`, `"${item.contact || ''}"`, `"${item.address || ''}"`, `"${item.city || ''}"`, `"${item.state || ''}"`, `"${item.zip || ''}"`, `"${item.machine || ''}"`, `"${item.stage || ''}"`, `"${item.humanEquivalentYears || ''}"`];
      csvRows.push(row.join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mailing-list-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const SidebarContent = () => (
    <>
      <div className="mb-12 hidden md:block"><MachineBirthdayLogo colorized showText /></div>
      <nav className="flex-1 space-y-3">
        <button className="w-full flex items-center gap-3 bg-indigo-800/60 p-4 rounded-2xl font-bold transition-all shadow-lg border border-white/5 uppercase tracking-widest text-[10px]"><Mail size={18}/> Mail Queue</button>
        <div className="flex items-center justify-between p-4 opacity-30 text-[10px] font-bold uppercase tracking-widest"><div className="flex items-center gap-3"><Users size={18}/> Customers</div><span>Soon</span></div>
        <div className="flex items-center justify-between p-4 opacity-30 text-[10px] font-bold uppercase tracking-widest"><div className="flex items-center gap-3"><Calendar size={18}/> Calendar</div><span>Soon</span></div>
      </nav>
      <div className="pt-6 border-t border-white/10 mt-auto text-[10px] font-bold uppercase tracking-widest text-white/40">
        <p className="mb-2 font-black text-indigo-400 tracking-tighter uppercase italic">{appId.replace(/_/g, ' ')} Fleet</p>
        <button onClick={() => { setShowSettings(true); setMobileMenuOpen(false); }} className="flex items-center gap-3 text-white/60 hover:text-white transition-colors text-sm font-bold w-full text-left"><Settings size={18}/> Branding</button>
      </div>
    </>
  );

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans">
      <Loader2 className="animate-spin text-indigo-600 mb-6" size={48} />
      <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight mb-2 italic">{statusMsg}</h2>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 selection:bg-indigo-100 relative overflow-hidden">
      
      {/* MOBILE HEADER */}
      <div className="md:hidden flex items-center justify-between p-4 bg-indigo-950 text-white z-50">
        <MachineBirthdayLogo colorized showText className="scale-75 origin-left" />
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 bg-white/10 rounded-xl"><Menu size={24} /></button>
      </div>

      {/* BACKGROUND LOGO */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center transition-all duration-1000">
        {subscriberLogo ? (
          <div className="w-full h-full opacity-[0.03]" style={{ backgroundImage: `url("${subscriberLogo}")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'clamp(250px, 40vw, 600px)' }} />
        ) : (
          <div className="opacity-[0.03] grayscale brightness-50"><MachineBirthdayLogo className="w-[300px] h-[300px] md:w-[500px] md:h-[500px]" /></div>
        )}
      </div>

      <div className="hidden md:flex w-64 bg-indigo-950 text-white p-6 flex flex-col shadow-2xl z-20"><SidebarContent /></div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-indigo-950 z-[60] p-6 flex flex-col">
          <div className="flex justify-between items-center mb-8"><MachineBirthdayLogo colorized showText /><button onClick={() => setMobileMenuOpen(false)} className="text-white"><X size={32}/></button></div>
          <SidebarContent />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-10 overflow-auto z-10 relative pb-24 md:pb-10">
        <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div><h1 className="text-3xl md:text-5xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Mail Queue</h1><p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-2 md:mt-3">Tracking {machines.length} Units</p></div>
          <div className="flex flex-row w-full lg:w-auto gap-3">
            <button onClick={handleExportCSV} className="flex-1 lg:flex-none bg-white border-2 border-slate-200 px-6 py-4 md:py-3 rounded-2xl font-black shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs md:text-sm text-slate-600"><Download size={18} /> Export Labels</button>
            <button onClick={() => { setEditingId(null); setFormData({customer:'', contact:'', machine:'', purchaseDate:'', lifespanYears:5, address:'', city:'', state:'', zip:''}); setShowModal(true); }} className="flex-1 lg:flex-none bg-indigo-600 text-white px-6 py-4 md:py-3 rounded-2xl font-black shadow-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-xs md:text-sm"><Plus size={18} /> Add Machine</button>
          </div>
        </header>

        <div className="flex items-center gap-3 mb-4 md:mb-6"><div className="bg-pink-500 w-2 h-6 md:w-3 md:h-8 rounded-full shadow-[0_0_12px_rgba(236,72,153,0.3)]"></div><h2 className="text-xl md:text-2xl font-bold uppercase tracking-tighter italic">Requires Action ({dashboardData.toSend.length})</h2></div>
        
        <div className="hidden md:block bg-white/80 backdrop-blur-sm rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden mb-12">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 text-[11px] font-bold uppercase tracking-widest text-slate-400 border-b"><tr><th className="p-6">Customer / Address</th><th className="p-6">Machine Details</th><th className="p-6 text-center">Life Stage</th><th className="p-6 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {dashboardData.toSend.length === 0 ? ( <tr><td colSpan="4" className="p-20 text-center text-slate-300 font-bold italic text-lg uppercase opacity-50 underline decoration-slate-100">No birthdays due today</td></tr> ) : (
                dashboardData.toSend.map(item => (
                  <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                    <td className="p-6"><div className="flex items-center gap-3 mb-1"><p className="font-bold text-slate-900 text-lg leading-none truncate max-w-[250px]"><SafeVal value={item.customer} /></p><div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingId(item.id); setFormData(item); setShowModal(true); }} className="text-slate-300 hover:text-indigo-600 p-2 bg-white border border-slate-100 rounded-xl shadow-sm transition-all"><Edit2 size={14}/></button><button onClick={() => setDeleteConfirmId(item.id)} className="text-slate-300 hover:text-red-500 p-2 bg-white border border-slate-100 rounded-xl shadow-sm transition-all"><Trash2 size={14}/></button></div></div><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1"><MapPin size={10} className="text-indigo-400" /> <SafeVal value={item.address} />, <SafeVal value={item.city} /> <SafeVal value={item.state} /></p></td>
                    <td className="p-6"><p className="font-bold text-slate-700 text-sm tracking-tight italic leading-none mb-1"><SafeVal value={item.machine} /></p><p className="text-[10px] text-slate-400 font-bold uppercase">Purchased: <SafeVal value={item.purchaseDate} /></p></td>
                    <td className="p-6 text-center"><span className="px-4 py-1.5 bg-pink-100 text-pink-700 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm"><SafeVal value={item.stage} /></span></td>
                    <td className="p-6 text-right"><button onClick={() => handleMarkSent(item.id, item.stage)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-indigo-700 active:translate-y-0.5 transition-all">Mark Sent</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-4 mb-12">
          {dashboardData.toSend.map(item => (
            <div key={item.id} className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100">
              <div className="flex justify-between items-start mb-4"><div><h3 className="font-black text-xl text-slate-900 leading-none mb-1"><SafeVal value={item.customer} /></h3><p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1"><MapPin size={10}/> {item.city}, {item.state}</p></div><div className="flex gap-2"><button onClick={() => { setEditingId(item.id); setFormData(item); setShowModal(true); }} className="p-2 bg-slate-50 rounded-xl text-slate-400"><Edit2 size={16}/></button><button onClick={() => setDeleteConfirmId(item.id)} className="p-2 bg-slate-50 rounded-xl text-red-300"><Trash2 size={16}/></button></div></div>
              <div className="bg-slate-50 p-4 rounded-2xl mb-4 flex justify-between items-center"><div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Machine</p><p className="font-bold text-slate-700">{item.machine}</p></div><div className="text-right"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stage</p><p className="font-black text-pink-500 uppercase text-xs tracking-tighter">{item.stage}</p></div></div>
              <button onClick={() => handleMarkSent(item.id, item.stage)} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-indigo-100">Mark Sent</button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mb-4 md:mb-6"><div className="bg-emerald-500 w-2 h-6 md:w-3 md:h-8 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.3)]"></div><h2 className="text-xl md:text-2xl font-bold uppercase tracking-tighter text-slate-800 italic">Up To Date ({dashboardData.completed.length})</h2></div>
        <div className="hidden md:block bg-white/60 backdrop-blur-sm rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden opacity-95 mb-10"><table className="w-full text-left border-collapse"><thead className="bg-slate-50/50 text-[11px] font-bold uppercase tracking-widest text-slate-400 border-b"><tr><th className="p-6 text-left">Customer</th><th className="p-6 text-left">Machine</th><th className="p-6 text-center">Status</th><th className="p-6 text-right">Next Stage</th></tr></thead><tbody className="divide-y divide-slate-50">{dashboardData.completed.map(item => (<tr key={item.id} className="hover:bg-slate-50/30 transition-colors group"><td className="p-6"><div className="flex items-center gap-3"><p className="font-bold text-slate-700 leading-tight"><SafeVal value={item.customer} /></p><div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditingId(item.id); setFormData(item); setShowModal(true); }} className="text-slate-300 hover:text-indigo-600 p-1.5"><Edit2 size={12}/></button><button onClick={() => setDeleteConfirmId(item.id)} className="text-slate-300 hover:text-red-500 p-1.5"><Trash2 size={12}/></button></div></div></td><td className="p-6 text-xs text-slate-500 font-bold uppercase tracking-widest"><SafeVal value={item.machine} /></td><td className="p-6 flex items-center gap-2 justify-center text-[10px] font-bold uppercase text-emerald-600 tracking-widest"><CheckCircle size={14} className="text-emerald-500" /> {item.stage === "Newborn" ? "Growing Up" : "Card Sent"}</td><td className="p-6 text-[10px] font-bold uppercase text-slate-300 tracking-widest leading-tight text-right uppercase">{item.stage === "Newborn" ? "Toddler (Age 2)" : "Next Milestone"}</td></tr>))}</tbody></table></div>
        <div className="md:hidden space-y-3">{dashboardData.completed.map(item => (<div key={item.id} className="bg-white/70 p-5 rounded-3xl border border-slate-100 flex justify-between items-center"><div><p className="font-bold text-slate-700 text-sm">{item.customer}</p><p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em]">{item.machine}</p></div><div className="flex items-center gap-2 text-[9px] font-black uppercase text-emerald-500 bg-emerald-50 px-3 py-1.5 rounded-full"><CheckCircle size={10}/> {item.stage === "Newborn" ? "New" : "Sent"}</div></div>))}</div>
      </div>

      {/* CHATBOT WIDGET */}
      <div className={`fixed bottom-6 right-6 z-[200] flex flex-col items-end transition-all duration-300 ${chatOpen ? 'w-[350px] md:w-[400px]' : 'w-14'}`}>
        {chatOpen && (
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 w-full mb-4 flex flex-col h-[500px] animate-in slide-in-from-bottom-5">
            <div className="bg-indigo-600 p-6 rounded-t-[2rem] flex justify-between items-center text-white">
              <div className="flex items-center gap-3 font-bold uppercase tracking-widest text-xs">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
                Assistant
              </div>
              <button onClick={() => setChatOpen(false)} className="bg-white/10 p-2 rounded-xl hover:bg-white/20 transition-colors"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${msg.type === 'user' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'bg-slate-50 text-slate-600 font-medium'}`}>
                    {msg.text}
                  </div>
                  {msg.options && !chatHistory[i+1] && (
                    <div className="mt-3 flex flex-col gap-2 w-full">
                      {msg.options.map((opt, oi) => (
                        <button key={oi} onClick={() => handleChatOption(opt.next)} className="text-left bg-white border border-slate-200 p-3 rounded-xl text-xs font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-between group">
                          {opt.label} <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 border-t bg-slate-50 rounded-b-[2rem] flex items-center gap-3">
              <input disabled placeholder="Ask a question..." className="flex-1 bg-white border border-slate-200 px-4 py-3 rounded-xl text-xs outline-none opacity-50 cursor-not-allowed" />
              <button disabled className="bg-indigo-400 text-white p-3 rounded-xl"><Send size={18}/></button>
            </div>
          </div>
        )}
        <button onClick={() => setChatOpen(!chatOpen)} className="bg-indigo-600 text-white p-4 rounded-full shadow-2xl hover:bg-indigo-700 hover:scale-110 active:scale-95 transition-all">
          {chatOpen ? <X size={24}/> : <MessageSquare size={24}/>}
        </button>
      </div>

      {/* MODALS */}
      {showModal && (
        <div className="fixed inset-0 bg-indigo-950 md:bg-indigo-950/80 backdrop-blur-xl flex items-center justify-center z-[100] p-0 md:p-4 font-sans overflow-auto">
          <div className="bg-white md:rounded-[2.5rem] shadow-2xl w-full max-w-xl min-h-screen md:min-h-0 overflow-hidden flex flex-col">
            <div className="p-6 md:p-10 border-b flex justify-between items-center bg-slate-50/50"><h3 className="font-black text-xl md:text-3xl text-slate-950 tracking-tighter uppercase italic leading-none">{editingId ? 'Edit Record' : 'Add New Machine'}</h3><button onClick={() => setShowModal(false)} className="bg-slate-200 text-slate-600 p-2 rounded-full hover:bg-slate-300 transition-colors"><X size={24}/></button></div>
            <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-4 md:space-y-6 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Customer Full Name</label><input required placeholder="First and Last" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})} /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Contact Person</label><input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} /></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mailing Address</label><input className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} /></div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <input placeholder="CITY" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                <input placeholder="ST" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm text-center uppercase" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                <div className="col-span-2 md:col-span-1"><input placeholder="ZIP" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm" value={formData.zip} onChange={e => setFormData({...formData, zip: e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Model Name</label><input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={formData.machine} onChange={e => setFormData({...formData, machine: e.target.value})} /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Purchase Date</label><input required type="date" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm uppercase" value={formData.purchaseDate} onChange={e => setFormData({...formData, purchaseDate: e.target.value})} /></div>
              </div>
              <button disabled={submitting} type="submit" className="w-full bg-indigo-600 text-white font-bold py-6 rounded-[2rem] shadow-2xl hover:bg-indigo-700 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 transition-all uppercase tracking-widest text-lg mt-4">{submitting ? <Loader2 className="animate-spin" /> : 'Save to Database'}</button>
            </form>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-indigo-950/80 backdrop-blur-xl flex items-center justify-center z-[100] p-4 font-sans">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
            <div className="p-6 md:p-10 border-b flex justify-between items-center bg-slate-50/50"><h3 className="font-bold text-xl text-slate-950 tracking-tighter uppercase italic flex items-center gap-3"><Building2 className="text-indigo-600" /> Branding</h3><button onClick={() => setShowSettings(false)} className="bg-slate-200 text-slate-600 p-2 rounded-full hover:bg-slate-300 transition-colors"><X size={24}/></button></div>
            <form onSubmit={handleSaveSettings} className="p-6 md:p-10 space-y-6">
              <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subscriber Logo URL</label><input placeholder="https://example.com/logo.png" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={subscriberLogo} onChange={e => setSubscriberLogo(e.target.value)} /></div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-5 rounded-2xl shadow-xl hover:bg-indigo-700 uppercase tracking-widest text-sm">Apply Branding</button>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[100] p-4 font-sans text-center">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 max-w-sm shadow-2xl border border-white/10 animate-in fade-in duration-200">
            <div className="bg-red-50 text-red-500 w-16 h-16 md:w-24 md:h-24 rounded-full flex items-center justify-center mx-auto mb-6 md:mb-8 shadow-inner shadow-red-100/50"><AlertTriangle size={48}/></div>
            <h3 className="text-2xl md:text-3xl font-bold mb-3 tracking-tighter uppercase text-slate-900 italic">Purge Data?</h3>
            <p className="text-slate-500 font-bold mb-8 md:mb-10 leading-relaxed text-xs md:text-sm">This record will be permanently deleted from the cloud.</p>
            <div className="flex gap-4"><button onClick={() => setDeleteConfirmId(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 py-4 rounded-2xl font-black transition-colors uppercase text-[10px] tracking-widest">Cancel</button><button onClick={handleDelete} className="flex-1 bg-red-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-200 hover:bg-red-600 active:scale-95 transition-all uppercase text-[10px] tracking-widest">Purge</button></div>
          </div>
        </div>
      )}
    </div>
  );
}