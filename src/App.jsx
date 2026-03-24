import React, { useState, useMemo, useEffect } from 'react';
import { Gift, Mail, Calendar, Settings, CheckCircle, Clock, Users, Plus, X, Download } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, updateDoc, addDoc, query } from 'firebase/firestore';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- HELPER FUNCTIONS ---
// Converts actual time passed into "Machine Years" based on human life expectancy (80 years)
const calculateMachineAge = (purchaseDate, lifespanYears) => {
  if (!purchaseDate || !lifespanYears) return { monthsPassed: 0, humanEquivalentYears: 0, stage: "Newborn" };
  
  const purchase = new Date(purchaseDate);
  const now = new Date(); // Dynamic current date
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
  
  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newMachine, setNewMachine] = useState({
    customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5
  });

  // --- FIREBASE AUTHENTICATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setError("Failed to authenticate.");
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // --- FIREBASE DATA SYNC (COLLABORATIVE PUBLIC WORKSPACE) ---
  useEffect(() => {
    if (!user) return;

    // RULE 1: Using the specific path required for collaborative/public data
    const collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
    const q = query(collectionPath);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const machinesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMachines(machinesData);
      setLoading(false);
    }, (err) => {
      console.error("Firestore Error:", err);
      setError("Failed to load machine data.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Process data to find upcoming birthdays
  const dashboardData = useMemo(() => {
    let toSend = [];
    let completed = [];

    machines.forEach(m => {
      const ageData = calculateMachineAge(m.purchaseDate, m.lifespanYears);
      
      // If the current stage is different from the last card sent, they are due for a birthday card!
      if (ageData.stage !== "Newborn" && m.lastCardSent !== ageData.stage) {
        toSend.push({ ...m, ...ageData });
      } else {
        completed.push({ ...m, ...ageData });
      }
    });

    // Sort toSend by age (oldest first)
    toSend.sort((a, b) => b.humanEquivalentYears - a.humanEquivalentYears);

    return { toSend, completed };
  }, [machines]);

  // --- ACTIONS ---
  const handleMarkSent = async (id, stage) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', id);
      await updateDoc(docRef, { lastCardSent: stage });
    } catch (err) {
      console.error("Error updating document:", err);
      alert("Failed to mark as sent. Please try again.");
    }
  };

  const handleAddMachine = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      const collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
      await addDoc(collectionPath, {
        customer: newMachine.customer,
        contact: newMachine.contact,
        machine: newMachine.machine,
        purchaseDate: newMachine.purchaseDate,
        lifespanYears: Number(newMachine.lifespanYears),
        lastCardSent: null,
        createdAt: new Date().toISOString()
      });
      setShowAddModal(false);
      setNewMachine({ customer: '', contact: '', machine: '', purchaseDate: '', lifespanYears: 5 });
    } catch (err) {
      console.error("Error adding document:", err);
      alert("Failed to add machine. Please try again.");
    }
  };

  const handleExportCSV = () => {
    if (dashboardData.toSend.length === 0) {
      alert("No cards are currently due for export.");
      return;
    }

    // Prepare CSV headers
    const headers = ["Customer Company", "Point of Contact", "Machine Model", "Purchase Date", "Machine Age Stage", "Human Equivalent Years"];
    const csvRows = [headers.join(",")];

    // Format data rows
    dashboardData.toSend.forEach(item => {
      const row = [
        `"${item.customer.replace(/"/g, '""')}"`,
        `"${item.contact.replace(/"/g, '""')}"`,
        `"${item.machine.replace(/"/g, '""')}"`,
        `"${new Date(item.purchaseDate).toLocaleDateString()}"`,
        `"${item.stage}"`,
        `"${item.humanEquivalentYears}"`
      ];
      csvRows.push(row.join(","));
    });

    // Create a Blob and trigger download
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.setAttribute("href", url);
    link.setAttribute("download", `machine-birthdays-due-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-sans">Connecting to Collaborative Workspace...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 font-sans relative">
      {/* Sidebar */}
      <div className="w-64 bg-indigo-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 font-bold text-xl mb-12">
          <Gift className="text-pink-400" />
          <span>MachineBday</span>
        </div>
        
        <nav className="flex-1 space-y-4">
          <a href="#" className="flex items-center gap-3 text-indigo-200 hover:text-white hover:bg-indigo-800 p-3 rounded-lg transition-colors bg-indigo-800 text-white">
            <Mail size={20} /> Mail Queue
          </a>
          <a href="#" className="flex items-center gap-3 text-indigo-200 hover:text-white hover:bg-indigo-800 p-3 rounded-lg transition-colors">
            <Users size={20} /> Customers
          </a>
          <a href="#" className="flex items-center gap-3 text-indigo-200 hover:text-white hover:bg-indigo-800 p-3 rounded-lg transition-colors">
            <Calendar size={20} /> Calendar
          </a>
        </nav>

        <div className="mt-auto pt-6 border-t border-indigo-800">
          <p className="text-xs text-indigo-300 flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Cloud Sync Active
          </p>
          <a href="#" className="flex items-center gap-3 text-indigo-200 hover:text-white hover:bg-indigo-800 p-3 rounded-lg transition-colors">
            <Settings size={20} /> Settings
          </a>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Mail Queue</h1>
            <p className="text-slate-500">Collaborative workspace. Updates reflect instantly for your team.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleExportCSV}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-5 py-2.5 rounded-full font-medium transition-colors shadow-sm flex items-center gap-2 text-sm"
            >
              <Download size={18} /> Export Mailing List
            </button>
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-full font-medium transition-colors shadow-sm flex items-center gap-2 text-sm"
            >
              <Plus size={18} /> Add Machine
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-8 border border-red-100">
            {error}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-pink-100 p-4 rounded-full text-pink-600">
              <Mail size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Cards Due</p>
              <p className="text-3xl font-bold text-slate-800">{dashboardData.toSend.length}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-emerald-100 p-4 rounded-full text-emerald-600">
              <CheckCircle size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Up to Date</p>
              <p className="text-3xl font-bold text-slate-800">{dashboardData.completed.length}</p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-blue-100 p-4 rounded-full text-blue-600">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Tracked</p>
              <p className="text-3xl font-bold text-slate-800">{machines.length}</p>
            </div>
          </div>
        </div>

        {/* Action Required Section */}
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="bg-pink-500 w-2 h-6 rounded-full inline-block"></span>
          Requires Action ({dashboardData.toSend.length})
        </h2>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-10">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-500">
                <th className="p-4">Customer & Contact</th>
                <th className="p-4">Machine Details</th>
                <th className="p-4">Current Life Stage</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.toSend.length === 0 ? (
                <tr>
                  <td colSpan="4" className="p-12 text-center text-slate-500">
                    <CheckCircle size={40} className="mx-auto text-emerald-300 mb-3" />
                    <p className="text-lg font-medium text-slate-600">All caught up!</p>
                    <p className="text-sm">No cards to send right now. Check back next month.</p>
                  </td>
                </tr>
              ) : (
                dashboardData.toSend.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-slate-800">{item.customer}</p>
                      <p className="text-sm text-slate-500">c/o {item.contact}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-slate-700">{item.machine}</p>
                      <p className="text-xs text-slate-400">Lifespan: {item.lifespanYears} yrs | Pur: {new Date(item.purchaseDate).toLocaleDateString()}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide
                          ${item.stage === 'Child' || item.stage === 'Toddler' ? 'bg-blue-100 text-blue-700' : 
                            item.stage === 'Teen' ? 'bg-purple-100 text-purple-700' : 
                            item.stage === 'Young Adult' ? 'bg-emerald-100 text-emerald-700' : 
                            item.stage === 'Retiring' || item.stage === 'Golden Years' ? 'bg-slate-200 text-slate-700' :
                            'bg-orange-100 text-orange-700'}`}>
                          {item.stage}
                        </span>
                        <span className="text-xs font-medium text-pink-600 bg-pink-50 px-2 py-0.5 rounded">
                          {item.humanEquivalentYears} human yrs
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <button 
                        onClick={() => handleMarkSent(item.id, item.stage)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                      >
                        Mark Sent
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Recently Sent Section */}
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="bg-emerald-500 w-2 h-6 rounded-full inline-block"></span>
          Up To Date
        </h2>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden opacity-75">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-medium text-slate-500">
                <th className="p-4">Customer</th>
                <th className="p-4">Machine</th>
                <th className="p-4">Last Stage Sent</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.completed.length === 0 ? (
                 <tr>
                 <td colSpan="3" className="p-6 text-center text-slate-500 text-sm">
                   Add machines above to start tracking their lifecycles.
                 </td>
               </tr>
              ) : (
                dashboardData.completed.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="p-4">
                      <p className="font-bold text-slate-800">{item.customer}</p>
                    </td>
                    <td className="p-4 text-slate-600">{item.machine}</td>
                    <td className="p-4 text-slate-500">
                      <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-emerald-500" />
                        {item.lastCardSent || "Newborn / Initializing"}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h3 className="font-bold text-xl text-slate-800">Track New Machine</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddMachine} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer / Company Name</label>
                <input required type="text" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                  value={newMachine.customer} onChange={e => setNewMachine({...newMachine, customer: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Point of Contact</label>
                <input required type="text" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                  value={newMachine.contact} onChange={e => setNewMachine({...newMachine, contact: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Machine Model/Name</label>
                <input required type="text" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="e.g. Xerox WorkCentre 6515"
                  value={newMachine.machine} onChange={e => setNewMachine({...newMachine, machine: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Date</label>
                  <input required type="date" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-600" 
                    value={newMachine.purchaseDate} onChange={e => setNewMachine({...newMachine, purchaseDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lifespan (Years)</label>
                  <input required type="number" min="1" max="50" className="w-full border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none" 
                    value={newMachine.lifespanYears} onChange={e => setNewMachine({...newMachine, lifespanYears: e.target.value})} />
                </div>
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-colors">
                  Save Machine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}