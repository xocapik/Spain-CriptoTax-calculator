/**
 * Test logic - No ES Modules (CORS Safe)
 */
const resultsContainer = document.getElementById('test-results');

function renderTestGroup(title, results) {
    const allPass = results.every(r => r.pass);
    const groupDiv = document.createElement('div');
    groupDiv.className = 'test-card';
    groupDiv.innerHTML = `
        <div class="test-header">
            <h3>${title}</h3>
            <span class="status-pill ${allPass ? 'status-pass' : 'status-fail'}">${allPass ? 'Pass' : 'Fail'}</span>
        </div>
        <ul>
            ${results.map(r => `
                <li>
                    <span class="result-msg">${r.name}</span>
                    <span class="result-icon" style="color: ${r.pass ? 'var(--success)' : 'var(--danger)'}">${r.pass ? '✓' : '✗'}</span>
                </li>
                ${!r.pass ? `<li><pre>${r.error}</pre></li>` : ''}
            `).join('')}
        </ul>
    `;
    resultsContainer.appendChild(groupDiv);
}

const suite = {
    async runEngineTests() {
        const results = [];
        
        // Test 1: Simple Buy/Sell
        try {
            const engine = new FifoEngine();
            engine.addIN('BTC', 1, 10000, '2025-01-01');
            engine.addOUT('BTC', 1, 15000, '2025-01-02', 'Venta simple');
            const summary = engine.getSummary(2025);
            if (summary.profit !== 5000) throw new Error(`Profit esperado 5000, obtenido ${summary.profit}`);
            results.push({ name: "Cálculo básico Compra/Venta", pass: true });
        } catch (e) { results.push({ name: "Cálculo básico Compra/Venta", pass: false, error: e.message }); }

        // Test 2: FIFO Logic (Oldest first)
        try {
            const engine = new FifoEngine();
            engine.addIN('BTC', 1, 10000, '2024-01-01'); // Adq 1
            engine.addIN('BTC', 1, 20000, '2024-02-01'); // Adq 2
            engine.addOUT('BTC', 1, 25000, '2025-01-01', 'Venta FIFO'); // Debería vender la de 10k
            const summary = engine.getSummary(2025);
            if (summary.profit !== 15000) throw new Error(`Profit esperado 15000, obtenido ${summary.profit}`);
            if (summary.details[0].valAdq !== 10000) throw new Error(`Val Adq esperado 10000, obtenido ${summary.details[0].valAdq}`);
            results.push({ name: "Lógica FIFO (vender lo más antiguo primero)", pass: true });
        } catch (e) { results.push({ name: "Lógica FIFO", pass: false, error: e.message }); }

        // Test 3: Income / Staking
        try {
            const engine = new FifoEngine();
            engine.addINCOME('ETH', 0.5, 2000, '2025-03-01', 'Staking Reward');
            const summary = engine.getSummary(2025);
            if (summary.income !== 1000) throw new Error(`Rendimiento esperado 1000, obtenido ${summary.income}`);
            // Check inventory
            const inv = engine.getInventorySummary();
            if (inv[0].totalAmount !== 0.5) throw new Error(`Inventario esperado 0.5, obtenido ${inv[0].totalAmount}`);
            results.push({ name: "Rendimientos (Staking/Earn) e inventario", pass: true });
        } catch (e) { results.push({ name: "Rendimientos", pass: false, error: e.message }); }

        // Test 4: Missing purchase warning
        try {
            const engine = new FifoEngine();
            engine.addOUT('SOL', 10, 100, '2025-01-01', 'Venta sin compra');
            if (engine.warnings.length === 0) throw new Error("Debería haber generado una advertencia de falta de compra");
            results.push({ name: "Detección de falta de compra (FALTA COMPRA)", pass: true });
        } catch (e) { results.push({ name: "Detección falta compra", pass: false, error: e.message }); }

        renderTestGroup("Motor FIFO (Engine)", results);
    },

    async runParserTests() {
        const results = [];

        // Test 1: Binance Categorization
        try {
            if (TaxParsers.classifyBinance('Venta') !== 'OUT') throw new Error("Venta debería ser OUT");
            if (TaxParsers.classifyBinance('Simple Earn Flexible Interest') !== 'INCOME') throw new Error("Interest debería ser INCOME");
            if (TaxParsers.classifyBinance('Staking Rewards') !== 'INCOME') throw new Error("Staking should be INCOME");
            if (TaxParsers.classifyBinance('Deposit') !== 'NEUTRAL') throw new Error("Deposit should be NEUTRAL");
            results.push({ name: "Categorización automática de operaciones Binance", pass: true });
        } catch (e) { results.push({ name: "Categorización Binance", pass: false, error: e.message }); }

        // Test 2: Binance CSV Parsing
        try {
            const mockRows = [
                { 'UTC_Time': '2025-01-01 10:00:00', 'Operation': 'Buy', 'Coin': 'BTC', 'Change': '0.5' },
                { 'UTC_Time': '2025-01-01 10:05:00', 'Operation': 'Sell', 'Coin': 'BTC', 'Change': '-0.2' }
            ];
            const parsed = TaxParsers.parseBinance(mockRows);
            if (parsed.length !== 2) throw new Error(`Esperados 2 filas, obtenidas ${parsed.length}`);
            if (parsed[0].asset !== 'BTC' || parsed[0].amount !== 0.5) throw new Error("Datos de parseo incorrectos");
            results.push({ name: "Parsing de estructura CSV Binance", pass: true });
        } catch (e) { results.push({ name: "Parsing Binance", pass: false, error: e.message }); }

        // Test 3: English CSV Headers Parsing
        try {
            const mockEnglishRows = [
                { 'User ID': '12345', 'Time': '25-01-01 07:46:58', 'Account': 'Spot', 'Operation': 'Buy', 'Coin': 'BTC', 'Change': '0.5', 'Remark': 'test' }
            ];
            const parsed = TaxParsers.parseBinance(mockEnglishRows);
            if (parsed.length !== 1) throw new Error(`Esperados 1 fila, obtenidas ${parsed.length}`);
            if (parsed[0].asset !== 'BTC' || parsed[0].amount !== 0.5 || parsed[0].uid !== '12345' || parsed[0].remark !== 'test') {
                throw new Error("Datos de parseo incorrectos para cabeceras en inglés");
            }
            const parsedDate = TaxParsers.parseDate(parsed[0].ts);
            if (!parsedDate || parsedDate.getFullYear() !== 2025 || parsedDate.getMonth() !== 0 || parsedDate.getDate() !== 1) {
                throw new Error(`Fecha incorrecta parseada: ${parsed[0].ts} -> ${parsedDate}`);
            }
            results.push({ name: "Parsing de estructura CSV Binance con cabeceras en inglés (Time, User ID)", pass: true });
        } catch (e) { results.push({ name: "Parsing Binance cabeceras en inglés", pass: false, error: e.message }); }

        renderTestGroup("Parsers e Interpretación de Datos", results);
    },

    async runIntegrationTests() {
        const results = [];
        try {
            const engine = new FifoEngine();
            // Scenario: Buy 1 BTC at 10k, then interest of 0.1 BTC at 12k, then sell 0.5 BTC at 15k
            engine.addIN('BTC', 1, 10000, '2024-12-31');
            engine.addINCOME('BTC', 0.1, 12000, '2025-01-15', 'Monthly Yield');
            engine.addOUT('BTC', 0.5, 15000, '2025-02-01', 'Partial Sell');
            
            const summary = engine.getSummary(2025);
            // Profit: 0.5 * (15000 - 10000) = 2500
            // Income: 0.1 * 12000 = 1200
            if (summary.profit !== 2500) throw new Error(`Profit esperado 2500, obtenido ${summary.profit}`);
            if (summary.income !== 1200) throw new Error(`Income esperado 1200, obtenido ${summary.income}`);
            
            const inv = engine.getInventorySummary();
            // Remaining: 0.5 BTC from original (cost 10k) + 0.1 BTC from income (cost 12k) = 0.6 BTC
            const btcInv = inv.find(i => i.asset === 'BTC');
            if (Math.abs(btcInv.totalAmount - 0.6) > 0.00000001) throw new Error(`Inventario final esperado 0.6, obtenido ${btcInv.totalAmount}`);
            
            results.push({ name: "Escenario de integración completo (Compra + Rendimiento + Venta Parcial)", pass: true });
        } catch (e) { results.push({ name: "Integración", pass: false, error: e.message }); }

        renderTestGroup("Pruebas de Integración (End-to-End Logic)", results);
    },

    async runComplexScenarios() {
        const results = [];

        // Test 1: Binance Dust (Small assets exchange BNB) basado en CSV Real
        try {
            const engine = new FifoEngine();
            // Pre-cargamos inventario para que no haya avisos de "FALTA COMPRA"
            engine.addIN('HEMI', 1, 0.5, '2025-01-01');
            engine.addIN('0G', 1, 1, '2025-01-01');
            engine.addIN('BARD', 1, 0.2, '2025-01-01');
            engine.addIN('LAYER', 1, 2, '2025-01-01');

            const csvData = `User_ID,UTC_Time,Account,Operation,Coin,Change,Remark
12513882,25-09-25 10:10:23,Spot,Small Assets Exchange BNB,BNB,0.00001692,HEMI to BNB
12513882,25-09-25 10:10:23,Spot,Small Assets Exchange BNB,BNB,0.00001346,0G to BNB
12513882,25-09-25 10:10:23,Spot,Small Assets Exchange BNB,0G,-0.00342833,0G to BNB
12513882,25-09-25 10:10:23,Spot,Small Assets Exchange BNB,BARD,-0.01143156,BARD to BNB
12513882,25-09-25 10:10:23,Spot,Small Assets Exchange BNB,BNB,0.00001176,BARD to BNB
12513882,25-09-25 10:10:23,Spot,Small Assets Exchange BNB,BNB,0.00000293,LAYER to BNB
12513882,25-09-25 10:10:23,Spot,Small Assets Exchange BNB,HEMI,-0.11392332,HEMI to BNB
12513882,25-09-25 10:10:23,Spot,Small Assets Exchange BNB,LAYER,-0.00686507,LAYER to BNB`;

            const parsedRows = Papa.parse(csvData, { header: true }).data;
            const binanceRows = TaxParsers.parseBinance(parsedRows);
            let processedRows = binanceRows.map(r => ({
                ts: TaxParsers.parseDate(r.ts),
                asset: r.asset,
                amount: r.amount,
                op: r.op,
                cat: TaxParsers.classifyBinance(r.op),
                uid: r.uid,
                remark: r.remark,
                source: 'binance'
            }));

            // Aplicamos la lógica de consolidación global (la misma que usa app.js)
            processedRows = TaxParsers.consolidateTrades(processedRows);

            // Verificamos que se hayan consolidado en 4 parejas (por remark)
            if (processedRows.length !== 4) throw new Error(`Se esperaban 4 trades consolidados, se obtuvieron ${processedRows.length}`);

            for (const tx of processedRows) {
                const price = 500; // Mock BNB price
                const pOut = 1; // Mock dust prices
                engine.addCONVERT(tx.outAsset, -tx.outAmount, tx.inAsset, tx.inAmount, pOut, price, tx.ts.toISOString(), 0);
            }

            const inv = engine.getInventorySummary();
            const bnb = inv.find(i => i.asset === 'BNB');
            if (Math.abs(bnb.totalAmount - (0.00001692+0.00001346+0.00001176+0.00000293)) > 1e-12) {
                throw new Error(`BNB total incorrecto: ${bnb.totalAmount}`);
            }
            results.push({ name: "Binance Dust: Parseo de CSV real y consolidación por Remark", pass: true });
        } catch (e) { results.push({ name: "Binance Dust", pass: false, error: e.message }); }

        // Test 2: Compra BTC con USDT/USDC + Fee en BNB (Precios dinámicos)
        /* 
           ESCENARIO CORRECTO (AEAT):
           1. Compra 60.000 USDC a 1,00 EUR (Coste 60.000 €)
           2. Compra 0,1 BNB a 300 EUR (Coste 30 €)
           3. Swap 60.000 USDC por 1 BTC.
              - Precio BTC mercado: 61.200 €
              - Precio USDC mercado: 1,02 € (V. Bruto = 61.200 €)
              - Fee: 0,01 BNB (valor a 400 €/BNB = 4 €)
           
           CÁLCULO FISCAL:
           - Venta USDC:
             V. Transmisión Bruto: 60.000 * 1,02 = 61.200 €
             Gasto (Fee): 4 €
             V. Transmisión Neto: 61.200 - 4 = 61.196 €
             V. Adquisición: 60.000 €
             ➡️ Ganancia USDC: 1.196 €
           
           - Pago del Fee (BNB):
             V. Transmisión: 0,01 * 400 = 4 €
             V. Adquisición: 0,01 * 300 = 3 €
             ➡️ Ganancia BNB: + 1 €
           
           - Entrada BTC:
             Coste de Adquisición = Precio mercado bruto de lo entregado = 61.200 €
        */
        try {
            const engine = new FifoEngine();
            // 1. Inventario inicial
            engine.addIN('USDC', 60000, 1.00, '2025-01-01');
            engine.addIN('BNB', 0.1, 300, '2025-01-01');

            // 2. Permuta
            const priceUsdcNow = 1.02;
            const priceBnbNow = 400;
            const feeAmountBnb = 0.01;
            const feeValEur = feeAmountBnb * priceBnbNow; // 4€
            
            // BTC entra por el valor de mercado bruto (61200)
            engine.addCONVERT('USDC', 60000, 'BTC', 1, priceUsdcNow, 61200, '2025-02-01', feeValEur);
            // El fee en BNB sale a precio de mercado
            engine.addOUT('BNB', feeAmountBnb, priceBnbNow, '2025-02-01', 'Fee en BNB para permuta BTC/USDC');

            const summary = engine.getSummary(2025);
            
            // Verificación Ganancia USDC: 61196 (neto) - 60000 = 1196
            const usdcTrade = summary.details.find(d => d.asset === 'USDC');
            if (usdcTrade.profit !== 1196) throw new Error(`Ganancia USDC esperada 1196, obtenida ${usdcTrade.profit}`);

            // Verificación Ganancia BNB (fee): 4 - 3 = 1
            const bnbTrade = summary.details.find(d => d.asset === 'BNB');
            if (Math.abs(bnbTrade.profit - 1) > 0.00001) throw new Error(`Ganancia BNB esperada 1, obtenida ${bnbTrade.profit}`);

            // Verificación Coste BTC
            const inv = engine.getInventorySummary();
            const btc = inv.find(i => i.asset === 'BTC');
            if (btc.totalValueEur !== 61200) throw new Error(`Coste BTC esperado 61200, obtenido ${btc.totalValueEur}`);

            results.push({ name: "Compra BTC con USDC + Fee BNB (Cálculo fiscal AEAT exacto)", pass: true });
        } catch (e) { results.push({ name: "Compra Compleja BTC/USDC/BNB", pass: false, error: e.message }); }

        // Test 3: Fallback de precio de listado para Airdrop pre-listado
        try {
            // ARB no existía en 2020. Buscamos precio para 2020-01-01.
            // Debería fallar el precio histórico (que sería 0) y devolver el primer precio de listado disponible (> 0).
            const price = await PriceService.getPriceEur('ARB', '2020-01-01T12:00:00.000Z', null);
            if (price <= 0) {
                throw new Error(`Precio de ARB para 2020 obtenido como ${price}, se esperaba un valor mayor a 0 (precio de listado)`);
            }
            results.push({ name: `Búsqueda de primer precio de listado (Airdrop Fallback): ARB en 2020 -> ${price.toFixed(4)} €`, pass: true });
        } catch (e) {
            results.push({ name: "Búsqueda de primer precio de listado (Airdrop Fallback)", pass: false, error: e.message });
        }

        renderTestGroup("Escenarios Complejos (Binance / Permutas)", results);
        this.runSecurityTests();
    },

    runSecurityTests() {
        const results = [];
        try {
            const input = '<script>alert("XSS")</script> & "Quotes"';
            const expected = '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &quot;Quotes&quot;';
            const escaped = TaxSecurity.esc(input);
            if (escaped !== expected) throw new Error(`Escaped: ${escaped} != Expected: ${expected}`);
            results.push({ name: "Escapado de caracteres HTML (XSS Prevention)", pass: true });
        } catch (e) { results.push({ name: "Sanitización", pass: false, error: e.message }); }

        renderTestGroup("Seguridad (XSS Prevention)", results);
    }
};

resultsContainer.innerHTML = '';
suite.runEngineTests();
suite.runParserTests();
suite.runIntegrationTests();
suite.runComplexScenarios();
