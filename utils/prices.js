/**
 * Price Service with caching and rate limiting - Global Namespace
 */
window.PriceService = {
    delay: ms => new Promise(res => setTimeout(res, ms)),
    priceCache: {},
    firstPriceCache: {},
    firstListingTimestamp: {},
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
        if (this.priceCache[key] !== undefined && this.priceCache[key] !== 0) return this.priceCache[key];

        const d = new Date(dateStr);
        const txTimestamp = d.getTime();

        // Si ya conocemos la fecha del primer listado de esta moneda,
        // y la fecha de esta transacción es anterior al listado, sabemos que es un airdrop pre-listado.
        // Evitamos hacer llamadas históricas inútiles y devolvemos directamente el precio de listado.
        if (this.firstListingTimestamp[assetUp] !== undefined && this.firstListingTimestamp[assetUp] !== 0 && txTimestamp < this.firstListingTimestamp[assetUp]) {
            const firstAvailable = this.firstPriceCache[assetUp] || 0;
            if (firstAvailable > 0) {
                this.priceCache[key] = firstAvailable;
                return firstAvailable;
            }
        }

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
            if (price !== null && price > 0) {
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
                        if (closePrice > 0) {
                            this.priceCache[key] = closePrice;
                            this.persistCache();
                            return closePrice;
                        }
                    }
                }
            } catch (e2) { }

            // Intentar obtener el primer precio histórico disponible como fallback
            const firstAvailable = await this.getFirstAvailablePriceEur(asset, engine);
            if (firstAvailable > 0) {
                this.priceCache[key] = firstAvailable;
                this.persistCache();
                return firstAvailable;
            }

            if (engine && !engine.apiWarned) {
                engine.warnings.push(`Problemas obteniendo precios (API / delistado). Algunos valores marcan 0 €. Revisa los símbolos ⚠️.`);
                engine.apiWarned = true;
            }
            this.priceCache[key] = 0;
            return 0;
        }
    },

    async getFirstAvailablePriceEur(asset, engine) {
        const assetUp = asset.toUpperCase();
        if (assetUp === 'EUR' || assetUp === 'USDE') return 1;
        if (['USDT', 'BUSD', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'USDP'].includes(assetUp)) {
            return 1;
        }
        if (this.firstPriceCache[assetUp] !== undefined) {
            return this.firstPriceCache[assetUp];
        }

        // 1. Intentar consultar CryptoCompare para obtener el historial (incluye DEX / Uniswap / CEX)
        try {
            const url = `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${assetUp}&tsym=EUR&limit=2000`;
            const res = await fetch(url);
            await this.delay(150);
            if (res.ok) {
                const json = await res.json();
                if (json.Response === 'Success' && json.Data && json.Data.Data && json.Data.Data.length > 0) {
                    for (const item of json.Data.Data) {
                        const closePrice = parseFloat(item.close);
                        if (closePrice > 0) {
                            this.firstListingTimestamp[assetUp] = item.time * 1000;
                            this.firstPriceCache[assetUp] = closePrice;
                            return closePrice;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`Error obteniendo primer precio en CryptoCompare para ${assetUp}`, e);
        }

        // 2. Intentar consultar Binance klines a partir de startTime = 0 (primeras velas registradas)
        try {
            let symbol = `${assetUp}EUR`;
            await this.loadBinanceSymbols();
            if (this.binanceHasSymbol(symbol)) {
                const bRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=0&limit=10`);
                await this.delay(150);
                if (bRes.ok) {
                    const bJson = await bRes.json();
                    if (bJson && bJson.length > 0) {
                        for (const candle of bJson) {
                            const closePrice = parseFloat(candle[4]);
                            if (closePrice > 0) {
                                this.firstListingTimestamp[assetUp] = candle[0];
                                this.firstPriceCache[assetUp] = closePrice;
                                return closePrice;
                            }
                        }
                    }
                }
            }

            let usdtSymbol = `${assetUp}USDT`;
            if (this.binanceHasSymbol(usdtSymbol)) {
                const bRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${usdtSymbol}&interval=1d&startTime=0&limit=10`);
                await this.delay(150);
                if (bRes.ok) {
                    const bJson = await bRes.json();
                    if (bJson && bJson.length > 0) {
                        for (const candle of bJson) {
                            const closePriceInUsdt = parseFloat(candle[4]);
                            if (closePriceInUsdt > 0) {
                                const firstTsMs = candle[0];
                                const usdtEur = await this.getUsdtEur(new Date(firstTsMs).toISOString(), engine);
                                const finalPrice = closePriceInUsdt * (usdtEur || 1);
                                this.firstListingTimestamp[assetUp] = firstTsMs;
                                this.firstPriceCache[assetUp] = finalPrice;
                                return finalPrice;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.warn(`Error obteniendo primer precio en Binance para ${assetUp}`, e);
        }

        this.firstListingTimestamp[assetUp] = 0;
        this.firstPriceCache[assetUp] = 0;
        return 0;
    },

    async getUsdtEur(dateStr, engine) {
        return await this.getPriceEur('USDT', dateStr, engine);
    }
};
