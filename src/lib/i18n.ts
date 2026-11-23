export type Language = 'id' | 'en';

export const dictionary = {
  id: {
    appTitle: 'NexPOS Enterprise',
    subtitle: 'Sistem Kasir & Asisten Operasional AI',
    posMenu: 'Terminal Kasir',
    inventoryStatus: 'Status Inventori',
    aiAssistantTitle: 'Groq Operational Copilot',
    aiPlaceholder: 'Tanya stok menipis, audit void, omzet hari ini, atau SOP...',
    quickPrompts: [
      'Cek stok yang hampir habis',
      'Audit transaksi VOID hari ini',
      'Ringkasan penjualan & SOP tutup shift',
    ],
    checkout: 'Proses Pembayaran',
    total: 'Total Tagihan',
    emptyCart: 'Keranjang masih kosong',
    langLabel: 'ID',
  },
  en: {
    appTitle: 'NexPOS Enterprise',
    subtitle: 'Point of Sales & AI Operational Assistant',
    posMenu: 'POS Terminal',
    inventoryStatus: 'Inventory Status',
    aiAssistantTitle: 'Groq Operational Copilot',
    aiPlaceholder: 'Ask about low stock, void audits, daily revenue, or SOPs...',
    quickPrompts: [
      'Check low stock items',
      'Audit VOID transactions today',
      'Sales summary & shift closing SOP',
    ],
    checkout: 'Process Checkout',
    total: 'Total Amount',
    emptyCart: 'Cart is currently empty',
    langLabel: 'EN',
  },
};