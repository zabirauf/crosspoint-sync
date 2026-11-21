// TEST ADAPTER — not the Protected Content plugin. It registers the same
// job-queue contract (`fulfill` with args.path, returning {title, dest, bytes})
// so the app → firmware job queue → /plugins-run path can run in the firmware
// simulator without an Adobe account. Instead of ADEPT fulfilment it copies
// book.epub from this plugin's folder beside the .acsm, then deletes the .acsm,
// as the real plugin does on success.
CrossPoint.registerPlugin(async (container, api) => {
  const ACTIVATED = true;
  api.registerAction('fulfill', async (args) => {
    const path = String((args && args.path) || '');
    if (!path.startsWith('/')) throw new Error('args.path must be an absolute .acsm path');
    if (!ACTIVATED) throw new Error('device not activated; open the plugin UI once to sign in');
    const acsmResponse = await fetch('/download?path=' + encodeURIComponent(path));
    if (!acsmResponse.ok) throw new Error('could not read ' + path + ' (HTTP ' + acsmResponse.status + ')');
    const acsm = await acsmResponse.text();
    if (!/<fulfillmentToken[\s>]/.test(acsm)) throw new Error('not an .acsm');
    const title = ((acsm.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/) || [])[1] || 'Protected Book').trim();
    const folder = path.slice(0, path.lastIndexOf('/')) || '/';
    const dest = (folder === '/' ? '' : folder) + '/' + title + '.epub';
    const book = new Uint8Array(await (await fetch(api.pluginFile('book.epub'))).arrayBuffer());
    let binary = '';
    for (let i = 0; i < book.length; i += 0x8000) binary += String.fromCharCode.apply(null, book.subarray(i, i + 0x8000));
    await api.writeFile(dest, btoa(binary));
    // URL-encoded: the simulator's web-server shim does not parse multipart fields.
    const deleted = await fetch('/delete', { method: 'POST', body: new URLSearchParams({ paths: JSON.stringify([path]) }) });
    if (!deleted.ok) throw new Error('could not delete ' + path);
    return { title, dest, bytes: book.length };
  });
});
