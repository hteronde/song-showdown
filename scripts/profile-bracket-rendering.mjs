import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

// This is a source-execution baseline, not a browser frame/layout benchmark.
// Angular decorators, DOM rectangles, RAF and ResizeObserver are controlled stubs.
const root = new URL('../', import.meta.url);
const noopDecorator = () => () => {};
const core = { Component: noopDecorator, Directive: noopDecorator, Input: noopDecorator,
  ViewChild: noopDecorator, Output: noopDecorator, EventEmitter: class { emit() {} } };
function load(path, globals = {}, dependencies = {}) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, experimentalDecorators: true } }).outputText;
  const context = createContext({ exports: {}, Error, AbortController, setInterval, clearInterval,
    require: name => name === '@angular/core' ? core : dependencies[name] ?? {}, ...globals });
  runInContext(code, context, { filename: path });
  return context.exports;
}
const state = load('src/app/brackets/state/voting-state.ts');
const { ActiveBracketPageComponent } = load('src/app/brackets/feature/active-bracket-page.component.ts', {}, { '../state/voting-state': state });
const { HistoryPageComponent } = load('src/app/history/feature/history-page.component.ts');

function fixture(size) {
  let id = 1;
  const rounds = [];
  for (let round = 1; round <= Math.log2(size); round++) {
    const count = size / 2 ** round;
    const matches = Array.from({length: count}, (_, index) => ({matchupId: id++, roundNumber: round,
      matchupNumber: index + 1, nextMatchupId: null, winnerEntryId: 1,
      songA: {entryId: 1, title: 'A'}, songB: {entryId: 2, title: 'B'}, ballots: []}));
    rounds.push({roundNumber: round, roundName: `Round ${round}`, matches});
  }
  for (let i = 0; i < rounds.length - 1; i++) rounds[i].matches.forEach((match, index) => {
    match.nextMatchupId = rounds[i + 1].matches[Math.floor(index / 2)].matchupId;
  });
  return rounds;
}
function countGetter(instance, name, counts) {
  const getter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(instance), name).get;
  Object.defineProperty(instance, name, {get() { counts[name] = (counts[name] ?? 0) + 1; return getter.call(this); }});
}
function roundProfile(size, firstRound, iterations) {
  const rounds = fixture(size);
  const active = new ActiveBracketPageComponent({}, {}, {}, {}, {markForCheck() {}});
  let weekNumber = 0;
  const weeks = rounds.flatMap(round => Array.from({length: Math.ceil(round.matches.length / 2)}, (_, index) => ({
    roundNumber: round.roundNumber, roundName: round.roundName, weekNumber: ++weekNumber,
    matchups: round.matches.slice(index * 2, index * 2 + 2), isUpcoming: false
  })));
  active.data = {bracket: {bracketId: 1}, weeks};
  const history = new HistoryPageComponent({}, {}, {markForCheck() {}}, {}, {});
  history.historyRounds = rounds.map(round => ({roundNumber: round.roundNumber, name: round.roundName, matches: round.matches}));
  active.firstVisibleRound = history.firstVisibleRound = firstRound;
  const activeCounts = {}, historyCounts = {};
  for (const name of ['revealedRounds', 'visibleRounds', 'connectorMatches']) countGetter(active, name, activeCounts);
  for (const name of ['visibleRounds', 'connectorMatches']) countGetter(history, name, historyCounts);
  const activePass = () => {
    void active.champion; // The champion component's binding, outside the board.
    void active.revealedRounds; // Round dropdown.
    void active.revealedRounds.length; // Board *ngIf.
    void active.visibleRounds.length; // CSS round count.
    void active.visibleRounds[0]?.matchups.length; // CSS row count.
    void active.connectorMatches;
    for (const round of active.visibleRounds) for (const _match of round.matchups) {
      active.bracketRoundSpan(round.roundNumber); // Grid-row binding.
      active.bracketRoundSpan(round.roundNumber); // Feeder-offset binding.
    }
  };
  const historyPass = () => {
    void history.visibleRounds.length;
    void history.visibleRounds[0]?.matches.length;
    void history.connectorMatches;
    for (const round of history.visibleRounds) for (const _match of round.matches) history.visibleRoundSpan(round.roundNumber);
  };
  activePass(); historyPass();
  const callsPerPass = {active: {...activeCounts}, history: {...historyCounts}};
  // Warm the actual getters without timing compilation or constructing fixtures.
  for (let i = 0; i < 50; i++) { activePass(); historyPass(); }
  function medianMs(pass) {
    const samples = [];
    for (let sample = 0; sample < 7; sample++) {
      const started = performance.now();
      for (let i = 0; i < iterations; i++) pass();
      samples.push((performance.now() - started) / iterations);
    }
    return Number(samples.sort((a, b) => a - b)[3].toFixed(4));
  }
  return {songs: size, firstRound, visibleMatchups: rounds.filter(round => round.roundNumber >= firstRound).reduce((n, round) => n + round.matches.length, 0),
    callsPerPass, matchupsRegroupedPerActivePass: callsPerPass.active.revealedRounds * (size - 1),
    activeMedianMsPerModeledPass: medianMs(activePass), historyMedianMsPerModeledPass: medianMs(historyPass)};
}

function connectorProfile(size, firstRound, frames = 100, checksPerFrame = 1) {
  const rounds = fixture(size), links = rounds.flatMap(round => round.matches);
  const visible = rounds.filter(round => round.roundNumber >= firstRound).flatMap(round => round.matches);
  const counts = {viewChecks: 0, scheduledFrames: 0, draws: 0, boardReads: 0, matchupReads: 0, childReplacements: 0};
  let nextFrame = 0, resize;
  const callbacks = new Map();
  const board = {scrollLeft: 0, scrollTop: 0,
    getBoundingClientRect() {counts.boardReads++; return {left: 0, top: 0, width: 1200, height: 1600};},
    querySelectorAll() {return visible.map((match, index) => ({dataset: {matchupId: String(match.matchupId)},
      getBoundingClientRect() {counts.matchupReads++; return {left: match.roundNumber * 220, right: match.roundNumber * 220 + 200, top: index * 180, bottom: index * 180 + 140};}}));}};
  const host = {style: {}, parentElement: board, setAttribute() {}, replaceChildren() {counts.childReplacements++;}};
  const {BracketConnectorsDirective} = load('src/app/brackets/ui/bracket-connectors.directive.ts', {
    ResizeObserver: class {constructor(callback) {resize = callback;} observe() {} disconnect() {}},
    requestAnimationFrame(callback) {const id = ++nextFrame; counts.scheduledFrames++; callbacks.set(id, callback); return id;},
    cancelAnimationFrame(id) {callbacks.delete(id);},
    document: {createDocumentFragment: () => ({appendChild() {}}), createElement: () => ({style: {}})}
  });
  const directive = new BracketConnectorsDirective({nativeElement: host});
  directive.appBracketConnectors = links;
  const originalDraw = directive.draw.bind(directive);
  directive.draw = () => {counts.draws++; originalDraw();};
  const flush = () => {for (const [id, callback] of [...callbacks]) {callbacks.delete(id); callback();}};
  for (let frame = 0; frame < frames; frame++) {
    for (let i = 0; i < checksPerFrame; i++) {counts.viewChecks++; directive.ngAfterViewChecked();}
    flush();
  }
  const steadyState = {...counts};
  resize(); flush(); // Verify observer-triggered work is separately scheduled.
  const resizeTriggeredDraws = counts.draws - steadyState.draws;
  directive.ngOnDestroy();
  return {songs: size, firstRound, frames, checksPerFrame, ...steadyState,
    rectangleReads: steadyState.boardReads + steadyState.matchupReads, resizeTriggeredDraws};
}
const iterationsArg = process.argv.find(arg => arg.startsWith('--iterations='));
const iterations = iterationsArg ? Number(iterationsArg.split('=')[1]) : 200;
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000) throw new Error('--iterations must be between 1 and 10000.');
const cases = [[4, 1], [32, 1], [128, 1], [128, 4]];
const result = {kind: 'source-execution baseline with synthetic DOM geometry', node: process.version,
  iterationsPerSample: iterations, timingSamples: 7, matchupsPerSession: 2,
  limitations: ['No browser or Angular runtime trace', 'Binding passes model only round/champion bindings from the templates', 'Synthetic rectangles cannot measure browser layout, forced reflow, paint, or FPS', 'Getter counts do not establish that a perceptible user-facing delay exists'],
  roundProfiles: cases.map(([size, firstRound]) => roundProfile(size, firstRound, iterations)),
  connectorProfiles: cases.map(([size, firstRound]) => connectorProfile(size, firstRound)),
  coalescedChecks: connectorProfile(128, 1, 1, 10)};
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(result.kind);
  console.table(result.roundProfiles.map(row => ({songs: row.songs, firstRound: row.firstRound, visibleMatchups: row.visibleMatchups,
    regroupings: row.callsPerPass.active.revealedRounds, regroupedMatchups: row.matchupsRegroupedPerActivePass,
    activeMs: row.activeMedianMsPerModeledPass, historyMs: row.historyMedianMsPerModeledPass})));
  console.table(result.connectorProfiles.map(row => ({songs: row.songs, firstRound: row.firstRound, checks: row.viewChecks,
    draws: row.draws, rectangleReads: row.rectangleReads, childReplacements: row.childReplacements})));
  console.log('Ten checks before one animation frame:', JSON.stringify(result.coalescedChecks));
  console.log('Limits:', result.limitations.join('; '));
}
