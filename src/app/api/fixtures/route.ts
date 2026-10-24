import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name') || 'risky';

  const validNames: Record<string, string> = {
    risky: 'risky-workflow.yml',
    corrected: 'corrected-workflow.yml',
    clean: 'clean-workflow.yml',
    malformed: 'malformed-workflow.yml',
    package: 'sample-package.json',
    lock: 'sample-package-lock.json',
  };

  const filename = validNames[name];
  if (!filename) {
    return NextResponse.json({ error: 'Unknown fixture name' }, { status: 404 });
  }

  try {
    const filePath = path.join(process.cwd(), 'src', 'fixtures', filename);
    const content = fs.readFileSync(filePath, 'utf8');
    return NextResponse.json({ name, filename, content });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not load fixture: ${msg}` }, { status: 500 });
  }
}
