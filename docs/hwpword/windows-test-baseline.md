# rhwp-studio test baseline on Windows

Upstream tag v0.8.6, before any HWP Word changes. Node: v22.23.2. Recorded: 2026-09-16.
Later tasks may not add failing test files beyond this list.

## Summary

```
# tests 1359
# suites 0
# pass 1353
# fail 5
# cancelled 0
# skipped 1
# todo 0
```

## Failing test files

```
not ok 105 - CanvasKit SFNT normalization selects exact TTC faces
not ok 106 - CanvasKit SFNT normalization keeps standalone fonts on face zero
not ok 107 - CanvasKit SFNT normalization rejects malformed collection directories
not ok 108 - CanvasKit SFNT normalization protects TTC v2 DSIG metadata
not ok 116 - tests\\issue-4969-font-resource-reuse.test.ts
```

## Update — 2026-09-21, engine built from source

Building the engine ourselves (see `engine-build.md`) dropped four of these. The npm `@rhwp/core`
0.8.6 build fails the CanvasKit SFNT normalization tests on this machine; the same sources built
here pass them. Only one known failure is left:

```
not ok - tests\issue-4969-font-resource-reuse.test.ts
```

So the rule tightens: a run may show **that file and nothing else**. If a CanvasKit SFNT failure
comes back, check whether `pkg/` fell back to the npm build (`pkg/.built-locally` gone).
