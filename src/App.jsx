import React, { useState, useMemo, useEffect } from 'react';
import { Mail, Calendar, Settings, CheckCircle, Clock, Users, Plus, X, Download, MapPin, Edit2, Trash2, AlertTriangle, Loader2, Info, Building2 } from 'lucide-react';
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

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'machine_bday_crm';
const appId = String(rawAppId).split('/').filter(Boolean).pop().replace(/[^a-zA-Z0-9]/g, '_');

// --- BRAND LOGO COMPONENTS ---

// This icon is used in the sidebar and as a watermark
const MachineBirthdayLogo = ({ className, colorized = false, showText = false }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <svg viewBox="0 0 400 400" className={`${showText ? 'w-10 h-10' : 'w-full h-full'}`}>
      {/* Industrial Gear Base */}
      <circle 
        cx="200" cy="200" r="70" 
        fill="none" 
        stroke={colorized ? "#6366f1" : "currentColor"} 
        strokeWidth="24" 
        strokeDasharray="36 10" 
      />
      <circle 
        cx="200" cy="200" r="45" 
        fill={colorized ? "#6366f1" : "currentColor"} 
      />
      {/* Center Star */}
      <path 
        d="M200 175l7 15h16l-13 10 5 15-15-9-15 9 5-15-13-10h16z" 
        fill="white" 
      />
      {/* Festive Confetti/Streamers */}
      <path 
        d="M160 120c-10-20 10-30 0-50M240 120c10-20-10-30 0-50M200 110v-40" 
        stroke={colorized ? "#ec4899" : "currentColor"} 
        strokeWidth="8" 
        strokeLinecap="round" 
        fill="none" 
      />
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
  if (typeof value === 'string' || typeof value === 'number') return <span>{value}</span>;
  if (typeof value === 'object' && value.toDate) return <span>{value.toDate().toLocaleDateString()}</span>;
  return <span>{String(value)}</span>;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("Initializing...");
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [subscriberLogo, setSubscriberLogo] = useState('');
  
  const [formData, setFormData] = useState({
    customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5,
    address: '', city: '', state: '', zip: ''
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        setStatusMsg("Authenticating...");
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setStatusMsg("Auth failed. Check settings.");
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setStatusMsg("Connected. Syncing fleet..."); }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const machinesRef = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
    const unsubMachines = onSnapshot(machinesRef, (snapshot) => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      setStatusMsg(`Permission Denied. Path: artifacts/${appId}/...`);
      setLoading(false);
    });

    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'branding');
    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) { setSubscriberLogo(docSnap.data().logoUrl || ''); }
    });
    return () => { unsubMachines(); unsubSettings(); };
  }, [user]);

  const dashboardData = useMemo(() => {
    let toSend = []; let completed = [];
    machines.forEach(m => {
      const ageData = calculateMachineAge(m.purchaseDate, m.lifespanYears);
      if (ageData.stage !== "Newborn" && m.lastCardSent !== ageData.stage) toSend.push({ ...m, ...ageData });
      else completed.push({ ...m, ...ageData });
    });
    return { 
      toSend: toSend.sort((a,b) => (Number(b.humanEquivalentYears) || 0) - (Number(a.humanEquivalentYears) || 0)), 
      completed: completed.sort((a,b) => (Number(b.humanEquivalentYears) || 0) - (Number(a.humanEquivalentYears) || 0))
    };
  }, [machines]);

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
    } catch (err) { alert("Error saving record."); } 
    finally { setSubmitting(false); }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'branding');
      await setDoc(settingsRef, { logoUrl: subscriberLogo }, { merge: true });
      setShowSettings(false);
    } catch (err) { alert("Error saving settings."); }
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
    if (dashboardData.toSend.length === 0) return alert("No cards due.");
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

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans">
      <Loader2 className="animate-spin text-indigo-600 mb-6" size={48} />
      <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight mb-2 italic">Syncing Fleet Database</h2>
      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">{statusMsg}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 selection:bg-indigo-100 relative overflow-hidden">
      
      {/* BACKGROUND BRANDING LOGO (Watermark) */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center transition-all duration-1000">
        {subscriberLogo ? (
          <div 
            className="w-full h-full opacity-[0.04]"
            style={{ 
              backgroundImage: `url("${subscriberLogo}")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              backgroundSize: 'clamp(300px, 40vw, 600px)'
            }}
          />
        ) : (
          <div className="opacity-[0.05] grayscale brightness-50">
            <MachineBirthdayLogo className="w-[500px] h-[500px]" />
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div className="w-64 bg-indigo-950 text-white p-6 flex flex-col shadow-2xl z-20">
        <div className="mb-12">
          {/* UPDATED: Custom Brand Logo replacing generic icon/text */}
          <MachineBirthdayLogo colorized showText />
        </div>
        
        <nav className="flex-1 space-y-3">
          <button className="w-full flex items-center gap-3 bg-indigo-800/60 p-4 rounded-2xl font-bold transition-all shadow-lg border border-white/5 uppercase tracking-widest text-[10px]"><Mail size={18}/> Mail Queue</button>
          <div className="flex items-center justify-between p-4 opacity-30 text-[10px] font-bold uppercase tracking-widest"><div className="flex items-center gap-3"><Users size={18}/> Customers</div><span>Soon</span></div>
          <div className="flex items-center justify-between p-4 opacity-30 text-[10px] font-bold uppercase tracking-widest"><div className="flex items-center gap-3"><Calendar size={18}/> Calendar</div><span>Soon</span></div>
        </nav>
        
        <div className="pt-6 border-t border-white/10 mt-auto text-[10px] font-bold uppercase tracking-widest text-white/40">
          <p className="mb-4 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-amber-400'}`}></span>
            {user ? "Cloud Active" : "Connecting..."}
          </p>
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-3 text-white/60 hover:text-white transition-colors text-sm font-bold w-full text-left">
            <Settings size={18}/> Branding
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-auto z-10 relative">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h1 className="text-5xl font-black tracking-tighter text-slate-900 uppercase italic leading-none">Mail Queue</h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest mt-3">Fleet Size: {machines.length} Units</p>
          </div>
          <div className="flex gap-4">
            <button onClick={handleExportCSV} className="bg-white border-2 border-slate-200 px-6 py-3 rounded-full flex items-center gap-2 text-sm font-bold shadow-sm hover:bg-slate-50 transition-all uppercase tracking-widest active:scale-95">Export Labels</button>
            <button onClick={() => { setEditingId(null); setFormData({customer:'', contact:'', machine:'', purchaseDate:'', lifespanYears:5, address:'', city:'', state:'', zip:''}); setShowModal(true); }} className="bg-indigo-600 text-white px-10 py-3 rounded-full font-bold shadow-xl hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest">Add Machine</button>
          </div>
        </header>

        {/* SECTION: REQUIRES ACTION */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-pink-500 w-3 h-8 rounded-full shadow-[0_0_12px_rgba(236,72,153,0.3)]"></div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter italic">Requires Action ({dashboardData.toSend.length})</h2>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden mb-16">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 text-[11px] font-bold uppercase tracking-widest text-slate-400 border-b">
              <tr><th className="p-6 text-left">Customer / Address</th><th className="p-6 text-left">Machine Details</th><th className="p-6 text-center">Life Stage</th><th className="p-6 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboardData.toSend.length === 0 ? (
                <tr><td colSpan="4" className="p-24 text-center text-slate-300 font-bold italic text-lg tracking-tighter uppercase opacity-50 underline decoration-slate-100">No birthdays due today</td></tr>
              ) : (
                dashboardData.toSend.map(item => (
                  <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                    <td className="p-6">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-bold text-slate-900 text-lg leading-none truncate max-w-[250px]"><SafeVal value={item.customer} /></p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => { setEditingId(item.id); setFormData(item); setShowModal(true); }} className="text-slate-300 hover:text-indigo-600 p-2 bg-white border border-slate-100 rounded-xl shadow-sm transition-all"><Edit2 size={14}/></button>
                           <button onClick={() => setDeleteConfirmId(item.id)} className="text-slate-300 hover:text-red-500 p-2 bg-white border border-slate-100 rounded-xl shadow-sm transition-all"><Trash2 size={14}/></button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                        <MapPin size={10} className="text-indigo-400" /> <SafeVal value={item.address} />, <SafeVal value={item.city} /> <SafeVal value={item.state} />
                      </p>
                    </td>
                    <td className="p-6">
                      <p className="font-bold text-slate-700 text-sm tracking-tight italic leading-none mb-1"><SafeVal value={item.machine} /></p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Purchased: <SafeVal value={item.purchaseDate} /></p>
                    </td>
                    <td className="p-6 text-center">
                      <span className="px-4 py-1.5 bg-pink-100 text-pink-700 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm"><SafeVal value={item.stage} /></span>
                    </td>
                    <td className="p-6 text-right">
                      <button onClick={() => handleMarkSent(item.id, item.stage)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg hover:bg-indigo-700 active:translate-y-0.5 transition-all">Mark Sent</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* SECTION: UP TO DATE */}
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-500 w-3 h-8 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.3)]"></div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter text-slate-800 italic">Up To Date ({dashboardData.completed.length})</h2>
        </div>
        <div className="bg-white/60 backdrop-blur-sm rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden opacity-95 mb-10">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 text-[11px] font-bold uppercase tracking-widest text-slate-400 border-b">
              <tr><th className="p-6 text-left">Customer</th><th className="p-6 text-left">Machine</th><th className="p-6 text-center">Status</th><th className="p-6 text-right">Next Stage</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {dashboardData.completed.length === 0 ? (
                <tr><td colSpan="4" className="p-16 text-center text-slate-300 font-bold italic text-lg tracking-tighter uppercase opacity-50 underline decoration-slate-100">No records found</td></tr>
              ) : (
                dashboardData.completed.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-slate-700 leading-tight"><SafeVal value={item.customer} /></p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => { setEditingId(item.id); setFormData(item); setShowModal(true); }} className="text-slate-300 hover:text-indigo-600 p-1.5 bg-white border border-slate-100 rounded-lg shadow-sm transition-all"><Edit2 size={12}/></button>
                           <button onClick={() => setDeleteConfirmId(item.id)} className="text-slate-300 hover:text-red-500 p-1.5 bg-white border border-slate-100 rounded-lg shadow-sm transition-all"><Trash2 size={12}/></button>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 text-xs text-slate-500 font-bold uppercase tracking-widest"><SafeVal value={item.machine} /></td>
                    <td className="p-6 flex items-center gap-2 justify-center text-[10px] font-bold uppercase text-emerald-600 tracking-widest">
                      <CheckCircle size={14} className="text-emerald-500" /> {item.stage === "Newborn" ? "Growing Up" : "Card Sent"}
                    </td>
                    <td className="p-6 text-[10px] font-bold uppercase text-slate-300 tracking-widest leading-tight text-right uppercase">
                      {item.stage === "Newborn" ? "Toddler (Age 2)" : 
                       item.stage === "Toddler" ? "Child (Age 5)" :
                       item.stage === "Child" ? "Teen (Age 10)" :
                       item.stage === "Teen" ? "Young Adult (Age 21)" : "Fleet Veteran"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALS */}
      {showModal && (
        <div className="fixed inset-0 bg-indigo-950/80 backdrop-blur-xl flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-3xl text-slate-950 tracking-tighter uppercase italic leading-none">{editingId ? 'Edit Record' : 'Add New Machine'}</h3>
              <button onClick={() => setShowModal(false)} className="bg-slate-200 text-slate-600 p-2 rounded-full hover:bg-slate-300 transition-colors"><X size={24}/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Customer Full Name</label><input required placeholder="First and Last Name" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm" value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})} /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Contact Person</label><input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} /></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Mailing Address</label><input className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} /></div>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="CITY" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                <input placeholder="ST" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm text-center uppercase" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                <input placeholder="ZIP" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-bold outline-none focus:border-indigo-500 text-sm" value={formData.zip} onChange={e => setFormData({...formData, zip: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-5 pt-2">
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Model Name</label><input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm" value={formData.machine} onChange={e => setFormData({...formData, machine: e.target.value})} /></div>
                <div className="space-y-1"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Purchase Date</label><input required type="date" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-bold text-slate-700 text-sm uppercase" value={formData.purchaseDate} onChange={e => setFormData({...formData, purchaseDate: e.target.value})} /></div>
              </div>
              <button disabled={submitting} type="submit" className="w-full bg-indigo-600 text-white font-bold py-6 rounded-[2rem] shadow-2xl hover:bg-indigo-700 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 transition-all uppercase tracking-widest text-lg mt-4">
                {submitting ? <Loader2 className="animate-spin" /> : editingId ? 'Update Record' : 'Save to Database'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-indigo-950/80 backdrop-blur-xl flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-2xl text-slate-950 tracking-tighter uppercase italic flex items-center gap-3">
                <Building2 className="text-indigo-600" /> Branding
              </h3>
              <button onClick={() => setShowSettings(false)} className="bg-slate-200 text-slate-600 p-2 rounded-full hover:bg-slate-300 transition-colors"><X size={24}/></button>
            </div>
            <form onSubmit={handleSaveSettings} className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subscriber Logo URL</label>
                <input placeholder="https://example.com/logo.png" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={subscriberLogo} onChange={e => setSubscriberLogo(e.target.value)} />
                <p className="text-[10px] text-slate-400 italic mt-2 leading-relaxed">Leave blank to use the built-in Machine Birthday watermark.</p>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-5 rounded-2xl shadow-xl hover:bg-indigo-700 active:scale-95 transition-all uppercase tracking-widest text-sm">Apply Branding</button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[60] p-4 font-sans text-center">
          <div className="bg-white rounded-[2.5rem] p-12 max-w-sm shadow-2xl border border-white/10 animate-in fade-in duration-200">
            <div className="bg-red-50 text-red-500 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner shadow-red-100/50"><AlertTriangle size={48}/></div>
            <h3 className="text-3xl font-bold mb-3 tracking-tighter uppercase text-slate-900 italic">Purge Data?</h3>
            <p className="text-slate-500 font-bold mb-10 leading-relaxed text-sm">This record will be permanently deleted from the cloud. There is no undo.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 py-5 rounded-2xl font-bold transition-colors uppercase text-[10px] tracking-widest">Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 text-white py-5 rounded-2xl font-black shadow-lg shadow-red-200 hover:bg-red-600 active:scale-95 transition-all uppercase text-[10px] tracking-widest">Purge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}