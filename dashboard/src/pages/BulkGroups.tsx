import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Pause, Play, Plus, Trash2, UsersRound } from 'lucide-react';
import { useCurrentEngineQuery, useSessionsQuery } from '../hooks/queries';
import { sessionApi } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../hooks/useToast';
import { createGroupWithAdmins, GroupAdminSetupError } from '../utils/groupAdminSetup';
import { BulkGroupRunControl } from '../utils/bulkGroupRunControl';
import './BulkGroups.css';

type Job = { name: string; status: 'pending' | 'creating' | 'promoting' | 'created' | 'admin_failed' | 'failed' | 'stopped'; groupCreated?: boolean; message?: string };
const phoneNumber = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length >= 7 && digits.length <= 15 ? digits : ''; };

function estimatedDuration(count: number, delay: number, batchSize: number, batchRest: number, allMembersAdmin: boolean): string {
  const groups = Math.max(0, count);
  const gaps = Math.max(0, groups - 1);
  const batchBreaks = Math.floor(gaps / Math.max(1, batchSize));
  const normalGaps = gaps - batchBreaks;
  // A healthy WhatsApp create normally needs only a few seconds. Delays apply BETWEEN groups,
  // never after the final group.
  const seconds = groups * (allMembersAdmin ? 15 : 5) + normalGaps * Math.max(0, delay) + batchBreaks * Math.max(0, batchRest);
  if (seconds < 60) return `~ ${Math.max(5, seconds)} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `~ ${minutes}m ${remainder}s` : `~ ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function BulkGroups() {
  useDocumentTitle('Bulk Group Creator');
  const toast = useToast();
  const { data: sessions = [] } = useSessionsQuery();
  const { data: currentEngine } = useCurrentEngineQuery();
  // A loaded engine may be reconnecting with a closed socket; only READY can create groups.
  const connected = sessions.filter(session => session.status === 'ready' && session.engineLoaded !== false);
  const [sessionId, setSessionId] = useState('');
  const [baseName, setBaseName] = useState('Demo');
  const [start, setStart] = useState(1);
  const [count, setCount] = useState(10);
  const [phone, setPhone] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [paste, setPaste] = useState('');
  const [tab, setTab] = useState<'manual' | 'paste'>('manual');
  const [batchSize, setBatchSize] = useState(5);
  const [delay, setDelay] = useState(10);
  const [batchRest, setBatchRest] = useState(120);
  const [requestTimeout, setRequestTimeout] = useState(75);
  const [allMembersAdmin, setAllMembersAdmin] = useState(false);
  const timingRef = useRef({ batchSize, delay, batchRest, requestTimeout });
  timingRef.current = { batchSize, delay, batchRest, requestTimeout };
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const runRef = useRef<BulkGroupRunControl | null>(null);
  const runSettingsRef = useRef<{ sessionId: string; members: string[]; allMembersAdmin: boolean } | null>(null);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  useEffect(() => () => { runRef.current?.stop(); runRef.current = null; }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const names = useMemo(() => Array.from({ length: Math.max(0, count) }, (_, index) => `${baseName.trim()} ${start + index}`), [baseName, start, count]);
  const selectedSession = connected.find(session => session.id === sessionId);
  const engineSupported = currentEngine?.engineType === 'baileys';
  const settingsValid = Boolean(engineSupported && sessionId && baseName.trim() && Number.isInteger(start) && start > 0 && Number.isInteger(count) && count > 0 && count <= 100 && members.length > 0 && members.length <= 256 && names.every(name => name.length <= 100) && Number.isInteger(batchSize) && batchSize > 0 && Number.isFinite(delay) && delay >= 0 && Number.isFinite(batchRest) && batchRest >= 0 && Number.isFinite(requestTimeout) && requestTimeout >= 30 && requestTimeout <= 180);
  const valid = Boolean(settingsValid && selectedSession);
  const estimate = estimatedDuration(count, delay, batchSize, batchRest, allMembersAdmin);

  const addNumbers = (raw: string) => {
    const parsed = raw.split(/[\s,;]+/).map(phoneNumber).filter(Boolean);
    setMembers(current => [...new Set([...current, ...parsed])]);
  };
  const addOne = () => { const value = phoneNumber(phone); if (!value) return toast.error('Invalid number', 'Use 7 to 15 digits including country code.'); addNumbers(value); setPhone(''); };
  const updateJob = (index: number, patch: Partial<Job>) => setJobs(current => current.map((job, i) => i === index ? { ...job, ...patch } : job));
  const validate = () => { if (!settingsValid) return toast.error('Validation failed', 'Select a connected session, add 1 to 256 members, keep group names within 100 characters and check the settings.'); setJobs(names.map(name => ({ name, status: 'pending' }))); toast.success('Ready', `${count} groups are ready to create.`); };

  const retryable = (job: Job) => !job.groupCreated && (job.status === 'failed' || job.status === 'stopped');
  const retryCount = jobs.filter(retryable).length;
  const hasRemainingRun = retryCount > 0 && runSettingsRef.current !== null;
  const retrySessionReady = connected.some(session => session.id === runSettingsRef.current?.sessionId);
  const create = async (retry = false) => {
    if (runRef.current || (retry ? !retryConfirmed || !retryCount || !retrySessionReady || !engineSupported : !valid)) return;
    const settings = retry ? runSettingsRef.current : { sessionId, members: [...members], allMembersAdmin };
    if (!settings) return;
    runSettingsRef.current = settings;
    const { sessionId: runSessionId, members: runMembers, allMembersAdmin: runAllMembersAdmin } = settings;
    const run = new BulkGroupRunControl();
    runRef.current = run;
    const initial: Job[] = retry ? jobs.map(job => retryable(job) ? { name: job.name, status: 'pending' } : { ...job }) : names.map(name => ({ name, status: 'pending' }));
    const indexes = initial.flatMap((job, index) => job.status === 'pending' ? [index] : []);
    setRetryConfirmed(false);
    setJobs(initial); setRunning(true); setPaused(false); setStopped(false);
    let failed = false;
    let failureMessage = '';
    const timeoutMs = () => Math.max(30, timingRef.current.requestTimeout) * 1000;
    const api = {
      createGroup: (id: string, name: string, participants: string[]) => run.request(signal => sessionApi.createGroup(id, name, participants, signal), timeoutMs),
      getGroupInfo: (id: string, groupId: string) => run.request(signal => sessionApi.getGroupInfo(id, groupId, signal), timeoutMs),
      promoteGroupParticipants: (id: string, groupId: string, participants: string[]) => run.request(signal => sessionApi.promoteGroupParticipants(id, groupId, participants, signal), timeoutMs),
    };
    try {
      for (let position = 0; position < indexes.length && !run.stopped; position++) {
        const index = indexes[position];
        await run.wait();
        updateJob(index, { status: 'creating' });
        try {
          const result = await createGroupWithAdmins(api, {
            sessionId: runSessionId, name: initial[index].name, members: runMembers, allMembersAdmin: runAllMembersAdmin, signal: run.signal,
          }, group => { initial[index].groupCreated = true; updateJob(index, { status: 'promoting', groupCreated: true, message: `Group created (${group.id}). Preparing admin setup...` }); });
          updateJob(index, { status: 'created', groupCreated: true, message: runAllMembersAdmin ? `All ${result.adminCount} group members are admins.` : undefined });
        } catch (error) {
          if (runRef.current !== run) return;
          const adminFailure = error instanceof GroupAdminSetupError;
          const rawError = error instanceof Error ? error.message : 'Creation failed';
          const errorDetail = /\b429\b/.test(rawError)
            ? 'WhatsApp rejected the request with code 429 (rate limit). No automatic retry was made.'
            : rawError;
          const message = adminFailure ? error.message : run.stopped
            ? 'Stopped. A request already sent to WhatsApp may still finish; check before recreating this group.'
            : `${errorDetail} Check WhatsApp before retrying; the group may still have been created.`;
          updateJob(index, { status: run.stopped ? 'stopped' : adminFailure ? 'admin_failed' : 'failed', groupCreated: initial[index].groupCreated || adminFailure, message });
          failed = !run.stopped;
          if (failed) failureMessage = `${initial[index].name}: ${message}`;
          // Never replay a group creation after an uncertain response.
          run.stop();
        }
        if (position < indexes.length - 1 && !run.stopped) {
          await run.wait(() => {
            const timing = timingRef.current;
            return (position + 1) % Math.max(1, timing.batchSize) === 0 ? timing.batchRest * 1000 : timing.delay * 1000;
          });
        }
      }
    } catch (error) {
      if (!run.stopped) { failed = true; failureMessage = error instanceof Error ? error.message : 'Bulk run failed'; run.stop(); }
    } finally {
      if (runRef.current === run) {
        runRef.current = null;
        setRunning(false); setPaused(false);
        if (run.stopped) setJobs(current => current.map(job => job.status === 'pending' ? { ...job, status: 'stopped', message: 'Not started. Run stopped.' } : job));
        if (failed) toast.error('Bulk run failed', failureMessage || 'Check the progress details. Existing groups will not be recreated automatically.');
        else if (run.stopped) toast.success('Bulk run stopped', 'No further group requests will be started.');
        else toast.success('Bulk run finished', 'Requested groups have been processed.');
      }
    }
  };
  const totals = jobs.reduce((a, j) => ({ ...a, [j.status]: a[j.status] + 1 }), { pending: 0, creating: 0, promoting: 0, created: 0, admin_failed: 0, failed: 0, stopped: 0 });
  const createdCount = jobs.filter(job => job.groupCreated).length;
  const progress = jobs.length ? Math.round(((totals.created + totals.failed + totals.admin_failed) / jobs.length) * 100) : 0;

  return <div className="bulk-groups-page">
    <header className="bgc-header"><span><UsersRound /></span><div><h1>Bulk Group Creator</h1><p>Create multiple WhatsApp groups and add the same members to all groups.</p></div></header>
    {!running && retryCount > 0 && runSettingsRef.current && <section className="bgc-card">
      <h2>Retry failed / stopped groups</h2>
      <p>Retry {retryCount} groups with their original names, session, members and admin option. Already created groups are skipped. Current timing settings apply. A WhatsApp 429 rejection may still happen.</p>
      <label><input type="checkbox" checked={retryConfirmed} onChange={event => setRetryConfirmed(event.target.checked)}/> I checked WhatsApp: the failed / stopped groups were not created.</label>
      <button disabled={!retryConfirmed || !retrySessionReady || !engineSupported} onClick={() => void create(true)}>Retry {retryCount} Groups (Same Names)</button>
    </section>}
    <div className="bgc-grid">
      <section className="bgc-card"><Title n="1" title="Session & Group Settings" text="Select session and set group name pattern." />
        <fieldset className="bgc-run-fields" disabled={running}><Label text="Connected Session *"><select value={sessionId} onChange={e => setSessionId(e.target.value)}><option value="">Select connected session</option>{connected.map(s => <option key={s.id} value={s.id}>{s.name} (Connected)</option>)}</select></Label>
        <Label text="Base Group Name *"><input value={baseName} onChange={e => setBaseName(e.target.value)} /></Label>
        <div className="bgc-row"><Label text="Starting Number"><input type="number" min="1" value={start} onChange={e => setStart(Number(e.target.value))} /></Label><Label text="Number of Groups"><input type="number" min="1" max="100" value={count} onChange={e => setCount(Math.min(100, Number(e.target.value)))} /></Label></div>
        <div className="bgc-preview"><b>Group Names Preview (First 10)</b><div>{names.slice(0,10).map(n => <span key={n}>{n}</span>)}</div></div></fieldset>
      </section>
      <section className="bgc-card"><Title n="2" title="Group Members" text="Add members that will be added to every group." extra={`Total: ${members.length}`} />
        <fieldset className="bgc-run-fields" disabled={running}><div className="bgc-tabs"><button className={tab==='manual'?'active':''} onClick={() => setTab('manual')}>Add Manually</button><button className={tab==='paste'?'active':''} onClick={() => setTab('paste')}>Paste Numbers</button><button onClick={() => fileRef.current?.click()}><FileUp size={14}/> CSV</button><input hidden ref={fileRef} type="file" accept=".csv,.txt" onChange={async e => { const f=e.target.files?.[0]; if(f) addNumbers(await f.text()); }} /></div>
        {tab==='manual'?<div className="bgc-add"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Country code + WhatsApp number" /><button onClick={addOne}><Plus size={16}/> Add</button></div>:<div className="bgc-paste"><textarea value={paste} onChange={e=>setPaste(e.target.value)} placeholder="Paste comma or line separated numbers"/><button onClick={()=>{addNumbers(paste);setPaste('');}}>Add Numbers</button></div>}
        <div className="bgc-members">{members.length?members.map((m,i)=><div key={m}><span>{i+1}</span><code>+{m}</code><button onClick={()=>setMembers(x=>x.filter(v=>v!==m))}><Trash2 size={14}/></button></div>):<p>No members added yet.</p>}</div>
        <footer><span><CheckCircle2 size={15}/> Valid Numbers: {members.length}</span><button onClick={()=>setMembers([])}><Trash2 size={14}/> Clear All</button></footer></fieldset>
      </section>
      <section className="bgc-card"><Title n="3" title="Batch & Advanced Settings" text="Configure speed, delays and safety." />
        <div className="bgc-row"><Label text="Groups per Batch"><input disabled={running&&!paused} type="number" min="1" value={batchSize} onChange={e=>setBatchSize(Math.max(1, Number(e.target.value) || 1))}/></Label><Label text="Interval (seconds)"><input disabled={running&&!paused} type="number" min="0" value={delay} onChange={e=>setDelay(Math.max(0, Number(e.target.value) || 0))}/></Label></div>
        <div className="bgc-row"><Label text="Batch Rest (seconds)"><input disabled={running&&!paused} type="number" min="0" value={batchRest} onChange={e=>setBatchRest(Math.max(0, Number(e.target.value) || 0))}/></Label><Label text="Request Timeout (seconds)"><input disabled={running&&!paused} type="number" min="30" max="180" value={requestTimeout} onChange={e=>setRequestTimeout(Math.min(180, Math.max(30, Number(e.target.value) || 30)))}/></Label></div>
        <p className="bgc-timing-help">{paused ? "Edit timing settings, then Resume. Elapsed rest time counts toward the new delay; completed groups will not be recreated." : "Pause a running job to change batch size, interval, rest or request timeout. Group names, members and admin option stay fixed for this run."}</p><div className="bgc-admin-option"><label><input type="checkbox" checked={allMembersAdmin} disabled={running} onChange={e=>setAllMembersAdmin(e.target.checked)}/> Make all group members admins</label><p>After each group is created, automatically promote every member who joined. The group creator is already an admin.</p></div>
        <div className="bgc-options"><h3>Safety</h3><label><input type="checkbox" checked readOnly/> Stop on Error</label><label><input type="checkbox" checked readOnly/> No Automatic Retry</label><label><input type="checkbox" checked readOnly/> Timeout Protection</label><label><input type="checkbox" checked readOnly/> Safe Intervals</label></div>
        <div className={`bgc-warning ${engineSupported ? '' : 'unsupported'}`}><AlertTriangle size={18}/><span>{engineSupported ? 'Use safe delays to reduce WhatsApp limits.' : `Bulk group creation is unavailable on ${currentEngine?.engineType || 'the active engine'}. Switch the Infrastructure engine to Baileys and restart OpenWA.`}</span></div>
      </section>
    </div>
    <section className="bgc-card bgc-summary"><Title n="4" title="Summary & Start" text="Review details before starting group creation." /><div className="bgc-summary-grid"><div className="bgc-summary-list"><p><span>Session</span><b>{selectedSession?.name||'Not selected'}</b></p><p><span>Total Groups</span><b>{count}</b></p><p><span>Members per Group</span><b>{members.length}</b></p><p><span>Group Admins</span><b>{allMembersAdmin ? "All members" : "Creator only"}</b></p><p><span>Group Range</span><b>{names[0]||'—'} → {names.at(-1)||'—'}</b></p></div><div className="bgc-estimate"><span>Estimated Time</span><b>{estimate}</b></div><div className="bgc-actions"><button className="primary" disabled={running || (hasRemainingRun ? !retryConfirmed || !retrySessionReady || !engineSupported : !valid)} onClick={()=>void create(hasRemainingRun)}>{running?<Loader2 className="animate-spin"/>:<Play/>} {engineSupported ? hasRemainingRun ? `Continue ${retryCount} Remaining Groups` : `Create ${count} Groups` : 'Baileys Engine Required'}</button><button disabled={running||hasRemainingRun||!engineSupported} onClick={validate}>Validate Only (Dry Run)</button></div></div></section>
    {jobs.length>0&&<section className="bgc-card bgc-progress"><div className="bgc-progress-head"><div><h2>Creation Progress</h2><p>Live status of group creation and member addition.</p></div><div><button disabled={!running||stopped} onClick={()=>{const run=runRef.current;if(!run||run.stopped)return;if(run.paused)run.resume();else run.pause();setPaused(run.paused);}}>{paused?<Play/>:<Pause/>}{paused?'Resume':'Pause'}</button><button disabled={!running||stopped} className="danger" onClick={()=>{runRef.current?.stop();setStopped(true);setPaused(false);}}>Stop</button></div></div><p className="bgc-run-status" role="status">{stopped ? "Stopped. No further requests will start. A request already sent to WhatsApp may still finish." : paused ? "Paused. The current request may finish; no next request starts until Resume. Resume applies your updated timing settings to the remaining rest." : running ? "Running" : totals.failed + totals.admin_failed > 0 ? "Run failed. Check the progress details before retrying." : totals.stopped ? "Run stopped. Remaining groups were not started." : "Run finished"}</p><div className="bgc-bar"><span style={{width:`${progress}%`}}/></div><div className="bgc-counts"><span>Created <b>{createdCount}</b></span><span>Processing <b>{totals.creating + totals.promoting}</b></span><span>Pending <b>{totals.pending}</b></span><span>Failed <b>{totals.failed + totals.admin_failed}</b></span><span>Stopped <b>{totals.stopped}</b></span></div><div className="bgc-jobs"><div><b>#</b><b>Group Name</b><b>Status</b><b>Message</b></div>{jobs.map((j,i)=><div key={`${j.name}-${i}`}><span>{i+1}</span><b>{j.name}</b><span className={j.status}>{j.status === "admin_failed" ? "Admin setup failed" : j.status}</span><small title={j.message}>{j.message||'—'}</small></div>)}</div></section>}
  </div>;
}

function Title({n,title,text,extra}:{n:string;title:string;text:string;extra?:string}){return <div className="bgc-title"><span>{n}</span><div><h2>{title}</h2><p>{text}</p></div>{extra&&<em>{extra}</em>}</div>}
function Label({text,children}:{text:string;children:React.ReactNode}){return <label className="bgc-label"><span>{text}</span>{children}</label>}
