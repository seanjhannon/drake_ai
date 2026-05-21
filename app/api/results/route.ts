import { NextResponse } from 'next/server';
import { readResults, clearResults } from '@/lib/results';

export async function GET() {
  const results = readResults();
  if (!results) {
    return NextResponse.json({ exists: false });
  }
  return NextResponse.json({ exists: true, data: results });
}

export async function DELETE() {
  clearResults();
  return NextResponse.json({ ok: true });
}
