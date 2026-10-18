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

async function renderRaw(fullHtml: string) {
  const { uri } = await Print.printToFileAsync({ html: fullHtml });
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
  const unit = (l: any) => (l.unit_price != null ? l.unit_price : l.gross / l.qty);
  const lines = (inv.lines || [])
    .map((l: any, i: number) =>
      `<tr>
        <td class="c">${i + 1}</td>
        <td>${l.label}</td>
        <td class="c">buc</td>
        <td class="r">${l.qty}</td>
        <td class="r">${formatRON2(unit(l)).replace(" RON", "")}</td>
        <td class="r">${formatRON2(l.gross).replace(" RON", "")}</td>
      </tr>`)
    .join("");

  const NAVY = "#0B2A4A";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
    body { margin: 0; color: #1a1a1a; font-size: 12px; }
    .bar { background: ${NAVY}; color: #fff; padding: 20px 28px; display: flex; justify-content: space-between; align-items: center; }
    .bar h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 1px; }
    .bar .no { font-size: 20px; font-weight: 700; }
    .bar .no small { display:block; font-size: 10px; font-weight: 400; opacity: .8; letter-spacing: 1px; text-transform: uppercase; }
    .wrap { padding: 24px 28px; }
    .meta { text-align: right; margin-bottom: 14px; font-size: 12px; }
    .meta b { color: ${NAVY}; }
    .parties { display: flex; gap: 16px; margin-bottom: 20px; }
    .party { flex: 1; border: 1px solid #d9dee6; border-top: 3px solid ${NAVY}; padding: 12px 14px; }
    .party .role { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #7a8599; margin-bottom: 4px; }
    .party .nm { font-size: 15px; font-weight: 700; color: ${NAVY}; margin-bottom: 6px; }
    .party .ln { font-size: 11.5px; line-height: 1.55; }
    .party .ln b { color: #51607a; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead th { background: ${NAVY}; color: #fff; font-size: 11px; font-weight: 600; text-transform: uppercase; padding: 9px 10px; text-align: left; }
    tbody td { padding: 9px 10px; border-bottom: 1px solid #e4e8ef; font-size: 12px; }
    tbody tr:nth-child(even) td { background: #f6f8fb; }
    td.r, th.r { text-align: right; } td.c, th.c { text-align: center; }
    .totals { display: flex; justify-content: flex-end; }
    .tbox { width: 56%; }
    .trow { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 12.5px; }
    .trow.base { color: #51607a; }
    .grand { background: ${NAVY}; color: #fff; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 700; margin-top: 4px; }
    .delivery { margin-top: 22px; display: flex; gap: 24px; font-size: 11px; color: #51607a; }
    .delivery .box { flex: 1; } .delivery .lbl { font-weight: 700; color: #1a1a1a; margin-bottom: 3px; }
    .sign { margin-top: 2px; border-top: 1px dotted #9aa6ba; padding-top: 18px; }
    .foot { background: ${NAVY}; color: #fff; text-align: center; padding: 10px; font-size: 10px; letter-spacing: .5px; margin-top: 26px; }
  </style></head><body>
    <div class="bar">
      <h1>FACTURĂ</h1>
      <div class="no">${inv.number_full}<small>Serie ${inv.series}</small></div>
    </div>
    <div class="wrap">
      <div class="meta"><b>Data emiterii:</b> ${formatDate(inv.issue_date)} &nbsp;·&nbsp; <b>Scadență:</b> ${formatDate(inv.due_date)}</div>
      <div class="parties">
        <div class="party">
          <div class="role">Furnizor</div>
          <div class="nm">${co.name || "—"}</div>
          <div class="ln">
            ${co.reg_com ? `<b>Reg. com.:</b> ${co.reg_com}<br/>` : ""}
            ${co.cui ? `<b>CIF:</b> ${co.cui}<br/>` : ""}
            ${co.address ? `<b>Adresa:</b> ${co.address}<br/>` : ""}
            ${co.iban ? `<b>IBAN:</b> ${co.iban}<br/>` : ""}
            ${co.bank ? `<b>Banca:</b> ${co.bank}<br/>` : ""}
            ${co.phone ? `<b>Tel.:</b> ${co.phone}` : ""}
          </div>
        </div>
        <div class="party">
          <div class="role">Client</div>
          <div class="nm">${inv.client_name}</div>
          <div class="ln">
            ${inv.client_cui ? `<b>CIF:</b> ${inv.client_cui}<br/>` : ""}
            ${inv.client_address ? `<b>Adresa:</b> ${inv.client_address}<br/>` : ""}
            <b>Țara:</b> România
          </div>
        </div>
      </div>
      <table>
        <thead><tr>
          <th class="c">Nr.</th><th>Denumire produs/serviciu</th><th class="c">U.M.</th>
          <th class="r">Cant.</th><th class="r">Preț unitar (RON)</th><th class="r">Valoare (RON)</th>
        </tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <div class="totals"><div class="tbox">
        ${inv.vat_rate === 0
          ? `<div class="trow base"><span>Regim TVA</span><span>Fără TVA (neplătitor)</span></div>`
          : `<div class="trow base"><span>Bază impozabilă</span><span>${formatRON2(inv.net)}</span></div>
             <div class="trow base"><span>TVA ${inv.vat_rate}%</span><span>${formatRON2(inv.vat)}</span></div>`}
        <div class="grand"><span>TOTAL DE PLATĂ</span><span>${formatRON2(inv.gross)}</span></div>
        ${(inv.paid || 0) > 0 ? `<div class="trow"><span>Încasat</span><span>${formatRON2(inv.paid)}</span></div>
        <div class="trow"><span>Rest de plată</span><span>${formatRON2(inv.gross - (inv.paid || 0))}</span></div>` : ""}
      </div></div>
      <div class="delivery">
        <div class="box"><div class="lbl">Întocmit de:</div>${co.name || "—"}</div>
        <div class="box"><div class="lbl">Date privind expediția:</div>Expediere la data de ........, ora .....</div>
        <div class="box"><div class="lbl">Semnătura de primire:</div><div class="sign"></div></div>
      </div>
    </div>
    <div class="foot">Emis cu NodeOne · nodeintelligence.ro</div>
  </body></html>`;
  await renderRaw(html);
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
