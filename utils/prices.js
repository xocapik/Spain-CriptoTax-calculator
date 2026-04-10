/**
 * Price Service with caching and rate limiting - Global Namespace
 */
window.PriceService = {
    delay: ms => new Promise(res => setTimeout(res, ms)),
    priceCache: {},
    binanceSymbols: null,

    async initCache() {
        try {
            const saved = await localforage.getItem('cryptoTaxPriceCache');
            if (saved) this.priceCache = saved;
        } catch (e) {
            console.warn("Error cargando IndexedDB", e);
        }
    },

    persistCache() {
        localforage.setItem('cryptoTaxPriceCache', this.priceCache).catch(e => console.warn(e));
    },

    getInternalCache() {
        return this.priceCache;
    },

    setInternalCache(newCache) {
        Object.assign(this.priceCache, newCache);
    },

    async loadBinanceSymbols() {
        if (this.binanceSymbols !== null) return;
        try {
            const cached = await localforage.getItem('binanceSymbolsCache');
            if (cached) {
                const { ts, symbols } = cached;
                if (Date.now() - ts < 24 * 60 * 60 * 1000) {
                    this.binanceSymbols = new Set(symbols);
                    return;
                }
            }
        } catch (e) { }

        try {
            const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
            if (!res.ok) { this.binanceSymbols = new Set(); return; }
            const json = await res.json();
            const syms = (json.symbols || []).map(s => s.symbol);
            this.binanceSymbols = new Set(syms);
            localforage.setItem('binanceSymbolsCache', { ts: Date.now(), symbols: syms });
        } catch (e) {
            this.binanceSymbols = new Set();
        }
    },

    binanceHasSymbol(symbol) {
        return this.binanceSymbols && this.binanceSymbols.has(symbol);
    },

    async prefetchAllPrices(uniqueAssets, minMs, maxMs, progressCb) {
        const dayMs = 24 * 60 * 60 * 1000;
        const maxLimit = 1000;
        const globalStart = Math.floor(minMs / dayMs) * dayMs;
        const globalEnd = Math.ceil(maxMs / dayMs) * dayMs;

        if (progressCb) progressCb('Pre-fetch: cargando catálogo de pares Binance...');
        await this.loadBinanceSymbols();

        for (let asset of uniqueAssets) {
            if (!asset) continue;
            let assetUp = asset.toUpperCase();
            if (assetUp === 'EUR' || assetUp === 'EURI' || assetUp === 'USDE') continue;
            if (assetUp === 'XBT') assetUp = 'BTC';
            if (['BUSD', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'USDP'].includes(assetUp)) assetUp = 'USDT';

            let symbol = `${assetUp}EUR`;
            let invertPrice = false;
            if (assetUp === 'USDT') {
                symbol = 'EURUSDT';
                invertPrice = true;
            }

            if (!this.binanceHasSymbol(symbol)) continue;

            if (progressCb) progressCb(`Pre-fetch: historial de ${assetUp}...`);

            let currentStart = globalStart;

            while (currentStart <= globalEnd) {
                let currentEnd = currentStart + ((maxLimit - 1) * dayMs);
                if (currentEnd > globalEnd) currentEnd = globalEnd;

                try {
                    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${currentStart}&endTime=${currentEnd}&limit=${maxLimit}`;
                    const res = await fetch(url);
                    await this.delay(150); 
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.length > 0) {
                            for (const candle of data) {
                                const t = candle[0];
                                let closePrice = parseFloat(candle[4]);
                                if (invertPrice && closePrice !== 0) closePrice = 1 / closePrice;

                                const dateStr = new Date(t).toISOString().slice(0, 10);
                                this.priceCache[`${assetUp}_${dateStr}`] = closePrice;
                            }
                        }
                    } else {
                        break;
                    }
                } catch (e) {
                    break;
                }
                currentStart = currentEnd + dayMs;
            }
        }
        this.persistCache();
    },

    async getPriceEur(asset, dateStr, engine) {
        const assetUp = asset.toUpperCase();
        if (assetUp === 'EUR' || assetUp === 'USDE') return 1;
        if (assetUp === 'XBT') return await this.getPriceEur('BTC', dateStr, engine);
        if (['BUSD', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'USDP'].includes(assetUp)) {
            return await this.getPriceEur('USDT', dateStr, engine);
        }
        const day = dateStr.slice(0, 10);
        const key = `${assetUp}_${day}`;
        if (this.priceCache[key] !== undefined) return this.priceCache[key];

        const d = new Date(dateStr);
        const ts = Math.floor(d.getTime() / 1000);
        const ts_ms = d.setUTCHours(0, 0, 0, 0);

        try {
            const url = `https://min-api.cryptocompare.com/data/pricehistorical?fsym=${assetUp}&tsyms=EUR&ts=${ts}`;
            const res = await fetch(url);
            await this.delay(150); 
            const json = await res.json();

            if (json.Response === 'Error') {
                throw new Error('CryptoCompare Error: ' + json.Message);
            }

            const price = (json[assetUp] && json[assetUp].EUR) ? json[assetUp].EUR : null;
            if (price !== null) {
                this.priceCache[key] = price;
                this.persistCache();
                return price;
            }
            throw new Error('Price not found in CryptoCompare');
        } catch (err) {
            try {
                let symbol = `${assetUp}EUR`;
                let invertPrice = false;
                if (assetUp === 'USDT') {
                    symbol = 'EURUSDT';
                    invertPrice = true;
                }
                await this.loadBinanceSymbols();
                if (this.binanceHasSymbol(symbol)) {
                    const bRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${ts_ms}&limit=1`);
                    await this.delay(150);
                    const bJson = await bRes.json();
                    if (bJson && bJson.length > 0) {
                        let closePrice = parseFloat(bJson[0][4]);
                        if (invertPrice && closePrice !== 0) closePrice = 1 / closePrice;
                        this.priceCache[key] = closePrice;
                        this.persistCache();
                        return closePrice;
                    }
                }
            } catch (e2) { }

            if (engine && !engine.apiWarned) {
                engine.warnings.push(`Problemas obteniendo precios (API / delistado). Algunos valores marcan 0 €. Revisa los símbolos ⚠️.`);
                engine.apiWarned = true;
            }
            this.priceCache[key] = 0;
            return 0;
        }
    },

    async getUsdtEur(dateStr, engine) {
        return await this.getPriceEur('USDT', dateStr, engine);
    }
};
