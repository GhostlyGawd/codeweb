# Generated public metrics

`npm-downloads.svg` is the README's npm package-download chart. Its large headline is the
total for the latest seven completed days, and its line shows the completed daily values. The
`.github/workflows/acquisition-ledger.yml` workflow reads npm's public downloads API, appends
one weekly aggregate row to `bench/acquisition-ledger.jsonl`, downloads the completed daily
range to a temporary file, and runs:

```bash
node scripts/render-acquisition.mjs /path/to/npm-downloads-range.json
```

The taller chart and large labels are designed to remain readable when GitHub scales the README
for a phone. The SVG contains no user-level data. Its embedded metadata identifies the generator,
capture date, data period, and public source. The seven-day headline is calculated from the daily
range; the weekly ledger remains the historical source for npm, star, fork, and issue snapshots
and is not used as fake multi-point chart data.
