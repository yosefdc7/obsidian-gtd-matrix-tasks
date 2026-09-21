/**
 * HTTPS-to-Obsidian OAuth callback relay for GTD Matrix Tasks.
 *
 * Deploy as a Google Apps Script web app. It stores nothing and performs no
 * Calendar API calls. Google redirects here, then this page hands the
 * short-lived authorization response to Obsidian's registered protocol.
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const query = ["code", "state", "error"]
    .filter((key) => params[key])
    .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(params[key]))
    .join("&");
  const target = "obsidian://gtd-calendar-auth?" + query;
  const safeTarget = JSON.stringify(target);

  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><base target="_top">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font:16px system-ui;padding:32px;max-width:560px;margin:auto">' +
    '<h2>Return to Obsidian</h2>' +
    '<p>Authorization is complete. Open GTD Matrix Tasks to finish connecting this device.</p>' +
    '<p><a id="open" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:white;border-radius:8px;text-decoration:none">Open Obsidian</a></p>' +
    '<script>const u=' + safeTarget + ';document.getElementById("open").href=u;setTimeout(()=>location.href=u,250);</script>' +
    '</body></html>'
  ).setTitle("GTD Matrix Tasks OAuth Callback");
}
