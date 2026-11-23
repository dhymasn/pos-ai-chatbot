import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { executeQuery } from '@/lib/db';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Definisi Tools Operasional POS
const tools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_low_stock_products',
      description: 'Mengambil daftar produk yang stoknya di bawah atau sama dengan batas minimum (min_stock_threshold) untuk rekomendasi restock.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sales_and_audit_report',
      description: 'Mengambil ringkasan omzet penjualan hari ini serta daftar transaksi bermasalah (VOID / REFUNDED) untuk audit operasional.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_invoice',
      description: 'Mencari detail spesifik sebuah nomor invoice transaksi.',
      parameters: {
        type: 'object',
        properties: {
          invoice_number: { type: 'string', description: 'Nomor invoice, contoh: INV-20261123-001' },
        },
        required: ['invoice_number'],
      },
    },
  },
];

// Eksekutor Query MySQL
async function runOperationalTool(name: string, args: any) {
  if (name === 'get_low_stock_products') {
    const rows = await executeQuery(
      'SELECT sku, name, category, stock, min_stock_threshold, cost_price FROM products WHERE stock <= min_stock_threshold ORDER BY stock ASC'
    );
    return JSON.stringify(rows);
  }

  if (name === 'get_sales_and_audit_report') {
    const summary = await executeQuery(
      `SELECT 
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS total_completed_tx,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_amount ELSE 0 END), 0) AS gross_revenue,
        COUNT(CASE WHEN status IN ('VOID', 'REFUNDED') THEN 1 END) AS anomaly_tx_count
       FROM transactions WHERE DATE(created_at) = CURDATE()`
    );
    const anomalies = await executeQuery(
      `SELECT invoice_number, cashier_name, total_amount, status, notes, created_at 
       FROM transactions WHERE status IN ('VOID', 'REFUNDED') ORDER BY created_at DESC LIMIT 5`
    );
    return JSON.stringify({ summary, anomalies });
  }

  if (name === 'search_invoice') {
    const rows = await executeQuery(
      'SELECT * FROM transactions WHERE invoice_number = ?',
      [args.invoice_number]
    );
    return JSON.stringify(rows);
  }

  return JSON.stringify({ error: 'Tool not found' });
}

export async function POST(req: NextRequest) {
  try {
    const { messages, lang } = await req.json();

    const systemPrompt = `Anda adalah Senior POS Operations & Retail Intelligence AI untuk sistem NexPOS.
Aturan Operasional:
1. Jawab dalam bahasa ${lang === 'en' ? 'Inggris (English)' : 'Indonesia'} yang profesional, analitis, dan terstruktur.
2. Selalu gunakan data real-time dari database menggunakan tools yang tersedia jika ditanya mengenai stok, omzet, invoice, atau audit transaksi. Jangan mengarang angka.
3. Jika pengguna bertanya tentang SOP Kasir (Buka/Tutup Shift, Selisih Kas, Otorisasi Void):
   - Void transaksi di atas Rp 100.000 wajib melampirkan alasan tertulis dan otorisasi Supervisor.
   - Tutup shift wajib menghitung fisik uang laci (Cash Drawer) dan mencocokkannya dengan sistem sebelum mencetak Z-Report.
4. Berikan rekomendasi tindakan nyata (actionable insights) setelah menyajikan data.`;

    const conversation = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    // Panggilan Pertama ke Groq
    const initialResponse = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: conversation,
      tools,
      tool_choice: 'auto',
      temperature: 0.2,
    });

    const responseMessage = initialResponse.choices[0].message;

    // Jika AI memanggil fungsi database
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      conversation.push(responseMessage as any);

      for (const toolCall of responseMessage.tool_calls) {
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        const toolResult = await runOperationalTool(fnName, fnArgs);

        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        } as any);
      }

      // Panggilan Kedua untuk merangkum hasil SQL menjadi analisis
      const finalResponse = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: conversation,
        temperature: 0.3,
      });

      return NextResponse.json({ reply: finalResponse.choices[0].message.content });
    }

    return NextResponse.json({ reply: responseMessage.content });
  } catch (error: any) {
    console.error('Groq POS Error:', error);
    return NextResponse.json(
      { error: 'Gagal memproses permintaan operasional AI.', details: error.message },
      { status: 500 }
    );
  }
}