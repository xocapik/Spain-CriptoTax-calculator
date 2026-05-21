/**
 * Transaction Parsers for Binance and Bitmex - Global Namespace
 */
window.TaxParsers = {
    MIGRATED_ASSETS: {
        'BCHABC': 'BCH',
        'BCHSV': 'BSV',
        'LUNA': 'LUNC',
        'YOYO': 'YOYOW'
    },

    BINANCE_KEYS: {
        'UTC_Time': 'ts', 'Tiempo': 'ts', 'Time': 'ts',
        'Operation': 'op', 'Operación': 'op',
        'Coin': 'asset', 'Moneda': 'asset',
        'Change': 'amount', 'Cambio': 'amount',
        'Account': 'account', 'Cuenta': 'account',
        'Remark': 'remark', 'Observación': 'remark',
        'User_ID': 'uid', 'ID de usuario': 'uid', 'User ID': 'uid'
    },

    BIN_CAT: {
        'buy': 'IN', 'compra': 'IN',
        'sell': 'OUT', 'venta': 'OUT',
        'deposit': 'NEUTRAL', 'depósito': 'NEUTRAL',
        'withdraw': 'NEUTRAL', 'retiro': 'NEUTRAL',
        'fee': 'FEE', 'transaction fee': 'FEE', 'battle fee': 'FEE',
        'binance convert': 'CONVERT',
        'small assets exchange bnb': 'CONVERT',
        'transaction sold': 'OUT', 'transaction buy': 'IN',
        'transaction revenue': 'IN', 'transaction spend': 'OUT',
        'commission rebate': 'AIRDROP', 'commission history': 'AIRDROP',
        'referee commission': 'AIRDROP', 'referral commission': 'AIRDROP',
        'staking rewards': 'INCOME', 'staking purchase': 'NEUTRAL',
        'staking redemption': 'NEUTRAL',
        'simple earn flexible interest': 'INCOME',
        'simple earn locked rewards': 'INCOME',
        'simple earn flexible subscription': 'NEUTRAL',
        'simple earn flexible redemption': 'NEUTRAL',
        'simple earn locked subscription': 'NEUTRAL',
        'simple earn locked redemption': 'NEUTRAL',
        'bnb vault rewards': 'INCOME',
        'airdrop assets': 'AIRDROP',
        'launchpool airdrop - user claim distribution': 'AIRDROP',
        'launchpool airdrop - system distribution': 'AIRDROP',
        'hodler airdrops distribution': 'AIRDROP',
        'cash voucher distribution': 'AIRDROP',
        'event bonus distribution': 'AIRDROP',
        'distribution': 'AIRDROP',
        'swap farming rewards': 'INCOME',
        'cashback voucher': 'AIRDROP',
        'binance card cashback': 'AIRDROP',
        'binance card spending': 'OUT',
        'launchpad token distribution': 'INCOME',
        'launchpad subscribe': 'NEUTRAL',
        'launchpool subscription/redemption': 'NEUTRAL',
        'transfer between main and funding wallet': 'NEUTRAL',
        'transfer between spot account and um futures account': 'NEUTRAL',
        'transfer between spot account and cm futures account': 'NEUTRAL',
        'funds transfer request - vega': 'NEUTRAL',
        'realized profit and loss': 'PNL',
        'funding fee': 'PNL',
        'leverage token redemption': 'NEUTRAL',
        'battle profit and loss': 'PNL',
        'insurance fund refund': 'INCOME',
        'liquid swap add': 'NEUTRAL',
        'liquidity farming remove': 'NEUTRAL',
        'dot slot auction staking': 'NEUTRAL',
        'dot slot auction rewards': 'INCOME',
        'dot slot auction redemption': 'NEUTRAL',
        'dot slot auction redemption': 'NEUTRAL',
        'asset recovery': 'NEUTRAL',
        'token swap - distribution': 'AIRDROP',
        'crypto box': 'AIRDROP',
    },

    classifyBinance(op) {
        const low = op.toLowerCase().trim();
        if (this.BIN_CAT[low] !== undefined) return this.BIN_CAT[low];
        const NEUTRAL_WORDS = ['subscription', 'redemption', 'purchase', 'subscribe', 'staking purchase', 'launchpad subscribe'];
        if (NEUTRAL_WORDS.some(w => low.includes(w))) return 'NEUTRAL';
        for (const [k, v] of Object.entries(this.BIN_CAT)) {
            if (low.includes(k)) return v;
        }
        return 'OTHER';
    },

    parseDate(str) {
        if (!str) return null;
        let s = str.trim();
        if (/^\d{2}-\d{2}-\d{2}/.test(s) && !/^\d{4}-/.test(s)) {
            s = '20' + s;
        }
        const monthsEs = { 'ene': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'abr': 'Apr', 'may': 'May', 'jun': 'Jun', 'jul': 'Jul', 'ago': 'Aug', 'sep': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'dic': 'Dec' };
        s = s.replace(/([a-z]{3})/i, match => monthsEs[match.toLowerCase()] || match);
        s = s.replace(/(\d{4}),\s?/g, '$1 ');
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    },

    parseBinance(rows) {
        return rows.map(row => {
            const n = {};
            for (const [k, v] of Object.entries(row)) {
                const cleanKey = k.trim().replace(/^\uFEFF/, '');
                const mk = this.BINANCE_KEYS[cleanKey];
                if (mk) n[mk] = v;
            }
            n.amount = parseFloat((n.amount || '').replace(',', '.')) || 0;
            if (n.asset) {
                let cleanAsset = n.asset.toUpperCase();
                if (this.MIGRATED_ASSETS[cleanAsset]) cleanAsset = this.MIGRATED_ASSETS[cleanAsset];
                n.asset = cleanAsset;
            }
            return n;
        }).filter(r => r.asset && !isNaN(r.amount) && r.amount !== 0);
    },

    parseBitmexAmount(amtStr, currency) {
        if (!amtStr) return 0;
        let s = amtStr.toString().replace(/\s.*$/, '');
        s = s.replace(',', '.');
        let val = parseFloat(s);
        const isLegacyXbt = currency && currency.toUpperCase() === 'XBT' && amtStr.toString().indexOf(',') === -1 && amtStr.toString().indexOf('.') === -1;
        if (isLegacyXbt && Number.isInteger(val) && Math.abs(val) >= 100) {
            val = val / 1e8;
        }
        return val;
    },

    parseBitmex(rows) {
        return rows.map(row => {
            let cleanAsset = (row.currency || '').replace('t', 'T');
            if (cleanAsset) {
                cleanAsset = cleanAsset.toUpperCase();
                if (this.MIGRATED_ASSETS[cleanAsset]) cleanAsset = this.MIGRATED_ASSETS[cleanAsset];
            }
            return {
                ts: row.transactTime,
                op: row.transactType,
                asset: cleanAsset,
                amount: this.parseBitmexAmount(row.amount, row.currency),
                fee: this.parseBitmexAmount(row.fee, row.currency),
                raw: row
            };
        }).filter(r => r.asset && r.ts && !isNaN(r.amount));
    },

    classifyBitmex(op) {
        const low = (op || '').toLowerCase();
        if (low.includes('realisedpnl') || low.includes('funding')) return 'PNL';
        if (low.includes('deposit') || low.includes('withdrawal') || low.includes('transfer')) return 'NEUTRAL';
        return 'OTHER';
    },

    detectSource(rows) {
        const keys = Object.keys(rows[0] || {}).map(k => k.trim().replace(/^\uFEFF/, ''));
        if (keys.includes('UTC_Time') || keys.includes('Tiempo') || keys.includes('Time') || keys.includes('Coin') || keys.includes('Moneda')) return 'binance';
        if (keys.includes('transactType') && keys.includes('transactTime')) return 'bitmex';
        return 'unknown';
    },

    isDusting(tx) {
        return tx.op.toLowerCase().trim() === 'small assets exchange bnb';
    },

    consolidateTrades(allData) {
        const out = [];
        const clusters = new Map();

        allData.forEach(tx => {
            const lowOp = tx.op.toLowerCase();
            const isRelaxed = lowOp.includes('convert') || lowOp.includes('small assets exchange bnb');
            let groupIdentifier;
            if (isRelaxed) {
                const minTs = Math.floor(tx.ts.getTime() / 60000) * 60000;
                groupIdentifier = `relaxed_${minTs}_${(tx.remark || '').trim()}`;
            } else {
                groupIdentifier = `strict_${tx.ts.getTime()}`;
            }
            const key = `${tx.uid}_${groupIdentifier}`;
            if (!clusters.has(key)) clusters.set(key, []);
            clusters.get(key).push(tx);
        });

        for (const cluster of clusters.values()) {
            const used = new Set();
            const remarkGroups = {};
            cluster.forEach(tx => {
                const cleanR = (tx.remark || '').trim();
                if (cleanR !== '') {
                    if (!remarkGroups[cleanR]) remarkGroups[cleanR] = [];
                    remarkGroups[cleanR].push(tx);
                }
            });

            for (const [remark, rows] of Object.entries(remarkGroups)) {
                const rSells = rows.filter(t => t.amount < 0);
                const rBuys = rows.filter(t => t.amount > 0);
                if (rSells.length > 0 && rBuys.length > 0) {
                    out.push({
                        ts: rows[0].ts, atomic: true, source: rows[0].source, uid: rows[0].uid,
                        op: this.isDusting(rows[0]) ? 'Trade Consolidado (Dusting)' : 'Trade Consolidado',
                        outAsset: rSells[0].asset, outAmount: Math.abs(rSells.reduce((acc, s) => acc + s.amount, 0)),
                        inAsset: rBuys[0].asset, inAmount: rBuys.reduce((acc, b) => acc + b.amount, 0),
                        feeAsset: '', feeAmount: 0
                    });
                    rows.forEach(r => used.add(r));
                }
            }

            const remaining = cluster.filter(tx => !used.has(tx));
            const sells = remaining.filter(t => t.amount < 0 && (t.cat === 'OUT' || t.cat === 'CONVERT'));
            const buys = remaining.filter(t => t.amount > 0 && (t.cat === 'REVENUE' || t.cat === 'IN' || t.cat === 'CONVERT'));
            const fees = remaining.filter(t => t.cat === 'FEE' && t.amount < 0);

            if (sells.length > 0 && buys.length > 0) {
                out.push({
                    ts: remaining[0].ts, atomic: true, source: remaining[0].source, uid: remaining[0].uid,
                    op: 'Trade Consolidado',
                    outAsset: sells[0].asset, outAmount: Math.abs(sells.reduce((acc, s) => acc + s.amount, 0)),
                    inAsset: buys[0].asset, inAmount: buys.reduce((acc, b) => acc + b.amount, 0),
                    feeAsset: fees.length > 0 ? fees[0].asset : '',
                    feeAmount: Math.abs(fees.reduce((acc, f) => acc + f.amount, 0))
                });
                [...sells, ...buys, ...fees].forEach(r => used.add(r));
            }

            cluster.forEach(tx => {
                if (!used.has(tx) && !this.isDusting(tx)) out.push(tx);
            });
        }
        return out.sort((a, b) => a.ts - b.ts);
    }
};

// Exportación global de seguridad y log de depuración
window.consolidateTrades = window.TaxParsers.consolidateTrades;
console.log("TaxParsers loaded (including consolidateTrades)");
