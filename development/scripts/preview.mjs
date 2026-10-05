import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PREVIEW_PORT || 4319);
const files = new Map([['/', ['index.html', 'text/html']], ['/demo.js', ['demo.js', 'text/javascript']], ['/demo.js.map', ['demo.js.map', 'application/json']]]);
const server = createServer(async (req, res) => {
  const file = files.get((req.url || '').split('?')[0]);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try { const body = await readFile(`dist/preview/${file[0]}`); res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(body); }
  catch { res.writeHead(503); res.end('Run npm run build first'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Dashboard preview: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
