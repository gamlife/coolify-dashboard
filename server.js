const http = require('http');
const net = require('net');

const PORT = process.env.PORT || 3000;
const MAC_IP = process.env.MAC_IP || '192.168.1.18';
const DOCKER_SOCK = '/var/run/docker.sock';

async function dockerRequest(path) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(DOCKER_SOCK);
    const chunks = [];
    socket.on('connect', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    socket.on('data', (d) => chunks.push(d));
    socket.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const jsonStr = body.split('\r\n\r\n').slice(1).join('\r\n');
      try { resolve(JSON.parse(jsonStr)); } catch(e) { reject(e); }
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error('timeout')), 3000);
  });
}

async function getServices() {
  try {
    const containers = await dockerRequest('/containers/json');
    return containers
      .filter(c => !c.Names[0].includes('coolify') && !c.Names[0].includes('dashboard'))
      .map(c => {
        const name = c.Names[0].replace(/^\//, '');
        const ports = c.Ports || [];
        const mapped = ports.find(p => p.PublicPort > 0);
        const port = mapped ? mapped.PublicPort : null;
        const status = c.State === 'running' ? '🟢' : '🔴';
        const image = c.Image;
        const uptime = c.State === 'running'
          ? Math.round((Date.now() - new Date(c.StartedAt * 1000)) / 60000)
          : 0;
        const uptimeStr = uptime < 60 ? `${uptime}m` : `${Math.floor(uptime/60)}h ${uptime%60}m`;
        return { name, port, status, image, uptime: uptimeStr };
      });
  } catch (e) {
    return [];
  }
}

function renderHTML(services) {
  const rows = services.map(s => `
    <tr>
      <td>${s.status}</td>
      <td><code>${s.name}</code></td>
      <td>${s.port ? `<a href="http://${MAC_IP}:${s.port}" target="_blank" style="color:#60a5fa">http://${MAC_IP}:${s.port}</a>` : '<span style="color:#666">—</span>'}</td>
      <td style="color:#888;font-size:0.8em">${s.image.split('/').pop()}</td>
      <td style="color:#888">${s.uptime}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>🏠 Mac Mini 服务总览</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,sans-serif; background:#0f172a; color:#e2e8f0; padding:2rem; }
    h1 { font-size:1.5rem; margin-bottom:0.5rem; }
    .sub { color:#64748b; margin-bottom:1.5rem; }
    table { width:100%; border-collapse:collapse; background:#1e293b; border-radius:12px; overflow:hidden; }
    th { text-align:left; padding:0.75rem 1rem; background:#334155; color:#94a3b8; font-size:0.85rem; text-transform:uppercase; }
    td { padding:0.75rem 1rem; border-top:1px solid #334155; }
    tr:hover td { background:#1e3a5f; }
    code { font-family:monospace; font-size:0.9em; color:#fbbf24; }
    a { text-decoration:none; }
    a:hover { text-decoration:underline; }
    .time { color:#64748b; font-size:0.8em; margin-top:1.5rem; }
    .panel-link { color:#60a5fa; }
  </style>
</head>
<body>
  <h1>🏠 Mac Mini 服务总览</h1>
  <p class="sub">自动发现所有运行中的服务 · <a href="http://${MAC_IP}:9000" class="panel-link">Coolify 面板</a></p>
  <table>
    <tr><th>状态</th><th>服务</th><th>访问地址</th><th>镜像</th><th>运行时间</th></tr>
    ${rows}
  </table>
  <p class="time">🔄 自动刷新: 30秒 · 最后更新: ${new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}</p>
  <script>setTimeout(()=>location.reload(),30000)</script>
</body></html>`;
}

const server = http.createServer(async (req, res) => {
  const services = await getServices();
  res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
  res.end(renderHTML(services));
});

server.listen(PORT, '0.0.0.0', () => console.log(`Dashboard on port ${PORT}`));
