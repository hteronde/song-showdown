import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Pure frontend modules can be exercised by Node without bootstrapping Angular.
export async function loadFrontendModule(url) {
  const source = readFileSync(url, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
