import { NextResponse } from "next/server";
import { ReviewRequestSchema } from "@/domain/schemas";
import { runReviewEngine } from "@/domain/rules/rule-engine";
import { loadStaticTaxRules } from "@/domain/rules/rule-store";

export async function POST(request: Request) {
  const body = ReviewRequestSchema.parse(await request.json());
  const rules = loadStaticTaxRules();
  const review = runReviewEngine({
    taxCase: { ...body.taxCase, status: "reviewed" },
    transactions: body.transactions,
    rules
  });

  return NextResponse.json(review);
}
