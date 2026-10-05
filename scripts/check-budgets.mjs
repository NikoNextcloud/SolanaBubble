import fs from 'node:fs';

const limits=[
  ['components/BubbleMap.tsx',78000],
  ['components/MarketMap.tsx',70000],
  ['app/globals.css',90000],
  ['app/lovable-theme.css',66000],
  ['supabase/functions/market-snapshot/index.js',97000],
  ['tests/browser-smoke.mjs',28000],
];
let failed=false;
for(const [file,max] of limits){
  const size=fs.statSync(file).size;
  console.log(`${file}: ${size} / ${max} bytes`);
  if(size>max){console.error(`Budget exceeded: ${file}`);failed=true;}
}
const css=fs.statSync('app/globals.css').size+fs.statSync('app/lovable-theme.css').size;
const cssMax=155000;
console.log(`combined CSS: ${css} / ${cssMax} bytes`);
if(css>cssMax){console.error('Budget exceeded: combined CSS');failed=true;}
if(failed)process.exit(1);
