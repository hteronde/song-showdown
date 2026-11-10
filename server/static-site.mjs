import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const contentTypes = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg',
  '.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const within = (file, root) => file === root || file.startsWith(root + sep);

export async function checkStaticSite(directory) {
  if (directory) await stat(resolve(directory, 'index.html'));
}

export async function serveStaticSite(request, response, pathname, directory) {
  const finish = (status, text) => { response.writeHead(status, {'Content-Type':'text/plain; charset=utf-8'}); response.end(text); };
  if (!['GET','HEAD'].includes(request.method)) {response.setHeader('Allow','GET, HEAD');finish(405,'Method not allowed.');return;}
  let path;
  try {path = decodeURIComponent(pathname);} catch {finish(400,'Invalid URL.');return;}
  if (path.includes('\0') || path.includes('\\') || path.split('/').some(part => part.startsWith('.'))) {finish(404,'Not found.');return;}
  const root = await realpath(directory);
  let candidate = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!within(candidate, root)) {finish(404,'Not found.');return;}
  try {
    candidate = await realpath(candidate);
    if (!within(candidate, root) || !(await stat(candidate)).isFile()) {finish(404,'Not found.');return;}
  } catch (error) {
    if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error;
    if (extname(path) || !String(request.headers.accept || '').includes('text/html')) {finish(404,'Not found.');return;}
    candidate = await realpath(resolve(root,'index.html'));
    if (!within(candidate, root)) {finish(404,'Not found.');return;}
  }
  const body = await readFile(candidate);
  const extension = extname(candidate).toLowerCase();
  response.writeHead(200, {'Content-Type':contentTypes[extension] || 'application/octet-stream',
    'Content-Length':body.length,'Cache-Control':extension === '.html' ? 'no-store' : 'public, max-age=3600',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});
  response.end(request.method === 'HEAD' ? undefined : body);
}
