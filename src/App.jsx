import React, { useState, useMemo, useEffect } from 'react';
import { Gift, Mail, Calendar, Settings, CheckCircle, Clock, Users, Plus, X, Download, MapPin, Edit2, Trash2, AlertTriangle } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, query } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
// PASTE YOUR ACTUAL KEYS HERE IN VS CODE
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const calculateMachineAge = (purchaseDate, lifespanYears) => {
  if (!purchaseDate || !lifespanYears) return { monthsPassed: 0, humanEquivalentYears: 0, stage: "Newborn" };
  const purchase = new Date(purchaseDate);
  const now = new Date();
  const monthsPassed = (now.getFullYear() - purchase.getFullYear()) * 12 + (now.getMonth() - purchase.getMonth());
  const totalLifespanMonths = lifespanYears * 12;
  const humanEquivalentYears = (monthsPassed / totalLifespanMonths) * 80;

  let stage = "Newborn";
  if (humanEquivalentYears >= 74) stage = "Retiring";
  else if (humanEquivalentYears >= 64) stage = "Golden Years";
  else if (humanEquivalentYears >= 53) stage = "Veteran";
  else if (humanEquivalentYears >= 37) stage = "Prime / Mid-Life";
  else if (humanEquivalentYears >= 21) stage = "Young Adult";
  else if (humanEquivalentYears >= 10) stage = "Teen";
  else if (humanEquivalentYears >= 5) stage = "Child";
  else if (humanEquivalentYears >= 2) stage = "Toddler";

  return { monthsPassed, humanEquivalentYears: Math.round(humanEquivalentYears), stage };
};

export default function App() {
  const [user, setUser] = useState(null);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null); // ID of machine to delete
  const [editingId, setEditingId] = useState(null);
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
      } catch (err) { setLoading(false); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
    const q = query(collectionPath);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, () => setLoading(false));
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
    toSend.sort((a, b) => b.humanEquivalentYears - a.humanEquivalentYears);
    return { toSend, completed };
  }, [machines]);

  const handleMarkSent = async (id, stage) => {
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', id);
      await updateDoc(docRef, { lastCardSent: stage });
    } catch (err) { console.error(err); }
  };

  const handleOpenEdit = (machine) => {
    setEditingId(machine.id);
    setFormData({
      customer: machine.customer,
      contact: machine.contact,
      machine: machine.machine,
      purchaseDate: machine.purchaseDate,
      lifespanYears: machine.lifespanYears,
      address: machine.address || '',
      city: machine.city || '',
      state: machine.state || '',
      zip: machine.zip || ''
    });
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', deleteConfirmId);
      await deleteDoc(docRef);
      setDeleteConfirmId(null);
    } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
      if (editingId) {
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', editingId);
        await updateDoc(docRef, { ...formData, lifespanYears: Number(formData.lifespanYears) });
      } else {
        await addDoc(collectionPath, {
          ...formData,
          lifespanYears: Number(formData.lifespanYears),
          lastCardSent: null,
          createdAt: new Date().toISOString()
        });
      }
      setShowModal(false);
      setEditingId(null);
      setFormData({ customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5, address: '', city: '', state: '', zip: '' });
    } catch (err) { console.error(err); }
  };

  const handleExportCSV = () => {
    if (dashboardData.toSend.length === 0) return;
    const headers = ["Customer", "Contact", "Address", "City", "State", "Zip", "Machine", "Stage"];
    const csvRows = [headers.join(",")];
    dashboardData.toSend.forEach(item => {
      const row = [`"${item.customer}"`, `"${item.contact}"`, `"${item.address}"`, `"${item.city}"`, `"${item.state}"`, `"${item.zip}"`, `"${item.machine}"`, `"${item.stage}"`];
      csvRows.push(row.join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mailing-list-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans italic text-slate-400">Syncing with Cloud Database...</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 font-sans relative">
      {/* Sidebar */}
      <div className="w-64 bg-indigo-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 font-bold text-xl mb-12"><Gift className="text-pink-400" /><span>MachineBday</span></div>
        <nav className="flex-1 space-y-4">
          <button className="w-full flex items-center gap-3 bg-indigo-800 p-3 rounded-lg"><Mail size={20} /> Mail Queue</button>
          <button className="w-full flex items-center justify-between text-indigo-200 p-3 opacity-60 cursor-not-allowed">
            <div className="flex items-center gap-3"><Users size={20} /> Customers</div>
            <span className="text-[8px] bg-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">Soon</span>
          </button>
          <button className="w-full flex items-center justify-between text-indigo-200 p-3 opacity-60 cursor-not-allowed">
            <div className="flex items-center gap-3"><Calendar size={20} /> Calendar</div>
            <span className="text-[8px] bg-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase">Soon</span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-auto">
        <header className="mb-10 flex justify-between items-end">
          <div><h1 className="text-3xl font-extrabold text-slate-900 mb-1">Mail Queue</h1><p className="text-slate-500 text-sm font-medium">Manage your equipment birthdays and mailing labels.</p></div>
          <div className="flex gap-3">
            <button onClick={handleExportCSV} className="bg-white border border-slate-200 px-5 py-2.5 rounded-full flex items-center gap-2 text-sm font-semibold shadow-sm hover:bg-slate-50 transition-colors"><Download size={18} /> Export Labels</button>
            <button onClick={() => { setEditingId(null); setFormData({customer:'', contact:'', machine:'', purchaseDate:'', lifespanYears:5, address:'', city:'', state:'', zip:''}); setShowModal(true); }} className="bg-indigo-600 text-white px-6 py-2.5 rounded-full flex items-center gap-2 text-sm font-bold shadow-md hover:bg-indigo-700 transition-all"><Plus size={18} /> Add Machine</button>
          </div>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-400"><tr className="border-b border-slate-200"><th className="p-4">Customer & Address</th><th className="p-4">Machine Details</th><th className="p-4">Life Stage</th><th className="p-4">Actions</th></tr></thead>
            <tbody>
              {dashboardData.toSend.length === 0 && (
                <tr><td colSpan="4" className="p-12 text-center text-slate-400 font-medium italic">No cards currently due for mailing.</td></tr>
              )}
              {dashboardData.toSend.map(item => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-slate-900">{item.customer}</p>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenEdit(item)} className="text-slate-300 hover:text-indigo-600 p-1"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteConfirmId(item.id)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={10} /> {item.address}, {item.city} {item.state}</p>
                  </td>
                  <td className="p-4"><p className="text-sm font-bold text-slate-700">{item.machine}</p><p className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">Pur: {new Date(item.purchaseDate).toLocaleDateString()}</p></td>
                  <td className="p-4"><span className="px-2.5 py-0.5 bg-pink-100 text-pink-700 rounded-full text-[10px] font-black uppercase tracking-tighter">{item.stage}</span></td>
                  <td className="p-4"><button onClick={() => handleMarkSent(item.id, item.stage)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-shadow shadow-sm">Mark Sent</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unified Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100"><h3 className="font-bold text-xl text-slate-800 tracking-tight">{editingId ? 'Edit Machine Details' : 'Track New Machine'}</h3><button onClick={() => setShowModal(false)}><X size={24} className="text-slate-400 hover:text-slate-600 transition-colors" /></button></div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Customer</label><input required className="border p-2.5 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={formData.customer} onChange={e => setFormData({...formData, customer: e.target.value})} /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Contact</label><input required className="border p-2.5 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} /></div>
              </div>
              <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Mailing Address</label><input className="border p-2.5 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} /></div>
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="City" className="border p-2.5 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                <input placeholder="ST" className="border p-2.5 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} />
                <input placeholder="Zip" className="border p-2.5 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={formData.zip} onChange={e => setFormData({...formData, zip: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Model</label><input required className="border p-2.5 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={formData.machine} onChange={e => setFormData({...formData, machine: e.target.value})} /></div>
                <div className="space-y-1"><label className="text-[10px] font-black text-slate-400 uppercase">Purchased</label><input required type="date" className="border p-2.5 rounded-lg w-full text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" value={formData.purchaseDate} onChange={e => setFormData({...formData, purchaseDate: e.target.value})} /></div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl shadow-lg mt-6 uppercase tracking-widest text-sm transition-all">{editingId ? 'Update Record' : 'Save to Cloud Sync'}</button>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-8 text-center">
            <div className="bg-red-50 text-red-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Delete this record?</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">This will permanently remove the machine from your database. This action cannot be undone.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-200 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}