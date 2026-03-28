import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mbid: string }> }
) {
  const { mbid } = await params;
  try {
    const res = await fetch(`https://coverartarchive.org/release/${mbid}`, {
      headers: { 'User-Agent': 'GhostAudio/1.0 (ghost.app)' },
      redirect: 'follow',
    });
    if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: res.status });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch cover art' }, { status: 500 });
  }
}
