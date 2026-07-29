# Generated public metrics

`npm-downloads.svg` is the README's completed daily npm package-download line chart. The
`.github/workflows/acquisition-ledger.yml` workflow reads npm's public downloads API, appends
one weekly aggregate row to `bench/acquisition-ledger.jsonl`, downloads the completed daily
range to a temporary file, and runs:

```bash
node scripts/render-acquisition.mjs /path/to/npm-downloads-range.json
```

The taller chart and large labels are designed to remain readable when GitHub scales the README
for a phone. The SVG contains no user-level data. Its embedded metadata identifies the generator,
capture date, data period, and public source. The weekly ledger remains the historical source for
npm, star, fork, and issue snapshots; it is not used as fake multi-point chart data.
