import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { panelApi, type CreditBalance, type PanelUser } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../hooks/useToast';
import './Panel.css';

export function Credits({ admin = false }: { admin?: boolean }) {
  const [users, setUsers] = useState<PanelUser[]>([]); const [selected, setSelected] = useState(''); const [data, setData] = useState<CreditBalance | null>(null); const [amount, setAmount] = useState(''); const [remark, setRemark] = useState(''); const toast = useToast();
  const load = async (userId?: string) => { try { const next = admin ? await panelApi.credits(userId || selected) : await panelApi.myCredits(); setData(next); } catch (e) { toast.error('Credits', e instanceof Error ? e.message : 'Unable to load credits'); } };
  useEffect(() => { if (admin) { void panelApi.users().then(next => { setUsers(next); if (next[0]) { setSelected(next[0].id); void load(next[0].id); } }); } else void load(); }, []);
  const add = async (e: React.FormEvent) => { e.preventDefault(); try { await panelApi.addCredit({ userId: selected, amount: Number(amount), remark }); setAmount(''); setRemark(''); await load(); toast.success('Credit entry saved'); } catch (err) { toast.error('Credits', err instanceof Error ? err.message : 'Unable to save entry'); } };
  return <div className="panel-page"><PageHeader title="Credits" subtitle="Customer credit balance and immutable ledger"/><div className="panel-grid">{admin && <section className="panel-card"><h2>Customer</h2><select value={selected} onChange={e => { setSelected(e.target.value); void load(e.target.value); }}>{users.map(user => <option key={user.id} value={user.id}>{user.displayName || user.username}</option>)}</select><form onSubmit={add}><input required type="number" step="1" placeholder="Credit amount (+/-)" value={amount} onChange={e => setAmount(e.target.value)}/><input placeholder="Remark" value={remark} onChange={e => setRemark(e.target.value)}/><button className="btn btn-primary"><Plus size={16}/>Add ledger entry</button></form></section>}<section className="panel-card"><h2>Balance</h2><div className="credit-balance">{data?.balance ?? '—'}</div><div className="ledger">{data?.entries.map(entry => <div key={entry.id}><strong className={entry.amount > 0 ? 'positive' : 'negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</strong><span>{entry.remark || 'Credit adjustment'} · {new Date(entry.createdAt).toLocaleString()}</span></div>) || <p>No ledger entries.</p>}</div></section></div></div>;
}
