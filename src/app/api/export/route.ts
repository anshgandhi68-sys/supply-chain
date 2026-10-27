import { NextRequest, NextResponse } from 'next/server';
import { ScanResult } from '@/lib/types';
import { generateMarkdownReport, generateHtmlReport } from '@/lib/reports';
import { readJsonBodyWithLimit } from '@/lib/api-payload';

export async function POST(req: NextRequest) {
  try {
    const { data: body, error, status } = await readJsonBodyWithLimit<{ result: ScanResult; format?: string }>(req);
    if (error || !body) {
      return NextResponse.json({ error }, { status: status || 400 });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || body?.format || 'json';

    if (!body || !body.result) {
      return NextResponse.json({ error: 'Valid ScanResult object is required in request body.' }, { status: 400 });
    }

    const result = body.result;

    if (format === 'markdown' || format === 'md') {
      const md = generateMarkdownReport(result);
      return new NextResponse(md, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${result.repository.repo || 'sentinel'}-audit-report.md"`,
        },
      });
    }

    if (format === 'html') {
      const html = generateHtmlReport(result);
      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${result.repository.repo || 'sentinel'}-audit-report.html"`,
        },
      });
    }

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
      const safeCsvCell = (val: string | number | undefined | null): string => {
        if (val === undefined || val === null) return '""';
        let str = String(val);
        // Mitigate CSV Formula Injection (DDE)
        if (/^[=\+\-@\t\r]/.test(str)) {
          str = `'${str}`;
        }
        return `"${str.replace(/"/g, '""')}"`;
      };

      const headers = ['ID', 'Category', 'Severity', 'File', 'Line', 'Title', 'Confidence', 'Status'];
      const rows = result.findings.map((f) => [
        safeCsvCell(f.id),
        safeCsvCell(f.category),
        safeCsvCell(f.severity),
        safeCsvCell(f.filePath),
        safeCsvCell(f.lineNumber),
        safeCsvCell(f.title),
        safeCsvCell(f.confidence),
        safeCsvCell(f.verificationStatus),
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
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
