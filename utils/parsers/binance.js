/**
 * Binance CSV Parser
 * Handles English and Spanish headers
 */

const BINANCE_MAPPING = {
    // English
    'UTC_Time': 'timestamp',
    'Account': 'account',
    'Operation': 'operation',
    'Coin': 'asset',
    'Change': 'amount',
    'Remark': 'remark',
    // Spanish
    'Tiempo': 'timestamp',
    'Cuenta': 'account',
    'Operación': 'operation',
    'Moneda': 'asset',
    'Cambio': 'amount',
    'Observación': 'remark',
    'ID de usuario': 'userId'
};

function parseBinance(data) {
    return data.map(row => {
        const normalized = {};
        for (const [key, value] of Object.entries(row)) {
            const mappedKey = BINANCE_MAPPING[key] || key;
            normalized[mappedKey] = value;
        }

        // Clean amount (remove commas if any)
        if (normalized.amount) {
            normalized.amount = parseFloat(normalized.amount.toString().replace(/,/g, ''));
        }

        return normalized;
    }).filter(row => row.asset && !isNaN(row.amount));
}

function categorizeOperation(op) {
    const opLower = op.toLowerCase();
    
    // Gain / Loss (Ventas/Permutas)
    if (['sell', 'venta', 'transaction sold', 'binance convert', 'small assets exchange bnb', 'binance card spending'].some(s => opLower.includes(s))) {
        return 'OUT';
    }
    
    // Purchases (Entradas con coste)
    if (['buy', 'compra', 'transaction buy'].some(s => opLower.includes(s))) {
        return 'IN';
    }

    // Income (Rendimientos)
    if (['staking rewards', 'recompensa', 'interest', 'interés', 'airdrop', 'commission', 'comisión', 'cashback'].some(s => opLower.includes(s))) {
        return 'INCOME';
    }

    // Transfers / Deposits / Withdraws (Neutrals)
    if (['deposit', 'depósito', 'withdraw', 'retiro', 'transfer'].some(s => opLower.includes(s))) {
        return 'NEUTRAL';
    }

    return 'OTHER';
}
