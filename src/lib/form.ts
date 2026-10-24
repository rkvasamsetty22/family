export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
export const req = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) throw new Error(`${k} is required`);
  return v;
};
export const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v == null) return null;
  const n = Number(v.replace(/,/g, ""));
  return isFinite(n) ? n : null;
};
export const moneyStr = (fd: FormData, k: string) => {
  const n = num(fd, k);
  return n == null ? null : n.toFixed(2);
};
export const intOrNull = (fd: FormData, k: string) => {
  const n = num(fd, k);
  return n == null ? null : Math.trunc(n);
};
