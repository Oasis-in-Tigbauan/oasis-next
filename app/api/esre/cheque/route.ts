import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { session as auth, SessionCode } from "@/lib/auth";
import * as permission from "@/lib/db/permissions";
import * as esreService from "@/lib/esre";
import { Failure, oneOf } from "@/lib/one-of";
import { validatorUtilities } from "@/lib/validators";

export async function GET(req: NextRequest) {
  const session = await auth.verify([permission.ESRE_READ]);
  if (!session || session.code !== SessionCode.Ok) {
    return htmlResponse(renderErrorPage("You are not allowed to print ESRE cheques."), 403);
  }

  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

  if (ids.length === 0 || ids.some(id => !validatorUtilities.isUuid(id))) {
    return htmlResponse(renderErrorPage("Select valid ESRE rows before printing a cheque."), 400);
  }

  const result = await esreService.getChequePrintData(ids);
  return oneOf(result).match(
    data => htmlResponse(renderChequePage(data)),
    failure => htmlResponse(renderErrorPage(failure.message), failure instanceof Failure ? 400 : 500),
  );
}

function htmlResponse(html: string, status = 200): NextResponse {
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function formatChequeAmountWords(words: string, amount: string): string {
  const cents = amount.split(".")[1]?.padEnd(2, "0").slice(0, 2) ?? "00";
  const trimmedWords = words
    .replace(/\s+ONLY$/iu, "")
    .replace(/\s+AND\s+ZERO\s+CENTAVOS$/iu, "")
    .replace(/\s+AND\s+00\/100$/iu, "")
    .trim();

  if (cents === "00") {
    return `${trimmedWords} ONLY`;
  }

  return `${trimmedWords} ONLY`;
}

function renderChequePage(data: esreService.EsreChequePrintData): string {
  const today = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }).format(data.printedAt);
  const dateDigits = today.replace(/\D/gu, "").split("").join("   ");
  const amountWords = formatChequeAmountWords(data.amountWords, data.amount);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ESRE Cheque Print</title>
  <style>
    @page {
      size: 8.5in 3.5in;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: #f4f6f8;
      font-family: "Times New Roman", Times, serif;
      color: #111827;
    }

    .screen-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      background: white;
      border-bottom: 1px solid #d8dee6;
    }

    .screen-toolbar button {
      height: 34px;
      padding: 0 14px;
      border: 1px solid #9aa7b5;
      border-radius: 6px;
      background: #ffffff;
      cursor: pointer;
      font-weight: 600;
    }

    .sheet {
      width: 8.5in;
      height: 3.5in;
      margin: 24px auto;
      position: relative;
      background: white;
      overflow: hidden;
      box-shadow: 0 12px 40px rgb(15 23 42 / 18%);
      outline: 1px dashed #cbd5e1;
    }

    .payee {
      position: absolute;
      left: 3.1in;
      top: 0.58in;
      width: 2.55in;
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: 0.01em;
      text-transform: uppercase;
      line-height: 1.08;
    }

    .amount-words {
      position: absolute;
      left: 3.08in;
      top: 0.99in;
      width: 3.08in;
      font-size: 10.5pt;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.18;
    }

    .date {
      position: absolute;
      left: 6.46in;
      top: 0.78in;
      width: 1.45in;
      text-align: center;
      font-size: 11pt;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .check-number {
      position: absolute;
      left: 6.55in;
      top: 0.45in;
      width: 1.32in;
      text-align: center;
      font-size: 9pt;
      letter-spacing: 0.04em;
      color: #111827;
    }

    .amount {
      position: absolute;
      left: 6.48in;
      top: 1.22in;
      width: 1.42in;
      text-align: right;
      font-size: 12pt;
      font-weight: 700;
    }

    .treasurer {
      position: absolute;
      left: 3.58in;
      top: 2.47in;
      width: 1.75in;
      text-align: center;
    }

    .mayor {
      position: absolute;
      left: 5.95in;
      top: 2.6in;
      width: 1.9in;
      text-align: center;
    }

    .signatory-name {
      font-size: 12pt;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1.05;
    }

    .signatory-title {
      margin-top: 2px;
      font-size: 10pt;
      line-height: 1.05;
    }

    @media print {
      body {
        background: white;
      }

      .screen-toolbar {
        display: none;
      }

      .sheet {
        margin: 0;
        box-shadow: none;
        outline: none;
      }
    }
  </style>
</head>
<body>
  <div class="screen-toolbar">
    <span>Cheque preview: ${escapeHtml(data.selectedCount.toString())} ESRE item(s), total PHP ${escapeHtml(data.amountFormatted)}</span>
    <button type="button" onclick="window.print()">Print Cheque</button>
  </div>
  <main class="sheet" aria-label="Cheque print layout">
    <div class="check-number">${escapeHtml(data.checkNumber ?? "")}</div>
    <div class="payee">${escapeHtml(data.payee)}</div>
    <div class="amount-words">${escapeHtml(amountWords)}</div>
    <div class="date">${escapeHtml(dateDigits)}</div>
    <div class="amount">${escapeHtml(data.amountFormatted)}</div>
    <div class="treasurer">
      <div class="signatory-name">ELMA G. TIONSAY</div>
      <div class="signatory-title">Municipal Treasurer</div>
    </div>
    <div class="mayor">
      <div class="signatory-name">VIRGILIO T. TERUEL</div>
      <div class="signatory-title">Municipal Mayor</div>
    </div>
  </main>
  <script>
    window.addEventListener("load", () => {
      setTimeout(() => window.print(), 350);
    });
  </script>
</body>
</html>`;
}

function renderErrorPage(message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unable to Print Cheque</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: Arial, sans-serif;
      background: #f8fafc;
      color: #111827;
    }
    main {
      width: min(520px, calc(100vw - 32px));
      padding: 24px;
      border: 1px solid #d8dee6;
      border-radius: 8px;
      background: white;
      box-shadow: 0 16px 50px rgb(15 23 42 / 12%);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 20px;
    }
    p {
      margin: 0;
      color: #4b5563;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <main>
    <h1>Unable to print cheque</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
