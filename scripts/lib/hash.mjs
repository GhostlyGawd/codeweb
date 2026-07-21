// codeweb shared hashing — the one sha1 every surface uses (extractor stamps/cache keys,
// checkStaleness's verify tier). Extracted after codeweb's own PR gate flagged the helper
// re-implemented in two files on this very branch (physician, heal thyself). Pure, no I/O.

import { createHash } from 'node:crypto';

export const sha1 = (s) => createHash('sha1').update(s).digest('hex');
