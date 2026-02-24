const fs = require('fs');
const path = require('path');

const keywords = [
    'Price Not Available',
    'per case', 'per unit', 'units_per_case',
    'allow_cases', 'allow_piece',
    'vendor override', 'vendor_price', 'override',
    'bulk price', 'bulk pricing', 'bulk override',
    'order_items', 'invoice_items', 'createInvoice', 'generate invoice', 'invoice generation',
    'supabase.from(\\\'products\\\')',
    'revalidatePath', 'revalidateTag', 'cache', 'fetchCache', 'no-store', 'force-cache'
];

const results = {};

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            searchDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');

            keywords.forEach(kw => {
                const regex = new RegExp(kw, 'i');
                lines.forEach((line, i) => {
                    if (regex.test(line)) {
                        if (!results[kw]) results[kw] = [];
                        results[kw].push({ file: fullPath, line: i + 1, content: line.trim() });
                    }
                });
            });
        }
    }
}

searchDir('src');
fs.writeFileSync('audit_results.json', JSON.stringify(results, null, 2));
console.log('Done writing audit_results.json');
