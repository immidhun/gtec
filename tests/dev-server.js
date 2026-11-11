/* Local test server: serves web/ and answers the Centre Manager API with the real server/Code.gs
   running on in-memory sheets. Usage: node tests/dev-server.js [port]   then open http://localhost:8787/?mode=office */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { create, addAttendance } = require('./mock-gas');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function start(port, opts) {
  const gas = create(opts || {});
  gas.run('setup()');
  const web = path.join(__dirname, '..', 'web');
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(gas.call(JSON.parse(body || '{}')))); });
      return;
    }
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (file === '/') file = '/index.html';
    if (file === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end("window.GTEC_CONFIG = { apiUrl: '', displayKey: '', mgmtUrl: '/api' };"); }
    const full = path.join(web, path.normalize(file));
    if (!full.startsWith(web) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });
  return new Promise(resolve => server.listen(port, () => resolve({ gas, server, addAttendance })));
}
module.exports = { start };
if (require.main === module) start(Number(process.argv[2]) || 8787).then(s => {
  console.log('http://localhost:' + (process.argv[2] || 8787) + '/?mode=office   sign in as Director, PIN ' + s.gas.data().getSheetByName('STAFF').data[1][2]);
});
