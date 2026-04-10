/**
 * Security utilities - Global Namespace
 */
window.TaxSecurity = {
    /**
     * Escapes HTML special characters to prevent XSS.
     * @param {string} unsafe The string to escape.
     * @returns {string} The escaped string.
     */
    esc(unsafe) {
        if (unsafe === undefined || unsafe === null) return '';
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

// Alias local para uso más cómodo
const esc = window.TaxSecurity.esc;
