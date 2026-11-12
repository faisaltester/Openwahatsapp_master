/**
 * Follow the dashboard theme (openwa_theme: light | dark | system), including live sidebar toggles.
 * Loaded as a classic, synchronous <head> script so the theme applies before first paint. It must be
 * a file rather than an inline <script>: the server's CSP (script-src 'self' + nonce) blocks inline code.
 */
(function () {
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function apply() {
    var t = null;
    try { t = localStorage.getItem('openwa_theme'); } catch (e) {}
    document.documentElement.setAttribute('data-theme', t === 'dark' || (t !== 'light' && mq.matches) ? 'dark' : 'light');
  }
  apply();
  window.addEventListener('storage', function (e) { if (e.key === 'openwa_theme' || e.key === null) apply(); });
  if (mq.addEventListener) mq.addEventListener('change', apply);
})();
