import { HEAD_KIND_LABEL, HEAD_KINDS } from "@/lib/heads";

type Head = { id: number; name: string; kind: string };

export function HeadSelect({
  heads,
  name = "headId",
  defaultValue,
  required,
  direction,
}: {
  heads: Head[];
  name?: string;
  defaultValue?: number | null;
  required?: boolean;
  direction?: string;
}) {
  // Show the likely kinds first: credits lead with income, debits with expense.
  const order = direction === "in" ? ["income", "loan", "transfer", "investment", "expense"] : direction === "out" ? ["expense", "investment", "loan", "transfer", "income"] : [...HEAD_KINDS];
  return (
    <select name={name} defaultValue={defaultValue ?? ""} required={required} className="input">
      <option value="">Choose head…</option>
      {order.map((k) => (
        <optgroup key={k} label={HEAD_KIND_LABEL[k]}>
          {heads
            .filter((h) => h.kind === k)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function Select({
  name,
  options,
  defaultValue,
  required,
  placeholder,
}: {
  name: string;
  options: { value: string | number; label: string }[];
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} required={required} className="input">
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-3">{children}</p>;
}

export function Amount({ value, direction }: { value: string | number; direction?: string }) {
  const n = Number(value);
  const s = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  if (!direction) return <span className="num">₹{s}</span>;
  return <span className={`num ${direction === "in" ? "text-good" : ""}`}>{direction === "in" ? "+" : "−"}₹{s}</span>;
}

// Coloured chip for an entry's head kind (income, expense, investment, loan, transfer).
export function KindChip({ kind }: { kind: string | null | undefined }) {
  if (!kind) return null;
  return (
    <span data-kind={kind} className="kind-chip">
      {HEAD_KIND_LABEL[kind] ?? kind}
    </span>
  );
}
