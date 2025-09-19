import type { ReactNode } from 'react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyState?: string;
}

export function DataTable<T extends Record<string, unknown>>({ columns, data, emptyState }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-black/40 shadow-glass">
      <table className="min-w-full divide-y divide-border/60 text-sm">
        <thead className="bg-black/50">
          <tr>
            {columns.map((column) => (
              <th key={column.key as string} className="px-4 py-3 text-left text-xs uppercase tracking-wider text-muted-foreground">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-black/40">
              {columns.map((column) => (
                <td key={column.key as string} className="px-4 py-3 align-top text-foreground/90">
                  {column.render ? column.render(row) : String(row[column.key as keyof T] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && <p className="p-4 text-center text-xs text-muted-foreground">{emptyState ?? 'No data yet.'}</p>}
    </div>
  );
}
