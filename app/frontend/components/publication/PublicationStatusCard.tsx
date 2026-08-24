import { CheckCircle2, Database, ShieldCheck } from "lucide-react";
import type { ExecutePublicationResponse } from "@/lib/import/publication";

export function PublicationStatusCard({ result }: { result: ExecutePublicationResponse | null }) {
  return (
    <section className="card publication-status-card">
      <div className="status-heading">
        {result ? <CheckCircle2 size={22} /> : <Database size={22} />}
        <div>
          <div className="muted">Publication transactionnelle</div>
          <div className="status-title">{result?.status ?? "En attente"}</div>
        </div>
      </div>
      <p>{result?.message ?? "Aucune écriture n’a encore été exécutée."}</p>
      <div className="security-chip"><ShieldCheck size={15} /> Insertions uniquement · rollback automatique</div>
    </section>
  );
}
