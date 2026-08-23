import type pg from 'pg';

/**
 * S1-T7 — Cost & cache telemetry (Doc 04 §17).
 * Every routed call writes an ai_execution_audits row: model used, token
 * counts, latency, computed £cost, and prompt_cache_hit for the ≥85%
 * prefix-cache target metric.
 */

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputUsdPerMillion: number;
  /** USD per 1M output tokens */
  outputUsdPerMillion: number;
}

/** Published list prices (USD / 1M tokens). */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'gpt-4o': { inputUsdPerMillion: 2.5, outputUsdPerMillion: 10 },
  'gpt-4o-mini': { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
  'claude-3-5-sonnet-20241022': { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
  'claude-3-5-haiku-20241022': { inputUsdPerMillion: 0.8, outputUsdPerMillion: 4 }
};

export const DEFAULT_GBP_USD_RATE = 0.79;

export function getPricing(model: string): ModelPricing {
  const tierOneRates: ModelPricing = {
    // Unknown/override models price at Tier-1 rates (conservative budgeting).
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 10
  };
  return MODEL_PRICING[model] ?? tierOneRates;
}

export function computeCostGbp(
  model: string,
  inputTokens: number,
  outputTokens: number,
  gbpUsdRate: number = DEFAULT_GBP_USD_RATE
): number {
  const p = getPricing(model);
  const usd =
    (inputTokens / 1_000_000) * p.inputUsdPerMillion +
    (outputTokens / 1_000_000) * p.outputUsdPerMillion;
  // Round to 6dp — matches double precision column without float dust.
  return Math.round(usd * gbpUsdRate * 1e6) / 1e6;
}

export interface AiExecutionAuditRecord {
  sessionId: string;
  modelUsed: string;
  promptCacheHit: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export type AiExecutionAuditRow = AiExecutionAuditRecord & { costGbp: number };

export interface AuditSink {
  writeAiExecutionAudit(record: AiExecutionAuditRecord): Promise<AiExecutionAuditRow>;
  listAudits(sessionId?: string): Promise<AiExecutionAuditRow[]>;
}

/** Enriches with £cost then delegates persistence to the injected store fn. */
export class PgAuditSink implements AuditSink {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gbpUsdRate: number = DEFAULT_GBP_USD_RATE
  ) {}

  async writeAiExecutionAudit(record: AiExecutionAuditRecord): Promise<AiExecutionAuditRow> {
    const costGbp = computeCostGbp(
      record.modelUsed,
      record.inputTokens,
      record.outputTokens,
      this.gbpUsdRate
    );
    await this.pool.query(
      `INSERT INTO ai_execution_audits
         (session_id, model_used, prompt_cache_hit, input_tokens, output_tokens, cost_gbp, latency_ms)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
      [
        record.sessionId,
        record.modelUsed,
        record.promptCacheHit,
        record.inputTokens,
        record.outputTokens,
        costGbp,
        record.latencyMs
      ]
    );
    return { ...record, costGbp };
  }

  async listAudits(sessionId?: string): Promise<AiExecutionAuditRow[]> {
    const res = sessionId
      ? await this.pool.query<{
          session_id: string;
          model_used: string;
          prompt_cache_hit: boolean;
          input_tokens: number;
          output_tokens: number;
          cost_gbp: number;
          latency_ms: number;
        }>(
          `SELECT session_id::text, model_used, prompt_cache_hit, input_tokens, output_tokens, cost_gbp, latency_ms
           FROM ai_execution_audits WHERE session_id = $1::uuid ORDER BY created_at`,
          [sessionId]
        )
      : await this.pool.query<{
          session_id: string;
          model_used: string;
          prompt_cache_hit: boolean;
          input_tokens: number;
          output_tokens: number;
          cost_gbp: number;
          latency_ms: number;
        }>(
          `SELECT session_id::text, model_used, prompt_cache_hit, input_tokens, output_tokens, cost_gbp, latency_ms
           FROM ai_execution_audits ORDER BY created_at`
        );
    return res.rows.map((r) => ({
      sessionId: r.session_id,
      modelUsed: r.model_used,
      promptCacheHit: r.prompt_cache_hit,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      costGbp: r.cost_gbp,
      latencyMs: r.latency_ms
    }));
  }
}

export class InMemoryAuditSink implements AuditSink {
  private readonly rows: AiExecutionAuditRow[] = [];

  constructor(private readonly gbpUsdRate: number = DEFAULT_GBP_USD_RATE) {}

  async writeAiExecutionAudit(record: AiExecutionAuditRecord): Promise<AiExecutionAuditRow> {
    const row: AiExecutionAuditRow = {
      ...record,
      costGbp: computeCostGbp(record.modelUsed, record.inputTokens, record.outputTokens, this.gbpUsdRate)
    };
    this.rows.push(row);
    return row;
  }

  async listAudits(sessionId?: string): Promise<AiExecutionAuditRow[]> {
    return sessionId ? this.rows.filter((r) => r.sessionId === sessionId) : [...this.rows];
  }

  get size(): number {
    return this.rows.length;
  }
}

/** Prefix-cache hit-rate metric wired for dashboards (target ≥85%). */
export function computeCacheHitRate(rows: Array<{ promptCacheHit: boolean }>): number {
  if (rows.length === 0) return 0;
  const hits = rows.filter((r) => r.promptCacheHit).length;
  return hits / rows.length;
}
