import React, { useState, useMemo, useEffect } from 'react';
import { Gift, Mail, Calendar, Settings, CheckCircle, Clock, Users, Plus, X, Download } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, query } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
// PASTE YOUR ACTUAL KEYS HERE AFTER UPDATING THE FILE
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

// --- HELPER FUNCTIONS ---
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
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Updated initial state with Address fields
  const [newMachine, setNewMachine] = useState({
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
      } catch (err) {
        setError("Failed to authenticate.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let unsubscribe;
    try {
      const collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
      const q = query(collectionPath);
      unsubscribe = onSnapshot(q, (snapshot) => {
        setMachines(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, (err) => {
        setError("Failed to load machine data.");
        setLoading(false);
      });
    } catch (err) {
      setLoading(false);
    }
    return () => unsubscribe && unsubscribe();
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
    } catch (err) { alert("Update failed."); }
  };

  const handleAddMachine = async (e) => {
    e.preventDefault();
    try {
      const collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
      await addDoc(collectionPath, {
        ...newMachine,
        lifespanYears: Number(newMachine.lifespanYears),
        lastCardSent: null,
        createdAt: new Date().toISOString()
      });
      setShowAddModal(false);
      setNewMachine({ customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5, address: '', city: '', state: '', zip: '' });
    } catch (err) { alert("Add failed."); }
  };

  const handleExportCSV = () => {
    if (dashboardData.toSend.length === 0) return alert("No cards are currently due for export.");
    const headers = ["Customer", "Contact", "Address", "City", "State", "Zip", "Machine Model", "Life Stage", "Human Years"];
    const csvRows = [headers.join(",")];
    dashboardData.toSend.forEach(item => {
      const row = [
        `"${item.customer}"`, `"${item.contact}"`, `"${item.address || ''}"`,
        `"${item.city || ''}"`, `"${item.state || ''}"`, `"${item.zip || ''}"`,
        `"${item.machine}"`, `"${item.stage}"`, `"${item.humanEquivalentYears}"`
      ];
      csvRows.push(row.join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mailing-list-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">Connecting to Collaborative Workspace...</div>;

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 font-sans relative">
      {/* Sidebar */}
      <div className="w-64 bg-indigo-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 font-bold text-xl mb-12"><Gift className="text-pink-400" /><span>MachineBday</span></div>
        <nav className="flex-1 space-y-4">
          <button className="w-full flex items-center gap-3 bg-indigo-800 p-3 rounded-lg"><Mail size={20} /> Mail Queue</button>
          <button className="w-full flex items-center gap-3 text-indigo-200 p-3 opacity-60">
            <Users size={20} /> Customers <span className="text-[10px] bg-indigo-700 px-2 py-0.5 rounded-full ml-auto">COMING SOON</span>
          </button>
          <button className="w-full flex items-center gap-3 text-indigo-200 p-3 opacity-60">
            <Calendar size={20} /> Calendar <span className="text-[10px] bg-indigo-700 px-2 py-0.5 rounded-full ml-auto">COMING SOON</span>
          </button>
        </nav>
        <div className="mt-auto pt-6 border-t border-indigo-800">
          <p className="text-xs text-indigo-300 flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> Cloud Sync Active</p>
          <button className="w-full flex items-center gap-3 text-indigo-200 p-3 hover:text-white transition-colors"><Settings size={20} /> Settings</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-auto">
        <header className="mb-10 flex justify-between items-end">
          <div><h1 className="text-3xl font-extrabold text-slate-900 mb-2">Mail Queue</h1><p className="text-slate-500 font-medium text-sm">Automated "dog-year" math for your equipment birthdays.</p></div>
          <div className="flex gap-3">
            <button onClick={handleExportCSV} className="bg-white border px-5 py-2.5 rounded-full flex items-center gap-2 text-sm shadow-sm font-semibold hover:bg-slate-50 transition-colors"><Download size={18} /> Export Mailing List</button>
            <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-full flex items-center gap-2 text-sm shadow-sm font-semibold hover:bg-indigo-700 transition-colors"><Plus size={18} /> Add Machine</button>
          </div>
        </header>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-pink-100 p-4 rounded-full text-pink-600"><Mail size={24} /></div>
            <div><p className="text-sm text-slate-500 font-medium">Cards Due</p><p className="text-3xl font-bold text-slate-800">{dashboardData.toSend.length}</p></div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-emerald-100 p-4 rounded-full text-emerald-600"><CheckCircle size={24} /></div>
            <div><p className="text-sm text-slate-500 font-medium">Up to Date</p><p className="text-3xl font-bold text-slate-800">{dashboardData.completed.length}</p></div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-blue-100 p-4 rounded-full text-blue-600"><Users size={24} /></div>
            <div><p className="text-sm text-slate-500 font-medium">Total Tracked</p><p className="text-3xl font-bold text-slate-800">{machines.length}</p></div>
          </div>
        </div>

        {/* Action Required Table */}
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><span className="bg-pink-500 w-2 h-6 rounded-full inline-block"></span> Requires Action ({dashboardData.toSend.length})</h2>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-10">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500"><tr className="border-b border-slate-200"><th className="p-4">Customer & Address</th><th className="p-4">Machine Details</th><th className="p-4">Current Life Stage</th><th className="p-4">Action</th></tr></thead>
            <tbody>
              {dashboardData.toSend.length === 0 ? (
                <tr><td colSpan="4" className="p-12 text-center text-slate-500"><CheckCircle size={40} className="mx-auto text-emerald-300 mb-3" /><p className="text-lg font-medium text-slate-600">All caught up!</p></td></tr>
              ) : (
                dashboardData.toSend.map(item => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-4"><p className="font-bold text-slate-800">{item.customer}</p><p className="text-xs text-slate-500 mt-1">{item.address}, {item.city} {item.state} {item.zip}</p></td>
                    <td className="p-4"><p className="font-medium text-slate-700">{item.machine}</p><p className="text-xs text-slate-400">Pur: {new Date(item.purchaseDate).toLocaleDateString()}</p></td>
                    <td className="p-4"><div className="flex flex-col gap-1 items-start"><span className="px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-[10px] font-bold uppercase tracking-wide">{item.stage}</span><span className="text-[10px] font-medium text-pink-600 bg-pink-50 px-2 py-0.5 rounded">{item.humanEquivalentYears} human yrs</span></div></td>
                    <td className="p-4"><button onClick={() => handleMarkSent(item.id, item.stage)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">Mark Sent</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100"><h3 className="font-bold text-xl text-slate-800">Track New Machine</h3><button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div>
            <form onSubmit={handleAddMachine} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input required placeholder="Customer/Company" className="border p-2.5 rounded-lg w-full text-sm" value={newMachine.customer} onChange={e => setNewMachine({...newMachine, customer: e.target.value})} />
                <input required placeholder="Contact Person" className="border p-2.5 rounded-lg w-full text-sm" value={newMachine.contact} onChange={e => setNewMachine({...newMachine, contact: e.target.value})} />
              </div>
              <input placeholder="Street Address" className="border p-2.5 rounded-lg w-full text-sm" value={newMachine.address} onChange={e => setNewMachine({...newMachine, address: e.target.value})} />
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="City" className="border p-2.5 rounded-lg w-full text-sm" value={newMachine.city} onChange={e => setNewMachine({...newMachine, city: e.target.value})} />
                <input placeholder="State" className="border p-2.5 rounded-lg w-full text-sm" value={newMachine.state} onChange={e => setNewMachine({...newMachine, state: e.target.value})} />
                <input placeholder="Zip" className="border p-2.5 rounded-lg w-full text-sm" value={newMachine.zip} onChange={e => setNewMachine({...newMachine, zip: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <input required placeholder="Machine Model" className="border p-2.5 rounded-lg w-full text-sm" value={newMachine.machine} onChange={e => setNewMachine({...newMachine, machine: e.target.value})} />
                <div className="space-y-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Purchase Date</span><input required type="date" className="border p-2.5 rounded-lg w-full text-sm" value={newMachine.purchaseDate} onChange={e => setNewMachine({...newMachine, purchaseDate: e.target.value})} /></div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md mt-4">Save to Cloud Sync</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}