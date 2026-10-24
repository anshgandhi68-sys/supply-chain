import { NextRequest, NextResponse } from 'next/server';
import { ScanResult } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'json';
    const body: { result: ScanResult } = await req.json();

    if (!body || !body.result) {
      return NextResponse.json({ error: 'Valid ScanResult object is required in request body.' }, { status: 400 });
    }

    const result = body.result;

    if (format === 'cyclonedx') {
      const sbom = result.sbomCycloneDx;
      if (!sbom) {
        return NextResponse.json({ error: 'No CycloneDX SBOM available in scan result.' }, { status: 404 });
      }
      return new NextResponse(JSON.stringify(sbom, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${result.repository.repo}-cyclonedx-sbom.json"`,
        },
      });
    }

    if (format === 'csv') {
      const headers = ['ID', 'Category', 'Severity', 'File', 'Line', 'Title', 'Confidence', 'Status'];
      const rows = result.findings.map((f) => [
        `"${f.id}"`,
        `"${f.category}"`,
        `"${f.severity}"`,
        `"${f.filePath}"`,
        `"${f.lineNumber || ''}"`,
        `"${f.title.replace(/"/g, '""')}"`,
        `"${f.confidence}"`,
        `"${f.verificationStatus}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${result.repository.repo}-security-findings.csv"`,
        },
      });
    }

    // Default: full JSON report
    return new NextResponse(JSON.stringify(result, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${result.repository.repo}-sentinel-audit.json"`,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Export failed: ${msg}` }, { status: 500 });
  }
}
