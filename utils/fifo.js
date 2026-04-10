/**
 * FIFO Calculation Engine for Spanish Taxes
 */

export class TaxEngine {
    constructor() {
        this.inventory = {}; // Asset stacks: { BTC: [{amount, price, date}, ...], ... }
        this.results = [];
        this.totalIncome = 0;
    }

    /**
     * Process a single transaction
     * @param {Object} tx { asset, amount, type, date, priceEur }
     */
    processTransaction(tx) {
        const { asset, amount, type, date, priceEur } = tx;

        if (!this.inventory[asset]) this.inventory[asset] = [];

        if (type === 'IN') {
            // Add to FIFO stack
            this.inventory[asset].push({
                amount: Math.abs(amount),
                price: priceEur,
                date: date
            });
        } 
        else if (type === 'OUT') {
            this.calculateFifo(asset, Math.abs(amount), priceEur, date);
        }
        else if (type === 'INCOME') {
            this.totalIncome += (Math.abs(amount) * priceEur);
            // Income also adds to inventory with the price at that moment as acquisition cost
            this.inventory[asset].push({
                amount: Math.abs(amount),
                price: priceEur,
                date: date
            });
        }
        else if (type === 'PNL') {
            // Direct gain/loss (e.g. Bitmex)
            this.results.push({
                asset,
                dateAdq: date,
                dateTrans: date,
                valAdq: 0,
                valTrans: amount * priceEur,
                profit: amount * priceEur
            });
        }
    }

    calculateFifo(asset, amountToSell, sellPrice, sellDate) {
        let remainingToSell = amountToSell;
        const stack = this.inventory[asset];

        while (remainingToSell > 0 && stack && stack.length > 0) {
            const oldest = stack[0];
            const amountTaken = Math.min(oldest.amount, remainingToSell);

            const valAdq = amountTaken * oldest.price;
            const valTrans = amountTaken * sellPrice;
            const profit = valTrans - valAdq;

            this.results.push({
                asset,
                dateAdq: oldest.date,
                dateTrans: sellDate,
                valAdq: valAdq,
                valTrans: valTrans,
                profit: profit
            });

            oldest.amount -= amountTaken;
            remainingToSell -= amountTaken;

            if (oldest.amount <= 0.00000001) { // Floating point safety
                stack.shift();
            }
        }

        // If remainingToSell > 0, it means we sold more than we had in the records
        // For Spanish taxes, this is usually a missing purchase or an error in CSVs
        if (remainingToSell > 0.00000001) {
            this.results.push({
                asset: asset + " (FALTA COMPRA)",
                dateAdq: "Desconocida",
                dateTrans: sellDate,
                valAdq: 0,
                valTrans: remainingToSell * sellPrice,
                profit: remainingToSell * sellPrice
            });
        }
    }

    getSummary(year) {
        const filtered = this.results.filter(r => {
            if (r.dateTrans === "Desconocida") return false;
            const d = new Date(r.dateTrans);
            return d.getFullYear() === parseInt(year);
        });

        const profit = filtered.reduce((acc, curr) => acc + curr.profit, 0);
        const sales = filtered.reduce((acc, curr) => acc + curr.valTrans, 0);

        return {
            profit,
            sales,
            income: this.totalIncome, // For simplicity, all-time income or filtered by year? 
            // In a real app we would filter income by year too
            details: filtered
        };
    }
}

/**
 * Basic Price Service using CryptoCompare
 */
export async function getPriceAtDate(asset, date) {
    try {
        const ts = Math.floor(new Date(date).getTime() / 1000);
        const url = `https://min-api.cryptocompare.com/data/pricehistorical?fsym=${asset}&tsyms=EUR&ts=${ts}`;
        const response = await fetch(url);
        const data = await response.json();
        return data[asset] ? data[asset].EUR : 0;
    } catch (e) {
        console.error("Error fetching price", e);
        return 0;
    }
}
