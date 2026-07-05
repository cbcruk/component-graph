// Classify a candidate into pass / broken / partial from score.mjs output.
// Usage: node evals/outcome.mjs '<scoreJSON>'
const s = JSON.parse(process.argv[2]);
const c = s.checks || {};
let outcome;
if (!c.parses) outcome = 'broken:parse';
else if (c.noNewTypeErrors === false) outcome = 'broken:type';
else if (s.pass) outcome = 'pass';
else outcome = `partial:${s.failureMode}`;
console.log(outcome);
