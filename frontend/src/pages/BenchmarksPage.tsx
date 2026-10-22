/**
 * BenchmarksPage — Dedicated Benchmark, Performance & Empirical Validation Section.
 *
 * Exposes reproducible quantitative evidence measured under controlled workloads.
 * Distinct from live operational KPIs and heartbeats.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Database,
  FileSpreadsheet,
  Gauge,
  Layers,
  RefreshCw,
  Server,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { fetchBenchmarkSummary } from '../lib/api';
import type {
  BenchmarkExperimentSummary,
  BenchmarkResumeEvidenceItem,
  BenchmarkSuiteSummary,
} from '../types/telemetry';

export default function BenchmarksPage() {
  const [data, setData] = useState<BenchmarkSuiteSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadBenchmarkData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summary = await fetchBenchmarkSummary();
      if (summary) {
        setData(summary);
      } else {
        setError('No executed benchmark summary found. Run "python -m benchmarks" to generate empirical results.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load benchmark summary';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadBenchmarkData();
    })();
  }, [loadBenchmarkData]);

  const evidence = data?.resume_evidence || {};
  const experiments = data?.experiments || {};
  const metadata = data?.overall_metadata;

  return (
    <div className="space-y-6 pb-12">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-signal-primary/20 text-signal-primary border border-signal-primary/30 uppercase tracking-widest">
              Empirical Validation Subsystem
            </span>
            <span className="text-xs text-text-muted">SentinelCore Performance & Reliability</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary mt-1">
            System Benchmarks & Defensible Evidence
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadBenchmarkData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Results
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadBenchmarkData}
            className="underline hover:text-rose-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Strict Isolation Notice ───────────────────────────────────────── */}
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-amber-200">
            CONTROLLED BENCHMARK MEASUREMENTS — ISOLATED FROM PRODUCTION STATE
          </div>
          <p className="text-amber-300/80 leading-relaxed">
            The data presented here is measured from executed empirical experiments (E01–E11) under controlled workloads,
            simulated outages, and stress scenarios. These values reflect tested system capacity, detection coverage,
            and reliability limits, and are separate from live operational KPIs.
          </p>
        </div>
      </div>

      {/* ── Metadata Strip ───────────────────────────────────────────────── */}
      {metadata && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-bg-surface p-3.5 rounded-xl border border-border">
          <div>
            <div className="text-[10px] uppercase font-mono text-text-muted">Latest Benchmark Run</div>
            <div className="text-xs font-mono text-text-primary font-medium mt-0.5">
              {new Date(data?.generated_at || metadata.timestamp).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-mono text-text-muted">Target Environment</div>
            <div className="text-xs font-mono text-text-primary font-medium mt-0.5 truncate">
              {metadata.OS} (Host: {metadata.hostname})
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-mono text-text-muted">Git Version / Commit</div>
            <div className="text-xs font-mono text-signal-primary font-medium mt-0.5">
              {metadata.git_commit_or_version}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-mono text-text-muted">Experiments Executed</div>
            <div className="text-xs font-mono text-emerald-400 font-medium mt-0.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {Object.keys(experiments).length} / 11 Verified
            </div>
          </div>
        </div>
      )}

      {/* ── Key Measured Benchmark Metrics Strip ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Throughput */}
        <div className="p-4 rounded-xl border border-border bg-bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-text-muted">Max Sustainable Throughput</span>
            <TrendingUp className="w-4 h-4 text-signal-primary" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-text-primary">
              {evidence.max_sustainable_throughput ? `${evidence.max_sustainable_throughput.value} eps` : 'N/A'}
            </div>
            <div className="text-[11px] text-text-muted mt-1 flex justify-between">
              <span>0% Event Loss SLA</span>
              <span>N={evidence.max_sustainable_throughput?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Detection Latency */}
        <div className="p-4 rounded-xl border border-border bg-bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-text-muted">P95 Detection Latency</span>
            <Gauge className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {evidence.p95_detection_latency ? `${evidence.p95_detection_latency.value} ms` : 'N/A'}
            </div>
            <div className="text-[11px] text-text-muted mt-1 flex justify-between">
              <span>Ingestion-to-Alert</span>
              <span>N={evidence.p95_detection_latency?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Detection Coverage */}
        <div className="p-4 rounded-xl border border-border bg-bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-text-muted">Fault Detection Coverage</span>
            <ShieldCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-sky-400">
              {evidence.detection_coverage ? `${evidence.detection_coverage.value}%` : 'N/A'}
            </div>
            <div className="text-[11px] text-text-muted mt-1 flex justify-between">
              <span>8 Controlled Classes</span>
              <span>N={evidence.detection_coverage?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Metric 4: Alert Precision */}
        <div className="p-4 rounded-xl border border-border bg-bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-text-muted">Alert Precision</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-purple-400">
              {evidence.alert_precision ? `${evidence.alert_precision.value}%` : 'N/A'}
            </div>
            <div className="text-[11px] text-text-muted mt-1 flex justify-between">
              <span>FPR: {evidence.false_positive_rate?.value ?? 0}%</span>
              <span>N={evidence.alert_precision?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Metric 5: ML F1 Score */}
        <div className="p-4 rounded-xl border border-border bg-bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-text-muted">ML Anomaly Detection F1</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-indigo-400">
              {evidence.ml_f1_score ? `${evidence.ml_f1_score.value}` : 'N/A'}
            </div>
            <div className="text-[11px] text-text-muted mt-1 flex justify-between">
              <span>Isolation Forest v2</span>
              <span>N={evidence.ml_f1_score?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Metric 6: Maximum Tested Scale */}
        <div className="p-4 rounded-xl border border-border bg-bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-text-muted">Maximum Tested Scale</span>
            <Server className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-amber-400">
              {evidence.maximum_tested_scale ? `${evidence.maximum_tested_scale.value} systems` : 'N/A'}
            </div>
            <div className="text-[11px] text-text-muted mt-1 flex justify-between">
              <span>Validated (0% Loss)</span>
              <span>N={evidence.maximum_tested_scale?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Metric 7: Collector Resource Overhead */}
        <div className="p-4 rounded-xl border border-border bg-bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-text-muted">Collector Resource Overhead</span>
            <Cpu className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold font-mono text-teal-400">
              {evidence.collector_cpu_overhead ? `+${evidence.collector_cpu_overhead.value}% CPU` : 'N/A'}
            </div>
            <div className="text-[11px] text-text-muted mt-1 flex justify-between">
              <span>RAM: +{evidence.collector_memory_overhead?.value ?? 0} MB</span>
              <span>N={evidence.collector_cpu_overhead?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Metric 8: Telemetry Delivery Success */}
        <div className="p-4 rounded-xl border border-border bg-bg-surface flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-text-muted">Delivery Success During Outage</span>
            <Database className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-rose-400">
              {evidence.telemetry_delivery_success_rate ? `${evidence.telemetry_delivery_success_rate.value}%` : 'N/A'}
            </div>
            <div className="text-[11px] text-text-muted mt-1 flex justify-between">
              <span>Fallback Drain: {evidence.kafka_recovery_time?.value ?? 0}s</span>
              <span>N={evidence.telemetry_delivery_success_rate?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Defensible Quantitative Claims & Evidence Provenance ─────────── */}
      <div className="p-5 rounded-xl border border-border bg-bg-surface space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-signal-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-text-primary">
            Defensible Evidence & Raw Data Provenance (Resume Claims)
          </h2>
        </div>
        <p className="text-xs text-text-muted">
          All values below are guaranteed to map directly to persisted raw observations recorded in CSV and JSON artifacts.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase font-mono text-text-muted">
                <th className="py-2.5 px-3">Metric Name</th>
                <th className="py-2.5 px-3">Empirical Result</th>
                <th className="py-2.5 px-3">Sample Count</th>
                <th className="py-2.5 px-3">Experiment</th>
                <th className="py-2.5 px-3">Raw Artifact Traceability</th>
                <th className="py-2.5 px-3">Methodology & Provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50 font-mono">
              {Object.entries(evidence).map(([key, item]: [string, BenchmarkResumeEvidenceItem]) => (
                <tr key={key} className="hover:bg-bg-hover/50 transition-colors">
                  <td className="py-2 px-3 font-sans font-medium text-text-primary">{item.metric_name}</td>
                  <td className="py-2 px-3 text-signal-primary font-bold">
                    {item.value} {item.unit}
                  </td>
                  <td className="py-2 px-3 text-text-secondary">{item.sample_count}</td>
                  <td className="py-2 px-3">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-bg-surface border border-border text-text-muted">
                      {item.experiment_code}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-text-muted text-[11px] truncate max-w-[180px]">
                    {item.source_artifact}
                  </td>
                  <td className="py-2 px-3 font-sans text-text-muted text-[11px] max-w-xs truncate" title={item.provenance}>
                    {item.provenance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── All Experiments Breakdown Table ───────────────────────────────── */}
      <div className="p-5 rounded-xl border border-border bg-bg-surface space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-text-primary">
            Experiment Execution Directory (E01 – E11)
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase font-mono text-text-muted">
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Experiment Title</th>
                <th className="py-2.5 px-3">Sample Count</th>
                <th className="py-2.5 px-3">Primary Measured Result</th>
                <th className="py-2.5 px-3">Run Identifier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {Object.entries(experiments).map(([code, exp]: [string, BenchmarkExperimentSummary]) => {
                let primaryResult = 'Completed';
                if (code === 'E01' && exp.detection_latency_ms) {
                  primaryResult = `P50: ${exp.detection_latency_ms.p50}ms | P95: ${exp.detection_latency_ms.p95}ms`;
                } else if (code === 'E02' && exp.overall_detection_coverage !== undefined) {
                  primaryResult = `Coverage: ${(exp.overall_detection_coverage * 100).toFixed(1)}%`;
                } else if (code === 'E03' && exp.alert_precision !== undefined) {
                  primaryResult = `Precision: ${(exp.alert_precision * 100).toFixed(1)}% | F1: ${exp.f1_score ?? 'N/A'}`;
                } else if (code === 'E04' && exp.maximum_sustainable_events_per_sec !== undefined) {
                  primaryResult = `Max Throughput: ${exp.maximum_sustainable_events_per_sec} eps`;
                } else if (code === 'E05' && exp.delivery_success_rate !== undefined) {
                  primaryResult = `Delivery Success: ${(exp.delivery_success_rate * 100).toFixed(1)}%`;
                } else if (code === 'E06' && exp.persisted_percentage !== undefined) {
                  primaryResult = `DB Recovery: ${exp.db_recovery_time_seconds}s | Persisted: ${exp.persisted_percentage}%`;
                } else if (code === 'E07' && exp.concurrency_results) {
                  const maxC = exp.concurrency_results[exp.concurrency_results.length - 1];
                  primaryResult = `${maxC.requests_per_second} req/s @ C=${maxC.concurrency}`;
                } else if (code === 'E08' && exp.f1_score !== undefined) {
                  primaryResult = `F1: ${exp.f1_score} | ROC-AUC: ${exp.roc_auc ?? 'N/A'}`;
                } else if (code === 'E09' && exp.lead_time_seconds) {
                  primaryResult = `Median Lead Time: ${exp.lead_time_seconds.p50}s`;
                } else if (code === 'E10' && exp.collector_cpu_overhead_percentage_points !== undefined) {
                  primaryResult = `CPU: +${exp.collector_cpu_overhead_percentage_points}% pts | RAM: +${exp.collector_memory_overhead_mb} MB`;
                } else if (code === 'E11' && exp.maximum_tested_scale !== undefined) {
                  primaryResult = `Max Validated Scale: ${exp.maximum_tested_scale} systems`;
                }

                return (
                  <tr key={code} className="hover:bg-bg-hover/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-signal-primary">{code}</td>
                    <td className="py-2.5 px-3 font-medium text-text-primary">{exp.experiment_name}</td>
                    <td className="py-2.5 px-3 font-mono text-text-secondary">{exp.sample_count}</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400 font-medium">{primaryResult}</td>
                    <td className="py-2.5 px-3 font-mono text-text-muted text-[11px] truncate max-w-[200px]">
                      {exp.experiment_id}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
