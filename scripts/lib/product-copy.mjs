// Claim-bearing strings that product STDOUT prints — hoisted here so the release gate can see
// them (DEBT D6: check-consistency audited files, never CLI output, and a charter-ruled-false
// sponsorship premise shipped in the v0.12.0 run banner unseen). Public-claim wording routes
// through CHARTER.md; C7 (2026-07-25) ruled the whole sponsorship cost-premise class fabricated:
// sponsorship simply supports the project, and sponsors get seen (featured README/site
// placement). checkConsistency (scripts/release-utils.mjs) fails the build on any cost-premise
// wording in this file, and the PROSE_FILES sweep covers its strings like any public surface.

/** The one ratified sponsor sentence (C7: support framing, never a cost story). Every surface
 *  that prints a sponsor line derives from this string, so the wording cannot fork. */
export const SPONSOR_LINE = 'codeweb is free — sponsoring supports the project, and sponsors get seen: https://github.com/sponsors/GhostlyGawd';

/** The one in-product sponsor ask (REVENUE §3.2: receipt high point only, 30-day throttle),
 *  printed by run.mjs. Wording mirrors the ratified README / support-page copy. */
export const SPONSOR_ASK = '[run]   ' + SPONSOR_LINE;

// ---- upgrade moments (REVENUE §3; CHARTER.md § "The boundary: free forever / Teams") ----------
// Three sanctioned surfaces, one line each: the gate-comment footer, the trend rail at 5+
// snapshots, and the receipt high point (SPONSOR_ASK above). Everything else is an ask-free zone
// — MCP tool responses (agent-consumed and budgeted), hook cards (mid-work trust), and every
// error path. tests/upgrade-placements.test.mjs sweeps the shipped scripts to keep it that way.

/** Where every upgrade moment points: the Teams surface on the site. */
export const TEAMS_URL = 'https://ghostlygawd.github.io/codeweb/pricing.html';

/** The lever that silences every upgrade moment, named beside the other knobs in docs/cli.md. */
export const NO_PROMO_ENV = 'CODEWEB_NO_PROMO';

/**
 * True when the user has opted out of in-product asks.
 *
 * `CODEWEB_NO_STATS` counts because the placements ride local counters: someone who turned the
 * ledger off has already said no to the mechanism these moments are computed from.
 */
export function placementsSuppressed(env = process.env) {
  return env[NO_PROMO_ENV] === '1' || env.CODEWEB_NO_STATS === '1';
}

/** The gate-comment footer's upgrade line (REVENUE §3 row 1) — muted, below the attribution. */
export const TEAMS_DASHBOARD_LINE =
  `<sub>Gating more than one repository? codeweb Teams keeps this trajectory for every repo in the org — [org dashboard →](${TEAMS_URL})</sub>`;

/** The trend rail at 5+ snapshots (REVENUE §3 row 4) — the hosted rollup job, being done by hand. */
export const TEAMS_TREND_NUDGE =
  `Tracking this across every repo, continuously, is what codeweb Teams does: ${TEAMS_URL}`;
