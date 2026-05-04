import detect from 'detect-port';
import { execSync } from 'child_process';

const PREFERRED_PORT = 3000;

detect(PREFERRED_PORT).then((availablePort) => {
  if (availablePort !== PREFERRED_PORT) {
    console.log(`⚠️  Port ${PREFERRED_PORT} is busy, using port ${availablePort}`);
  }
  execSync(`npx next dev -p ${availablePort}`, { stdio: 'inherit' });
}).catch((err) => {
  console.error('Failed to detect port:', err);
  process.exit(1);
});
