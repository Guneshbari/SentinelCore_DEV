/**
 * EventTable — TanStack Table v8 + @tanstack/react-virtual
 *
 * Performance rules:
 *  - Rows are 26px, virtualized (no DOM for off-screen rows)
 *  - Memoized row renders via areRowsEqual
 *  - Column pinning: time + severity pinned left
 *  - Keyboard navigation: arrow keys, Enter to select
 *  - Server-side sorting stub (sort params emitted via onSortChange)
 *  - text-xs font-mono, sharp borders, no rounded corners
 */
import {
  useRef,
  useCallback,
  useState,
  useEffect,
  useMemo,
} from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnPinningState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUIStore } from '../../store/uiStore';
import type { TelemetryEvent, Severity } from '../../types/telemetry';
import { ENABLE_PRETEXT_OPTIMIZATION, measureText } from '../../utils/textLayout';

const SEV_COLORS: Record<Severity, string> = {
  CRITICAL: '#FF3B3B',
  ERROR:    '#FF8A00',
  WARNING:  '#FFD600',
  INFO:     '#3BA4FF',
};

const ROW_HEIGHT    = 30;
const ROW_PADDING_Y = 8;
const OVERSCAN      = 15;
const MESSAGE_FONT = '11px Inter';
const MESSAGE_LINE_HEIGHT = 16;

const colHelper = createColumnHelper<TelemetryEvent>();

function formatTs(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(',', '');
}

const COLUMNS = [
  colHelper.accessor('event_time', {
    id: 'time',
    header: 'Time',
    size: 130,
    enablePinning: true,
    cell: (info) => (
      <span className="text-[#6B7C93]">{formatTs(info.getValue())}</span>
    ),
  }),
  colHelper.accessor('severity', {
    id: 'sev',
    header: 'SEV',
    size: 68,
    enablePinning: true,
    cell: (info) => {
      const sev = info.getValue();
      return (
        <span
          className={`soc-badge soc-badge-${sev.toLowerCase()} w-[56px] justify-center mx-auto`}
        >
          {sev}
        </span>
      );
    },
  }),
  colHelper.accessor('hostname', {
    id: 'system',
    header: 'System',
    size: 140,
    cell: (info) => (
      <span className="text-[#E6EDF3] font-semibold">{info.getValue().split('.')[0]}</span>
    ),
  }),
  colHelper.accessor('fault_type', {
    id: 'fault',
    header: 'Fault Type',
    size: 140,
    cell: (info) => <span className="text-[#9FB3C8]">{info.getValue()}</span>,
  }),
  colHelper.accessor('provider_name', {
    id: 'provider',
    header: 'Provider',
    size: 160,
    cell: (info) => <span className="text-[#6B7C93]">{info.getValue()}</span>,
  }),
  colHelper.accessor('fault_description', {
    id: 'msg',
    header: 'Message',
    size: 280,
    cell: (info) => (
      <span className="text-[#9FB3C8] truncate block" style={{ maxWidth: 280 }}>
        {info.getValue() || info.row.original.fault_type}
      </span>
    ),
  }),
  colHelper.accessor('cpu_usage_percent', {
    id: 'cpu',
    header: 'CPU%',
    size: 52,
    cell: (info) => {
      const v = info.getValue() || 0;
      const color = v > 90 ? '#FF3B3B' : v > 70 ? '#FF8A00' : '#E6EDF3';
      return <span style={{ color }}>{v.toFixed(0)}</span>;
    },
  }),
  colHelper.accessor('memory_usage_percent', {
    id: 'mem',
    header: 'MEM%',
    size: 52,
    cell: (info) => {
      const v = info.getValue() || 0;
      const color = v > 90 ? '#FF3B3B' : v > 80 ? '#FF8A00' : '#E6EDF3';
      return <span style={{ color }}>{v.toFixed(0)}</span>;
    },
  }),
];

interface EventTableProps {
  events: TelemetryEvent[];
}

export default function EventTable({ events }: EventTableProps) {
  const selectedEvent    = useUIStore((s) => s.selectedEvent);
  const setSelectedEvent = useUIStore((s) => s.setSelectedEvent);

  const [sorting, setSorting] = useState<SortingState>([
    { id: 'time', desc: true },
  ]);
  const [columnPinning] = useState<ColumnPinningState>({
    left: ['time', 'sev'],
  });

  const [focusedIdx, setFocusedIdx] = useState<number>(-1);

  const table = useReactTable({
    data:             events,
    columns:          COLUMNS,
    state:            { sorting, columnPinning },
    onSortingChange:  setSorting,
    getCoreRowModel:  getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
  });

  const { rows } = table.getRowModel();
  const messageColumn = table.getColumn('msg');
  const messageColumnWidth = Math.max((messageColumn?.getSize() ?? 280) - 16, 120);

  const rowHeights = useMemo(
    () => rows.map((row) => {
      if (!ENABLE_PRETEXT_OPTIMIZATION) return ROW_HEIGHT;
      const message = row.original.fault_description || row.original.fault_type || '';
      const measured = measureText(message, messageColumnWidth, {
        font: MESSAGE_FONT,
        lineHeight: MESSAGE_LINE_HEIGHT,
      });
      return Math.max(ROW_HEIGHT, measured.height + ROW_PADDING_Y * 2);
    }),
    [messageColumnWidth, rows],
  );

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count:            rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize:     (index) => rowHeights[index] ?? ROW_HEIGHT,
    overscan:         OVERSCAN,
  });

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      setSelectedEvent(rows[focusedIdx]?.original ?? null);
    }
  }, [rows, focusedIdx, setSelectedEvent]);

  // Scroll focused row into view
  useEffect(() => {
    if (focusedIdx >= 0) {
      virtualizer.scrollToIndex(focusedIdx, { align: 'auto' });
    }
  }, [focusedIdx, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  const headers = table.getFlatHeaders();

  return (
    <div
      className="flex flex-col h-full outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Fixed header */}
      <div
        className="overflow-hidden flex-shrink-0"
        style={{ background: '#111927', borderBottom: '1px solid #1F2A37' }}
      >
        <div style={{ display: 'flex' }}>
          {headers.map((header) => (
            <div
              key={header.id}
              style={{
                width:    header.getSize(),
                flexShrink: 0,
                height:   24,
                display:  'flex',
                alignItems: 'center',
                padding:  '0 8px',
                borderRight: '1px solid #1F2A37',
                cursor:   header.column.getCanSort() ? 'pointer' : 'default',
                userSelect: 'none',
              }}
              onClick={header.column.getToggleSortingHandler()}
            >
              <span className="font-mono text-[9px] text-[#6B7C93] uppercase tracking-wider">
                {flexRender(header.column.columnDef.header, header.getContext())}
                {header.column.getIsSorted()
                  ? header.column.getIsSorted() === 'asc' ? ' ↑' : ' ↓'
                  : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Virtual body */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        style={{ background: '#0A0F14' }}
      >
        <div
          style={{
            height:   virtualizer.getTotalSize(),
            position: 'relative',
          }}
        >
          {virtualItems.map((item) => {
            const row      = rows[item.index];
            const isActive = selectedEvent?.event_record_id === row.original.event_record_id;
            const isFocused = focusedIdx === item.index;

            return (
              <div
                key={row.id}
                onClick={() => {
                  setSelectedEvent(row.original);
                  setFocusedIdx(item.index);
                }}
                style={{
                  position:  'absolute',
                  top:        item.start,
                  left:       0,
                  height:     item.size,
                  display:    'flex',
                  alignItems: 'center',
                  width:      '100%',
                  background:  isActive
                    ? '#1E293B'
                    : isFocused
                    ? '#162131'
                    : row.original.severity === 'CRITICAL'
                    ? '#2A0F10'
                    : row.original.severity === 'ERROR'
                    ? '#2A1A0F'
                    : item.index % 2 === 0
                    ? '#0A0F14'
                    : '#0F1720',
                  borderBottom: '1px solid #1F2A37',
                  borderLeft:   `3px solid ${SEV_COLORS[row.original.severity]}`,
                  cursor:       'pointer',
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    style={{
                      width:    cell.column.getSize(),
                      flexShrink: 0,
                      padding:  '0 8px',
                      overflow: 'hidden',
                      borderRight: '1px solid #1F2A37',
                      fontFamily: 'Inter, monospace',
                      fontSize:   11,
                      whiteSpace: cell.column.id === 'msg' ? 'normal' : 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-3 border-t border-[#1F2A37]"
        style={{ height: 24, flexShrink: 0, background: '#0F1720' }}
      >
        <span className="font-mono text-[9px] text-[#6B7C93]">
          {events.length.toLocaleString()} events · ↑↓ navigate · Enter select
        </span>
        <span className="font-mono text-[9px] text-[#6B7C93]">
          {sorting[0] ? `sorted by ${sorting[0].id} ${sorting[0].desc ? '↓' : '↑'}` : ''}
        </span>
      </div>
    </div>
  );
}
