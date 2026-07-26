// Claim-bearing strings that product STDOUT prints — hoisted here so the release gate can see
// them (DEBT D6: check-consistency audited files, never CLI output, and a charter-ruled-false
// sponsorship premise shipped in the v0.12.0 run banner unseen). Public-claim wording routes
// through CHARTER.md; C7 (2026-07-25) ruled the whole sponsorship cost-premise class fabricated:
// sponsorship simply supports the project, and sponsors get seen (featured README/site
// placement). checkConsistency (scripts/release-utils.mjs) fails the build on any cost-premise
// wording in this file, and the PROSE_FILES sweep covers its strings like any public surface.

/** The one in-product sponsor ask (REVENUE §3.2: receipt high point only, 30-day throttle),
 *  printed by run.mjs. Wording mirrors the ratified README / support-page copy. */
export const SPONSOR_ASK = '[run]   codeweb is free — sponsoring supports the project, and sponsors get seen: https://github.com/sponsors/GhostlyGawd';
