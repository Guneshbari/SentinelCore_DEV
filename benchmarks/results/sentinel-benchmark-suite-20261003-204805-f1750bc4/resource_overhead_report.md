# Benchmark Report: E10 Collector Resource Overhead

**Experiment ID:** `E10-overhead-20261003-204814-d55cec02`  
**Events Processed:** 100  
**Baseline Samples:** 5 | **Active Samples:** 5  

## Resource Cost Summary

| Metric | Controlled Baseline | Collector Under Load | Net Overhead (Delta) |
|---|---|---|---|
| **CPU Utilization** | 4.6% system | 0.0% process (P95: 0.0%) | **+0.0 % points** |
| **Process Memory (RSS)** | 239.57 MB | 239.566 MB (P95: 239.566 MB) | **+0.0 MB** |
| **Disk Write Total** | 0 B | 38379520.0 bytes | 38379520.0 bytes |
| **Network Output** | 0 B | 556890.0 bytes | 556890.0 bytes |

*Overhead is computed strictly as the difference between controlled idle baseline and collector workload execution.*
