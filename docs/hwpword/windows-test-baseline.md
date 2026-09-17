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
