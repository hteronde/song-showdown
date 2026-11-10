import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const child = spawn(process.execPath, ['--test', 'server/http.integration.test.mjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: {...process.env, HTTP_DB_TESTS: '1'},
  stdio: 'inherit'
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
