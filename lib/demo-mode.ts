/** True when running the public Vercel demo (no live LLM / disk writes). */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export function demoModeResponse(): Response {
  return new Response(
    JSON.stringify({
      type: 'error',
      message: 'Live scans are disabled in demo mode. Use the replay on the home page.',
    }) + '\n',
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  );
}

export function demoModeJson(): Response {
  return Response.json(
    { error: 'This action is disabled in demo mode.' },
    { status: 403 },
  );
}
