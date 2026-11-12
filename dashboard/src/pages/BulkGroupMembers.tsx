import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UsersRound, ShieldCheck, UserRound, RefreshCw, Search, Upload, CheckCircle2 } from 'lucide-react';
import { useSessionsQuery } from '../hooks/queries';
import { sessionApi, type ManagedGroup, type BulkMemberSummary } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { parseTeamNumbers } from '../utils/teamNumbers';
import './BulkGroupMembers.css';

export function BulkGroupMembers() {
  useDocumentTitle('Bulk Group Member Management');
  const { data: sessions = [] } = useSessionsQuery();
  const [sessionId, setSessionId] = useState('');
  const [selected, setSelected] = useState<ManagedGroup | null>(null);
  const [raw, setRaw] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [adminPage, setAdminPage] = useState(0);
  const [memberPage, setMemberPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<BulkMemberSummary | null>(null);
  const [activity, setActivity] = useState<{ time: string; summary: BulkMemberSummary }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const numbers = useMemo(() => parseTeamNumbers(raw), [raw]);
  const readySessions = sessions.filter(session => session.status === 'ready' && session.engineLoaded !== false);
  const sessionReady = readySessions.some(session => session.id === sessionId);
  const groupsQuery = useQuery({ queryKey: ['group-member-management', sessionId], queryFn: () => sessionApi.getManagementGroups(sessionId), enabled: Boolean(sessionId && sessionReady), staleTime: 30000, retry: false });
  const groups = groupsQuery.data || [];
  const admins = groups.filter(group => group.isAdmin === true);
  const nonAdmins = groups.filter(group => group.isAdmin === false);
  const unknown = groups.filter(group => group.isAdmin === undefined);
  const canProcess = !busy && sessionReady && selected?.isAdmin === true && numbers.numbers.length > 0 && numbers.numbers.length <= 256 && numbers.invalid.length === 0;
  const clearPreview = () => { setSummary(null); setError(''); };
  const process = async (preview: boolean) => {
    if (!canProcess || !selected || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(''); setSummary(null);
    try {
      const result = await sessionApi.bulkGroupMembers(sessionId, selected.id, numbers.numbers, preview);
      setSummary(result);
      if (!preview) setActivity(current => [{ time: new Date().toLocaleString(), summary: result }, ...current].slice(0, 50));
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to process members. Check WhatsApp before retrying.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const table = (list: ManagedGroup[], isAdmin: boolean) => {
    const search = isAdmin ? adminSearch : memberSearch;
    const page = isAdmin ? adminPage : memberPage;
    const setPage = isAdmin ? setAdminPage : setMemberPage;
    const filtered = list.filter(group => `${group.name} ${group.id}`.toLowerCase().includes(search.toLowerCase()));
    const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 8) - 1));
    return <section className="bgm-card bgm-group-panel">
      <div className="bgm-panel-title"><span className={isAdmin ? 'green' : 'amber'}>{isAdmin ? <ShieldCheck /> : <UsersRound />}</span><div><h2>{isAdmin ? 'My Groups (Admin)' : 'My Groups (Not Admin)'} <b>{list.length}</b></h2><p>{isAdmin ? 'Select a group to add your team.' : 'You are a member here. Only group admins can use bulk add.'}</p></div></div>
      <label className="bgm-search"><Search size={17}/><input aria-label={isAdmin ? 'Search admin groups' : 'Search non-admin groups'} value={search} onChange={event => { (isAdmin ? setAdminSearch : setMemberSearch)(event.target.value); setPage(0); }} placeholder="Search group name or ID..."/></label>
      <div className="bgm-table-wrap"><table><thead><tr><th>Group Name</th><th>Members</th><th>My Role</th><th>Action</th></tr></thead><tbody>{filtered.slice(safePage * 8, safePage * 8 + 8).map(group => <tr key={group.id} className={selected?.id === group.id ? 'selected' : ''}><td><strong>{group.name || group.id}</strong><small>{group.id}</small></td><td>{group.participantsCount ?? '—'}</td><td><span className={`bgm-badge ${isAdmin ? 'green' : 'amber'}`}>{isAdmin ? 'Admin' : 'Member'}</span></td><td><button disabled={busy} onClick={() => { setSelected(group); clearPreview(); }}>{isAdmin ? 'Add Members' : 'View Group'}</button></td></tr>)}</tbody></table></div>
      {!filtered.length && <p className="bgm-empty">{groupsQuery.isFetching ? 'Loading groups...' : sessionId ? 'No matching groups.' : 'Select a connected session to load groups.'}</p>}
      <footer><span>{filtered.length ? `${safePage * 8 + 1}–${Math.min((safePage + 1) * 8, filtered.length)} of ${filtered.length} groups` : '0 groups'}</span><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button><button disabled={(safePage + 1) * 8 >= filtered.length} onClick={() => setPage(safePage + 1)}>Next</button></footer>
    </section>;
  };
  return <div className="bulk-group-members">
    <header className="bgm-header"><div><h1>Bulk Group Member Management</h1><p>Find your groups, check your role and add your team without duplicates.</p></div><button disabled={!sessionReady || busy || groupsQuery.isFetching} onClick={() => { clearPreview(); void groupsQuery.refetch(); }}><RefreshCw size={16} className={groupsQuery.isFetching ? 'animate-spin' : ''}/> Refresh Groups</button></header>
    <label className="bgm-session">Connected Session<select value={sessionId} disabled={busy} onChange={event => { setSessionId(event.target.value); setSelected(null); setActivity([]); clearPreview(); setAdminPage(0); setMemberPage(0); }}><option value="">Select connected session</option>{readySessions.map(session => <option key={session.id} value={session.id}>{session.name}</option>)}</select></label>
    {groupsQuery.error && <p role="alert" className="bgm-error">{groupsQuery.error.message}</p>}
    {sessionId && !sessionReady && <p role="alert" className="bgm-error">Session is reconnecting or disconnected. Wait until it is ready.</p>}
    <div className="bgm-stats">{[[UsersRound, 'Total Groups', groups.length, 'blue'], [ShieldCheck, 'Admin Groups', admins.length, 'green'], [UsersRound, 'Non-Admin Groups', nonAdmins.length, 'amber'], [UserRound, 'Team Numbers', numbers.numbers.length, 'purple']].map(([Icon, label, value, color]) => { const StatIcon = Icon as typeof UsersRound; return <section className="bgm-card bgm-stat" key={String(label)}><span className={String(color)}><StatIcon/></span><div><p>{String(label)}</p><b>{String(value)}</b></div></section>; })}</div>
    <div className="bgm-group-grid">{table(admins, true)}{table(nonAdmins, false)}</div>
    {unknown.length > 0 && <p className="bgm-note">Admin status could not be confirmed for {unknown.length} groups. These groups cannot be used for bulk add.</p>}
    <div className="bgm-workflow">
      <section className="bgm-card"><h2><i>1</i> Select Group</h2><p>Choose a group from your admin list.</p>{selected ? <div className="bgm-selection"><CheckCircle2/><strong>{selected.name}</strong><small>{selected.id}</small><span>{selected.participantsCount ?? 'Unknown'} members · {selected.isAdmin ? 'Admin' : 'Member'}</span>{!selected.isAdmin && <p role="alert">You are not an admin of this group. Bulk add is unavailable.</p>}<button disabled={busy} onClick={() => { setSelected(null); clearPreview(); }}>Change Group</button></div> : <p className="bgm-empty">No group selected</p>}</section>
      <section className="bgm-card"><h2><i>2</i> Add Team Numbers</h2><p>Enter one number per line, including country code.</p><button disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16}/> Upload CSV / TXT</button><input ref={fileRef} hidden type="file" accept=".csv,.txt" onChange={async event => { const file = event.target.files?.[0]; if (file) { const text = await file.text(); setRaw(current => `${current}\n${text}`); clearPreview(); } event.target.value = ''; }}/><textarea aria-label="Team numbers" disabled={busy} value={raw} onChange={event => { setRaw(event.target.value); clearPreview(); }} placeholder="919876543210&#10;919876543211"/><footer><span>{numbers.numbers.length} unique numbers · {numbers.duplicates} input duplicates removed</span><button disabled={busy} onClick={() => { setRaw(''); clearPreview(); }}>Clear All</button></footer>{numbers.invalid.length > 0 && <p role="alert" className="bgm-error">Invalid entries: {numbers.invalid.slice(0, 5).join(', ')}. Use a one-column phone-number CSV.</p>}{numbers.numbers.length > 256 && <p role="alert" className="bgm-error">Maximum 256 unique numbers per run.</p>}</section>
      <section className="bgm-card"><h2><i>3</i> Preview &amp; Add Members</h2><p>Fresh group permissions and membership are checked before every add.</p><div className="bgm-preview"><span><b>{summary?.total ?? numbers.numbers.length}</b>Total Numbers</span><span className="amber"><b>{summary?.skipped ?? '—'}</b>Existing · Skipped</span><span className="green"><b>{summary?.ready ?? '—'}</b>To Be Added</span></div><p className="bgm-note">Already present numbers are skipped. Unconfirmed or private identities are reported separately.</p><button disabled={!canProcess} onClick={() => void process(true)}>Check Existing Members</button><button className="bgm-primary" disabled={!canProcess} onClick={() => void process(false)}>{busy ? 'Processing…' : 'Add Members to Group'}</button>{error && <p role="alert" className="bgm-error">{error}</p>}</section>
    </div>
    {summary && <section className="bgm-card bgm-results"><h2>{summary.preview ? 'Preview Results' : 'Result Summary'} — {summary.groupName}</h2><div className="bgm-preview"><span>Total <b>{summary.total}</b></span><span className="amber">Existing · Skipped <b>{summary.skipped}</b></span><span className="green">Successfully Added <b>{summary.added}</b></span><span>Failed / Unable <b>{summary.failed}</b></span></div><div className="bgm-table-wrap"><table><thead><tr><th>Number</th><th>Status</th><th>Details</th></tr></thead><tbody>{summary.results.map(row => <tr key={row.number}><td>+{row.number}</td><td>{row.status}</td><td>{row.message}</td></tr>)}</tbody></table></div></section>}
    <section className="bgm-card bgm-activity"><h2>Activity Log</h2><p>Recent actions in this page session.</p><div className="bgm-table-wrap"><table><thead><tr><th>Date &amp; Time</th><th>Group</th><th>Total</th><th>Skipped</th><th>Added</th><th>Failed</th></tr></thead><tbody>{activity.map((entry, index) => <tr key={index}><td>{entry.time}</td><td>{entry.summary.groupName}</td><td>{entry.summary.total}</td><td>{entry.summary.skipped}</td><td>{entry.summary.added}</td><td>{entry.summary.failed}</td></tr>)}</tbody></table></div>{!activity.length && <p className="bgm-empty">No member-add actions yet.</p>}</section>
  </div>;
}
