import { useState, useEffect } from 'react';
import { Plus, Package, AlertTriangle, CheckCircle, Clock, RotateCcw, X } from 'lucide-react';
import LinkedMeetings from './LinkedMeetings';
import Attachments from './Attachments';

const API = import.meta.env.VITE_API_URL || '';
const ITEM_TYPES = ['radio','portable_radio','pager','keys','access_card','laptop','tablet','camera','thermal_imager','gas_meter','aed','ppe_set','scba_pack','hand_tool','power_tool','vehicle','other'];
const TYPE_LABELS = { radio:'Radio',portable_radio:'Portable Radio',pager:'Pager',keys:'Keys',access_card:'Access Card',laptop:'Laptop',tablet:'Tablet',camera:'Camera',thermal_imager:'Thermal Imager',gas_meter:'Gas Meter',aed:'AED',ppe_set:'PPE Set',scba_pack:'SCBA Pack',hand_tool:'Hand Tool',power_tool:'Power Tool',vehicle:'Vehicle',other:'Other' };
const CONDITIONS = ['new','excellent','good','fair','poor','damaged'];
const STATUS_COLORS = { checked_out:'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300', returned:'bg-green-100 dark:bg-green-950/50 text-green-800 dark:text-green-300', lost:'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300', damaged:'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300' };

function CheckoutModal({ members, onSave, onClose }) {
  const [f, setF] = useState({ item_name:'', item_type:'radio', serial_number:'', asset_tag:'', checked_out_by:'', expected_return:'', condition_out:'good', purpose:'', notes:'' });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-10 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Check Out Equipment</h3>
          <button onClick={onClose} aria-label="Close checkout form" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Item name *" aria-label="Item name" value={f.item_name} onChange={e => setF({...f, item_name: e.target.value})} />
          <div className="grid grid-cols-2 gap-3">
            <select className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.item_type} aria-label="Item type" onChange={e => setF({...f, item_type: e.target.value})}>
              {ITEM_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            <select className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.condition_out} aria-label="Condition at checkout" onChange={e => setF({...f, condition_out: e.target.value})}>
              {CONDITIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Serial #" aria-label="Serial number" value={f.serial_number} onChange={e => setF({...f, serial_number: e.target.value})} />
            <input className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Asset tag" aria-label="Asset tag" value={f.asset_tag} onChange={e => setF({...f, asset_tag: e.target.value})} />
          </div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.checked_out_by} aria-label="Checked out by member" onChange={e => setF({...f, checked_out_by: e.target.value})}>
            <option value="">— Select member —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div><label className="text-xs text-gray-500 dark:text-gray-400">Expected Return</label><input type="datetime-local" className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.expected_return} onChange={e => setF({...f, expected_return: e.target.value})} /></div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" placeholder="Purpose" aria-label="Purpose" value={f.purpose} onChange={e => setF({...f, purpose: e.target.value})} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" rows={2} placeholder="Notes" aria-label="Notes" value={f.notes} onChange={e => setF({...f, notes: e.target.value})} />
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={() => f.item_name && f.checked_out_by && onSave(f)} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Check Out</button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ item, members, onReturn, onClose }) {
  const [f, setF] = useState({ returned_to:'', condition_in:'good', notes:'' });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6 m-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Return: {item.item_name}</h3>
          <button onClick={onClose} aria-label="Close return form" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <select className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.returned_to} aria-label="Returned to member" onChange={e => setF({...f, returned_to: e.target.value})}>
            <option value="">— Select member —</option>
            {members.map(m => <option key={m.id} value={m.name}>{m.name} — {m.rank || 'N/A'}</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" value={f.condition_in} aria-label="Condition at return" onChange={e => setF({...f, condition_in: e.target.value})}>
            {CONDITIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700" rows={2} placeholder="Notes" aria-label="Notes" value={f.notes} onChange={e => setF({...f, notes: e.target.value})} />
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
          <button onClick={() => onReturn({ ...f, return_item: true })} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            <RotateCcw size={14} className="inline mr-1" /> Return Item
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EquipmentCheckout() {
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [returnItem, setReturnItem] = useState(null);
  const [view, setView] = useState('active'); // active | all

  const load = () => {
    const statusParam = view === 'active' ? '?status=checked_out' : '';
    fetch(`${API}/api/equipment-checkout${statusParam}`).then(r => r.json()).then(d => setItems(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [])).catch(() => {});
    fetch(`${API}/api/equipment-checkout/stats`).then(r => r.json()).then(d => setStats(d && typeof d === 'object' ? d : {})).catch(() => {});
    fetch(`${API}/api/members`).then(r => r.json()).then(d => setMembers(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [])).catch(() => {});
  };
  useEffect(load, [view]);

  const checkout = async (data) => {
    await fetch(`${API}/api/equipment-checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setShowModal(false); load();
  };

  const doReturn = async (data) => {
    await fetch(`${API}/api/equipment-checkout/${returnItem.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setReturnItem(null); load();
  };

  const del = async (id) => {
    if (!confirm('Delete this record?')) return;
    await fetch(`${API}/api/equipment-checkout/${id}`, { method: 'DELETE' });
    load();
  };

  const isOverdue = (item) => item.status === 'checked_out' && item.expected_return && new Date(item.expected_return) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Equipment Checkout</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track equipment sign-outs and returns</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">
          <Plus size={16} /> Check Out Item
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Checked Out', val: stats.checkedOut || 0, icon: Package, color: 'blue' },
          { label: 'Overdue', val: stats.overdue || 0, icon: AlertTriangle, color: 'red' },
          { label: 'Total Records', val: stats.totalRecords || 0, icon: CheckCircle, color: 'gray' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${s.color}-50`}><s.icon size={18} className={`text-${s.color}-600`} /></div>
              <div><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.val}</p><p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p></div>
            </div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {['active','all'].map(v => (
          <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${view === v ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {v === 'active' ? 'Currently Out' : 'All Records'}
          </button>
        ))}
      </div>

      {/* Items table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-950 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Item</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Type</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Member</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Checked Out</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Expected Return</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map(item => (
              <tr key={item.id} className={isOverdue(item) ? 'bg-red-50 dark:bg-red-950/50' : ''}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{item.item_name}</p>
                  {item.serial_number && <p className="text-xs text-gray-400">S/N: {item.serial_number}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{TYPE_LABELS[item.item_type] || item.item_type}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.member_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{new Date(item.checked_out_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-xs">
                  {item.expected_return ? (
                    <span className={isOverdue(item) ? 'text-red-600 dark:text-red-400 font-bold' : 'text-gray-500 dark:text-gray-400'}>
                      {isOverdue(item) && <AlertTriangle size={12} className="inline mr-1" />}
                      {new Date(item.expected_return).toLocaleString()}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{item.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {item.status === 'checked_out' && (
                      <button onClick={() => setReturnItem(item)} className="px-2 py-1 text-xs bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900 rounded-lg font-medium">Return</button>
                    )}
                    <button onClick={() => del(item.id)} className="px-2 py-1 text-xs bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 rounded-lg">Delete</button>
                  </div>
                  {/* Linked Meetings */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
                    <LinkedMeetings module="equipment-checkout" recordId={item.id} recordLabel={item.item_name || 'Equipment'} />
                    <Attachments module="equipment-checkout" recordId={item.id} recordLabel={item.item_name || 'Equipment'} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="text-center text-gray-400 py-8">{view === 'active' ? 'No items currently checked out' : 'No checkout records'}</p>}
      </div>

      {showModal && <CheckoutModal members={members} onSave={checkout} onClose={() => setShowModal(false)} />}
      {returnItem && <ReturnModal item={returnItem} members={members} onReturn={doReturn} onClose={() => setReturnItem(null)} />}
    </div>
  );
}
