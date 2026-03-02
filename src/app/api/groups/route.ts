import { NextRequest, NextResponse } from 'next/server';
import { listGroups, createGroup } from '@/lib/db/groups';

export async function GET() {
  try {
    const groups = listGroups();
    return NextResponse.json({ groups });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, color } = body as { name: string; color?: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const group = createGroup(name, color);
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
