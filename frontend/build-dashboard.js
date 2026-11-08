#!/usr/bin/env node
/**
 * SiteChat dashboard bundler (ROADMAP 4.1).
 * Concatenates frontend/js/modules/*.js into a single classic script
 * (frontend/js/app.js) that is byte-for-byte equivalent to the old monolith.
 * The modules are the source of truth; app.js is a generated artifact.
 */
const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, 'js', 'modules');
const OUT = path.join(__dirname, 'js', 'app.js');

// Load order matters: core first (globals, auth, navigation), then feature panels.
const ORDER = [
    'core.js',
    'sites.js',
    'site_detail.js',
    'documents.js',
    'analytics.js',
    'customization.js',
    'conversations.js',
    'quick_prompts.js',
    'triggers.js',
    'handoffs.js',
    'security.js',
    'whitelabel.js',
    'settings.js',
    'team.js',
    'crawling.js',
    'leads.js',
    'qa_training.js',
];

const files = fs.readdirSync(MODULES_DIR).filter((f) => f.endsWith('.js')).sort();
const missing = ORDER.filter((f) => !files.includes(f));
if (missing.length) {
    console.error('Missing modules:', missing.join(', '));
    process.exit(1);
}
const extra = files.filter((f) => !ORDER.includes(f));
if (extra.length) {
    console.error('Modules not in build order (add them to ORDER):', extra.join(', '));
    process.exit(1);
}

const banner = '// GENERATED FILE - do not edit.\n// Built from frontend/js/modules/ by `npm run build:dashboard`.\n\n';
const parts = ORDER.map((f) => {
    const body = fs.readFileSync(path.join(MODULES_DIR, f), 'utf8');
    return `// ---- module: ${f} ----\n${body.trimEnd()}\n`;
});
fs.writeFileSync(OUT, banner + parts.join('\n'));
console.log(`Built ${path.relative(process.cwd(), OUT)} from ${ORDER.length} modules (${fs.statSync(OUT).size} bytes)`);
