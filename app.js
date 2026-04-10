/**
 * Main Application logic - No ES Modules (CORS Safe)
 */
const UMBRAL_RENTA = 10;

// Initialize Cache
PriceService.initCache();

// ═══════════════════════════════════════════════════════════════
// UI STATE & GLOBALS
// ═══════════════════════════════════════════════════════════════
let loadedFiles = [];
let currentEngine = null;
let currentSort = { col: 'dateTrans', asc: true };

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const processBtn = document.getElementById('process-btn');
const fileListEl = document.getElementById('file-list');
const progressWrap = document.getElementById('progress-wrap');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const warnBox = document.getElementById('warn-box');
const warnList = document.getElementById('warn-list');

if (dropzone) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
    dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('over'); handleFiles(e.dataTransfer.files); });
}
if (fileInput) fileInput.addEventListener('change', e => handleFiles(e.target.files));
if (document.getElementById('close-warn')) {
    document.getElementById('close-warn').addEventListener('click', () => warnBox.style.display = 'none');
}

function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (file.name.endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const loadedCache = JSON.parse(e.target.result);
                    PriceService.setInternalCache(loadedCache);
                    PriceService.persistCache();
                    addFilePill(file.name, 'cache', file.size);
                } catch (err) { alert('Error leyendo caché JSON'); }
            };
            reader.readAsText(file);
            return;
        }

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: result => {
                const source = TaxParsers.detectSource(result.data);
                loadedFiles.push({ name: file.name, source, rows: result.data });
                addFilePill(file.name, source, file.size);
                processBtn.disabled = false;
            }
        });
    });
}

function addFilePill(name, source, size) {
    const pill = document.createElement('div');
    pill.className = 'file-pill';
    let badgeClass = 'pill-unknown', badgeText = 'Desconocido';
    if (source === 'binance') { badgeClass = 'pill-binance'; badgeText = 'Binance'; }
    else if (source === 'bitmex') { badgeClass = 'pill-bitmex'; badgeText = 'Bitmex'; }
    else if (source === 'cache') { badgeClass = 'pill-unknown'; badgeText = 'Caché'; }
    pill.innerHTML = `<div class="name"><span class="pill-badge ${badgeClass}">${TaxSecurity.esc(badgeText)}</span><span>${TaxSecurity.esc(name)}</span></div><span class="size">${(size / 1024).toFixed(1)} KB</span>`;
    fileListEl.appendChild(pill);
}

// ═══════════════════════════════════════════════════════════════
// PROCESS
// ═══════════════════════════════════════════════════════════════
if (processBtn) {
    processBtn.addEventListener('click', async () => {
        processBtn.disabled = true;
        processBtn.textContent = 'Procesando…';
        progressWrap.style.display = 'block';

        let all = [];
        const engine = new FifoEngine();

        for (const f of loadedFiles) {
            if (f.source === 'binance') {
                const parsed = TaxParsers.parseBinance(f.rows);
                parsed.forEach(tx => {
                    const d = TaxParsers.parseDate(tx.ts);
                    if (d) {
                        all.push({
                            ts: d, asset: tx.asset, amount: tx.amount,
                            op: tx.op || '', cat: TaxParsers.classifyBinance(tx.op || ''),
                            source: 'binance', uid: tx.uid || 'single', remark: tx.remark || ''
                        });
                    } else { engine.warnings.push(`Fecha inválida omitida: "${tx.ts}"`); }
                });
            } else if (f.source === 'bitmex') {
                const parsed = TaxParsers.parseBitmex(f.rows);
                parsed.forEach(tx => {
                    const d = TaxParsers.parseDate(tx.ts);
                    if (d) {
                        all.push({
                            ts: d, asset: tx.asset, amount: tx.amount,
                            op: tx.op || '', cat: TaxParsers.classifyBitmex(tx.op || ''),
                            source: 'bitmex', uid: 'bitmex_user', remark: ''
                        });
                    } else { engine.warnings.push(`Fecha inválida omitida: "${tx.ts}"`); }
                });
            }
        }

        all.sort((a, b) => a.ts - b.ts);

        // Deduplication
        const uniqueRows = [];
        const seenAtoms = new Set();
        all.forEach(row => {
            const key = `${row.ts.getTime()}_${row.asset}_${row.amount}_${row.op}_${(row.remark || '').trim()}`;
            if (!seenAtoms.has(key)) {
                seenAtoms.add(key);
                uniqueRows.push(row);
            }
        });
        all = uniqueRows;

        // Trade Consolidation
        all = TaxParsers.consolidateTrades(all);

        try {
            if (all.length > 0) {
                const minMs = all[0].ts.getTime();
                const maxMs = all[all.length - 1].ts.getTime();
                const uniqueAssets = [...new Set(all.map(tx => tx.asset || tx.outAsset))];
                await PriceService.prefetchAllPrices(uniqueAssets, minMs, maxMs, (label) => {
                    progressLabel.textContent = label;
                });
            }

            let i = 0;
            while (i < all.length) {
                const tx = all[i++];
                progressFill.style.width = Math.round((i / all.length) * 100) + '%';
                progressLabel.textContent = `Procesando ${i}/${all.length} — ${tx.asset || tx.outAsset} ${tx.op}`;

                const dateStr = tx.ts.toISOString();
                const priceOf = async (asset, ts) => {
                    if (!asset) return 0;
                    const up = asset.toUpperCase();
                    if (up === 'EUR' || up === 'EURI') return 1;
                    if (['USDT', 'BUSD', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'USDP', 'USDE'].includes(up)) return await PriceService.getUsdtEur(ts.toISOString(), engine);
                    return await PriceService.getPriceEur(asset, ts.toISOString(), engine);
                };

                if (tx.atomic) {
                    const outPrice = await priceOf(tx.outAsset, tx.ts);
                    const inPrice = await priceOf(tx.inAsset, tx.ts);
                    const feePrice = tx.feeAsset ? await priceOf(tx.feeAsset, tx.ts) : 0;
                    engine.addCONVERT(tx.outAsset, -tx.outAmount, tx.inAsset, tx.inAmount, outPrice, inPrice, dateStr, tx.feeAmount * feePrice);
                    if (tx.feeAsset && tx.feeAmount > 0) engine.addOUT(tx.feeAsset, tx.feeAmount, feePrice, dateStr, 'Comisión de Permuta');
                } else {
                    const p = await priceOf(tx.asset, tx.ts);
                    if (tx.cat === 'OUT' || tx.cat === 'CONVERT') engine.addOUT(tx.asset, tx.amount, p, dateStr, tx.op);
                    else if (tx.cat === 'IN') engine.addIN(tx.asset, tx.amount, p, dateStr);
                    else if (tx.cat === 'INCOME') engine.addINCOME(tx.asset, tx.amount, p, dateStr, tx.op);
                    else if (tx.cat === 'AIRDROP' || tx.cat === 'REVENUE') engine.addAIRDROP(tx.asset, tx.amount, p, dateStr, tx.op);
                    else if (tx.cat === 'PNL') engine.addPNL(tx.asset, tx.amount, p, dateStr, tx.op);
                    else if (tx.cat === 'FEE') engine.addOUT(tx.asset, tx.amount, p, dateStr, tx.op);
                }
                if (i % 50 === 0) await PriceService.delay(0);
            }

            progressFill.style.width = '100%';
            progressLabel.textContent = 'Cálculo FIFO completado.';

            if (engine.warnings.length > 0) {
                warnBox.style.display = 'block';
                warnList.innerHTML = engine.warnings.map(w => `<li>${TaxSecurity.esc(w)}</li>`).join('');
            }

            currentEngine = engine;
            renderResults();

            processBtn.disabled = false;
            processBtn.textContent = 'Recalcular';
        } catch (err) {
            console.error(err);
            alert("Error fatal durante el procesamiento: " + err.message);
            processBtn.textContent = 'Error. Recarga la página';
        }
    });
}
// ═══════════════════════════════════════════════════════════════
// RENDER & SORTING
// ═══════════════════════════════════════════════════════════════
function fmt(n) { return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €'; }
function fmtDate(d) { return (!d || d === '—') ? '—' : new Date(d).toLocaleDateString('es-ES'); }

window.switchTab = function (tabId) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const pane = document.getElementById('pane-' + tabId);
    if (pane) pane.classList.add('active');

    document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.getAttribute('onclick')?.includes(tabId)) b.classList.add('active');
    });
};

document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (currentSort.col === col) {
            currentSort.asc = !currentSort.asc;
        } else {
            currentSort.col = col;
            currentSort.asc = true;
        }
        document.querySelectorAll('th[data-sort]').forEach(el => el.classList.remove('sort-asc', 'sort-desc'));
        th.classList.add(currentSort.asc ? 'sort-asc' : 'sort-desc');
        renderResults();
    });
});

function populateAssetFilter(engine) {
    const filter = document.getElementById('asset-filter');
    if (!filter) return;
    const assets = new Set();
    engine.sales.forEach(s => assets.add(s.asset));
    engine.incomes.forEach(i => assets.add(i.asset));
    engine.airdrops.forEach(a => assets.add(a.asset));
    Object.keys(engine.lots).forEach(a => assets.add(a));

    const currentVal = filter.value;
    filter.innerHTML = '<option value="ALL">Todos los activos</option>';
    [...assets].sort().forEach(a => {
        if (!a) return;
        const opt = document.createElement('option');
        opt.value = opt.innerText = a;
        filter.appendChild(opt);
    });
    filter.value = [...assets].includes(currentVal) ? currentVal : 'ALL';
    filter.onchange = () => renderResults();
}

function renderResults() {
    if (!currentEngine) return;
    const engine = currentEngine;
    const yearEl = document.getElementById('fiscal-year');
    const year = yearEl ? yearEl.value : '2025';
    const filterAssetEl = document.getElementById('asset-filter');
    const filterAsset = filterAssetEl ? filterAssetEl.value : 'ALL';
    const s = engine.getSummary(year);
    const inv = engine.getInventorySummary();

    populateAssetFilter(engine);
    document.getElementById('results-section').classList.remove('hidden');

    document.getElementById('stat-profit').textContent = fmt(s.profit);
    document.getElementById('stat-profit').className = 'stat-value ' + (s.profit > 0 ? 'positive' : s.profit < 0 ? 'negative' : 'neutral');
    document.getElementById('stat-profit-sub').textContent = s.profit > 0 ? 'A declarar en ganancias' : s.profit < 0 ? 'Pérdida computable' : '';
    document.getElementById('stat-sales').textContent = fmt(s.sales);
    document.getElementById('stat-cost').textContent = fmt(s.cost);
    document.getElementById('stat-income').textContent = fmt(s.income);
    document.getElementById('stat-airdrop').textContent = fmt(s.airdropTotal);

    const filterByAsset = (arr) => filterAsset === 'ALL' ? arr : arr.filter(item => item.asset === filterAsset);

    let details = filterByAsset(s.details);
    details.sort((a, b) => {
        let valA = a[currentSort.col];
        let valB = b[currentSort.col];
        if (currentSort.col.includes('date')) {
            valA = valA === '—' ? 0 : new Date(valA).getTime();
            valB = valB === '—' ? 0 : new Date(valB).getTime();
        }
        if (valA < valB) return currentSort.asc ? -1 : 1;
        if (valA > valB) return currentSort.asc ? 1 : -1;
        return 0;
    });

    const tbody = document.getElementById('tax-body');
    tbody.innerHTML = '';
    if (details.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No hay operaciones de ${filterAsset === 'ALL' ? '' : TaxSecurity.esc(filterAsset)} en ${year}</td></tr>`;
    } else {
        details.forEach(row => {
            const tr = document.createElement('tr');
            const adqStyle = row.valAdq === 0 ? 'zero-price' : '';
            tr.innerHTML = `
                <td><span class="asset-chip">${TaxSecurity.esc(row.asset)}</span></td>
                <td>${TaxSecurity.esc(row.op)}</td>
                <td>${TaxSecurity.esc(fmtDate(row.dateAdq))}</td>
                <td>${TaxSecurity.esc(fmtDate(row.dateTrans))}</td>
                <td class="${adqStyle}">${row.valAdq === 0 ? '⚠️ 0,00 €' : TaxSecurity.esc(fmt(row.valAdq))}</td>
                <td>${TaxSecurity.esc(fmt(row.valTrans))}</td>
                <td class="td-profit ${row.profit >= 0 ? 'positive' : 'negative'}">${TaxSecurity.esc(fmt(row.profit))}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Totales Renta (AEAT)
    const rawAgrupada = {};
    s.details.forEach(row => {
        if (!rawAgrupada[row.asset]) rawAgrupada[row.asset] = { adq: 0, trans: 0, profit: 0 };
        rawAgrupada[row.asset].adq += row.valAdq;
        rawAgrupada[row.asset].trans += row.valTrans;
        rawAgrupada[row.asset].profit += row.profit;
    });

    const finalAgrupada = {};
    const otros = { adq: 0, trans: 0, profit: 0 };
    let hasOtros = false;

    Object.keys(rawAgrupada).forEach(asset => {
        const vals = rawAgrupada[asset];
        if (vals.trans < UMBRAL_RENTA) {
            otros.adq += vals.adq;
            otros.trans += vals.trans;
            otros.profit += vals.profit;
            hasOtros = true;
        } else {
            finalAgrupada[asset] = vals;
        }
    });

    const rBody = document.getElementById('renta-body');
    rBody.innerHTML = '';

    const rentaKeys = Object.keys(finalAgrupada).sort();
    if (rentaKeys.length === 0 && !hasOtros) {
        rBody.innerHTML = '<tr class="empty-row"><td colspan="4">Sin datos</td></tr>';
    } else {
        rentaKeys.forEach(asset => {
            const vals = finalAgrupada[asset];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="asset-chip">${TaxSecurity.esc(asset)}</span></td>
                <td>${TaxSecurity.esc(fmt(vals.adq))}</td>
                <td>${TaxSecurity.esc(fmt(vals.trans))}</td>
                <td class="td-profit ${vals.profit >= 0 ? 'positive' : 'negative'}">${TaxSecurity.esc(fmt(vals.profit))}</td>
            `;
            rBody.appendChild(tr);
        });
        if (hasOtros) {
            const tr = document.createElement('tr');
            tr.style.background = 'rgba(168, 85, 247, 0.05)';
            tr.innerHTML = `
                <td style="font-weight: 600; color: var(--accent2)">Otras monedas (Menores a ${UMBRAL_RENTA}€)</td>
                <td style="font-weight: 600">${fmt(otros.adq)}</td>
                <td style="font-weight: 600">${fmt(otros.trans)}</td>
                <td class="td-profit ${otros.profit >= 0 ? 'positive' : 'negative'}" style="font-weight: 600">${fmt(otros.profit)}</td>
            `;
            rBody.appendChild(tr);
        }
    }

    const renderSimpleTable = (arr, id) => {
        const body = document.getElementById(id);
        body.innerHTML = '';
        if (arr.length === 0) {
            body.innerHTML = '<tr class="empty-row"><td colspan="6">Sin datos</td></tr>';
        } else {
            arr.forEach(row => {
                const tr = document.createElement('tr');
                const priceStyle = row.priceEur === 0 ? 'zero-price' : '';
                tr.innerHTML = `
                    <td><span class="asset-chip">${TaxSecurity.esc(row.asset)}</span></td>
                    <td>${TaxSecurity.esc(row.op)}</td>
                    <td>${TaxSecurity.esc(fmtDate(row.date))}</td>
                    <td>${row.amount.toFixed(8)}</td>
                    <td class="${priceStyle}">${row.priceEur === 0 ? '⚠️ 0,00 €' : row.priceEur.toFixed(4) + ' €'}</td>
                    <td><strong>${TaxSecurity.esc(fmt(row.value))}</strong></td>
                `;
                body.appendChild(tr);
            });
        }
    };
    renderSimpleTable(filterByAsset(s.incomeDetails), 'income-body');
    renderSimpleTable(filterByAsset(s.airdropDetails), 'airdrop-body');

    const pGrid = document.getElementById('portfolio-grid');
    pGrid.innerHTML = '';
    const filteredInv = filterAsset === 'ALL' ? inv : inv.filter(i => i.asset === filterAsset);
    if (filteredInv.length === 0) {
        pGrid.innerHTML = '<p class="inv-details">Sin existencias para el activo seleccionado.</p>';
    } else {
        filteredInv.forEach(item => {
            const div = document.createElement('div');
            div.className = 'inv-item';
            div.innerHTML = `
                <div class="inv-asset"><span>${TaxSecurity.esc(item.asset)}</span><span class="badge">FIFO</span></div>
                <div class="inv-details">Cantidad: ${item.totalAmount.toFixed(8)}<br>P. Medio Adq: ${item.avgPrice.toFixed(4)} €</div>
                <div class="inv-val">${TaxSecurity.esc(fmt(item.totalValueEur))}</div>
            `;
            pGrid.appendChild(div);
        });
    }
    document.getElementById('export-btn').onclick = () => exportCSV(s, inv, year);
}

function exportCSV(s, inv, year) {
    const data = [];
    const rawAgrupada = {};
    s.details.forEach(r => {
        if (!rawAgrupada[r.asset]) rawAgrupada[r.asset] = { adq: 0, trans: 0, profit: 0 };
        rawAgrupada[r.asset].adq += r.valAdq;
        rawAgrupada[r.asset].trans += r.valTrans;
        rawAgrupada[r.asset].profit += r.profit;
    });

    const finalAgrupada = {};
    const otros = { adq: 0, trans: 0, profit: 0 };
    let hasOtros = false;

    Object.keys(rawAgrupada).forEach(asset => {
        const vals = rawAgrupada[asset];
        if (vals.trans < UMBRAL_RENTA) {
            otros.adq += vals.adq;
            otros.trans += vals.trans;
            otros.profit += vals.profit;
            hasOtros = true;
        } else {
            finalAgrupada[asset] = vals;
        }
    });

    data.push(['--- SECCION 1A: TOTALES AGRUPADOS POR MONEDA (RENTA WEB CASILLA 1800-1814) ---']);
    data.push(['Moneda', 'Valor Adquisicion Total EUR', 'Valor Transmision Total EUR', 'Ganancia/Perdida Neta EUR']);
    Object.keys(finalAgrupada).sort().forEach(asset => {
        const vals = finalAgrupada[asset];
        data.push([asset, vals.adq.toFixed(2), vals.trans.toFixed(2), vals.profit.toFixed(2)]);
    });
    if (hasOtros) data.push([`Otras monedas (Menores a ${UMBRAL_RENTA}€)`, otros.adq.toFixed(2), otros.trans.toFixed(2), otros.profit.toFixed(2)]);

    data.push([]);
    data.push(['--- SECCION 1: TRANSMISIONES (Modelo 100) ---']);
    data.push(['Activo', 'Operacion', 'Fecha Adquisicion', 'Fecha Transmision', 'Valor Adquisicion EUR', 'Valor Transmision EUR', 'Ganancia/Perdida EUR']);
    s.details.forEach(r => data.push([r.asset, r.op, fmtDate(r.dateAdq), fmtDate(r.dateTrans), r.valAdq.toFixed(2), r.valTrans.toFixed(2), r.profit.toFixed(2)]));

    data.push([]);
    data.push(['--- SECCION 2: RENDIMIENTOS (Casilla 0033) ---']);
    data.push(['Activo', 'Operacion', 'Fecha', 'Cantidad', 'Precio V. EUR', 'Valor Imputable EUR']);
    s.incomeDetails.forEach(r => data.push([r.asset, r.op, fmtDate(r.date), r.amount.toFixed(8), r.priceEur.toFixed(4), r.value.toFixed(2)]));

    data.push([]);
    data.push(['--- SECCION 3: AIRDROPS / PREMIOS (Casilla 0304) ---']);
    data.push(['Activo', 'Operacion', 'Fecha', 'Cantidad', 'Precio V. EUR', 'Valor Imputable EUR']);
    s.airdropDetails.forEach(r => data.push([r.asset, r.op, fmtDate(r.date), r.amount.toFixed(8), r.priceEur.toFixed(4), r.value.toFixed(2)]));

    data.push([]);
    data.push(['--- SECCION 4: INVENTARIO ACTUAL (Existencias) ---']);
    data.push(['Activo', 'Cantidad', 'Precio Medio Adq. EUR', 'Valor Total EUR']);
    inv.forEach(i => data.push([i.asset, i.totalAmount.toFixed(8), i.avgPrice.toFixed(4), i.totalValueEur.toFixed(2)]));

    const csv = Papa.unparse(data, { delimiter: ";" });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cryptotax_${year}.csv`;
    a.click();
}
