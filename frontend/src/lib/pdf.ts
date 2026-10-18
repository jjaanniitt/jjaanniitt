import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { formatRON, formatRON2, formatDate } from "@/src/lib/format";

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

export async function exportInvoicePdf(inv: any) {
  const co = inv.company || {};
  const lines = (inv.lines || [])
    .map((l: any, i: number) => `<tr><td>${i + 1}</td><td>${l.label}</td><td class="num">${l.qty}</td><td class="num">${formatRON2(l.net / l.qty)}</td><td class="num">${inv.vat_rate}%</td><td class="num">${formatRON2(l.gross)}</td></tr>`)
    .join("");
  const html = `
    <div style="display:flex;justify-content:space-between;">
      <div>
        <h1>FACTURA ${inv.number_full}</h1>
        <div class="sub">Data: ${formatDate(inv.issue_date)} · Scadenta: ${formatDate(inv.due_date)}</div>
      </div>
      <div style="text-align:right;font-size:11px;">
        <strong>${co.name || "—"}</strong><br/>
        ${co.cui ? "CUI " + co.cui + "<br/>" : ""}
        ${co.reg_com ? co.reg_com + "<br/>" : ""}
        ${co.address || ""}<br/>
        ${co.iban ? "IBAN " + co.iban + "<br/>" : ""}
        ${co.bank || ""}
      </div>
    </div>
    <div style="border:1px solid #111;padding:10px;margin-bottom:16px;font-size:11px;">
      <strong>Client:</strong> ${inv.client_name}
      ${inv.client_cui ? " · CUI " + inv.client_cui : ""}
      ${inv.client_address ? "<br/>" + inv.client_address : ""}
    </div>
    <table>
      <tr><th>#</th><th>Produs</th><th>Cant.</th><th>Pret unit. (fara TVA)</th><th>TVA</th><th>Total</th></tr>
      ${lines}
    </table>
    <div class="kpis">
      <div class="kpi"><div class="label">Baza impozabila</div><div class="val">${formatRON2(inv.net)}</div></div>
      <div class="kpi"><div class="label">TVA ${inv.vat_rate}%</div><div class="val">${formatRON2(inv.vat)}</div></div>
      <div class="kpi"><div class="label">Total de plata</div><div class="val">${formatRON2(inv.gross)}</div></div>
      <div class="kpi"><div class="label">Incasat</div><div class="val">${formatRON2(inv.paid || 0)}</div></div>
    </div>
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
