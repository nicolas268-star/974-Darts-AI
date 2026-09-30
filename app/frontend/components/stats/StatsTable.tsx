import { Children, Fragment, isValidElement, type ReactElement, type ReactNode, type TableHTMLAttributes } from "react";
import styles from "./StatsTable.module.css";

type NodeProps = { children?: ReactNode; label?: string; title?: string; colSpan?: number };
type Element = ReactElement<NodeProps>;

// Read only the table's explicit markup, never execute a child component.
function elements(children: ReactNode): Element[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<NodeProps>(child)) return [];
    return child.type === Fragment ? elements(child.props.children) : [child];
  });
}

function labelOf(node: ReactNode): string {
  return Children.toArray(node).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (!isValidElement<NodeProps>(child)) return "";
    return child.props.title || child.props.label || labelOf(child.props.children);
  }).join(" ").replace(/\s+/g, " ").trim();
}

type Props = TableHTMLAttributes<HTMLTableElement> & {
  /** Zero-based columns. Keep the same values and ordering as the desktop table. */
  mobileTitleColumn?: number;
  mobileSummaryColumns?: number[];
};

/** Semantic desktop table and compact phone cards share the exact same cells. */
export function StatsTable({ children, className, mobileTitleColumn, mobileSummaryColumns, ...props }: Props) {
  const parts = elements(children);
  const head = parts.find(part => part.type === "thead");
  const headers = elements(elements(head?.props.children)[0]?.props.children);
  const labels = headers.map(header => labelOf(header));
  const rows = parts.filter(part => part.type === "tbody").flatMap(part => elements(part.props.children));
  const rankColumn = labels.findIndex(label => /^(#|rang|place)$/i.test(label));
  const titleColumn = mobileTitleColumn ?? Math.max(0, labels.findIndex(label => /^(joueur|équipe|duo|doublette|adversaire|rencontre)( |$)/i.test(label)));
  const otherColumns = labels.map((_, index) => index).filter(index => index !== titleColumn && index !== rankColumn);
  // Points and performance remain visible even when they are last in a wide table.
  const preferred = otherColumns.filter(index => /^(pts|total|points par joueur|indice MVP|indice équitable|total 180|moy|score|résultat|legs)/i.test(labels[index]));
  const summary = (mobileSummaryColumns ?? [...new Set([...preferred, ...otherColumns])].slice(0, 4)).filter(index => otherColumns.includes(index));
  const secondary = otherColumns.filter(index => !summary.includes(index));
  const caption = parts.find(part => part.type === "caption");

  return <>
    <table {...props} className={`${className ?? ""} ${styles.desktop}`}>{children}</table>
    <div className={styles.mobile} data-stats-cards aria-label={props["aria-label"]}>
      {caption && <p className={styles.caption}>{caption.props.children}</p>}
      <ul className={styles.list}>
        {rows.map((row, rowIndex) => {
          const cells = elements(row.props.children);
          if (cells.length === 1 && (cells[0].props.colSpan ?? 1) > 1) {
            return <li className={styles.empty} key={row.key ?? rowIndex}>{cells[0].props.children}</li>;
          }
          const metrics = (columns: number[]) => <dl className={styles.metrics}>{columns.map(index => <div key={index}>
            <dt>{labels[index]}</dt><dd>{cells[index]?.props.children}</dd>
          </div>)}</dl>;
          return <li className={styles.card} key={row.key ?? rowIndex}>
            <div className={styles.identity}>
              {rankColumn >= 0 && rankColumn !== titleColumn && <span className={styles.rank} aria-label={`${labels[rankColumn]} ${labelOf(cells[rankColumn]?.props.children)}`}>{cells[rankColumn]?.props.children}</span>}
              <div className={styles.name}>{cells[titleColumn]?.props.children}</div>
            </div>
            {metrics(summary)}
            {secondary.length > 0 && <details className={styles.details}>
              <summary>Autres statistiques <span>({secondary.length})</span></summary>
              {metrics(secondary)}
            </details>}
          </li>;
        })}
      </ul>
    </div>
  </>;
}
