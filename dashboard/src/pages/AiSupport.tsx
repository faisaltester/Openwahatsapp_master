import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Bot, BookOpen, Check, ChevronDown, CircleAlert, Clock3, Loader2, MessageCircle, Plus, Save, Search, ShieldCheck, Sparkles, Trash2, UsersRound, X, Headset } from 'lucide-react';
import { aiSupportApi, sessionApi, type AiKnowledgeArticle, type AiKnowledgePayload, type AiSupportCase, type AiSupportGroupSetting, type AiSupportLog, type AiSupportStatus, type Session } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../hooks/useToast';
import './AiSupport.css';

type Group = { id: string; name: string };
type Section = 'groups' | 'knowledge' | 'activity' | 'human';
const blankArticle = (): AiKnowledgePayload => ({ title: '', category: 'General', question: '', answer: '', keywords: [], language: 'en', approved: false, active: true });

export function AiSupport() {
  const navigate = useNavigate();
  useDocumentTitle('WhatsApp Support');
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [settings, setSettings] = useState<AiSupportGroupSetting[]>([]);
  const [articles, setArticles] = useState<AiKnowledgeArticle[]>([]);
  const [logs, setLogs] = useState<AiSupportLog[]>([]);
  const [humanCases, setHumanCases] = useState<AiSupportCase[]>([]);
  const [closedCases, setClosedCases] = useState<AiSupportCase[]>([]);
  const [aiStatus, setAiStatus] = useState<AiSupportStatus | null>(null);
  const [section, setSection] = useState<Section>('groups');
  const [loading, setLoading] = useState(true);
  const [savingGroup, setSavingGroup] = useState('');
  const [savingAll, setSavingAll] = useState(false);
  const [savingArticle, setSavingArticle] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [articleForm, setArticleForm] = useState<AiKnowledgePayload>(blankArticle);
  const [search, setSearch] = useState('');

  useEffect(() => {
    sessionApi.list().then(items => {
      setSessions(items);
      const ready = items.find(item => item.status === 'ready') ?? items[0];
      if (ready) setSessionId(ready.id);
    }).catch(error => toast.error(error instanceof Error ? error.message : 'Could not load WhatsApp sessions'))
      .finally(() => setLoading(false));
  }, [toast.error]);

  const reload = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        sessionApi.getGroups(id), aiSupportApi.groups(id), aiSupportApi.articles(id), aiSupportApi.conversations(id), aiSupportApi.status(id), aiSupportApi.cases(id),
      ]);
      const [liveGroups, savedGroups, savedArticles, recentLogs, status, supportCases] = results;
      if (liveGroups.status === 'fulfilled') setGroups(liveGroups.value.map(group => ({ id: group.id, name: group.name?.trim() || '' })));
      else setGroups([]);
      if (savedGroups.status === 'fulfilled') setSettings(savedGroups.value);
      else setSettings([]);
      if (savedArticles.status === 'fulfilled') setArticles(savedArticles.value);
      else setArticles([]);
      if (recentLogs.status === 'fulfilled') setLogs(recentLogs.value);
      else setLogs([]);
      if (status.status === 'fulfilled') setAiStatus(status.value);
      else setAiStatus(null);
      if (supportCases.status === 'fulfilled') {
        setHumanCases(supportCases.value.filter(item => item.status === 'human'));
        setClosedCases(supportCases.value.filter(item => item.status === 'closed'));
      } else { setHumanCases([]); setClosedCases([]); }
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') toast.error(failed.reason instanceof Error ? failed.reason.message : 'Could not load all AI support data');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load AI support data');
      setGroups([]); setSettings([]); setArticles([]); setLogs([]); setHumanCases([]); setClosedCases([]); setAiStatus(null);
    } finally { setLoading(false); }
  }, [toast.error]);

  useEffect(() => { void reload(sessionId); }, [reload, sessionId]);

  // Keep the shared handoff badge/queue current while support agents leave this page open.
  useEffect(() => {
    if (!sessionId) return;
    const refreshQueue = () => {
      void aiSupportApi.cases(sessionId).then(items => {
        setHumanCases(items.filter(item => item.status === 'human'));
        setClosedCases(items.filter(item => item.status === 'closed'));
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refreshQueue, 8000);
    return () => window.clearInterval(timer);
  }, [sessionId]);

  const enabledCount = settings.filter(group => group.enabled).length;
  const approvedCount = articles.filter(article => article.approved && article.active).length;
  const filteredArticles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return articles.filter(article => !query || `${article.title} ${article.question} ${article.keywords.join(' ')}`.toLowerCase().includes(query));
  }, [articles, search]);

  const saveGroup = async (group: Group, enabled: boolean) => {
    if (!/^[\d-]+@g\.us$/.test(group.id) || !group.name.trim()) {
      toast.error('This WhatsApp group is missing its chat ID or group name. Refresh the group list and try again.');
      return;
    }
    setSavingGroup(group.id);
    const existing = settings.find(setting => setting.chatId === group.id);
    try {
      const saved = await aiSupportApi.saveGroup(sessionId, {
        chatId: group.id, groupName: group.name.trim(), enabled,
        trigger: '*', cooldownSeconds: existing?.cooldownSeconds ?? 60,
      });
      setSettings(current => [...current.filter(item => item.chatId !== group.id), saved]);
      toast.success(enabled ? 'Support flow enabled for this group' : 'Support flow paused for this group');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update this group'); }
    finally { setSavingGroup(''); }
  };

  const enableAllGroups = async () => {
    if (!groups.length || !window.confirm(`Enable the support workflow in all ${groups.length} groups?`)) return;
    const invalidGroupCount = groups.filter(group => !/^[\d-]+@g\.us$/.test(group.id) || !group.name.trim()).length;
    if (invalidGroupCount) {
      toast.error(`${invalidGroupCount} group${invalidGroupCount === 1 ? ' is' : 's are'} missing a valid WhatsApp group ID or name. Refresh the group list before enabling all.`);
      return;
    }
    setSavingAll(true);
    try {
      setSettings(await aiSupportApi.enableAllGroups(sessionId, groups.map(group => ({ chatId: group.id, groupName: group.name.trim() }))));
      toast.success(`Support workflow enabled in ${groups.length} groups`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not enable support for all groups'); }
    finally { setSavingAll(false); }
  };

  const openCreate = () => { setEditingId(''); setArticleForm(blankArticle()); setEditorOpen(true); };
  const openEdit = (article: AiKnowledgeArticle) => {
    setEditingId(article.id);
    setArticleForm({ title: article.title, category: article.category || 'General', question: article.question, answer: article.answer, keywords: article.keywords, language: article.language, approved: article.approved, active: article.active });
    setEditorOpen(true);
  };
  const saveArticle = async () => {
    setSavingArticle(true);
    try {
      if (editingId) await aiSupportApi.updateArticle(sessionId, editingId, articleForm);
      else await aiSupportApi.createArticle(sessionId, articleForm);
      await reload(sessionId);
      setEditorOpen(false);
      toast.success(editingId ? 'Knowledge article updated' : 'Knowledge article added');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save article'); }
    finally { setSavingArticle(false); }
  };
  const deleteArticle = async (article: AiKnowledgeArticle) => {
    if (!window.confirm(`Delete “${article.title}”?`)) return;
    try { await aiSupportApi.deleteArticle(sessionId, article.id); await reload(sessionId); toast.success('Knowledge article deleted'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete article'); }
  };

  const settingFor = (groupId: string) => settings.find(setting => setting.chatId === groupId);
  const closeHumanCase = async (item: AiSupportCase) => {
    try {
      const closed = await aiSupportApi.closeHumanCase(sessionId, item.id);
      setHumanCases(current => current.filter(row => row.id !== item.id));
      setClosedCases(current => [closed, ...current.filter(row => row.id !== closed.id)].slice(0, 30));
      toast.success('Support request closed. WhatsApp history is kept.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not close support request'); }
  };
  const claimHumanCase = async (item: AiSupportCase) => {
    try {
      const claimed = await aiSupportApi.claimHumanCase(sessionId, item.id);
      setHumanCases(current => current.map(row => row.id === claimed.id ? claimed : row));
      toast.success(`Request assigned to ${claimed.assignedTo || 'you'}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not assign support request'); }
  };

  return (
    <div className="ai-support-page">
      <PageHeader title="WhatsApp Support" subtitle="Predefined client answers and human handoff, powered by OpenWA." />

      <section className="ai-support-intro">
        <div className="ai-support-intro-icon"><Sparkles size={23} /></div>
        <div className="ai-support-intro-copy">
          <div className="ai-support-intro-title">WhatsApp support flow, ready for the groups you select</div>
          <p>OpenWA sends predefined answers and routes requests to your human support queue. No external AI provider is used.</p>
        </div>
        <div className={`ai-support-provider-pill ${aiStatus?.ready ? 'ready' : ''}`}><span className="ai-support-dot" />{aiStatus?.ready ? 'OpenWA replies ready · no AI key' : !aiStatus ? 'Checking support setup…' : 'Add and approve a support answer'}</div>
      </section>

      <div className="ai-support-stats">
        <div className="ai-support-stat"><span className="ai-support-stat-icon purple"><UsersRound size={18} /></span><div><strong>{enabledCount}</strong><span>Groups enabled</span></div></div>
        <div className="ai-support-stat"><span className="ai-support-stat-icon blue"><ShieldCheck size={18} /></span><div><strong>{approvedCount}</strong><span>Approved answers</span></div></div>
        <div className="ai-support-stat"><span className="ai-support-stat-icon green"><MessageCircle size={18} /></span><div><strong>{logs.length}</strong><span>Recent questions</span></div></div>
        <div className="ai-support-stat"><span className="ai-support-stat-icon amber"><BookOpen size={18} /></span><div><strong>{articles.length - approvedCount}</strong><span>Drafts to review</span></div></div>
      </div>

      <div className="ai-support-toolbar">
        <div className="ai-support-tabs" role="tablist" aria-label="AI support sections">
          <button className={section === 'groups' ? 'active' : ''} onClick={() => setSection('groups')}><UsersRound size={16} /> Groups</button>
          <button className={section === 'knowledge' ? 'active' : ''} onClick={() => setSection('knowledge')}><BookOpen size={16} /> Answers</button>
          <button className={section === 'activity' ? 'active' : ''} onClick={() => setSection('activity')}><Activity size={16} /> Activity</button>
          <button className={section === 'human' ? 'active' : ''} onClick={() => setSection('human')}><Headset size={16} /> Human support {humanCases.length > 0 && <b className="ai-support-tab-count">{humanCases.length}</b>}</button>
        </div>
        <label className="ai-support-session-select"><span>WhatsApp session</span><select value={sessionId} onChange={event => setSessionId(event.target.value)} disabled={!sessions.length}>
          {sessions.length === 0 && <option value="">No sessions available</option>}
          {sessions.map(session => <option key={session.id} value={session.id}>{session.name} · {session.status}</option>)}
        </select><ChevronDown size={15} /></label>
      </div>

      {loading ? <div className="ai-support-loading"><Loader2 className="ai-spin" size={24} /> Loading AI support…</div> : !sessionId ? (
        <div className="ai-support-empty"><Bot size={30} /><strong>Connect a WhatsApp session first</strong><span>Your groups will appear here after a session is added.</span></div>
      ) : section === 'groups' ? (
        <section className="ai-support-panel">
          <div className="ai-support-panel-heading"><div><h2>Choose which groups can use support flow</h2><p>Clients choose a category and question, get the approved answer, or request a person. Each group needs one active approved answer.</p></div><div className="ai-support-heading-actions"><span className="ai-support-count">{groups.length} groups</span><button className="ai-primary-btn" onClick={() => void enableAllGroups()} disabled={!groups.length || savingAll || !aiStatus?.ready} title={!aiStatus?.ready ? 'Approve at least one support answer first' : undefined}>{savingAll ? <Loader2 className="ai-spin" size={16} /> : <Sparkles size={16} />} Enable all groups</button></div></div>
          {groups.length ? <div className="ai-support-group-list">{groups.map(group => {
            const enabled = settingFor(group.id)?.enabled ?? false;
            return <div className="ai-support-group-row" key={group.id}>
              <div className="ai-support-group-avatar"><MessageCircle size={18} /></div>
              <div className="ai-support-group-details"><strong>{group.name || 'Group name unavailable'}</strong><span>{group.id || 'Group chat ID unavailable'}</span></div>
              <span className={`ai-support-trigger ${enabled ? 'on' : ''}`}>{enabled ? 'Support flow' : 'Paused'}</span>
              <button type="button" className={`ai-switch ${enabled ? 'checked' : ''}`} role="switch" aria-checked={enabled} aria-label={`${enabled ? 'Disable' : 'Enable'} support flow for ${group.name}`} disabled={savingGroup === group.id || (!enabled && !aiStatus?.ready)} title={!enabled && !aiStatus?.ready ? 'Approve at least one support answer first' : undefined} onClick={() => void saveGroup(group, !enabled)}>{savingGroup === group.id ? <Loader2 className="ai-spin" size={14} /> : <span />}</button>
            </div>;
          })}</div> : <div className="ai-support-empty"><UsersRound size={28} /><strong>No groups found for this session</strong><span>Try selecting a connected session or refresh the WhatsApp connection.</span></div>}
          <div className="ai-support-note"><CircleAlert size={17} /><span>Only admin-approved knowledge articles are used. If there is no reliable match, the bot says so instead of making up steps.</span></div>
        </section>
      ) : section === 'knowledge' ? (
        <section className="ai-support-panel">
          <div className="ai-support-panel-heading"><div><h2>Categories and predefined answers</h2><p>Each category appears in the WhatsApp menu. Add one answer per selectable client question.</p></div><button className="ai-primary-btn" onClick={openCreate}><Plus size={17} /> Add answer</button></div>
          <div className="ai-support-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search questions, answers, keywords…" /></div>
          {filteredArticles.length ? <div className="ai-article-list">{filteredArticles.map(article => <article className="ai-article-card" key={article.id}>
            <div className="ai-article-main"><div className="ai-article-title-line"><h3>{article.title}</h3><span className={`ai-status ${article.approved && article.active ? 'approved' : 'draft'}`}>{article.approved && article.active ? <><Check size={12} /> Approved</> : 'Draft'}</span></div><p className="ai-article-question">{article.question}</p><p className="ai-article-answer">{article.answer}</p><div className="ai-article-meta"><span>{article.category || 'General'}</span><span>{article.language.toUpperCase()}</span>{article.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div></div>
            <div className="ai-article-actions"><button onClick={() => openEdit(article)}>Edit</button><button className="danger" aria-label={`Delete ${article.title}`} onClick={() => void deleteArticle(article)}><Trash2 size={15} /></button></div>
          </article>)}</div> : <div className="ai-support-empty"><BookOpen size={28} /><strong>{articles.length ? 'No matching answers' : 'Your knowledge base is empty'}</strong><span>Add a verified Q&amp;A article to give the assistant approved material to use.</span></div>}
        </section>
      ) : section === 'activity' ? (
        <section className="ai-support-panel">
          <div className="ai-support-panel-heading"><div><h2>Recent support activity</h2><p>Client menu choices, delivered answers, and human handoffs.</p></div><span className="ai-support-count">Latest 100</span></div>
          {logs.length ? <div className="ai-log-list">{logs.map(log => <article key={log.id} className="ai-log-card"><div className="ai-log-top"><span className={`ai-status ${log.outcome === 'answered' ? 'approved' : log.outcome === 'no_match' ? 'draft' : log.outcome === 'human_requested' ? 'human' : 'error'}`}>{log.outcome.replace('_', ' ')}</span><span><Clock3 size={13} /> {new Date(log.createdAt).toLocaleString()}</span><code>{groups.find(group => group.id === log.chatId)?.name ?? log.chatId}</code></div><p><b>Client</b> {log.question}</p>{log.answer && <p><b>OpenWA</b> {log.answer}</p>}</article>)}</div> : <div className="ai-support-empty"><Activity size={28} /><strong>No support activity yet</strong><span>Client menu choices and support handoffs will appear here.</span></div>}
        </section>
      ) : (
        <section className="ai-support-panel">
          <div className="ai-support-panel-heading"><div><h2>Active human support</h2><p>Open the group in <b>Chats</b> and reply to the client there. Close a request after resolving it; WhatsApp history remains intact.</p></div><span className="ai-support-count">{humanCases.length} active</span></div>
          {humanCases.length ? <div className="ai-human-queue">{humanCases.map(item => <article className="ai-human-case" key={item.id}><div className="ai-human-case-icon"><Headset size={18} /></div><div className="ai-human-case-main"><div><strong>{item.groupName}</strong><span className="ai-status human">{item.assignedTo ? `Assigned: ${item.assignedTo}` : 'Unassigned'}</span></div><p>Client: {item.sender}</p><p>{item.lastQuestion || 'Client asked for human support.'}</p><small>Requested {new Date(item.updatedAt).toLocaleString()}</small></div><div className="ai-human-case-actions">{!item.assignedTo && <button className="ai-secondary-btn" onClick={() => void claimHumanCase(item)}>Assign to me</button>}<button className="ai-secondary-btn" onClick={() => navigate('/chats', { state: { supportSessionId: sessionId, supportChatId: item.chatId } })}>Open WhatsApp chat</button><button className="ai-primary-btn" onClick={() => void closeHumanCase(item)}>Mark closed</button></div></article>)}</div> : <div className="ai-support-empty"><Headset size={28} /><strong>No active human requests</strong><span>When a client replies 0 or human, their group will appear here.</span></div>}
          {closedCases.length > 0 && <div className="ai-closed-cases"><h3>Recently closed</h3>{closedCases.map(item => <article key={item.id}><div><strong>{item.groupName}</strong><span>Client: {item.sender}</span><p>{item.lastQuestion || 'Support request resolved.'}</p></div><span className="ai-status approved">Closed</span></article>)}</div>}
        </section>
      )}

      {editorOpen && <div className="ai-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditorOpen(false); }}><section className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-article-modal-title">
        <header><div><span className="ai-modal-kicker"><Sparkles size={14} /> KNOWLEDGE BASE</span><h2 id="ai-article-modal-title">{editingId ? 'Edit approved answer' : 'Add a support answer'}</h2></div><button className="ai-modal-close" onClick={() => setEditorOpen(false)} aria-label="Close"><X size={19} /></button></header>
        <div className="ai-modal-fields">
          <label>Title<input value={articleForm.title} onChange={event => setArticleForm({ ...articleForm, title: event.target.value })} placeholder="e.g. Create a membership card" maxLength={180} /></label>
          <label>Category<input value={articleForm.category} onChange={event => setArticleForm({ ...articleForm, category: event.target.value })} placeholder="e.g. Membership, Payments, Orders" maxLength={120} /></label>
          <label>Example client question<input value={articleForm.question} onChange={event => setArticleForm({ ...articleForm, question: event.target.value })} placeholder="How do I create a membership card?" /></label>
          <label>Approved steps<textarea rows={6} value={articleForm.answer} onChange={event => setArticleForm({ ...articleForm, answer: event.target.value })} placeholder="Write the verified support steps…" /></label>
          <div className="ai-modal-two-col"><label>Keywords<input value={articleForm.keywords.join(', ')} onChange={event => setArticleForm({ ...articleForm, keywords: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })} placeholder="card, membership, create" /></label><label>Language<select value={articleForm.language} onChange={event => setArticleForm({ ...articleForm, language: event.target.value })}><option value="en">English</option><option value="hi">Hindi</option><option value="hinglish">Hinglish</option></select></label></div>
          <label className="ai-approve-check"><input type="checkbox" checked={articleForm.approved} onChange={event => setArticleForm({ ...articleForm, approved: event.target.checked })} /><span><strong>Approve this answer</strong><small>Only approved and active articles can be used in group replies.</small></span></label>
        </div>
        <footer><button className="ai-secondary-btn" onClick={() => setEditorOpen(false)}>Cancel</button><button className="ai-primary-btn" onClick={() => void saveArticle()} disabled={savingArticle || !articleForm.title.trim() || !articleForm.question.trim() || !articleForm.answer.trim()}>{savingArticle ? <Loader2 className="ai-spin" size={16} /> : <Save size={16} />} Save article</button></footer>
      </section></div>}
    </div>
  );
}
