import { useEffect, useRef, useState } from 'react';
import { ImageUp, RotateCcw, Save, Trash2 } from 'lucide-react';
import { brandingApi, healthApi } from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../hooks/useToast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { DEFAULT_APP_NAME, DEFAULT_LOGO, setBranding, useBranding } from '../hooks/useBranding';
import './Panel.css';
import './Branding.css';

const MAX_BYTES = 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/x-icon';

/** Admin page to replace the panel logo, name and version label shown in the sidebar and on the login page. */
export function Branding() {
  useDocumentTitle('Branding');
  const toast = useToast();
  const [autoVersion, setAutoVersion] = useState(`v${__APP_VERSION__}`);
  const saved = useBranding(autoVersion);
  const fileInput = useRef<HTMLInputElement>(null);

  const [appName, setAppName] = useState('');
  const [versionText, setVersionText] = useState('');
  const [showVersion, setShowVersion] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [helpText, setHelpText] = useState('Need help?');
  const [helpLinkText, setHelpLinkText] = useState('View Documentation');
  const [helpUrl, setHelpUrl] = useState('');
  // undefined = keep the saved logo, null = go back to the built-in logo, string = new upload (data URL).
  const [logo, setLogo] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    healthApi
      .check()
      .then(h => h?.version && setAutoVersion(`v${h.version}`))
      .catch(() => undefined);
    brandingApi
      .get()
      .then(b => {
        setAppName(b.appName);
        setVersionText(b.versionText);
        setShowVersion(b.showVersion);
        setShowHelp(b.showHelp);
        setHelpText(b.helpText);
        setHelpLinkText(b.helpLinkText);
        setHelpUrl(b.helpUrl);
        setLoaded(true);
      })
      .catch(e => toast.error('Branding', e instanceof Error ? e.message : 'Unable to load branding'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewLogo = logo === undefined ? saved.logo : logo === null ? DEFAULT_LOGO : logo;
  const previewName = appName.trim() || DEFAULT_APP_NAME;
  const previewVersion = showVersion ? versionText.trim() || autoVersion : '';
  const usingCustomLogo = logo === undefined ? !!saved.raw.logoUrl : logo !== null;
  const dirty =
    logo !== undefined ||
    appName.trim() !== saved.raw.appName ||
    versionText.trim() !== saved.raw.versionText ||
    showVersion !== saved.raw.showVersion ||
    showHelp !== saved.raw.showHelp ||
    helpText.trim() !== saved.raw.helpText ||
    helpLinkText.trim() !== saved.raw.helpLinkText ||
    helpUrl.trim() !== saved.raw.helpUrl;
  const helpUrlOk = !helpUrl.trim() || /^(https?:\/\/|mailto:|tel:)/i.test(helpUrl.trim());
  const helpError = !helpUrlOk
    ? 'The link must start with https://, http://, mailto: or tel:'
    : showHelp && !helpUrl.trim()
      ? 'Add the link address, or turn the help link off.'
      : '';
  const previewHelp = showHelp && helpUrl.trim() && helpUrlOk;

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('Logo', 'Choose a PNG, JPG, WEBP, GIF or ICO image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Logo', `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 1 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.onerror = () => toast.error('Logo', 'Could not read that file.');
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      const next = await brandingApi.update({
        appName: appName.trim(),
        versionText: versionText.trim(),
        showVersion,
        showHelp,
        helpText: helpText.trim(),
        helpLinkText: helpLinkText.trim(),
        helpUrl: helpUrl.trim(),
        ...(logo !== undefined ? { logo } : {}),
      });
      setBranding(next);
      setLogo(undefined);
      toast.success('Branding saved. The sidebar and login page now use it.');
    } catch (e) {
      toast.error('Branding', e instanceof Error ? e.message : 'Unable to save');
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    setAppName('');
    setVersionText('');
    setShowVersion(true);
    setShowHelp(false);
    setHelpText('Need help?');
    setHelpLinkText('View Documentation');
    setHelpUrl('');
    setLogo(null);
  };

  return (
    <div className="panel-page">
      <PageHeader title="Branding" subtitle="Upload your own logo and change the name and version shown in the panel" />
      <div className="branding-grid">
        <section className="panel-card">
          <h2>Logo</h2>
          <div
            className="branding-drop"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0]);
            }}
          >
            <img src={previewLogo} alt="Logo preview" />
            <div>
              <p>
                <strong>{usingCustomLogo ? 'Custom logo' : 'Built-in OpenWA logo'}</strong>
                {logo !== undefined && <span className="branding-unsaved"> · not saved yet</span>}
              </p>
              <p className="branding-hint">
                PNG, JPG, WEBP, GIF or ICO, up to 1 MB. A square image looks best. You can also drop a file here.
              </p>
              <div className="branding-actions">
                <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
                  <ImageUp size={16} />
                  Upload logo
                </button>
                {usingCustomLogo && (
                  <button type="button" className="btn btn-secondary" onClick={() => setLogo(null)}>
                    <Trash2 size={16} />
                    Use built-in logo
                  </button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={e => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <h2>Name and version</h2>
          <label className="branding-field">
            <span>App name</span>
            <input
              value={appName}
              maxLength={40}
              placeholder={DEFAULT_APP_NAME}
              onChange={e => setAppName(e.target.value)}
            />
            <small>Shown next to the logo and in the browser tab. Leave empty to use “{DEFAULT_APP_NAME}”.</small>
          </label>
          <label className="branding-check">
            <input type="checkbox" checked={showVersion} onChange={e => setShowVersion(e.target.checked)} />
            Show a version line under the logo
          </label>
          <label className="branding-field">
            <span>Version text</span>
            <input
              value={versionText}
              maxLength={60}
              disabled={!showVersion}
              placeholder={`Automatic (${autoVersion})`}
              onChange={e => setVersionText(e.target.value)}
            />
            <small>For example “v2.0 · My Company”. Leave empty to show the real version automatically.</small>
          </label>

          <h2>Login page help link</h2>
          <label className="branding-check">
            <input type="checkbox" checked={showHelp} onChange={e => setShowHelp(e.target.checked)} />
            Show a help link under the login button
          </label>
          <p className="branding-hint">
            Off by default. Turn it on to point users to your own guide, support page, WhatsApp or email.
          </p>
          <div className="branding-two">
            <label className="branding-field">
              <span>Text before the link</span>
              <input
                value={helpText}
                maxLength={80}
                disabled={!showHelp}
                placeholder="Need help?"
                onChange={e => setHelpText(e.target.value)}
              />
            </label>
            <label className="branding-field">
              <span>Link text</span>
              <input
                value={helpLinkText}
                maxLength={80}
                disabled={!showHelp}
                placeholder="Contact support"
                onChange={e => setHelpLinkText(e.target.value)}
              />
            </label>
          </div>
          <label className="branding-field">
            <span>Link address</span>
            <input
              value={helpUrl}
              maxLength={500}
              disabled={!showHelp}
              placeholder="https://example.com/help  or  mailto:support@example.com"
              onChange={e => setHelpUrl(e.target.value)}
            />
            {helpError && showHelp ? (
              <small className="branding-error">{helpError}</small>
            ) : (
              <small>Opens in a new tab.</small>
            )}
          </label>

          <div className="branding-actions branding-footer">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!loaded || saving || !dirty || (showHelp && !!helpError)}
              onClick={save}
            >
              <Save size={16} />
              {saving ? 'Saving…' : 'Save branding'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={resetAll}>
              <RotateCcw size={16} />
              Reset to default
            </button>
          </div>
        </section>

        <section className="panel-card">
          <h2>Preview</h2>
          <p className="branding-hint">Sidebar</p>
          <div className="branding-preview-sidebar">
            <img src={previewLogo} alt="" />
            <div>
              <strong>{previewName}</strong>
              {previewVersion && <small>{previewVersion}</small>}
            </div>
          </div>
          <p className="branding-hint">Login page</p>
          <div className="branding-preview-login">
            <img src={previewLogo} alt="" />
            {previewVersion && <small>{previewVersion}</small>}
            <span className="branding-preview-form" aria-hidden="true" />
            <span className="branding-preview-btn">Login</span>
            {previewHelp ? (
              <p className="branding-preview-help">
                {helpText.trim()}{' '}
                <a href={helpUrl.trim()} target="_blank" rel="noopener noreferrer">
                  {helpLinkText.trim() || helpUrl.trim()}
                </a>
              </p>
            ) : (
              <p className="branding-hint">No help link</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
