import React, { useState, useMemo, useEffect } from 'react';
import { Gift, Mail, Calendar, Settings, CheckCircle, Clock, Users, Plus, X, Download, MapPin, Edit2, Trash2, AlertTriangle, Loader2, Info } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "YOUR_ACTUAL_API_KEY",
      authDomain: "machine-birthday-crm.firebaseapp.com",
      projectId: "machine-birthday-crm",
      storageBucket: "machine-birthday-crm.firebasestorage.app",
      messagingSenderId: "YOUR_ACTUAL_SENDER_ID",
      appId: "YOUR_ACTUAL_APP_ID"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'machine_bday_crm';
const appId = String(rawAppId).split('/').pop().replace(/[^a-zA-Z0-9]/g, '_');

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

  const s = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string' || typeof val === 'number') return val;
    if (typeof val === 'object' && val.toDate) return val.toDate().toLocaleDateString();
    return String(val);
  };

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
        setStatusMsg("Auth failed. Check settings.");
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) { setUser(u); setStatusMsg("Connected. Syncing..."); }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (err) => {
      setStatusMsg("Permission Denied.");
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
      alert("Error: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkSent = async (id, stage) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', id), { lastCardSent: stage });
    } catch (err) { console.error(err); }
  };

  const handleDelete = async () => {
    if (!user || !deleteConfirmId) return;
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
      const row = [`"${s(item.customer)}"`, `"${s(item.contact)}"`, `"${s(item.address)}"`, `"${s(item.city)}"`, `"${s(item.state)}"`, `"${s(item.zip)}"`, `"${s(item.machine)}"`, `"${s(item.stage)}"`, `"${s(item.humanEquivalentYears)}"`];
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
      <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">Syncing Fleet Database</h2>
      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">{statusMsg}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900 selection:bg-indigo-100">
      <div className="w-64 bg-indigo-950 text-white p-6 flex flex-col shadow-2xl z-20">
        <div className="flex items-center gap-3 font-black text-2xl mb-12 italic tracking-tighter"><Gift className="text-pink-400 shrink-0" />MachineBday</div>
        <nav className="flex-1 space-y-3">
          <button className="w-full flex items-center gap-3 bg-indigo-800/60 p-4 rounded-2xl font-black transition-all shadow-lg border border-white/5 uppercase tracking-widest text-[10px]"><Mail size={18}/> Mail Queue</button>
          <div className="flex items-center justify-between p-4 opacity-30 text-[10px] font-black uppercase tracking-widest"><div className="flex items-center gap-3"><Users size={18}/> Customers</div><span>Soon</span></div>
          <div className="flex items-center justify-between p-4 opacity-30 text-[10px] font-black uppercase tracking-widest"><div className="flex items-center gap-3"><Calendar size={18}/> Calendar</div><span>Soon</span></div>
        </nav>
        <div className="pt-6 border-t border-white/10 mt-auto text-[10px] font-black uppercase tracking-widest text-white/40">
          <p className="mb-4 flex items-center gap-2 font-bold"><span className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-amber-400'}`}></span> {user ? "Cloud Active" : "Authenticating..."}</p>
          <button className="flex items-center gap-3 text-white/60 hover:text-white transition-colors text-sm font-black"><Settings size={18}/> Settings</button>
        </div>
      </div>

      <div className="flex-1 p-10 overflow-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div><h1 className="text-5xl font-black tracking-tighter text-slate-900 uppercase italic">Mail Queue</h1><p className="text-slate-500 font-black uppercase text-[10px] tracking-[0.2em] mt-2">Fleet Size: {machines.length} Units</p></div>
          <div className="flex gap-4">
            <button onClick={handleExportCSV} className="bg-white border-2 border-slate-200 px-6 py-3 rounded-full flex items-center gap-2 text-sm font-black shadow-sm hover:bg-slate-50 transition-all uppercase tracking-widest">Export Labels</button>
            <button onClick={() => { setEditingId(null); setFormData({customer:'', contact:'', machine:'', purchaseDate:'', lifespanYears:5, address:'', city:'', state:'', zip:''}); setShowModal(true); }} className="bg-indigo-600 text-white px-10 py-3 rounded-full font-black shadow-xl hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 uppercase tracking-widest">Add Machine</button>
          </div>
        </header>

        <div className="flex items-center gap-3 mb-6"><div className="bg-pink-500 w-3 h-8 rounded-full shadow-[0_0_12px_rgba(236,72,153,0.3)]"></div><h2 className="text-2xl font-black uppercase tracking-tighter italic">Requires Action ({dashboardData.toSend.length})</h2></div>
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden mb-16">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b">
              <tr><th className="p-6">Customer / Address</th><th className="p-6">Machine</th><th className="p-6 text-center">Life Stage</th><th className="p-6 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dashboardData.toSend.length === 0 ? (
                <tr><td colSpan="4" className="p-24 text-center text-slate-300 font-black italic text-lg tracking-tighter uppercase opacity-50">No birthdays due in the queue today</td></tr>
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
                    <td className="p-6 text-right"><button onClick={() => handleMarkSent(item.id, item.stage)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 hover:shadow-indigo-200 transition-all active:translate-y-0.5">Mark Sent</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 mb-6"><div className="bg-emerald-500 w-3 h-8 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.3)]"></div><h2 className="text-2xl font-black uppercase tracking-tighter text-slate-800 italic">Up To Date ({dashboardData.completed.length})</h2></div>
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden opacity-95 mb-10">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-widest text-slate-400 border-b">
              <tr><th className="p-6">Customer</th><th className="p-6">Machine</th><th className="p-6">Status</th><th className="p-6 text-right">Next Stage</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {dashboardData.completed.length === 0 ? (
                <tr><td colSpan="4" className="p-16 text-center text-slate-300 font-black italic text-lg tracking-tighter uppercase opacity-50 underline decoration-slate-100">No existing records found</td></tr>
              ) : (
                dashboardData.completed.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors group">
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
                      <CheckCircle size={14} className="text-emerald-500" /> {item.stage === "Newborn" ? "Growing Up" : "Card Sent"}
                    </td>
                    <td className="p-6 text-[10px] font-black uppercase text-slate-300 tracking-widest leading-tight text-right">
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

      {showModal && (
        <div className="fixed inset-0 bg-indigo-950/80 backdrop-blur-xl flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
            <div className="p-10 border-b flex justify-between items-center bg-slate-50/50">
              <h3 className="font-black text-3xl text-slate-950 tracking-tighter uppercase italic">{editingId ? 'Edit Record' : 'Add New Machine'}</h3>
              <button onClick={() => setShowModal(false)} className="bg-slate-200 text-slate-600 p-2 rounded-full hover:bg-slate-300 transition-colors"><X size={24}/></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer Full Name</label>
                  <input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={s(formData.customer)} onChange={e => setFormData({...formData, customer: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact</label>
                  <input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={s(formData.contact)} onChange={e => setFormData({...formData, contact: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mailing Address</label>
                <input className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={s(formData.address)} onChange={e => setFormData({...formData, address: e.target.value})} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="CITY" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm" value={s(formData.city)} onChange={e => setFormData({...formData, city: e.target.value})} />
                <input placeholder="ST" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm text-center uppercase" value={s(formData.state)} onChange={e => setFormData({...formData, state: e.target.value})} />
                <input placeholder="ZIP" className="bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl font-black outline-none focus:border-indigo-500 text-sm" value={s(formData.zip)} onChange={e => setFormData({...formData, zip: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-5 pt-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Model</label>
                  <input required className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm" value={s(formData.machine)} onChange={e => setFormData({...formData, machine: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Purchase Date</label>
                  <input required type="date" className="w-full bg-slate-50 border-2 border-slate-100 p-4 rounded-2xl focus:border-indigo-500 outline-none font-black text-slate-700 text-sm uppercase" value={s(formData.purchaseDate)} onChange={e => setFormData({...formData, purchaseDate: e.target.value})} />
                </div>
              </div>
              <button disabled={submitting || !user} type="submit" className="w-full bg-indigo-600 text-white font-black py-6 rounded-[2rem] shadow-2xl hover:bg-indigo-700 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 transition-all uppercase tracking-widest text-lg mt-4">
                {submitting ? <Loader2 className="animate-spin" /> : editingId ? 'Update Record' : 'Save to Database'}
              </button>
            </form>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[60] p-4 font-sans">
          <div className="bg-white rounded-[2.5rem] p-12 max-w-sm text-center shadow-2xl border border-white/10 animate-in fade-in duration-200">
            <div className="bg-red-50 text-red-500 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner shadow-red-100/50"><AlertTriangle size={48}/></div>
            <h3 className="text-3xl font-black mb-3 tracking-tighter uppercase text-slate-900 italic">Purge Data?</h3>
            <p className="text-slate-500 font-bold mb-10 leading-relaxed text-sm">This record will be permanently deleted from the cloud. There is no undo.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 py-5 rounded-2xl font-black transition-colors uppercase text-[10px] tracking-widest">Cancel</button>
              <button onClick={handleDelete} className="flex-1 bg-red-500 text-white py-5 rounded-2xl font-black shadow-lg shadow-red-200 hover:bg-red-600 active:scale-95 transition-all uppercase text-[10px] tracking-widest">Purge</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}