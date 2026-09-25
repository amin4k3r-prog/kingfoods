import { normalizeCustomerName, validTaxId } from "./policy";
export type ReceivableImportRow = {
  document: string;
  customer: string;
  customer_id: string | null;
  due: string;
  amount: number;
  balance_display: string;
  charge_type: string;
  seller: string;
};
export type CsvImportPreview = {
  valid: ReceivableImportRow[];
  rows: ReceivableImportRow[];
  presentDocuments: string[];
  duplicates: number;
  invalid: { line: number; reason: string }[];
  excluded: number;
  absent: string[];
  unlinked: number;
};

const headerKey = (value: string) =>
  value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
const validDate = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
    ? date.toISOString().slice(0, 10)
    : null;
};

export function decodeCsv(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, "");
  }
}

function detectDelimiter(text: string) {
  const line = text.split(/\r?\n/).find((x) => x.trim()) ?? "";
  const count = (delimiter: string) => {
    let quoted = false,
      total = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\"') {
        if (quoted && line[i + 1] === '\"') {
          i++;
          continue;
        }
        quoted = !quoted;
      } else if (!quoted && line[i] === delimiter) total++;
    }
    return total;
  };
  return count(",") > count(";") ? "," : ";";
}
function parseRecords(text: string) {
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      record.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      if (record.some((cell) => cell.trim())) records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field || record.length) {
    record.push(field);
    if (record.some((cell) => cell.trim())) records.push(record);
  }
  return records;
}

export function parseCsvDate(raw: string) {
  const value = raw.trim();
  let m = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += year < 50 ? 2000 : 1900;
    return validDate(year, +m[2], +m[1]);
  }
  if (/^\d{5}(?:\.\d+)?$/.test(value)) {
    const serial = Number(value);
    if (serial >= 1 && serial <= 100000) {
      const date = new Date(
        Date.UTC(1899, 11, 30) + Math.trunc(serial) * 86400000,
      );
      return validDate(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
      );
    }
  }
  return null;
}

function parseMoney(raw: string) {
  let value = raw.trim().replace(/\s|R\$/gi, "");
  if (!value || !/^[-+]?\d[\d.,]*$/.test(value)) return null;
  const sign = value.startsWith("-") ? -1 : 1;
  value = value.replace(/^[-+]/, "");
  let integer = "",
    fraction = "";
  if (value.includes(",")) {
    if ((value.match(/,/g) || []).length !== 1) return null;
    const parts = value.split(",");
    integer = parts[0].replace(/[.]/g, "");
    fraction = parts[1];
  } else if (value.includes(".")) {
    const parts = value.split(".");
    if (parts.length === 2 && parts[1].length !== 3) {
      integer = parts[0];
      fraction = parts[1];
    } else integer = parts.join("");
  } else integer = value;
  if (!/^\d+$/.test(integer) || (fraction && !/^\d+$/.test(fraction)))
    return null;
  const whole = Number(integer),
    fractionDigits = (fraction + "00").slice(0, 2),
    roundUp = (fraction + "000")[2] >= "5";
  if (!Number.isSafeInteger(whole) || whole < 0) return null;
  const cents = whole * 100 + Number(fractionDigits) + (roundUp ? 1 : 0);
  return Number.isSafeInteger(cents) ? cents * sign : null;
}

function documentValue(raw: string) {
  let value = raw.trim();
  const formula = value.match(/^=\s*"([\s\S]*)"$/);
  if (formula) value = formula[1].replace(/""/g, '"');
  else if (value.startsWith("=")) value = value.slice(1).trim();
  return value.trim();
}

export function previewReceivablesCsv(
  text: string,
  existingCards: {
    document?: string | null;
    archived_at?: string | null;
    paid?: number;
    kind?: string;
    customer_id?: string | null;
  }[],
  customers: {
    id: string;
    name: string;
    customer_code?: string | null;
    tax_id?: string;
  }[],
): CsvImportPreview {
  const records = parseRecords(text);
  const headerIndex = records.findIndex(
    (row) =>
      row.some((cell) => headerKey(cell) === "documento") &&
      row.some((cell) => headerKey(cell) === "saldo"),
  );
  if (headerIndex < 0)
    throw new Error("Não encontrei as colunas Documento e Saldo no CSV.");
  const headers = records[headerIndex].map(headerKey);
  const index = (name: string) => headers.indexOf(headerKey(name));
  const docIndex = index("Documento"),
    balanceIndex = index("Saldo"),
    customerIndex = index("Fantasia"),
    companyIndex = index("Razão Social"),
    dateIndex = index("Vencimento"),
    chargeIndex = index("Tipo cobrança"),
    sellerIndex = index("Vendedor"),
    customerCodeIndex =
      index("Código do cliente") >= 0
        ? index("Código do cliente")
        : index("Cod. Cliente") >= 0
          ? index("Cod. Cliente")
          : index("Código");
  if (dateIndex < 0 || (customerIndex < 0 && companyIndex < 0))
    throw new Error(
      "O CSV precisa conter Vencimento e Fantasia ou Razão Social.",
    );
  const existingByDocument = new Map(
    existingCards.map((c) => [c.document?.trim() ?? "", c]),
  );
  const existing = new Set(existingByDocument.keys()),
    seen = new Set<string>(),
    present = new Set<string>();
  const customersByCode = new Map<string, typeof customers>();
  const customersByName = new Map<string, typeof customers>();
  for (const customer of customers) {
    const code = String(customer.customer_code ?? "").trim();
    if (code) {
      const list = customersByCode.get(code) ?? [];
      list.push(customer);
      customersByCode.set(code, list);
    }
    const name = normalizeCustomerName(customer.name);
    const list = customersByName.get(name) ?? [];
    list.push(customer);
    customersByName.set(name, list);
  }
  const preview: CsvImportPreview = {
    valid: [],
    rows: [],
    presentDocuments: [],
    duplicates: 0,
    invalid: [],
    excluded: 0,
    absent: [],
    unlinked: 0,
  };
  records.slice(headerIndex + 1).forEach((row, rowOffset) => {
    const line = headerIndex + rowOffset + 2;
    const cell = (i: number) => (i < 0 ? "" : (row[i] ?? "").trim());
    const document = documentValue(cell(docIndex));
    if (document) present.add(document);
    const companyRaw = cell(companyIndex);
    const embeddedCode = companyRaw.match(/^\s*(\d+)\s*[-–]/)?.[1] ?? "";
    const legalName = companyRaw.replace(/^\s*\d+\s*[-–]\s*/, "").trim();
    const customer = cell(customerIndex) || legalName;
    const due = parseCsvDate(cell(dateIndex));
    const rawBalance = cell(balanceIndex);
    const amount = parseMoney(rawBalance);
    const reason = !document
      ? "Documento vazio"
      : !customer
        ? "Cliente vazio"
        : !due
          ? "Vencimento inválido"
          : amount === null
            ? "Saldo inválido"
            : "";
    if (reason) {
      preview.invalid.push({ line, reason });
      return;
    }
    if (!due || amount === null || !document || !customer) return;
    if (amount <= 0) {
      preview.excluded++;
      return;
    }
    if (seen.has(document)) {
      preview.duplicates++;
      return;
    }
    seen.add(document);
    const candidateNames = [cell(customerIndex), legalName]
      .filter(Boolean)
      .map(normalizeCustomerName);
    const code = cell(customerCodeIndex) || embeddedCode;
    const codeMatches = code ? (customersByCode.get(code) ?? []) : [];
    const nameMatches = codeMatches.length
      ? []
      : candidateNames.flatMap((name) => customersByName.get(name) ?? []);
    const matches = codeMatches.length
      ? codeMatches
      : [...new Map(nameMatches.map((match) => [match.id, match])).values()];
    const previous = existingByDocument.get(document);
    const customerId =
      matches.length === 1 ? matches[0].id : (previous?.customer_id ?? null);
    if (!customerId) preview.unlinked++;
    const item = {
      document,
      customer,
      customer_id: customerId,
      due,
      amount,
      balance_display: rawBalance,
      charge_type: cell(chargeIndex) || "Não informado",
      seller: cell(sellerIndex) || "Não informado",
    };
    preview.rows.push(item);
    if (existing.has(document)) preview.duplicates++;
    else preview.valid.push(item);
  });
  preview.presentDocuments = [...present];
  preview.absent = existingCards
    .filter(
      (c) =>
        c.kind === "title" &&
        !c.paid &&
        !c.archived_at &&
        c.document &&
        !present.has(c.document),
    )
    .map((c) => c.document as string);
  return preview;
}

export type CustomerImportRow = {
  customer_code: string;
  name: string;
  tax_id: string;
  seller_name: string;
  last_sale_date: string;
  address: string;
  city: string;
  category: string;
};
export type CustomerCsvPreview = {
  rows: CustomerImportRow[];
  newCount: number;
  updateCount: number;
  duplicates: number;
  invalid: { line: number; reason: string }[];
};
export function previewCustomersCsv(
  text: string,
  existingCustomers: {
    id: string;
    customer_code: string | null;
    tax_id: string;
    name: string;
  }[],
): CustomerCsvPreview {
  const records = parseRecords(text);
  const headerIndex = records.findIndex(
    (row) =>
      row.some((cell) =>
        ["codigo", "codigo do cliente", "cod cliente"].includes(
          headerKey(cell),
        ),
      ) &&
      row.some((cell) => ["cnpj", "cpf", "cpf/cnpj", "cpf ou cnpj"].includes(headerKey(cell))) &&
      row.some((cell) => headerKey(cell) === "nome"),
  );
  if (headerIndex < 0)
    throw new Error("Não encontrei as colunas Nome, CPF/CNPJ e Código no CSV.");
  const headers = records[headerIndex].map(headerKey),
    idx = (...names: string[]) => {
      for (const name of names) {
        const found = headers.indexOf(headerKey(name));
        if (found >= 0) return found;
      }
      return -1;
    };
  const nameIndex = idx("Nome"),
    taxIndex = idx("CPF/CNPJ", "CPF ou CNPJ", "CNPJ", "CPF"),
    cpfIndex = idx("CPF"),
    codeIndex = idx("Código", "Codigo"),
    sellerIndex = idx("Nome do vendedor", "Vendedor"),
    saleIndex = idx(
      "Data da última venda",
      "Última venda",
      "Data última venda",
    ),
    addressIndex = idx("Endereço", "Endereco"),
    cityIndex = idx("Cidade"),
    categoryIndex = idx("Categoria");
  const codeMap = new Map(
    existingCustomers.map((c) => [String(c.customer_code ?? ""), c]),
  );
  const taxMap = new Map(
    existingCustomers.map((c) => [c.tax_id.replace(/\D/g, ""), c]),
  );
  const seen = new Set<string>(),
    seenTax = new Map<string, string>();
  const preview: CustomerCsvPreview = {
    rows: [],
    newCount: 0,
    updateCount: 0,
    duplicates: 0,
    invalid: [],
  };
  records.slice(headerIndex + 1).forEach((row, offset) => {
    const line = headerIndex + offset + 2,
      cell = (i: number) => (i < 0 ? "" : String(row[i] ?? "").trim());
    const customer_code = documentValue(cell(codeIndex)),
      name = cell(nameIndex),
      tax_id = (cell(taxIndex) || cell(cpfIndex)).replace(/\D/g, "");
    if (!customer_code || !name || !validTaxId(tax_id)) {
      preview.invalid.push({
        line,
        reason: !customer_code
          ? "Código vazio"
          : !name
            ? "Nome vazio"
            : "CPF ou CNPJ inválido",
      });
      return;
    }
    if (seen.has(customer_code)) {
      preview.duplicates++;
      return;
    }
    seen.add(customer_code);
    const previousCode = seenTax.get(tax_id);
    if (previousCode && previousCode !== customer_code) {
      preview.invalid.push({
        line,
        reason: "CPF ou CNPJ repetido com códigos diferentes",
      });
      return;
    }
    seenTax.set(tax_id, customer_code);
    const codeCustomer = codeMap.get(customer_code);
    const taxCustomer = taxMap.get(tax_id);
    if (
      taxCustomer &&
      taxCustomer.customer_code &&
      taxCustomer.customer_code !== customer_code &&
      !taxCustomer.customer_code.startsWith("LEGACY-")
    ) {
      preview.invalid.push({
        line,
        reason: "CPF ou CNPJ já cadastrado com outro código",
      });
      return;
    }
    if (codeCustomer && taxCustomer && codeCustomer.id !== taxCustomer.id) {
      preview.invalid.push({
        line,
        reason: "Código e documento já pertencem a cadastros diferentes",
      });
      return;
    }
    const lastSale = cell(saleIndex),
      last_sale_date = lastSale ? (parseCsvDate(lastSale) ?? lastSale) : "";
    preview.rows.push({
      customer_code,
      name,
      tax_id,
      seller_name: cell(sellerIndex),
      last_sale_date,
      address: cell(addressIndex),
      city: cell(cityIndex),
      category: cell(categoryIndex),
    });
    if (codeCustomer || taxCustomer) preview.updateCount++;
    else preview.newCount++;
  });
  return preview;
}
