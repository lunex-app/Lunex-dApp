const fs = require('fs');
let content = fs.readFileSync('src/pages/Bridge.tsx', 'utf-8');
content = content.replace('className=w-full mt-4 h-12 border border-primary/20 bg-primary/5 rounded-sm text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors>', 'className="w-full mt-4 h-12 border border-primary/20 bg-primary/5 rounded-sm text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors">');
fs.writeFileSync('src/pages/Bridge.tsx', content);
