import React, { useState, useMemo, useEffect } from 'react';
import { Gift, Mail, Calendar, Settings, CheckCircle, Clock, Users, Plus, X, Download, MapPin, Edit2, Trash2, AlertTriangle, Loader2, Info } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query } from 'firebase/firestore';

// --- 𝗙𝗜𝗥𝗘𝗕𝗔𝗦𝗘 𝗜𝗡𝗜𝗧𝗜𝗔𝗟𝗜𝗭𝗔𝗧𝗜𝗢𝗡 ---
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

// 𝗥𝗨𝗟𝗘 𝟭 𝗙𝗜𝗫: Ensuring appId is a single string segment for a 5-segment path.
// This prevents the "Invalid collection reference" error by keeping the path at an odd number of segments.
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'machine_bday_crm';
const appId = String(rawAppId).split('/').pop().replace(/[^a-zA-Z0-9]/g, '_');

// --- 𝗛𝗘𝗟𝗣𝗘𝗥 𝗙𝗨𝗡𝗖𝗧𝗜𝗢𝗡𝗦 ---
const calculateMachineAge = (purchaseDate, lifespanYears) => {
  if (!purchaseDate) return { humanEquivalentYears: 0, stage: "Newborn" };
  
  let purchase;
  if (purchaseDate && typeof purchaseDate.toDate === 'function') {
    purchase = purchaseDate.toDate();
  } else {
    purchase = new Date(purchaseDate);
  }
  
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

export default function App() {
  const [user, setUser] = useState(null);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("Initializing...");
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5,
    address: '', city: '', state: '', zip: ''
  });

  // 𝗦𝗮𝗳𝗲 𝗥𝗲𝗻д𝗲𝗿 helper to avoid React child errors
  const s = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string' || typeof val === 'number') return val;
    if (typeof val === 'object' && val.toDate) return val.toDate().toLocaleDateString();
    return String(val);
  };

  // 𝗥𝗨𝗟𝗘 𝟯: Auth FIRST
  useEffect(() => {
    const initAuth = async () => {
      if (firebaseConfig.apiKey.includes("YOUR_ACTUAL_API_KEY")) {
        setStatusMsg("Missing API Key. Update App.jsx with real keys.");
        setLoading(false);
        return;
      }
      try {
        setStatusMsg("Authenticating...");
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setStatusMsg("Auth failed. Please check Firebase settings.");
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        setStatusMsg("Connected. Syncing...");
      }
    });
    return () => unsubscribe();
  }, []);

  // 𝗥𝗨𝗟𝗘 𝟯: Fetch Data AFTER Auth
  useEffect(() => {
    if (!user) return;
    
    // Using standard path: artifacts/{appId}/public/data/machines
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
    
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      console.error("Firestore Error:", err);
      setStatusMsg("𝗣𝗲𝗿𝗺𝗶𝘀𝘀𝗶𝗼𝗻 𝗗𝗲𝗻𝗶𝗲𝗱. Path: " + appId);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  const dashboardData = useMemo(() => {
    let toSend = [];
    let completed = [];
    machines.forEach(m => {
      const ageData = calculateMachineAge(m.purchaseDate, m.lifespanYears);
      if (ageData.stage !== "Newborn" && m.lastCardSent !== ageData.stage) {
        toSend.push({ ...m, ...ageData });
      } else {
        completed.push({ ...m, ...ageData });
      }
    });
    return { 
      toSend: toSend.sort((a,b) => (Number(b.humanEquivalentYears) || 0) - (Number(a.humanEquivalentYears) || 0)), 
      completed: completed.sort((a,b) => (Number(b.humanEquivalentYears) || 0) - (Number(a.humanEquivalentYears) || 0))
    };
  }, [machines]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
      const payload = { ...formData, lifespanYears: Number(formData.lifespanYears) || 5 };
      if (editingId) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', editingId), payload);
      } else {
        await addDoc(colRef, { ...payload, lastCardSent: null, createdAt: new Date().toISOString() });
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5, address: '', city: '', state: '', zip: '' });
    } catch (err) {
      console.error("Save Error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkSent = async (id, stage) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', id), { lastCardSent: stage });
    } catch (err) { console.error("Update Error:", err); }
  };

  const handleDelete = async () => {
    if (!user || !deleteConfirmId) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) { console.error("Delete Error:", err); }
  };

  const handleExportCSV = () => {
    if (dashboardData.toSend.length === 0) return alert("No cards are currently due for export.");
    const headers = ["Customer", "Contact", "Address", "City", "State", "Zip", "Machine", "Stage", "Human Years"];
    const csvRows = [headers.join(",")];
    dashboardData.toSend.forEach(item => {
      const row = [`"${s(item.customer)}"`, `"${s(item.contact)}"`, `"${s(item.address)}"`, `"${s(item.city)}"`, `"${s(item.state)}"`, `"${s(item.zip)}"`, `"${s(item.machine)}"`, `"${s(item.stage)}"`, `"${s(item.humanEquivalentYears)}"`];
      csvRows.push(row.join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `mailing-list-${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center font-sans">
      <Loader2 className="animate-spin text-indigo-600 mb-6" size={48} />
      <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2 italic">𝗦𝘆𝗻𝗰𝗶𝗻𝗴 𝗙𝗹𝗲𝗲𝘁 𝗗𝗮𝘁𝗮𝗯𝗮𝘀𝗲</h2>
      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">{statusMsg}</p>
      {statusMsg.includes("Denied") && (
        <div className="mt-8 bg-amber-50 border border-amber-200 p-6 rounded-2xl max-w-sm text-left shadow-sm">
          <div className="flex gap-2 text-amber-700 font-black mb-3 items-center"><Info size={20} /> 𝗣𝗲𝗿𝗺𝗶𝘀𝘀𝗶𝗼𝗻 𝗗𝗲𝗻𝗶𝗲𝗱</div>
          <p className="text-xs text-amber-800 leading-relaxed font-bold">
            𝟭. Go to Firebase Console {"→"} Auth {"→"} Enable "Anonymous".<br/>
            𝟮. Go to Firestore {"→"} Rules {"→"} Ensure rules are Published.<br/>
            𝟯. Current Path ID: <code className="bg-amber-100 px-1 rounded">{appId}</code>
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 selection:bg-indigo-100">
      {/* Sidebar */}
      <div className="w-64 bg-indigo-950 text-white p-6 flex flex-col shadow-2xl z-20">
        <div className="flex items-center gap-3 font-black text-2xl mb-12 italic tracking-tighter"><Gift className="text-pink-400 shrink-0" />𝗠𝗮𝗰𝗵𝗶𝗻𝗲𝗕𝗱𝗮𝘆</div>
        <nav className="flex-1 space-y-3">
          <button className="w-full flex items-center gap-3 bg-indigo-800/60 p-4 rounded-2xl font-black transition-all shadow-lg border border-white/5 uppercase tracking-widest text-[10px]"><Mail size={18}/> 𝗠𝗮𝗶𝗹 𝗤𝘂𝗲𝘂𝗲</button>
          <div className="flex items-center justify-between p-4 opacity-30 text-[10px] font-black uppercase tracking-widest"><div className="flex items-center gap-3"><Users size={18}/> 𝗖𝘂𝘀𝘁𝗼𝗺𝗲𝗿𝘀</div><span>𝗦𝗼𝗼𝗻</span></div>
          <div className="flex items-center justify-between p-4 opacity-30 text-[10px] font-black uppercase tracking-widest"><div className="flex items-center gap-3"><Calendar size={18}/> 𝗖𝗮𝗹𝗲𝗻𝗱𝗮𝗿</div><span>𝗦𝗼𝗼𝗻</span></div>
        </nav>
        <div className="pt-6 border-t border-white/10 mt-auto text-[10px] font-black uppercase tracking-widest text-white/40">
          <p className="mb-4 flex items-center gap-2 font-bold"><span className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-amber-400'}`}></span> {user ? "𝗖𝗹𝗼𝘂𝗱 𝗔𝗰𝘁𝗶𝘃𝗲" : "𝗔𝘂𝘁𝗵𝗲𝗻𝘁𝗶𝗰𝗮𝘁𝗶𝗻𝗴..."}</p>
          <button className="flex items-center gap-3 text-white/60 hover:text-white transition-colors text-sm font-black"><Settings size={18}/> 𝗦𝗲𝘁𝘁𝗶𝗻𝗴𝘀</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div><h1 className="text-5xl font-black tracking-tighter text-slate-900 uppercase italic">𝗠𝗮𝗶𝗹 𝗤𝘂𝗲𝘂𝗲</h1><p className="text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] mt-2">𝗙𝗹𝗲𝗲𝘁 𝗦𝗶𝘇𝗲: {machines.length} 𝗨𝗻𝗶𝘁𝘀</p></div>
          <div className="flex gap-4">
            <button onClick={handleExportCSV} className="bg-white border-2 border-slate-200 px-6 py-3 rounded-full flex items-center gap-2 text-sm font-black shadow-sm hover:bg-slate-50 transition-all uppercase tracking-widest">𝗘𝘅𝗽𝗼𝗿𝘁 𝗟𝗮𝗯𝗲𝗹𝘀</button>
            <button onClick={() => { setEditingId(null); setFormData({customer:'', contact:'', machine:'', purchaseDate:'', lifespanYears:5, address:'', city:'', state:'', zip:''}); setShowModal(true); }} className="bg-indigo-600 text-white px-10 py-3 rounded-full font-black shadow-xl hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest">𝗔𝗱𝗱 𝗠𝗮𝗰𝗵𝗶𝗻𝗲</button>
          </div>
        </header>

        {/* SECTION: REQUIRES ACTION */}
        <div className="flex items-center gap-3 mb-6"><div className="bg-pink-500 w-3 h-8 rounded-full shadow-[0_0_12px_rgba(236,72,153,0.3)]"></div><h2 className="text-2xl font-black uppercase tracking-tighter italic">𝗥𝗲𝗾𝘂𝗶𝗿𝗲𝘀 𝗔𝗰𝘁𝗶𝗼𝗻 ({dashboardData.toSend.length})</h2></div>
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden mb-16">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b">
              <tr><th className="p-6">𝗖𝘂𝘀𝘁𝗼𝗺𝗲𝗿 / 𝗔𝗱д𝗿𝗲𝘀𝘀</th><th className="p-6">𝗠𝗮𝗰𝗵𝗶𝗻𝗲</th><th className="p-6 text-center">𝗟𝗶𝗳𝗲 𝗦𝘁𝗮𝗴𝗲</th><th className="p-6 text-right">𝗔𝗰𝘁𝗶𝗼𝗻</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboardData.toSend.length === 0 ? (
                <tr><td colSpan="4" className="p-24 text-center text-slate-300 font-black italic text-lg tracking-tighter uppercase opacity-50">𝗡𝗼 𝗯𝗶𝗿𝘁𝗵д𝗮𝘆𝘀 𝗱𝘂𝗲 𝗶𝗻 𝘁𝗵𝗲 𝗾𝘂𝗲𝘂𝗲 𝘁𝗼𝗱𝗮𝘆</td></tr>
              ) : (
                dashboardData.toSend.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="p-6">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-black text-slate-900 text-lg leading-none">{s(item.customer)}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => { setEditingId(item.id); setFormData(item); setShowModal(true); }} className="text-slate-300 hover:text-indigo-600 p-2 bg-white border border-slate-100 rounded-xl shadow-sm transition-all"><Edit2 size={14}/></button>
                           <button onClick={() => setDeleteConfirmId(item.id)} className="text-slate-300 hover:text-red-500 p-2 bg-white border border-slate-100 rounded-xl shadow-sm transition-all"><Trash2 size={14}/></button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1"><MapPin size={10} className="text-indigo-400" /> {s(item.address)}, {s(item.city)} {s(item.state)}</p>
                    </td>
                    <td className="p-6 font-bold text-slate-700 text-sm tracking-tight italic">{s(item.machine)}</td>
                    <td className="p-6 text-center"><span className="px-4 py-1.5 bg-pink-100 text-pink-700 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">{s(item.stage)}</span></td>
                    <td className="p-6 text-right"><button onClick={() => handleMarkSent(item.id, item.stage)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 hover:shadow-indigo-200 transition-all active:translate-y-0.5">𝗠𝗮𝗿𝗸 𝗦𝗲𝗻𝘁</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* SECTION: UP TO DATE */}
        <div className="flex items-center gap-3 mb-6"><div className="bg-emerald-500 w-3 h-8 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.3)]"></div><h2 className="text-2xl font-black uppercase tracking-tighter text-slate-800 italic">𝗨𝗽 𝗧𝗼 𝗗𝗮𝘁𝗲 ({dashboardData.completed.length})</h2></div>
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden opacity-95 mb-10">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b">
              <tr><th className="p-6">𝗖𝘂𝘀𝘁𝗼𝗺𝗲𝗿</th><th className="p-6">𝗠𝗮𝗰𝗵𝗶𝗻𝗲</th><th className="p-6">𝗦𝘁𝗮𝘁𝘂𝘀</th><th className="p-6 text-right">𝗡𝗲𝘅𝘁 𝗦𝘁𝗮𝗴𝗲</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {dashboardData.completed.length === 0 ? (
                <tr><td colSpan="4" className="p-16 text-center text-slate-300 font-black italic text-lg tracking-tighter uppercase opacity-50 underline decoration-slate-100">𝗡𝗼 𝗲𝘅𝗶𝘀𝘁𝗶𝗻𝗴 𝗿𝗲𝗰𝗼𝗿𝗱𝘀 𝗳𝗼𝘂𝗻д</td></tr>
              ) : (
                dashboardData.completed.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group border-b last:border-0">
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <p className="font-black text-slate-700 leading-tight">{s(item.customer)}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => { setEditingId(item.id); setFormData(item); setShowModal(true); }} className="text-slate-300 hover:text-indigo-600 p-1.5 bg-white border border-slate-100 rounded-lg shadow-sm transition-all"><Edit2 size={12}/></button>
                           <button onClick={() => setDeleteConfirmId(item.id)} className="text-slate-300 hover:text-red-500 p-1.5 bg-white border border-slate-100 rounded-lg shadow-sm transition-all"><Trash2 size={12}/></button>
                        </div>
                      </div>
                    </td>
                    <td className="p-6 text-xs text-slate-500 font-bold uppercase tracking-widest">{s(item.machine)}</td>
                    <td className="p-6 flex items-center gap-2 text-[10px] font-black uppercase text-emerald-600 tracking-widest">
                      <CheckCircle size={14} className="text-emerald-500" /> {item.stage === "Newborn" ? "𝗚𝗿𝗼𝘄𝗶𝗻𝗴 𝗨𝗽" : "𝗖𝗮𝗿д 𝗦𝗲𝗻𝘁"}
                    </td>
                    <td className="p-6 text-[10px] font-black uppercase text-slate-300 tracking-widest leading-tight text-right">
                      {item.stage === "Newborn" ? "𝗧𝗼дд𝗹𝗲𝗿 (𝗔𝗴𝗲 𝟮)" : 
                       item.stage === "Toddler" ? "𝗖𝗵𝗶𝗹𝗱 (𝗔𝗴𝗲 𝟱)" :
                       item.stage === "Child" ? "𝗧𝗲𝗲𝗻 (𝗔𝗴𝗲 𝟭𝟬)" :
                       item.stage === "Teen" ? "𝗬𝗼𝘂𝗻𝗴 𝗔д𝘂𝗹𝘁 (𝗔𝗴𝗲 𝟮𝟭)" : "𝗙𝗹𝗲𝗲𝘁 𝗩𝗲𝘁𝗲𝗿𝗮𝗻"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unified Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-indigo-950/80 backdrop-blur-xl flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-3xl text-slate-950 tracking-tighter uppercase italic">{editingId ? '𝗘𝗱𝗶𝘁 𝗥𝗲𝗰𝗼𝗿𝗱' : '𝗔д𝗱 𝗡𝗲𝘄 𝗠𝗮𝗰𝗵𝗶𝗻𝗲'}</h3>
              <button onClick={() => setShowModal(false)} className="bg-slate-200 text-slate-600 p-2 rounded-full hover:bg-slate-300 transition-colors"><X size={24}/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">𝗖𝘂𝘀𝘁𝗼𝗺𝗲𝗿</label>
                  <input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={s(formData.customer)} onChange={e => setFormData({...formData, customer: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">𝗖𝗼𝗻𝘁𝗮𝗰𝘁</label>
                  <input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={s(formData.contact)} onChange={e => setFormData({...formData, contact: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">𝗠𝗮𝗶𝗹𝗶𝗻𝗴 𝗔дд𝗿𝗲𝘀𝘀</label>
                <input className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={s(formData.address)} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="𝗖𝗜𝗧𝗬" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm" value={s(formData.city)} onChange={e => setFormData({...formData, city: e.target.value})} />
                <input placeholder="𝗦𝗧" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm text-center uppercase" value={s(formData.state)} onChange={e => setFormData({...formData, state: e.target.value})} />
                <input placeholder="𝗭𝗜𝗣" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm" value={s(formData.zip)} onChange={e => setFormData({...formData, zip: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-5 pt-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">𝗠𝗼д𝗲𝗹</label>
                  <input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={s(formData.machine)} onChange={e => setFormData({...formData, machine: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">𝗣𝘂𝗿𝗰𝗵𝗮𝘀𝗲 𝗗𝗮𝘁𝗲</label>
                  <input required type="date" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm uppercase" value={s(formData.purchaseDate)} onChange={e => setFormData({...formData, purchaseDate: e.target.value})} />
                </div>
              </div>
              <button disabled={submitting || !user} type="submit" className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-2xl hover:bg-indigo-700 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 transition-all uppercase tracking-widest text-lg mt-4">
                {submitting ? <Loader2 className="animate-spin" /> : editingId ? '𝗨𝗽𝗱𝗮𝘁𝗲 𝗖𝗹𝗼𝘂д 𝗥𝗲𝗰𝗼𝗿𝗱' : '𝗦𝗮𝘃𝗲 𝗧𝗼 𝗙𝗹𝗲𝗲𝘁'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[60] p-4 font-sans">
          <div className="bg-white rounded-[2.5rem] p-12 max-w-sm text-center shadow-2xl border border-white/10 animate-in fade-in duration-200">
            <div className="bg-red-50 text-red-500 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner shadow-red-100/50"><AlertTriangle size={48}/></div>
            <h3 className="text-3xl font-black mb-3 tracking-tighter uppercase text-slate-900 italic">𝗣𝘂𝗿𝗴𝗲 𝗗𝗮𝘁𝗮?</h3>
            <p className="text-slate-500 font-bold mb-10 leading-relaxed text-sm">𝗧𝗵𝗶𝘀 𝗿𝗲𝗰𝗼𝗿д 𝘄𝗶𝗹𝗹 𝗯𝗲 𝗽𝗲𝗿𝗺𝗮𝗻𝗲𝗻𝘁𝗹𝘆 𝗱𝗲𝗹𝗲𝘁𝗲𝗱 𝗳𝗿𝗼𝗺 𝘁𝗵𝗲 𝗰𝗹𝗼𝘂д. 𝗧𝗵𝗲𝗿𝗲 𝗶𝘀 𝗻𝗼 𝘂𝗻𝗱𝗼.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 py-5 rounded-2xl font-black transition-colors uppercase text-[10px] tracking-widest">𝗖𝗮𝗻𝗰𝗲𝗹</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 text-white py-5 rounded-2xl font-black shadow-lg shadow-red-200 hover:bg-red-600 active:scale-95 transition-all uppercase text-[10px] tracking-widest">𝗣𝘂𝗿𝗴𝗲</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}