import { readFileSync } from 'fs';
import { parse, compileScript } from '@vue/compiler-sfc';
const src=readFileSync('src/App.vue','utf8');
const { descriptor, errors } = parse(src, { filename: 'App.vue' });
if(errors.length){ console.log('PARSE ERRORS:'); for(const e of errors) console.log('  -', e.message, e.loc ? 'L'+e.loc.start.line : ''); }
else console.log('parse OK');
try { compileScript(descriptor, { id: 'x' }); console.log('compileScript OK'); }
catch(e){ console.log('COMPILE ERROR:', e.message); if(e.loc) console.log('  en linea', e.loc.start ? e.loc.start.line : '?'); }
