import { NextResponse } from 'next/server';
import { demoModeJson, isDemoMode } from '@/lib/demo-mode';
import { readResults, clearResults } from '@/lib/results';

export async function GET() {
  const results = readResults();
  if (!results) {
    return NextResponse.json({ exists: false });
  }
  return NextResponse.json({ exists: true, data: results });
}

export async function DELETE() {
  if (isDemoMode()) return demoModeJson();
  clearResults();
  return NextResponse.json({ ok: true });
}
