import { NextResponse } from 'next/server';
import { executeQuery } from '@/lib/db';

export async function GET() {
  try {
    await executeQuery('SELECT 1 AS ok');
    return NextResponse.json({
      status: 'healthy',
      database: 'connected',
      groqConfigured: Boolean(process.env.GROQ_API_KEY),
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        status: 'unhealthy',
        database: 'disconnected',
        error: message,
      },
      { status: 500 }
    );
  }
}