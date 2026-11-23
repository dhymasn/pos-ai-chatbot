import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

interface CheckoutItemInput {
  productId: number;
  qty: number;
}

export async function POST(req: NextRequest) {
  const connection = await pool.getConnection();

  try {
    const body = await req.json();
    const items: CheckoutItemInput[] = body?.items || [];
    const paymentMethod: 'CASH' | 'QRIS' | 'DEBIT' | 'CREDIT' = body?.paymentMethod || 'QRIS';
    const cashierName: string = body?.cashierName || 'Kasir Utama';

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Keranjang belanja tidak boleh kosong.' },
        { status: 400 }
      );
    }

    await connection.beginTransaction();

    let totalAmount = 0;
    const validatedItems: {
      productId: number;
      qty: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];

    for (const item of items) {
      const qty = Math.max(1, Number(item.qty) || 1);
      const [rows] = await connection.execute(
        'SELECT id, name, selling_price, stock FROM products WHERE id = ? FOR UPDATE',
        [item.productId]
      );
      const productList = rows as Array<{
        id: number;
        name: string;
        selling_price: number;
        stock: number;
      }>;

      if (productList.length === 0) {
        throw new Error(`Produk dengan ID ${item.productId} tidak ditemukan.`);
      }

      const product = productList[0];
      if (product.stock < qty) {
        throw new Error(
          `Stok ${product.name} tidak mencukupi (tersisa ${product.stock}, diminta ${qty}).`
        );
      }

      const unitPrice = Number(product.selling_price);
      const subtotal = unitPrice * qty;
      totalAmount += subtotal;

      validatedItems.push({
        productId: product.id,
        qty,
        unitPrice,
        subtotal,
      });

      // Kurangi stok produk
      await connection.execute(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [qty, product.id]
      );
    }

    // Buat nomor invoice unik
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${datePart}-${randomPart}`;

    // Simpan ke tabel transactions
    const [txResult] = await connection.execute(
      `INSERT INTO transactions (invoice_number, cashier_name, total_amount, payment_method, status, notes)
       VALUES (?, ?, ?, ?, 'COMPLETED', 'POS Checkout')`,
      [invoiceNumber, cashierName, totalAmount, paymentMethod]
    );
    const txHeader = txResult as { insertId: number };

    // Simpan ke tabel transaction_items
    for (const vItem of validatedItems) {
      await connection.execute(
        `INSERT INTO transaction_items (transaction_id, product_id, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [txHeader.insertId, vItem.productId, vItem.qty, vItem.unitPrice, vItem.subtotal]
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
      invoiceNumber,
      totalAmount,
      paymentMethod,
    });
  } catch (error: unknown) {
    await connection.rollback();
    const message = error instanceof Error ? error.message : 'Gagal memproses transaksi.';
    console.error('[Checkout Error]:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    connection.release();
  }
}