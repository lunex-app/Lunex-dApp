const fs = require('fs');
let content = fs.readFileSync('src/pages/Bridge.tsx', 'utf-8');

// 1. Remove duplicate recovery button
content = content.replace(
  /\r?\n\r?\n          <button onClick=\{.*?setShowResumeModal\(true\).*?>\r?\n            Recover Pending Bridge\r?\n          <\/button>\r?\n/s,
  '\n'
);

// 2. Rename "Protocol Recovery Terminal" to "CCTP Recovery Terminal"
content = content.replace('Protocol Recovery Terminal', 'CCTP Recovery Terminal');

fs.writeFileSync('src/pages/Bridge.tsx', content);
console.log('Done');
