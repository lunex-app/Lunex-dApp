const fs = require('fs');
let c = fs.readFileSync('src/pages/Bridge.tsx', 'utf8');

const oldHeader = `<div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold uppercase tracking-widest">CCTP Recovery Terminal</h3>`;

const newHeader = `<div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                   {resumeTerminal.stage !== "idle" && resumeTerminal.stage !== "success" && (
                     <button 
                        onClick={resumeTerminal.reset}
                        className="p-1 hover:bg-muted rounded-full transition-colors"
                     >
                        <ArrowLeft className="h-4 w-4" />
                     </button>
                   )}
                   <h3 className="text-sm font-bold uppercase tracking-widest">CCTP Recovery Terminal</h3>
                </div>`;

// Try to match with literal replacement
if (c.includes(oldHeader)) {
    c = c.replace(oldHeader, newHeader);
    fs.writeFileSync('src/pages/Bridge.tsx', c);
    console.log('Successfully patched Bridge.tsx');
} else {
    // Try with normalized whitespace
    console.log('Literal match failed, trying normalized match...');
    const searchStr = `CCTP Recovery Terminal</h3>`;
    if (c.includes(searchStr)) {
        // Find the line with CCTP Recovery Terminal and the div before it
        const lines = c.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('CCTP Recovery Terminal</h3>')) {
                // Check if previous line is the header div
                if (lines[i-1].includes('flex justify-between items-center mb-6')) {
                    lines[i-1] = lines[i-1].replace('<div className="flex justify-between items-center mb-6">', 
                        `<div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                   {resumeTerminal.stage !== "idle" && resumeTerminal.stage !== "success" && (
                     <button 
                        onClick={resumeTerminal.reset}
                        className="p-1 hover:bg-muted rounded-full transition-colors"
                     >
                        <ArrowLeft className="h-4 w-4" />
                     </button>
                   )}`);
                    lines[i] = lines[i].replace('</h3>', '</h3>\n                </div>');
                    fs.writeFileSync('src/pages/Bridge.tsx', lines.join('\n'));
                    console.log('Successfully patched Bridge.tsx using line iteration');
                    process.exit(0);
                }
            }
        }
    }
    console.error('Target not found in Bridge.tsx');
    process.exit(1);
}
