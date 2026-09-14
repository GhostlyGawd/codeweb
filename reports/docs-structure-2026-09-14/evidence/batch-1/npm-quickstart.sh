demo=$(mktemp -d "${TMPDIR:-/tmp}/codeweb-npm.XXXXXX") || exit 1
cd "$demo" || exit 1
printf 'import { beta } from "./b.js";\nexport function alpha() { return beta(); }\n' > a.js
printf 'export function beta() { return 1; }\n' > b.js
npx -y -p @ghostlygawd/codeweb@0.14.0 codeweb . || exit $?
npx -y -p @ghostlygawd/codeweb@0.14.0 codeweb-query --callers beta --json || exit $?
cp .codeweb/graph.json before.json
printf 'import { alpha } from "./a.js";\nexport function beta() { return alpha(); }\n' > b.js
npx -y -p @ghostlygawd/codeweb@0.14.0 codeweb . --full || exit $?
npx -y -p @ghostlygawd/codeweb@0.14.0 codeweb-diff before.json .codeweb/graph.json --json
codeweb_status=$?
echo "DOC_DIFF_EXIT=$codeweb_status"
printf 'export function beta() { return 1; }\n' > b.js
npx -y -p @ghostlygawd/codeweb@0.14.0 codeweb . --full || exit $?
npx -y -p @ghostlygawd/codeweb@0.14.0 codeweb-diff before.json .codeweb/graph.json --json
codeweb_status=$?
echo "DOC_DIFF_EXIT=$codeweb_status"
