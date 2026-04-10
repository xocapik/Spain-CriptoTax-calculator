/**
 * FIFO Calculation Engine for Spanish Taxes
 */
window.FifoEngine = class FifoEngine {
    constructor() {
        this.lots = {};
        this.sales = [];
        this.incomes = [];
        this.airdrops = [];
        this.warnings = [];
    }

    _getStack(asset) {
        if (!this.lots[asset]) this.lots[asset] = [];
        return this.lots[asset];
    }

    addIN(asset, amount, precio_unitario, date) {
        if (amount <= 0) return;
        this._getStack(asset).push({
            amount,
            precio_adquisicion_unitario_eur: precio_unitario,
            date
        });
    }

    addOUT(asset, amount, priceEur, date, opLabel, feeEur = 0) {
        amount = Math.abs(amount);
        const stack = this._getStack(asset);
        let remaining = amount;

        while (remaining > 1e-12 && stack.length > 0) {
            const lot = stack[0];
            const taken = Math.min(lot.amount, remaining);
            const valAdq = taken * lot.precio_adquisicion_unitario_eur;
            const feeShare = amount > 1e-12 ? (taken / amount) * feeEur : 0;
            const valTrans = (taken * priceEur) - feeShare;
            this.sales.push({
                asset, op: opLabel,
                dateAdq: lot.date, dateTrans: date,
                valAdq, valTrans,
                profit: valTrans - valAdq
            });
            lot.amount -= taken;
            remaining -= taken;
            if (lot.amount < 1e-12) stack.shift();
        }

        if (remaining > 1e-10) {
            const saleDate = new Date(date).toLocaleDateString('es-ES');
            this.warnings.push(`${asset}: vendidos ${remaining.toFixed(8)} el ${saleDate} sin compra registrada.`);
            const valTrans = (remaining * priceEur) - feeEur;
            this.sales.push({
                asset, op: opLabel + ' (FALTA COMPRA)',
                dateAdq: '—', dateTrans: date,
                valAdq: 0, valTrans,
                profit: valTrans
            });
        }
    }

    addCONVERT(assetOut, amountOut, assetIn, amountIn, priceOutEur, priceInEur, date, feeEur = 0) {
        const totalValTransBruto = Math.abs(amountIn) * priceInEur;
        const totalValTransNeto = totalValTransBruto - feeEur;
        const effectiveOutPrice = Math.abs(amountOut) > 0 ? (totalValTransNeto + feeEur) / Math.abs(amountOut) : priceOutEur;

        this.addOUT(assetOut, Math.abs(amountOut), effectiveOutPrice, date, 'Permuta (Convert)', feeEur);
        this.addIN(assetIn, Math.abs(amountIn), priceInEur, date);
    }

    addINCOME(asset, amount, priceEur, date, opLabel) {
        amount = Math.abs(amount);
        const value = amount * priceEur;
        this.incomes.push({ asset, op: opLabel, date, amount, priceEur, value });
        this.addIN(asset, amount, priceEur, date);
    }

    addAIRDROP(asset, amount, priceEur, date, opLabel) {
        amount = Math.abs(amount);
        const value = amount * priceEur;
        this.airdrops.push({ asset, op: opLabel, date, amount, priceEur, value });
        this.addIN(asset, amount, priceEur, date);
    }

    addPNL(asset, amount, priceEur, date, opLabel) {
        const value = amount * priceEur;
        this.sales.push({
            asset, op: opLabel,
            dateAdq: date, dateTrans: date,
            valAdq: value < 0 ? Math.abs(value) : 0,
            valTrans: value > 0 ? value : 0,
            profit: value
        });
    }

    getInventorySummary() {
        const summary = [];
        for (const [asset, stack] of Object.entries(this.lots)) {
            let totalAmount = 0;
            let totalValueEur = 0;
            stack.forEach(lot => {
                totalAmount += lot.amount;
                totalValueEur += lot.amount * (lot.precio_adquisicion_unitario_eur || 0);
            });
            if (totalAmount > 1e-10) {
                summary.push({
                    asset,
                    totalAmount,
                    totalValueEur,
                    avgPrice: totalValueEur / totalAmount
                });
            }
        }
        return summary.sort((a, b) => b.totalValueEur - a.totalValueEur);
    }

    getSummary(year) {
        const yr = parseInt(year);
        const filteredSales = this.sales.filter(s => {
            if (s.dateTrans === '—') return false;
            return new Date(s.dateTrans).getFullYear() === yr;
        });
        const filteredIncome = this.incomes.filter(i => new Date(i.date).getFullYear() === yr);
        const filteredAirdrop = this.airdrops.filter(i => new Date(i.date).getFullYear() === yr);

        const grouped = {};
        filteredSales.forEach(s => {
            const day = s.dateTrans.slice(0, 10);
            const baseOp = s.op.replace(' (FALTA COMPRA)', '');
            const key = `${s.asset}_${baseOp}_${day}`;

            if (!grouped[key]) {
                grouped[key] = { ...s, op: baseOp };
            } else {
                const g = grouped[key];
                g.valAdq += s.valAdq;
                g.valTrans += s.valTrans;
                g.profit += s.profit;
                if (s.dateAdq !== '—' && (g.dateAdq === '—' || new Date(s.dateAdq) < new Date(g.dateAdq))) {
                    g.dateAdq = s.dateAdq;
                }
            }
        });
        const consolidatedSales = Object.values(grouped).sort((a, b) => new Date(a.dateTrans) - new Date(b.dateTrans));

        return {
            profit: filteredSales.reduce((a, b) => a + b.profit, 0),
            sales: filteredSales.reduce((a, b) => a + b.valTrans, 0),
            cost: filteredSales.reduce((a, b) => a + b.valAdq, 0),
            income: filteredIncome.reduce((a, b) => a + b.value, 0),
            airdropTotal: filteredAirdrop.reduce((a, b) => a + b.value, 0),
            details: consolidatedSales,
            incomeDetails: filteredIncome,
            airdropDetails: filteredAirdrop
        };
    }
}
