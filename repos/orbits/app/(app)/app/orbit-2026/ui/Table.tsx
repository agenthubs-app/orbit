import type { ReactNode } from "react";

import styles from "./Table.module.css";

export type TableColumn<Row> = { key: string; header: string; render: (row: Row) => ReactNode; align?: "start" | "end"; width?: string };

// kit .table (Web): 13 px rows, 11.5 grey headers, hairline row borders, hover tint.
// A caption names the table for screen readers.
export function Table<Row>({ caption, columns, rows, rowKey }: { caption: string; columns: TableColumn<Row>[]; rows: Row[]; rowKey: (row: Row) => string }) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>{columns.map((column) => <th key={column.key} scope="col" style={column.width ? { width: column.width } : undefined} className={column.align === "end" ? styles.end : undefined}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={column.align === "end" ? styles.end : undefined}>{column.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
