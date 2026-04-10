/**
 * Bitmex CSV Parser
 */

function parseBitmex(data) {
    return data.map(row => {
        const amount = parseFloat(row.amount);
        const fee = parseFloat(row.fee || 0);
        
        return {
            timestamp: row.transactTime,
            operation: row.transactType,
            asset: row.currency,
            amount: amount,
            fee: fee,
            raw: row
        };
    }).filter(row => row.asset && !isNaN(row.amount));
}

function categorizeBitmexOperation(op) {
    const opLower = op.toLowerCase();

    if (opLower.includes('realisedpnl')) {
        return 'PNL'; // Specific for derivatives
    }

    if (opLower.includes('deposit')) return 'NEUTRAL';
    if (opLower.includes('withdrawal')) return 'NEUTRAL';
    if (opLower.includes('transfer')) return 'NEUTRAL';

    return 'OTHER';
}
