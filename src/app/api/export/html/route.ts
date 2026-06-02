import { NextResponse } from "next/server";
import { z } from "zod";
import { ReviewOutputSchema, TaxCaseSchema, TransactionSchema } from "@/domain/schemas";
import { buildTaxPack } from "@/domain/summary/tax-pack";
import { renderTaxPackHtml } from "@/domain/summary/export-html";

const ExportHtmlRequestSchema = z.object({
  taxCase: TaxCaseSchema,
  transactions: z.array(TransactionSchema).min(1),
  review: ReviewOutputSchema
});

export async function POST(request: Request) {
  const body = ExportHtmlRequestSchema.parse(await request.json());
  const taxPack = buildTaxPack(body.taxCase, body.transactions, body.review);
  return new NextResponse(renderTaxPackHtml(taxPack), {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}
