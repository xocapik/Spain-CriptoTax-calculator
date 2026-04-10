# CryptoTax ES ₿

**[🚀 Ver App en Vivo](https://xocapik.github.io/Spain-CriptoTax-calculator/)**

Calculadora de impuestos para criptomonedas en España (IRPF). Esta herramienta procesa archivos CSV de transacciones de plataformas como Binance y Bitmex, aplicando el método **FIFO** (First-In-First-Out) según el criterio de la AEAT (Hacienda).

## ✨ Características

-   **100% Local y Privado**: Todo el procesamiento se realiza en tu navegador. Tus datos financieros nunca salen de tu ordenador.
-   **Método FIFO**: Cálculo preciso de la base de coste y ganancias patrimoniales.
-   **Soporte Multiformato**:
    -   **Binance**: Soporta CSVs en español e inglés, incluyendo conversiones (Convert) y Dusting (conversión a BNB).
    -   **Bitmex**: Soporta historial de transacciones.
-   **Precios Automáticos**: Obtención automática de precios históricos en EUR para el cálculo de valoración (vía Binance API / CryptoCompare).
-   **Seguridad**: Sanitización de datos contra ataques XSS y protección SRI (Subresource Integrity) para librerías externas.
-   **Exportación**: Genera un reporte detallado en CSV compatible con Renta Web (Casillas 1800-1814).

## 🚀 Cómo usar

1.  Descarga el repositorio o clónalo.
2.  Abre el archivo `index.html` en cualquier navegador web moderno (Chrome, Edge, Firefox).
3.  Arrastra tus archivos CSV a la zona de carga.
4.  Haz clic en **"Calcular impuestos"**.
5.  Revisa los resultados en las pestañas y exporta el reporte para tu declaración.

## 🧪 Pruebas (Test Suite)

La aplicación incluye una batería de pruebas integradas para asegurar la precisión de los cálculos fiscales. Para ejecutarlas, haz clic en el enlace **"Test Suite"** en la cabecera de la aplicación o abre directamente `tests.html`.

## 🛠️ Estructura del Proyecto

-   `index.html`: Interfaz principal.
-   `style.css`: Estilos visuales minimalistas y modernos.
-   `app.js`: Lógica de la interfaz de usuario y coordinación.
-   `utils/`:
    -   `engine.js`: Motor de cálculo FIFO.
    -   `parsers.js`: Lógica de parseo y consolidación de CSVs.
    -   `prices.js`: Servicio de obtención de precios con caché local (IndexedDB).
    -   `security.js`: Utilidades de protección y escape HTML.
-   `tests.js` / `tests.html`: Suite de pruebas unitarias e integración.

## ⚖️ Licencia

Distribuido bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalle.

---
*Nota: Esta herramienta no constituye asesoría fiscal. Se recomienda revisar los resultados con un profesional ante cualquier duda con tu declaración de la renta.*
