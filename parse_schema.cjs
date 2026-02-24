const fs = require('fs');

try {
    const doc = JSON.parse(fs.readFileSync('supabase_rest_openapi.json', 'utf8'));

    const extractSchema = (tableName) => {
        const schema = doc.definitions[tableName];
        if (!schema) return null;
        return Object.keys(schema.properties).map(col => {
            return {
                name: col,
                type: schema.properties[col].format || schema.properties[col].type,
                desc: schema.properties[col].description || ''
            };
        });
    };

    const tables = ['products', 'vendor_price_overrides', 'bulk_pricing', 'orders', 'order_items', 'invoices', 'invoice_items', 'categories', 'product_categories'];
    const results = {};

    tables.forEach(t => {
        const s = extractSchema(t);
        if (s) results[t] = s;
    });

    fs.writeFileSync('schema_extracted.json', JSON.stringify(results, null, 2));
    console.log('Successfully wrote schema_extracted.json');
} catch (e) {
    console.error("Error parsing schema dump:", e);
}
