import { useState } from "react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import { Page, Loading, ErrorNote } from "../components/shell";
import { useViewer } from "../components/viewer";
import { Empty, Stat } from "../components/bits";
import { CertChip, SectionTitle } from "../components/program-bits";
import { useCerts, useRecordCert } from "../queries/certs";
import { CERT_KINDS, type CertKind } from "../../shared/program";
import { ROLE_LABEL } from "../../shared/domain";
import { errMsg, shortDay } from "../lib/format";

export default function CertsPage() {
  const v = useViewer();
  const scope = v.isLeader ? v.scope : v.storeId;
  const q = useCerts(scope);
  const [recording, setRecording] = useState<{ memberId: string; kind: CertKind } | null>(null);
  return (
    <Page eyebrow={v.isLeader && !v.scope ? "All stores" : `${v.store?.name}`} title="Certifications">
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        <>
          <div className="mb-10 grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat label="Missing" value={q.data!.alerts.filter((a) => a.status === "missing").length} tone="bad" sub="Required for their role" />
            <Stat label="Expired" value={q.data!.alerts.filter((a) => a.status === "expired").length} tone="bad" sub="Can't serve alcohol until renewed" />
            <Stat label="Expiring" value={q.data!.alerts.filter((a) => a.status === "expiring").length} tone="gold" sub={`Within ${q.data!.alertDays} days`} />
            <Stat label="On file" value={q.data!.rows.reduce((a, r) => a + r.certs.filter((c) => c.status !== "missing").length, 0)} sub="Food handler, alcohol, wine" />
          </div>

          {recording && <RecordForm init={recording} onDone={() => setRecording(null)} name={q.data!.rows.find((r) => r.id === recording.memberId)?.name ?? ""} />}

          <SectionTitle aside={<span className="text-[12px] text-ink-soft">Alerts start {q.data!.alertDays} days before expiry</span>}>Needs action</SectionTitle>
          {q.data!.alerts.length ? (
            <div className="mb-10 grid gap-2 md:grid-cols-2">
              {q.data!.alerts.map((a) => (
                <div key={a.memberId + a.kind} className="flex items-center justify-between gap-3 rounded-[2px] border rule px-4 py-3">
                  <div>
                    <Link href={`/team/${a.memberId}#certs`} className="text-[14px] font-semibold hover:underline">
                      {a.name}
                    </Link>
                    <div className="text-[12px] text-ink-soft">
                      {a.label} · {ROLE_LABEL[a.role]}
                      {v.isLeader && !v.scope && ` · ${a.storeName}`}
                      {a.expiresOn && ` · ${a.status === "expired" ? "expired" : "expires"} ${shortDay(a.expiresOn)}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <CertChip status={a.status} daysLeft={a.daysLeft} />
                    <button className="btn btn-line !h-8 !px-3 !text-[12px]" onClick={() => setRecording({ memberId: a.memberId, kind: a.kind })}>
                      Record
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-10">
              <Empty>Everyone's certifications are current.</Empty>
            </div>
          )}

          <SectionTitle>Everyone</SectionTitle>
          <div className="overflow-x-auto">
            <table className="tbl min-w-[720px]">
              <thead>
                <tr>
                  <th>Colleague</th>
                  <th>Food handler</th>
                  <th>Alcohol service</th>
                  <th>Wine</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data!.rows.map((r) => {
                  const c = (k: CertKind) => r.certs.find((x) => x.kind === k);
                  const wine = r.certs.filter((x) => x.kind === "wset2" || x.kind === "cms_intro");
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/team/${r.id}#certs`} className="font-semibold hover:underline">
                          {r.name}
                        </Link>
                        <div className="text-[11.5px] text-ink-soft">
                          {ROLE_LABEL[r.role]}
                          {v.isLeader && !v.scope && ` · ${r.storeName}`}
                        </div>
                      </td>
                      {(["food_handler", "alcohol"] as const).map((k) => {
                        const x = c(k);
                        return (
                          <td key={k}>
                            {x ? (
                              <div>
                                <CertChip status={x.status} daysLeft={x.daysLeft} />
                                {x.expiresOn && <div className="mt-0.5 text-[11px] text-ink-soft">to {shortDay(x.expiresOn)}</div>}
                              </div>
                            ) : (
                              <span className="text-[12px] text-ink-soft">Not required</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-[12px]">{wine.length ? wine.map((w) => w.label).join(", ") : <span className="text-ink-soft">—</span>}</td>
                      <td className="r">
                        <button aria-label={`Record a certificate for ${r.name}`} className="text-ink-soft hover:text-ink" onClick={() => setRecording({ memberId: r.id, kind: "food_handler" })}>
                          <Plus className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Page>
  );
}

export function RecordForm({ init, onDone, name }: { init: { memberId: string; kind: CertKind }; onDone: () => void; name: string }) {
  const record = useRecordCert();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ kind: init.kind, issuer: "", number: "", issuedOn: today, expiresOn: "" });
  return (
    <form
      className="mb-10 rounded-[2px] border-2 border-ink p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await record.mutateAsync({ memberId: init.memberId, ...f, expiresOn: f.expiresOn || null }).catch(() => null);
        if (r) onDone();
      }}
    >
      <div className="eyebrow mb-4">Record a certificate · {name}</div>
      <div className="grid gap-4 md:grid-cols-5">
        <div className="md:col-span-2">
          <span className="label">Certificate</span>
          <select aria-label="Certificate" className="field" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CertKind })}>
            {Object.entries(CERT_KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Issuer</span>
          <input aria-label="Issuer" className="field" value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} placeholder="ServSafe" />
        </div>
        <div>
          <span className="label">Issued</span>
          <input aria-label="Issued on" type="date" className="field" value={f.issuedOn} onChange={(e) => setF({ ...f, issuedOn: e.target.value })} />
        </div>
        <div>
          <span className="label">Expires</span>
          <input aria-label="Expires on" type="date" className="field" value={f.expiresOn} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} />
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-5">
        <div className="md:col-span-2">
          <span className="label">Certificate number</span>
          <input aria-label="Certificate number" className="field" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} />
        </div>
      </div>
      {record.error && <div className="mt-2 text-[13px] text-oxblood">{errMsg(record.error)}</div>}
      <div className="mt-4 flex gap-2">
        <button className="btn btn-ink" disabled={record.isPending}>
          Save
        </button>
        <button type="button" className="btn btn-line" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
