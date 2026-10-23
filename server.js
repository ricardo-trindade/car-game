// Servidor: serve o jogo e repassa a posição dos carros entre os 2 jogadores (WebSocket).
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8000;
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/2024_alfa_romeo_33_stradale_ice.glb': ['2024_alfa_romeo_33_stradale_ice.glb', 'model/gltf-binary'],
  '/free_lamborghini_revuelto.glb': ['free_lamborghini_revuelto.glb', 'model/gltf-binary'],
};

const server = http.createServer((req, res) => {
  const f = FILES[req.url.split('?')[0]];
  if (!f) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-cache' });
  fs.createReadStream(path.join(__dirname, f[0])).pipe(res);
});

const wss = new WebSocketServer({ server });
const slots = [null, null];
let winner = null;

const send = (ws, msg) => ws && ws.readyState === 1 && ws.send(JSON.stringify(msg));
const other = id => slots[1 - id];
const startRace = () => { winner = null; slots.forEach(s => send(s, { t: 'start' })); };

wss.on('connection', ws => {
  const id = slots.findIndex(s => !s);
  if (id < 0) { send(ws, { t: 'full' }); return ws.close(); }
  slots[id] = ws;
  send(ws, { t: 'welcome', id, peer: !!other(id) });
  console.log(`Jogador ${id + 1} entrou`);
  if (other(id)) { send(other(id), { t: 'peer', peer: true }); startRace(); }

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 's') send(other(id), { t: 's', x: +m.x, z: +m.z, h: +m.h, v: +m.v });
    else if (m.t === 'restart' && other(id)) startRace();
    else if (m.t === 'finish' && winner === null) {
      winner = id;
      slots.forEach(s => send(s, { t: 'winner', id, time: +m.time }));
    }
  });
  ws.on('close', () => {
    slots[id] = null;
    console.log(`Jogador ${id + 1} saiu`);
    send(other(id), { t: 'peer', peer: false });
  });
});

server.listen(PORT, () => {
  console.log(`\nJogo em http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list) if (i.family === 'IPv4' && !i.internal)
      console.log(`Para o outro computador (mesma rede): http://${i.address}:${PORT}`);
});
