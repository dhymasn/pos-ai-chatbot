import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { executeQuery } from '@/lib/db';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PREFERRED_MODELS = [
  process.env.GROQ_MODEL,
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
].filter(Boolean) as string[];

async function getChatModelCandidates(): Promise<string[]> {
  try {
    const modelsPage = await groq.models.list();
    const validChatIds = modelsPage.data
      .map((m) => m.id)
      .filter(
        (id) =>
          !id.includes('whisper') &&
          !id.includes('guard') &&
          !id.includes('tts') &&
          !id.includes('orpheus') &&
          !id.includes('playai')
      );

    const prioritized = PREFERRED_MODELS.filter((id) => validChatIds.includes(id));
    const remaining = validChatIds.filter((id) => !prioritized.includes(id));
    const combined = [...prioritized, ...remaining];

    if (combined.length > 0) {
      return combined;
    }
  } catch (err) {
    console.warn('[Groq] Gagal mengambil daftar model, memakai default fallback:', err);
  }

  return ['llama-3.1-8b-instant'];
}

async function resolveActiveModel(): Promise<string> {
  const candidates = await getChatModelCandidates();
  return candidates[0] || 'llama-3.1-8b-instant';
}

async function createChatCompletion(
  params: Record<string, unknown>,
  primaryModel: string
) {
  const candidates = await getChatModelCandidates();
  const orderedModels = [primaryModel, ...candidates.filter((m) => m !== primaryModel)];

  let lastError: unknown;
  for (const model of orderedModels) {
    try {
      return await groq.chat.completions.create({
        ...(params as any),
        model,
      });
    } catch (err: unknown) {
      lastError = err;
      const e = err as { status?: number; error?: { code?: string } };
      const code = e?.error?.code;

      if (
        e?.status === 404 ||
        code === 'model_not_found' ||
        code === 'model_terms_required' ||
        code === 'tool_use_failed'
      ) {
        console.warn(`[Groq] Melewati model ${model} (${code || e?.status})...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

const tools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_low_stock_products',
      description:
        'Mengambil daftar produk yang stoknya di bawah atau sama dengan batas minimum (min_stock_threshold) untuk rekomendasi restock.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sales_and_audit_report',
      description:
        'Mengambil ringkasan omzet penjualan hari ini serta daftar transaksi bermasalah (VOID / REFUNDED) untuk audit operasional.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
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
          invoice_number: {
            type: 'string',
            description: 'Nomor invoice, contoh: INV-20261123-001',
          },
        },
        required: ['invoice_number'],
      },
    },
  },
];

async function runOperationalTool(name: string, args: Record<string, string>) {
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
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY.includes('your_groq_api_key')) {
      return NextResponse.json(
        { reply: '⚠️ GROQ_API_KEY belum dikonfigurasi dengan benar di file .env.local.' },
        { status: 200 }
      );
    }

    const { messages, lang } = await req.json();
    const activeModel = await resolveActiveModel();

    const systemPrompt = `Anda adalah Senior POS Operations & Retail Intelligence AI untuk sistem NexPOS.
Aturan Operasional:
1. Jawab dalam bahasa ${lang === 'en' ? 'Inggris (English)' : 'Indonesia'} yang profesional, analitis, dan terstruktur.
2. Selalu gunakan data real-time dari database menggunakan tools yang tersedia jika ditanya mengenai stok, omzet, invoice, atau audit transaksi. Jangan mengarang angka.
3. Jika pengguna bertanya tentang SOP Kasir (Buka/Tutup Shift, Selisih Kas, Otorisasi Void):
  - Void transaksi di atas Rp 100.000 wajib melampirkan alasan tertulis dan otorisasi Supervisor.
  - Tutup shift wajib menghitung fisik uang laci (Cash Drawer) dan mencocokkannya dengan sistem sebelum mencetak Z-Report.
4. Berikan rekomendasi tindakan nyata (actionable insights) setelah menyajikan data.`;

    const cleanHistory = (messages || []).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));

    const conversation: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...cleanHistory,
    ];

    const initialResponse = await createChatCompletion(
      {
        messages: conversation,
        tools,
        tool_choice: 'auto',
        temperature: 0.2,
      },
      activeModel
    );

    const responseMessage = initialResponse.choices[0].message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      conversation.push({
        role: 'assistant',
        content: responseMessage.content || null,
        tool_calls: responseMessage.tool_calls,
      });

      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const fnName = toolCall.function.name;
        const fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        const toolResult = await runOperationalTool(fnName, fnArgs);

        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      const finalResponse = await createChatCompletion(
        {
          messages: conversation,
          temperature: 0.3,
        },
        activeModel
      );

      return NextResponse.json({ reply: finalResponse.choices[0].message.content });
    }

    return NextResponse.json({ reply: responseMessage.content });
  } catch (error: unknown) {
    console.error('[Groq POS Error Detail]:', error);
    const errObj = error as { error?: { message?: string }; message?: string };
    return NextResponse.json(
      {
        reply: `❌ Error Groq AI: ${errObj?.error?.message || errObj?.message || 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}