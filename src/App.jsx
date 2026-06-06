import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc
} from "firebase/firestore";

// ─── MOT DE PASSE ────────────────────────────────────────────────────────────
const APP_PASSWORD = "coparent2024";

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmt(amount) {
  return parseFloat(amount || 0).toFixed(2) + " €";
}
function resteACharge(e) {
  return Math.max(0,
    parseFloat(e.amount || 0)
    - parseFloat(e.remboSecu || 0)
    - parseFloat(e.remboMutuelle || 0)
    - parseFloat(e.remboMutuelleSabrina || 0)
  );
}
// Montant payé par "Moi" dans une dépense (RAC)
function racMoi(e) {
  const rac = resteACharge(e);
  if (e.payer === "Moi") return rac;
  if (e.payer === "Elle") return 0;
  if (e.payer === "Les deux") {
    // On utilise les montants partagés si disponibles
    const totalPaye = parseFloat(e.amountMoi || 0) + parseFloat(e.amountElle || 0);
    if (totalPaye === 0) return rac / 2;
    return rac * (parseFloat(e.amountMoi || 0) / totalPaye);
  }
  return 0;
}
function racElle(e) {
  const rac = resteACharge(e);
  if (e.payer === "Elle") return rac;
  if (e.payer === "Moi") return 0;
  if (e.payer === "Les deux") {
    const totalPaye = parseFloat(e.amountMoi || 0) + parseFloat(e.amountElle || 0);
    if (totalPaye === 0) return rac / 2;
    return rac * (parseFloat(e.amountElle || 0) / totalPaye);
  }
  return 0;
}
function versementTotal(e) {
  return (e.versements || []).reduce((s, v) => s + parseFloat(v.amount || 0), 0);
}
function todayISO() { return new Date().toISOString().slice(0, 10); }

const CATEGORIES_EXPENSE = ["Médical", "Scolaire", "Vêtements", "Loisirs", "Alimentation", "Transport", "Autre"];
const CATEGORIES_EVENT   = ["Médecin", "Dentiste", "École", "Réunion", "Activité", "Vacances", "Autre"];
const PAYERS       = ["Moi", "Elle", "Les deux"];
const CHILDREN_OPTS = ["Les deux", "Nathan", "Lucas"];

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:wght@700&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f1117;color:#e8e6e0;font-family:'DM Sans',system-ui,sans-serif}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#1a1d27}::-webkit-scrollbar-thumb{background:#3a3d4d;border-radius:4px}
input,select,textarea{outline:none;font-family:inherit}
button{cursor:pointer;font-family:inherit}
.tab-btn{background:none;border:none;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;transition:all .2s}
.tab-btn.active{background:#f0c040;color:#0f1117}
.tab-btn:not(.active){color:#888}
.card{background:#181b26;border-radius:16px;padding:16px;border:1px solid #23263a}
.chip{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600}
.chip-moi{background:#1e3a5f;color:#60aaff}
.chip-elle{background:#3d1e3a;color:#e060e0}
.chip-deux{background:#2a2a1e;color:#f0c040}
.chip-cat{background:#1f2235;color:#aaa}
.fab{position:fixed;bottom:90px;right:20px;width:52px;height:52px;border-radius:50%;background:#f0c040;color:#0f1117;border:none;font-size:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(240,192,64,.35);z-index:100;transition:transform .15s}
.fab:active{transform:scale(.92)}
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:flex-end;justify-content:center}
.modal{background:#181b26;border-radius:20px 20px 0 0;padding:24px 20px 36px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto}
.modal-title{font-family:'Playfair Display',serif;font-size:20px;margin-bottom:20px}
.field{margin-bottom:14px}
.field label{display:block;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
.field input,.field select,.field textarea{width:100%;background:#1f2235;border:1px solid #2e3150;border-radius:10px;padding:10px 12px;color:#e8e6e0;font-size:14px}
.field textarea{resize:none;min-height:64px}
.btn-primary{background:#f0c040;color:#0f1117;border:none;border-radius:12px;padding:13px 20px;font-size:15px;font-weight:600;width:100%;margin-top:8px}
.btn-secondary{background:transparent;color:#888;border:1px solid #2e3150;border-radius:12px;padding:11px 20px;font-size:14px;width:100%;margin-top:8px}
.nav{position:fixed;bottom:0;left:0;right:0;background:#181b26;border-top:1px solid #23263a;display:flex;justify-content:space-around;padding:10px 0 18px;z-index:99}
.nav-item{display:flex;flex-direction:column;align-items:center;gap:3px;background:none;border:none;color:#555;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:4px 12px;transition:color .2s}
.nav-item.active{color:#f0c040}
.nav-icon{font-size:20px}
.balance-pos{color:#40d090}
.balance-neg{color:#e05060}
.balance-zero{color:#f0c040}
.progress-bar{height:8px;border-radius:4px;background:#1f2235;overflow:hidden;margin-top:6px}
.progress-fill{height:100%;border-radius:4px;transition:width .4s}
.event-row{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #23263a}
.event-row:last-child{border-bottom:none}
.expense-row{display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #23263a}
.expense-row:last-child{border-bottom:none}
.date-badge{background:#1f2235;border-radius:8px;padding:4px 8px;font-size:11px;color:#888;white-space:nowrap;min-width:72px;text-align:center}
.amount-badge{font-size:16px;font-weight:700}
.done-circle{width:22px;height:22px;border-radius:50%;border:2px solid #3a3d4d;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;margin-top:2px;transition:all .2s}
.done-circle.done{background:#40d090;border-color:#40d090}
.toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#23263a;color:#e8e6e0;border-radius:20px;padding:10px 22px;font-size:13px;font-weight:500;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.4);animation:toastIn .25s ease;border:1px solid #3a3d4d}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.section-title{font-family:'Playfair Display',serif;font-size:17px;margin-bottom:12px}
.filter-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:14px}
.filter-chip{background:#1f2235;border:1px solid #2e3150;border-radius:20px;padding:5px 13px;font-size:12px;font-weight:500;color:#aaa;white-space:nowrap;cursor:pointer}
.filter-chip.active{background:#f0c040;color:#0f1117;border-color:#f0c040}
.action-row{display:flex;gap:8px;margin-top:6px}
.action-btn{background:#1f2235;border:none;border-radius:8px;padding:5px 10px;font-size:12px;color:#888}
.action-btn.del{color:#e05060}
.confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:300;display:flex;align-items:center;justify-content:center}
.confirm-box{background:#181b26;border-radius:16px;padding:24px;max-width:320px;width:90%;border:1px solid #23263a;text-align:center}
.section-divider{font-size:13px;font-weight:600;color:#f0c040;margin:16px 0 8px;padding-top:12px;border-top:1px solid #23263a}
.hint{font-size:11px;color:#666;margin-top:4px}
.rac-preview{background:#1f2235;border-radius:10px;padding:10px 14px;margin-bottom:12px;font-size:13px}
.sync-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.sync-dot.ok{background:#40d090}
.sync-dot.loading{background:#f0c040;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login-box{background:#181b26;border-radius:20px;padding:36px 28px;width:100%;max-width:360px;border:1px solid #23263a;text-align:center}
.partage-box{background:#1f2235;border-radius:10px;padding:12px;margin-bottom:14px;border:1px solid #2e3150}
`;

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    if (pw === APP_PASSWORD) { sessionStorage.setItem("cp_auth","1"); onLogin(); }
    else { setErr(true); setTimeout(() => setErr(false), 1500); }
  };
  return (
    <div className="login-wrap">
      <div className="login-box">
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, color:"#f0c040", marginBottom:6 }}>CoParent</div>
        <div style={{ fontSize:13, color:"#555", marginBottom:28 }}>Accès privé</div>
        <div className="field">
          <label>Mot de passe</label>
          <input type="password" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="••••••••" autoFocus style={{ border: err ? "1px solid #e05060" : undefined }} />
        </div>
        {err && <div style={{ color:"#e05060", fontSize:13, marginBottom:8 }}>Mot de passe incorrect</div>}
        <button className="btn-primary" onClick={submit}>Entrer</button>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(!!sessionStorage.getItem("cp_auth"));
  const [expenses, setExpenses] = useState([]);
  const [events, setEvents]     = useState([]);
  const [syncing, setSyncing]   = useState(true);
  const [tab, setTab]           = useState("dashboard");
  const [expenseModal, setExpenseModal] = useState(false);
  const [eventModal, setEventModal]     = useState(false);
  const [versementModal, setVersementModal] = useState(null);
  const [filterChild, setFilterChild]   = useState("Tous");
  const [filterCat, setFilterCat]       = useState("Toutes");
  const [editExpense, setEditExpense]   = useState(null);
  const [editEvent, setEditEvent]       = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expandedExpense, setExpandedExpense] = useState(null);
  const [toast, setToast]               = useState(null);

  useEffect(() => {
    if (!authed) return;
    const unsubExp = onSnapshot(collection(db, "expenses"), snap => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSyncing(false);
    });
    const unsubEv = onSnapshot(collection(db, "events"), snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubExp(); unsubEv(); };
  }, [authed]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  // ── FINANCE CALCS ──
  const totalMoi  = expenses.reduce((s,e) => s + racMoi(e), 0);
  const totalElle = expenses.reduce((s,e) => s + racElle(e), 0);
  const totalAll  = totalMoi + totalElle;
  const fairShare = totalAll / 2;
  const totalVersementsElleVersMoi = expenses
    .reduce((s,e)=>s+(e.versements||[]).filter(v=>v.de==="Elle").reduce((ss,v)=>ss+parseFloat(v.amount||0),0),0);
  const totalVersementsMoiVersElle = expenses
    .reduce((s,e)=>s+(e.versements||[]).filter(v=>v.de==="Moi").reduce((ss,v)=>ss+parseFloat(v.amount||0),0),0);
  const balanceNette = (totalMoi - fairShare) - totalVersementsElleVersMoi + totalVersementsMoiVersElle;

  // ── EXPENSE FORM ──
  const emptyExpense = { date:todayISO(), label:"", amount:"", payer:"Moi", amountMoi:"", amountElle:"", category:"Médical", child:"Les deux", note:"", remboSecu:"", remboMutuelle:"", remboMutuelleSabrina:"", versements:[] };
  const [expForm, setExpForm] = useState(emptyExpense);

  // Sync automatique du montant total quand payer=Les deux
  const handleAmountMoiElle = (field, value) => {
    const updated = { ...expForm, [field]: value };
    const total = parseFloat(updated.amountMoi || 0) + parseFloat(updated.amountElle || 0);
    updated.amount = total > 0 ? total.toFixed(2) : expForm.amount;
    setExpForm(updated);
  };

  const openAddExpense  = () => { setExpForm(emptyExpense); setEditExpense(null); setExpenseModal(true); };
  const openEditExpense = (e) => { setExpForm({...e}); setEditExpense(e.id); setExpenseModal(true); };
  const saveExpense = async () => {
    if (!expForm.label || !expForm.amount || !expForm.date) return;
    const id = editExpense || Date.now().toString();
    await setDoc(doc(db,"expenses",id), {...expForm, id, versements: expForm.versements||[] });
    showToast(editExpense ? "Dépense modifiée ✓" : "Dépense ajoutée ✓");
    setExpenseModal(false);
  };
  const deleteExpense = async (id) => {
    await deleteDoc(doc(db,"expenses",id));
    showToast("Dépense supprimée.");
  };

  // ── VERSEMENT FORM ──
  const emptyVersement = { date:todayISO(), amount:"", de:"Elle", note:"" };
  const [vForm, setVForm] = useState(emptyVersement);
  const openVersement = (expenseId) => {
    const exp = expenses.find(e=>e.id===expenseId);
    setVForm({...emptyVersement, de: exp?.payer==="Moi" ? "Elle" : "Moi"});
    setVersementModal(expenseId);
  };
  const saveVersement = async () => {
    if (!vForm.amount || !vForm.date) return;
    const exp = expenses.find(e=>e.id===versementModal);
    if (!exp) return;
    const versements = [...(exp.versements||[]), {...vForm, id:Date.now().toString()}];
    await updateDoc(doc(db,"expenses",versementModal), { versements });
    showToast("Versement enregistré ✓");
    setVersementModal(null);
  };
  const deleteVersement = async (expId, vId) => {
    const exp = expenses.find(e=>e.id===expId);
    if (!exp) return;
    const versements = (exp.versements||[]).filter(v=>v.id!==vId);
    await updateDoc(doc(db,"expenses",expId), { versements });
    showToast("Versement supprimé.");
  };

  // ── EVENT FORM ──
  const emptyEvent = { date:todayISO(), label:"", category:"Médecin", child:"Les deux", note:"", done:false };
  const [evForm, setEvForm] = useState(emptyEvent);
  const openAddEvent  = () => { setEvForm(emptyEvent); setEditEvent(null); setEventModal(true); };
  const openEditEvent = (e) => { setEvForm({...e}); setEditEvent(e.id); setEventModal(true); };
  const saveEvent = async () => {
    if (!evForm.label || !evForm.date) return;
    const id = editEvent || Date.now().toString();
    await setDoc(doc(db,"events",id), {...evForm, id});
    showToast(editEvent ? "Événement modifié ✓" : "Événement ajouté ✓");
    setEventModal(false);
  };
  const toggleEventDone = async (id) => {
    const ev = events.find(e=>e.id===id);
    if (!ev) return;
    await updateDoc(doc(db,"events",id), { done: !ev.done });
  };
  const deleteEvent = async (id) => {
    await deleteDoc(doc(db,"events",id));
    showToast("Événement supprimé.");
  };

  // ── DELETE ──
  const deleteItem = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type==="expense") await deleteExpense(confirmDelete.id);
    else await deleteEvent(confirmDelete.id);
    setConfirmDelete(null);
  };

  // ── FILTERS ──
  const filteredExpenses = expenses.filter(e=>{
    const mc = filterChild==="Tous" || e.child===filterChild || e.child==="Les deux";
    const mcat = filterCat==="Toutes" || e.category===filterCat;
    return mc && mcat;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));

  const filteredEvents = events.filter(e=>{
    const mc = filterChild==="Tous" || e.child===filterChild || e.child==="Les deux";
    const mcat = filterCat==="Toutes" || e.category===filterCat;
    return mc && mcat;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));

  const upcomingEvents  = events.filter(e=>!e.done && new Date(e.date)>=new Date(todayISO())).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,4);
  const recentExpenses  = [...expenses].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);

  if (!authed) return (
    <>
      <style>{CSS}</style>
      <Login onLogin={()=>setAuthed(true)} />
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <div style={{ minHeight:"100vh", background:"#0f1117", color:"#e8e6e0", paddingBottom:80 }}>

        {/* HEADER */}
        <div style={{ padding:"20px 20px 8px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, color:"#f0c040" }}>CoParent</div>
            <div style={{ fontSize:11, color:"#555", letterSpacing:".05em", textTransform:"uppercase", display:"flex", alignItems:"center" }}>
              <span className={`sync-dot ${syncing?"loading":"ok"}`}></span>
              {syncing ? "Synchronisation..." : "Synchronisé"}
            </div>
          </div>
          <div style={{ display:"flex", gap:4 }}>
            {[["dashboard","Accueil"],["finances","Finances"],["events","Événements"]].map(([id,label])=>(
              <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={()=>setTab(id)}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding:"0 16px" }}>

          {/* ── DASHBOARD ── */}
          {tab==="dashboard" && (
            <div>
              <div className="card" style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:".06em", marginBottom:6 }}>Solde actuel</div>
                <div style={{ fontSize:28, fontWeight:700, fontFamily:"'Playfair Display',serif" }}>
                  <span className={balanceNette>0.01?"balance-pos":balanceNette<-0.01?"balance-neg":"balance-zero"}>
                    {balanceNette>0.01 ? `Elle te doit ${fmt(balanceNette)}` : balanceNette<-0.01 ? `Tu lui dois ${fmt(Math.abs(balanceNette))}` : "✓ Équilibre parfait"}
                  </span>
                </div>
                <div style={{ marginTop:14, display:"flex", gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:"#60aaff", marginBottom:3 }}>Toi — {fmt(totalMoi)}</div>
                    <div className="progress-bar"><div className="progress-fill" style={{ width:totalAll?`${(totalMoi/totalAll)*100}%`:"50%", background:"#60aaff" }}/></div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, color:"#e060e0", marginBottom:3, textAlign:"right" }}>Elle — {fmt(totalElle)}</div>
                    <div className="progress-bar"><div className="progress-fill" style={{ width:totalAll?`${(totalElle/totalAll)*100}%`:"50%", background:"#e060e0" }}/></div>
                  </div>
                </div>
                <div style={{ marginTop:8, fontSize:12, color:"#555", textAlign:"center" }}>Total : {fmt(totalAll)} · Part équitable : {fmt(fairShare)}</div>
              </div>

              {upcomingEvents.length>0 && (
                <div className="card" style={{ marginBottom:14 }}>
                  <div className="section-title">📅 Prochains événements</div>
                  {upcomingEvents.map(e=>(
                    <div key={e.id} className="event-row">
                      <div className="date-badge">{formatDate(e.date)}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:500, fontSize:14 }}>{e.label}</div>
                        <div style={{ marginTop:3, display:"flex", gap:6 }}>
                          <span className="chip chip-cat">{e.category}</span>
                          <span className="chip chip-cat">{e.child}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {recentExpenses.length>0 && (
                <div className="card" style={{ marginBottom:14 }}>
                  <div className="section-title">💰 Dernières dépenses</div>
                  {recentExpenses.map(e=>(
                    <div key={e.id} className="expense-row">
                      <div className="date-badge">{formatDate(e.date)}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:500, fontSize:14 }}>{e.label}</div>
                        <div style={{ marginTop:3, display:"flex", gap:6 }}>
                          <span className={`chip ${e.payer==="Moi"?"chip-moi":e.payer==="Elle"?"chip-elle":"chip-deux"}`}>{e.payer}</span>
                          <span className="chip chip-cat">{e.category}</span>
                        </div>
                      </div>
                      <div className="amount-badge" style={{ color:"#e8e6e0" }}>{fmt(e.amount)}</div>
                    </div>
                  ))}
                </div>
              )}

              {expenses.length===0 && events.length===0 && (
                <div style={{ textAlign:"center", padding:"40px 20px", color:"#555" }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>👨‍👧‍👦</div>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, color:"#888", marginBottom:8 }}>Commençons !</div>
                  <div style={{ fontSize:13 }}>Ajoute ta première dépense ou ton premier événement avec le bouton <span style={{ color:"#f0c040" }}>+</span></div>
                </div>
              )}
            </div>
          )}

          {/* ── FINANCES ── */}
          {tab==="finances" && (
            <div>
              <div className="card" style={{ marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontSize:11, color:"#888", textTransform:"uppercase", letterSpacing:".06em" }}>Bilan net</div>
                  <div style={{ fontSize:20, fontWeight:700, marginTop:2 }}>
                    <span className={balanceNette>0.01?"balance-pos":balanceNette<-0.01?"balance-neg":"balance-zero"}>
                      {balanceNette>0.01?`+${fmt(balanceNette)}`:balanceNette<-0.01?`-${fmt(Math.abs(balanceNette))}`:"Équité ✓"}
                    </span>
                  </div>
                  <div style={{ fontSize:12, color:"#555", marginTop:2 }}>
                    {balanceNette>0.01?"Elle te doit":balanceNette<-0.01?"Tu lui dois":"Vous êtes à égalité"}
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:12, color:"#60aaff" }}>Toi (RAC) : {fmt(totalMoi)}</div>
                  <div style={{ fontSize:12, color:"#e060e0" }}>Elle (RAC) : {fmt(totalElle)}</div>
                  <div style={{ fontSize:12, color:"#555" }}>Total RAC : {fmt(totalAll)}</div>
                </div>
              </div>

              <div className="filter-row">
                {["Tous","Nathan","Lucas"].map(c=>(
                  <button key={c} className={`filter-chip ${filterChild===c?"active":""}`} onClick={()=>setFilterChild(c)}>{c}</button>
                ))}
                {["Toutes",...CATEGORIES_EXPENSE].map(c=>(
                  <button key={c} className={`filter-chip ${filterCat===c?"active":""}`} onClick={()=>setFilterCat(c)}>{c}</button>
                ))}
              </div>

              {filteredExpenses.length===0 ? (
                <div style={{ textAlign:"center", padding:32, color:"#555" }}>Aucune dépense trouvée.</div>
              ) : (
                <div className="card">
                  {filteredExpenses.map(e=>{
                    const rac = resteACharge(e);
                    const vTotal = versementTotal(e);
                    const expanded = expandedExpense===e.id;
                    const rmoi = racMoi(e);
                    const relle = racElle(e);
                    return (
                      <div key={e.id} className="expense-row" style={{ flexDirection:"column", gap:0 }}>
                        <div style={{ display:"flex", gap:12, width:"100%" }}>
                          <div className="date-badge" style={{ marginTop:2 }}>{formatDate(e.date)}</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:500, fontSize:14 }}>{e.label}</div>
                            <div style={{ marginTop:3, display:"flex", gap:5, flexWrap:"wrap" }}>
                              <span className={`chip ${e.payer==="Moi"?"chip-moi":e.payer==="Elle"?"chip-elle":"chip-deux"}`}>{e.payer}</span>
                              <span className="chip chip-cat">{e.category}</span>
                              <span className="chip chip-cat">{e.child}</span>
                            </div>
                            {e.payer==="Les deux" && (
                              <div style={{ fontSize:11, color:"#888", marginTop:3 }}>
                                <span style={{ color:"#60aaff" }}>Toi : {fmt(e.amountMoi)}</span>
                                <span style={{ margin:"0 6px", color:"#444" }}>·</span>
                                <span style={{ color:"#e060e0" }}>Elle : {fmt(e.amountElle)}</span>
                              </div>
                            )}
                            {e.note && <div style={{ fontSize:12, color:"#666", marginTop:4 }}>{e.note}</div>}
                            <div className="action-row">
                              <button className="action-btn" onClick={()=>setExpandedExpense(expanded?null:e.id)}>
                                {expanded?"▲ Réduire":"▼ Détails"}
                              </button>
                              <button className="action-btn" onClick={()=>openEditExpense(e)}>✏️</button>
                              <button className="action-btn del" onClick={()=>setConfirmDelete({type:"expense",id:e.id})}>🗑</button>
                            </div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div className="amount-badge" style={{ color:"#e8e6e0" }}>{fmt(e.amount)}</div>
                            {rac!==parseFloat(e.amount||0) && <div style={{ fontSize:11, color:"#888", marginTop:2 }}>RAC : {fmt(rac)}</div>}
                          </div>
                        </div>

                        {expanded && (
                          <div style={{ marginTop:10, background:"#1a1d27", borderRadius:10, padding:12, width:"100%" }}>
                            {/* Remboursements sécu/mutuelle */}
                            <div style={{ fontSize:12, color:"#888", marginBottom:8, fontWeight:600 }}>REMBOURSEMENTS</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10, textAlign:"center" }}>
                              <div><div style={{ fontSize:10, color:"#666" }}>Sécu</div><div style={{ color:"#f0c040", fontWeight:600 }}>{fmt(e.remboSecu)}</div></div>
                              <div><div style={{ fontSize:10, color:"#666" }}>Mutuelle Charlène</div><div style={{ color:"#f0c040", fontWeight:600 }}>{fmt(e.remboMutuelle)}</div></div>
                              <div><div style={{ fontSize:10, color:"#666" }}>Mutuelle Sabrina</div><div style={{ color:"#f0c040", fontWeight:600 }}>{fmt(e.remboMutuelleSabrina)}</div></div>
                            </div>
                            <div style={{ textAlign:"center", fontSize:13, marginBottom:12 }}>
                              Reste à charge : <strong style={{ color:"#f0c040" }}>{fmt(rac)}</strong>
                              <span style={{ color:"#555", marginLeft:6 }}>· Moitié : <strong>{fmt(rac/2)}</strong></span>
                            </div>

                            {/* Part de chacun */}
                            <div style={{ fontSize:12, color:"#888", marginBottom:8, fontWeight:600 }}>PART DE CHACUN (RAC)</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12, textAlign:"center" }}>
                              <div style={{ background:"#1e2a3a", borderRadius:8, padding:"8px 4px" }}>
                                <div style={{ fontSize:10, color:"#60aaff", marginBottom:3 }}>Toi</div>
                                <div style={{ color:"#60aaff", fontWeight:700 }}>{fmt(rmoi)}</div>
                              </div>
                              <div style={{ background:"#2a1e2a", borderRadius:8, padding:"8px 4px" }}>
                                <div style={{ fontSize:10, color:"#e060e0", marginBottom:3 }}>Elle</div>
                                <div style={{ color:"#e060e0", fontWeight:700 }}>{fmt(relle)}</div>
                              </div>
                            </div>

                            {/* Versements */}
                            <div style={{ fontSize:12, color:"#888", marginBottom:8, fontWeight:600 }}>VERSEMENTS ENTRE VOUS</div>
                            {(e.versements||[]).length===0 ? (
                              <div style={{ fontSize:12, color:"#555", marginBottom:8 }}>Aucun versement enregistré.</div>
                            ) : (
                              (e.versements||[]).map(v=>(
                                <div key={v.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #23263a" }}>
                                  <div>
                                    <span className={`chip ${v.de==="Moi"?"chip-moi":"chip-elle"}`}>{v.de}</span>
                                    <span style={{ fontSize:12, color:"#888", marginLeft:8 }}>{formatDate(v.date)}</span>
                                    {v.note && <span style={{ fontSize:11, color:"#555", marginLeft:6 }}>{v.note}</span>}
                                  </div>
                                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                    <span style={{ color:"#40d090", fontWeight:600 }}>{fmt(v.amount)}</span>
                                    <button className="action-btn del" style={{ padding:"2px 6px" }} onClick={()=>deleteVersement(e.id,v.id)}>✕</button>
                                  </div>
                                </div>
                              ))
                            )}
                            <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <span style={{ fontSize:12, color: vTotal>=rac/2-0.01?"#40d090":"#e05060" }}>
                                {vTotal>=rac/2-0.01 ? "✓ Soldé" : `Reste à verser : ${fmt(rac/2-vTotal)}`}
                              </span>
                              <button className="action-btn" style={{ background:"#1e3a2f", color:"#40d090" }} onClick={()=>openVersement(e.id)}>+ Versement</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── EVENTS ── */}
          {tab==="events" && (
            <div>
              <div className="filter-row">
                {["Tous","Nathan","Lucas"].map(c=>(
                  <button key={c} className={`filter-chip ${filterChild===c?"active":""}`} onClick={()=>setFilterChild(c)}>{c}</button>
                ))}
                {["Toutes",...CATEGORIES_EVENT].map(c=>(
                  <button key={c} className={`filter-chip ${filterCat===c?"active":""}`} onClick={()=>setFilterCat(c)}>{c}</button>
                ))}
              </div>

              {filteredEvents.length===0 ? (
                <div style={{ textAlign:"center", padding:32, color:"#555" }}>Aucun événement trouvé.</div>
              ) : (
                <div className="card">
                  {filteredEvents.map(e=>(
                    <div key={e.id} className="event-row">
                      <div onClick={()=>toggleEventDone(e.id)} className={`done-circle ${e.done?"done":""}`}>
                        {e.done && <span style={{ color:"#0f1117", fontSize:13, fontWeight:700 }}>✓</span>}
                      </div>
                      <div style={{ flex:1, opacity:e.done?.45:1 }}>
                        <div style={{ fontWeight:500, fontSize:14, textDecoration:e.done?"line-through":"none" }}>{e.label}</div>
                        <div style={{ fontSize:12, color:"#888", marginBottom:4 }}>{formatDate(e.date)}</div>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                          <span className="chip chip-cat">{e.category}</span>
                          <span className="chip chip-cat">{e.child}</span>
                        </div>
                        {e.note && <div style={{ fontSize:12, color:"#666", marginTop:4 }}>{e.note}</div>}
                        <div className="action-row">
                          <button className="action-btn" onClick={()=>openEditEvent(e)}>✏️ Modifier</button>
                          <button className="action-btn del" onClick={()=>setConfirmDelete({type:"event",id:e.id})}>🗑 Suppr.</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* FAB */}
        <button className="fab" onClick={()=>{ if(tab==="events") openAddEvent(); else { setTab("finances"); openAddExpense(); } }}>+</button>

        {/* NAV */}
        <nav className="nav">
          {[["dashboard","🏠","Accueil"],["finances","💰","Finances"],["events","📅","Événements"]].map(([id,icon,label])=>(
            <button key={id} className={`nav-item ${tab===id?"active":""}`} onClick={()=>setTab(id)}>
              <span className="nav-icon">{icon}</span>{label}
            </button>
          ))}
        </nav>

        {/* ── EXPENSE MODAL ── */}
        {expenseModal && (
          <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setExpenseModal(false)}>
            <div className="modal">
              <div className="modal-title">{editExpense?"Modifier la dépense":"Nouvelle dépense"}</div>
              <div className="field"><label>Date</label><input type="date" value={expForm.date} onChange={e=>setExpForm(f=>({...f,date:e.target.value}))} /></div>
              <div className="field"><label>Description *</label><input type="text" placeholder="Ex: Médecin généraliste" value={expForm.label} onChange={e=>setExpForm(f=>({...f,label:e.target.value}))} /></div>

              <div className="field"><label>Payé par</label>
                <select value={expForm.payer} onChange={e=>setExpForm(f=>({...f, payer:e.target.value, amountMoi:"", amountElle:""}))}>
                  {PAYERS.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>

              {expForm.payer !== "Les deux" ? (
                <div className="field"><label>Montant total payé (€) *</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={expForm.amount} onChange={e=>setExpForm(f=>({...f,amount:e.target.value}))} />
                </div>
              ) : (
                <div className="partage-box">
                  <div style={{ fontSize:11, color:"#f0c040", fontWeight:600, marginBottom:10, textTransform:"uppercase", letterSpacing:".05em" }}>Montants payés par chacun</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div className="field" style={{ marginBottom:0 }}>
                      <label style={{ color:"#60aaff" }}>Toi (€) *</label>
                      <input type="number" step="0.01" min="0" placeholder="0.00" value={expForm.amountMoi}
                        onChange={e=>handleAmountMoiElle("amountMoi", e.target.value)} />
                    </div>
                    <div className="field" style={{ marginBottom:0 }}>
                      <label style={{ color:"#e060e0" }}>Elle (€) *</label>
                      <input type="number" step="0.01" min="0" placeholder="0.00" value={expForm.amountElle}
                        onChange={e=>handleAmountMoiElle("amountElle", e.target.value)} />
                    </div>
                  </div>
                  {(parseFloat(expForm.amountMoi||0) + parseFloat(expForm.amountElle||0)) > 0 && (
                    <div style={{ marginTop:8, fontSize:12, color:"#888", textAlign:"center" }}>
                      Total : <strong style={{ color:"#e8e6e0" }}>{fmt(parseFloat(expForm.amountMoi||0) + parseFloat(expForm.amountElle||0))}</strong>
                    </div>
                  )}
                </div>
              )}

              <div className="field"><label>Enfant(s)</label>
                <select value={expForm.child} onChange={e=>setExpForm(f=>({...f,child:e.target.value}))}>
                  {CHILDREN_OPTS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="field"><label>Catégorie</label>
                <select value={expForm.category} onChange={e=>setExpForm(f=>({...f,category:e.target.value}))}>
                  {CATEGORIES_EXPENSE.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>

              <div className="section-divider">🏥 Remboursements (optionnel)</div>
              <p className="hint" style={{ marginBottom:10 }}>Le reste à charge réel est calculé automatiquement et sert de base au solde.</p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                <div className="field"><label>Sécu (€)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={expForm.remboSecu} onChange={e=>setExpForm(f=>({...f,remboSecu:e.target.value}))} />
                </div>
                <div className="field"><label>Mutuelle Charlène (€)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={expForm.remboMutuelle} onChange={e=>setExpForm(f=>({...f,remboMutuelle:e.target.value}))} />
                </div>
                <div className="field"><label>Mutuelle Sabrina (€)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={expForm.remboMutuelleSabrina||""} onChange={e=>setExpForm(f=>({...f,remboMutuelleSabrina:e.target.value}))} />
                </div>
              </div>
              {(parseFloat(expForm.remboSecu||0)+parseFloat(expForm.remboMutuelle||0)+parseFloat(expForm.remboMutuelleSabrina||0))>0 && (
                <div className="rac-preview">
                  <span style={{ color:"#f0c040", fontWeight:700 }}>
                    Reste à charge : {fmt(Math.max(0, parseFloat(expForm.amount||0)-parseFloat(expForm.remboSecu||0)-parseFloat(expForm.remboMutuelle||0)-parseFloat(expForm.remboMutuelleSabrina||0)))}
                  </span>
                  <span style={{ color:"#555", marginLeft:8, fontSize:12 }}>(base du solde)</span>
                </div>
              )}
              <div className="field"><label>Note (optionnel)</label><textarea placeholder="Détails, numéro de reçu..." value={expForm.note} onChange={e=>setExpForm(f=>({...f,note:e.target.value}))} /></div>
              <button className="btn-primary" onClick={saveExpense}>Enregistrer</button>
              <button className="btn-secondary" onClick={()=>setExpenseModal(false)}>Annuler</button>
            </div>
          </div>
        )}

        {/* ── VERSEMENT MODAL ── */}
        {versementModal && (()=>{
          const exp = expenses.find(e=>e.id===versementModal);
          const rac = exp ? resteACharge(exp) : 0;
          const deja = exp ? versementTotal(exp) : 0;
          const resteAVerser = Math.max(0, rac/2 - deja);
          return (
            <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setVersementModal(null)}>
              <div className="modal">
                <div className="modal-title">Versement entre vous</div>
                {exp && (
                  <div style={{ background:"#1f2235", borderRadius:10, padding:"10px 12px", marginBottom:16, fontSize:13 }}>
                    <div style={{ fontWeight:600 }}>{exp.label}</div>
                    <div style={{ color:"#666", fontSize:12, marginBottom:6 }}>{formatDate(exp.date)}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, textAlign:"center" }}>
                      <div><div style={{ color:"#666", fontSize:11 }}>RAC</div><div style={{ color:"#f0c040", fontWeight:700 }}>{fmt(rac)}</div></div>
                      <div><div style={{ color:"#666", fontSize:11 }}>Moitié</div><div style={{ color:"#f0c040", fontWeight:700 }}>{fmt(rac/2)}</div></div>
                      <div><div style={{ color:"#666", fontSize:11 }}>Reste à verser</div><div style={{ color:resteAVerser<0.01?"#40d090":"#e05060", fontWeight:700 }}>{resteAVerser<0.01?"Soldé ✓":fmt(resteAVerser)}</div></div>
                    </div>
                  </div>
                )}
                <div className="field"><label>Date du versement</label><input type="date" value={vForm.date} onChange={e=>setVForm(f=>({...f,date:e.target.value}))} /></div>
                <div className="field"><label>Montant versé (€)</label><input type="number" step="0.01" min="0" placeholder="0.00" value={vForm.amount} onChange={e=>setVForm(f=>({...f,amount:e.target.value}))} /></div>
                <div className="field"><label>Versé par</label>
                  <select value={vForm.de} onChange={e=>setVForm(f=>({...f,de:e.target.value}))}>
                    {["Moi","Elle"].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="field"><label>Note (optionnel)</label><input type="text" placeholder="Ex: virement du 12 mars" value={vForm.note} onChange={e=>setVForm(f=>({...f,note:e.target.value}))} /></div>
                <button className="btn-primary" onClick={saveVersement}>Enregistrer le versement</button>
                <button className="btn-secondary" onClick={()=>setVersementModal(null)}>Annuler</button>
              </div>
            </div>
          );
        })()}

        {/* ── EVENT MODAL ── */}
        {eventModal && (
          <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setEventModal(false)}>
            <div className="modal">
              <div className="modal-title">{editEvent?"Modifier l'événement":"Nouvel événement"}</div>
              <div className="field"><label>Date</label><input type="date" value={evForm.date} onChange={e=>setEvForm(f=>({...f,date:e.target.value}))} /></div>
              <div className="field"><label>Description *</label><input type="text" placeholder="Ex: Rendez-vous pédiatre" value={evForm.label} onChange={e=>setEvForm(f=>({...f,label:e.target.value}))} /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div className="field"><label>Catégorie</label>
                  <select value={evForm.category} onChange={e=>setEvForm(f=>({...f,category:e.target.value}))}>
                    {CATEGORIES_EVENT.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field"><label>Enfant(s)</label>
                  <select value={evForm.child} onChange={e=>setEvForm(f=>({...f,child:e.target.value}))}>
                    {CHILDREN_OPTS.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="field"><label>Note (optionnel)</label><textarea placeholder="Détails, lieu, contact..." value={evForm.note} onChange={e=>setEvForm(f=>({...f,note:e.target.value}))} /></div>
              <button className="btn-primary" onClick={saveEvent}>Enregistrer</button>
              <button className="btn-secondary" onClick={()=>setEventModal(false)}>Annuler</button>
            </div>
          </div>
        )}

        {/* ── CONFIRM DELETE ── */}
        {confirmDelete && (
          <div className="confirm-overlay">
            <div className="confirm-box">
              <div style={{ fontSize:32, marginBottom:12 }}>🗑</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, marginBottom:8 }}>Confirmer la suppression</div>
              <div style={{ fontSize:13, color:"#888", marginBottom:20 }}>Cette action est irréversible.</div>
              <button className="btn-primary" style={{ background:"#e05060", marginBottom:8 }} onClick={deleteItem}>Supprimer</button>
              <button className="btn-secondary" onClick={()=>setConfirmDelete(null)}>Annuler</button>
            </div>
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}
