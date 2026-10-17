import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatRON, formatDate } from "@/src/lib/format";

const CSS = `
  * { font-family: 'Courier New', monospace; color: #111; box-sizing: border-box; }
  body { padding: 28px; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.5px; }
  .sub { font-size: 12px; color: #555; margin-bottom: 18px; }
  .kpis { display: flex; gap: 0; border: 1px solid #111; margin-bottom: 18px; }
  .kpi { flex: 1; padding: 12px; border-right: 1px solid #111; }
  .kpi:last-child { border-right: 0; }
  .kpi .label { font-size: 10px; text-transform: uppercase; color: #555; }
  .kpi .val { font-size: 18px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th, td { border: 1px solid #111; padding: 7px 9px; font-size: 11px; text-align: left; }
  th { background: #111; color: #fff; text-transform: uppercase; font-size: 10px; }
  td.num { text-align: right; }
  .final { color: #0F5132; }
  .pending { color: #664D03; }
  .neg { color: #B42318; }
  .foot { margin-top: 26px; border-top: 1px solid #111; padding-top: 10px; font-size: 10px; color: #555; }
`;

async function render(html: string) {
  const full = `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${html}<div class="foot">Powered by Node Intelligence · nodeintelligence.ro</div></body></html>`;
  const { uri } = await Print.printToFileAsync({ html: full });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  }
}

export async function exportCollaboratorPdf(c: any) {
  const stockRows = (c.stock_rows || [])
    .map((r: any) => `<tr><td>${r.label}</td><td class="num">${r.price} RON</td><td class="num ${r.quantity < 0 ? "neg" : ""}">${r.quantity}</td></tr>`)
    .join("");
  const orderRows = (c.orders || [])
    .map((o: any) => `<tr><td>${o.document_no}</td><td>${o.client_name}</td><td>${formatDate(o.date)}</td><td class="num">${formatRON(o.total)}</td><td class="${o.status === "Finalizat" ? "final" : "pending"}">${o.status}</td></tr>`)
    .join("");
  const html = `
    <h1>FISA PARTENER — ${c.name}</h1>
    <div class="sub">Generat: ${formatDate(new Date().toISOString())}</div>
    <div class="kpis">
      <div class="kpi"><div class="label">Stoc total</div><div class="val">${c.total_stock} buc</div></div>
      <div class="kpi"><div class="label">Incasat</div><div class="val">${formatRON(c.collected)}</div></div>
      <div class="kpi"><div class="label">De incasat</div><div class="val">${formatRON(c.pending)}</div></div>
      <div class="kpi"><div class="label">Comenzi</div><div class="val">${c.orders_count}</div></div>
    </div>
    <h1 style="font-size:14px">STOC</h1>
    <table><tr><th>Produs</th><th>Pret</th><th>Stoc</th></tr>${stockRows}</table>
    <h1 style="font-size:14px">COMENZI</h1>
    <table><tr><th>Document</th><th>Client</th><th>Data</th><th>Total</th><th>Status</th></tr>${orderRows || '<tr><td colspan="5">Nicio comanda</td></tr>'}</table>
  `;
  await render(html);
}

export async function exportClientPdf(c: any) {
  const orderRows = (c.orders || [])
    .map((o: any) => {
      const items = (o.lines || []).map((l: any) => `${l.label} x${l.qty}`).join(", ");
      return `<tr><td>${o.document_no}</td><td>${formatDate(o.date)}</td><td>${items}</td><td class="num">${formatRON(o.total)}</td><td class="${o.status === "Finalizat" ? "final" : "pending"}">${o.status}</td></tr>`;
    })
    .join("");
  const html = `
    <h1>FISA CLIENT — ${c.name}</h1>
    <div class="sub">Colaborator: ${c.collaborator_name || "—"} · Generat: ${formatDate(new Date().toISOString())}</div>
    <div class="kpis">
      <div class="kpi"><div class="label">Comenzi</div><div class="val">${c.orders_count}</div></div>
      <div class="kpi"><div class="label">Incasat</div><div class="val">${formatRON(c.collected)}</div></div>
      <div class="kpi"><div class="label">De incasat</div><div class="val">${formatRON(c.pending)}</div></div>
    </div>
    <table><tr><th>Document</th><th>Data</th><th>Produse</th><th>Total</th><th>Status</th></tr>${orderRows || '<tr><td colspan="5">Nicio comanda</td></tr>'}</table>
  `;
  await render(html);
}
