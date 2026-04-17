export const PIPELINE_STAGES = ["Applicant", "Interview", "Offer", "Hired", "Active"] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value);
}

export function normalizePipelineStage(value: string | null | undefined): PipelineStage {
  if (!value) return "Applicant";
  return isPipelineStage(value) ? value : "Applicant";
}

