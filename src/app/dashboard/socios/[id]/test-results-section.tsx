"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type TestResult = {
  id: string;
  test: string;
  valueNumeric: number;
  unit: string;
  recordedAt: Date;
  notes: string | null;
};

export function TestResultsSection({
  testResults,
  memberId,
  testLabels,
}: {
  testResults: TestResult[];
  memberId: string;
  testLabels: Record<string, string>;
}) {
  if (testResults.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Tests físicos SRXFit</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sin resultados de tests. Se registran en las evaluaciones de la Semana 9 y durante el onboarding.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by test type, show latest result + history
  const byTest = new Map<string, TestResult[]>();
  for (const tr of testResults) {
    const existing = byTest.get(tr.test) ?? [];
    existing.push(tr);
    byTest.set(tr.test, existing);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Tests físicos SRXFit</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from(byTest.entries()).map(([test, results]) => {
            const latest = results[0];
            const prev = results[1];
            const improved = prev ? latest.valueNumeric > prev.valueNumeric : null;
            // For time-based tests, lower is better
            const isTimeBased = test.includes("SECONDS") || test.includes("TIME");
            const actuallyImproved = isTimeBased ? (prev ? latest.valueNumeric < prev.valueNumeric : null) : improved;

            return (
              <div key={test} className="p-3 rounded-md border space-y-1">
                <p className="text-xs text-muted-foreground">
                  {testLabels[test] ?? test}
                </p>
                <p className="text-lg font-semibold">
                  {latest.valueNumeric} <span className="text-sm font-normal text-muted-foreground">{latest.unit}</span>
                </p>
                {actuallyImproved !== null && (
                  <Badge variant="outline" className={
                    actuallyImproved
                      ? "text-emerald-600 border-emerald-200 text-xs"
                      : "text-red-600 border-red-200 text-xs"
                  }>
                    {actuallyImproved ? "↑ Mejoró" : "↓ Bajó"}
                    {prev && ` (antes: ${prev.valueNumeric})`}
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(latest.recordedAt).toLocaleDateString("es-EC")}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
