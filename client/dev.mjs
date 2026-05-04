import { execSync, spawn } from 'child_process';
import http from 'http';

const PRIMARY_PORT = 3000;
const MIRROR_PORT = 3001;

// Start Next.js on primary port
const next = spawn('npx', ['next', 'dev', '-p', String(PRIMARY_PORT)], {
  stdio: 'inherit',
  shell: true,
});

// Wait for Next.js to be ready, then start mirror proxy
setTimeout(() => {
  const proxy = http.createServer((req, res) => {
    const options = {
      hostname: 'localhost',
      port: PRIMARY_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502);
      res.end('Next.js not ready yet');
    });

    req.pipe(proxyReq, { end: true });
  });

  // Handle WebSocket upgrades (for HMR)
  proxy.on('upgrade', (req, socket, head) => {
    const options = {
      hostname: 'localhost',
      port: PRIMARY_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    const proxyReq = http.request(options);
    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
        '\r\n\r\n'
      );
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });
    proxyReq.on('error', () => socket.destroy());
    proxyReq.end();
  });

  proxy.listen(MIRROR_PORT, () => {
    console.log(`\n🔗 Mirror running on http://localhost:${MIRROR_PORT} → :${PRIMARY_PORT}\n`);
  });

  proxy.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️  Mirror port ${MIRROR_PORT} is busy, skipping mirror`);
    }
  });
}, 2000);

next.on('exit', (code) => process.exit(code));
process.on('SIGINT', () => { next.kill(); process.exit(0); });
process.on('SIGTERM', () => { next.kill(); process.exit(0); });
