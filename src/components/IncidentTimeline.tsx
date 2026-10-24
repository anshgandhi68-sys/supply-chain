'use client';

import React from 'react';
import { ScanTimelineEvent } from '@/lib/types';
import {
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  ChevronRight,
  Shield,
  Activity,
} from 'lucide-react';

interface IncidentTimelineProps {
  timeline: ScanTimelineEvent[];
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({ timeline }) => {
  const getStageIcon = (event: ScanTimelineEvent) => {
    switch (event.status) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-sentinel-teal" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case 'error':
        return <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Info className="w-3.5 h-3.5 text-sentinel-cyan" />;
    }
  };

  const getStageBadge = (stage: ScanTimelineEvent['stage']) => {
    switch (stage) {
      case 'validate':
        return 'VALIDATE';
      case 'fetch':
        return 'FETCH';
      case 'manifest_parse':
        return 'MANIFEST';
      case 'osv_query':
        return 'OSV API';
      case 'actions_inspect':
        return 'GHA AST';
      case 'complete':
        return 'COMPLETE';
      case 'error':
        return 'ERROR';
      default:
        return (stage || 'EVENT').toUpperCase();
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-sentinel-hairline space-y-4 font-mono">
      <div className="flex items-center justify-between border-b border-sentinel-hairline pb-3">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-sentinel-teal" />
          <h3 className="text-sm font-bold text-sentinel-textPrimary uppercase tracking-wider">
            Incident Investigation Audit Log
          </h3>
        </div>
        <span className="text-xs text-sentinel-textMuted">
          {timeline.length} Recorded Checkpoints
        </span>
      </div>

      <div className="relative pl-6 space-y-4 border-l border-sentinel-hairline text-xs">
        {timeline.map((event, idx) => (
          <div key={event.id || idx} className="relative group">
            {/* Dot on line */}
            <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-sentinel-midnight border border-sentinel-hairline flex items-center justify-center">
              {getStageIcon(event)}
            </div>

            <div className="p-3.5 rounded-xl bg-sentinel-surface/70 border border-sentinel-hairline group-hover:border-sentinel-teal/40 transition-colors space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sentinel-midnight text-sentinel-textSecondary border border-sentinel-hairline">
                  {getStageBadge(event.stage)}
                </span>
                <span className="text-[10px] text-sentinel-textMuted">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>

              <p className="text-sentinel-textPrimary text-xs leading-relaxed">{event.message}</p>

              {event.details && Object.keys(event.details).length > 0 && (
                <div className="mt-1 text-[11px] text-sentinel-textMuted bg-sentinel-midnight p-2.5 rounded-lg border border-sentinel-hairline overflow-x-auto">
                  {JSON.stringify(event.details, null, 2)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
