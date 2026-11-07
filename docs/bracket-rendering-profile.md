# Bracket rendering baseline

Recorded on November 7, 2026. No production rendering behavior was changed.

## Scope and limitations

Browser access was unavailable during this session. This is a **source-execution profile with a modeled binding pass and synthetic DOM geometry**, not a Chrome/Angular Performance recording. It runs the actual compiled page getters and connector directive, with Angular decorators, DOM rectangles, ResizeObserver and requestAnimationFrame stubbed. Fixtures use two matchups per session and cover 4, 32 and 128 songs, plus a 128-song bracket filtered from Sweet 16.

A modeled pass evaluates the round-related bindings present in the templates, including the active page's champion binding and the two per-matchup span bindings. It excludes other Angular work, network requests, browser layout, forced reflow, painting and garbage-collection analysis. Synthetic connector frames are explicitly flushed by the harness; they are not evidence of the application's real change-detection frequency or a self-sustaining rendering loop.

The reported times are illustrative Node getter-execution timings, not user-facing frame times. No claim is made that these costs currently cause perceptible latency.

## Reproduce

```sh
npm run profile:bracket
npm run profile:bracket -- --json
npm run profile:bracket -- --iterations=1000
```

Node version: `v24.21.0`. Timing uses seven samples of 200 modeled passes after 50 warmup passes; the table reports the median per-pass duration. If templates change, update the harness's modeled binding reads before comparing profiles.

## Round computation

| Songs | First visible round | Visible matchups | Active round rebuilds per modeled pass | Matchup entries regrouped per modeled pass | Active getter work (ms/pass) | History getter work (ms/pass) |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | All rounds | 3 | 12 | 36 | 0.0037 | 0.0004 |
| 32 | All rounds | 31 | 68 | 2,108 | 0.0556 | 0.003 |
| 128 | All rounds | 127 | 260 | 33,020 | 0.6006 | 0.0135 |
| 128 | Sweet 16 (round 4) | 15 | 36 | 4,572 | 0.085 | 0.0024 |

The active page's `visibleRounds` calls `revealedRounds`, which recreates a Map, grouped round objects and matchup wrappers. Each matchup evaluates `bracketRoundSpan` twice, and that method reads `visibleRounds` again. With 127 visible matchups, this yields 254 span-driven rebuilds plus six other modeled reads. Each rebuild still visits the full bracket even when the view starts at Sweet 16.

History already stores its round list. Its `visibleRounds` still allocates a filtered array for the board bindings and each call to `visibleRoundSpan`, but it does not perform the active page's full round regrouping. Both `connectorMatches` getters flatten their inputs into a new array on each access.

## Connector measurement

The following uses 100 unchanged view checks, each followed by an animation-frame flush:

| Songs | First visible round | Draw calls | Rectangle reads | Connector child replacements |
| --- | --- | --- | --- | --- |
| 4 | All rounds | 100 | 400 | 1 |
| 32 | All rounds | 100 | 3,200 | 1 |
| 128 | All rounds | 100 | 12,800 | 1 |
| 128 | Sweet 16 (round 4) | 100 | 1,600 | 1 |

Each draw reads the board rectangle and every visible matchup rectangle before constructing and comparing the path signature. Identical geometry prevents repeated `replaceChildren` calls, but it does **not** prevent geometry reads, querySelectorAll, path construction or signature serialization. The harness cannot determine whether those geometry reads force browser layout.

Ten view checks before a single frame are correctly coalesced into one draw (128 rectangle reads for the full 128-song board). A ResizeObserver notification schedules another draw. This confirms useful coalescing already exists; it does not eliminate measurement across separate frames.

## Browser follow-up before optimization

Capture a real browser trace on both the active bracket and History pages, using 32- and 128-song brackets. Record unchanged idle frames across several five-second polls, round-filter changes and restoration to All rounds, viewport resizing, and album-art loading. Separate round computation/allocation from connector scripting, layout and paint. Compare development and production builds; Angular development checks may increase binding evaluations.

Measure frame duration, long tasks, allocation/GC activity, layout time, and rectangle-read counts. Only then decide whether to cache derived round lists, avoid repeated per-matchup span calculations, or invalidate connector measurements only after topology/size/filter changes. Preserve updates after polling, image loading and resizing. Do not assume requestAnimationFrame or a signature cache already avoids the layout cost.
