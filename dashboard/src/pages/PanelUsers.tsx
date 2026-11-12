import { useEffect, useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { panelApi, sessionApi, type PanelRole, type PanelUser, type Session } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../hooks/useToast';
import './Panel.css';

const roles: PanelRole[] = ['admin', 'reseller', 'user', 'support'];

export function PanelUsers() {
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<PanelUser | null>(null);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'user' as PanelRole });
  const toast = useToast();
  const load = async () => { try { const [nextUsers, nextSessions] = await Promise.all([panelApi.users(), sessionApi.list()]); setUsers(nextUsers); setSessions(nextSessions); } catch (e) { toast.error('Panel users', e instanceof Error ? e.message : 'Unable to load users'); } };
  useEffect(() => { void load(); }, []);
  const create = async (event: React.FormEvent) => { event.preventDefault(); try { await panelApi.createUser({ ...form }); setForm({ username: '', password: '', displayName: '', role: 'user' }); await load(); toast.success('User created'); } catch (e) { toast.error('Create user', e instanceof Error ? e.message : 'Unable to create user'); } };
  const pick = (user: PanelUser) => { setSelected(user); setAssigned(user.sessionIds ?? []); };
  const saveAssignments = async () => { if (!selected) return; try { await panelApi.replaceUserSessions(selected.id, assigned); toast.success('Session access saved. The user must log in again.'); } catch (e) { toast.error('Session access', e instanceof Error ? e.message : 'Unable to save'); } };
  return <div className="panel-page"><PageHeader title="Panel Users" subtitle="WA3-style accounts and OpenWA session access" />
    <div className="panel-grid"><form className="panel-card" onSubmit={create}><h2>Create user</h2><input required placeholder="Username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}/><input required minLength={3} type="password" placeholder="Password (3+ characters)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}/><input placeholder="Display name" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })}/><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as PanelRole })}>{roles.map(role => <option key={role}>{role}</option>)}</select><button className="btn btn-primary"><Plus size={16}/>Create user</button></form>
      <section className="panel-card"><h2>Accounts</h2><div className="panel-list">{users.map(user => <button type="button" key={user.id} className={selected?.id === user.id ? 'selected' : ''} onClick={() => pick(user)}><strong>{user.displayName || user.username}</strong><span>{user.username} · {user.role}</span></button>)}</div></section>
      <section className="panel-card">{selected ? <><h2>Session access: {selected.username}</h2>{selected.role === 'admin' ? <p>Administrators access all sessions.</p> : <><p>Select the OpenWA sessions this account may use. Saving signs out existing browser sessions.</p><div className="check-list">{sessions.map(session => <label key={session.id}><input type="checkbox" checked={assigned.includes(session.id)} onChange={e => setAssigned(current => e.target.checked ? [...current, session.id] : current.filter(id => id !== session.id))}/>{session.name} <small>{session.status}</small></label>)}</div><button className="btn btn-primary" onClick={saveAssignments}><Save size={16}/>Save access</button></>}</> : <p>Select an account to manage its OpenWA sessions.</p>}</section></div></div>;
}
