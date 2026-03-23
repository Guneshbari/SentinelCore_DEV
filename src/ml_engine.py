import time
import logging
from datetime import datetime, timezone
from typing import Dict, List, Any

from sentinel_utils import make_db_connection, retry_with_backoff
import psycopg2.extras

MODEL_VERSION = 'v1'
CYCLE_INTERVAL = 30

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('ml_engine')

def fetch_latest_snapshots(conn: Any) -> List[Dict[str, Any]]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT DISTINCT ON (system_id) *
            FROM feature_snapshots
            ORDER BY system_id, snapshot_time DESC
        """)
        return [dict(r) for r in cur.fetchall()]

def simple_anomaly_score(snapshot: Dict[str, Any]) -> float:
    score = 0.0
    if snapshot.get('cpu_usage_percent', 0) > 85:
        score += 0.3
    if snapshot.get('memory_usage_percent', 0) > 90:
        score += 0.3
    if snapshot.get('critical_count', 0) > 2:
        score += 0.4
    return min(score, 1.0)

def simple_failure_probability(snapshot: Dict[str, Any]) -> float:
    return min(
        (snapshot.get('critical_count', 0) * 0.2) +
        (snapshot.get('error_count', 0) * 0.1),
        1.0
    )

def predict_fault(snapshot: Dict[str, Any]) -> str:
    if snapshot.get('critical_count', 0) > 3:
        return 'SYSTEM_FAILURE'
    if snapshot.get('error_count', 0) > 5:
        return 'SERVICE_DEGRADATION'
    return 'NONE'

def write_prediction(conn: Any, system_id: str, anomaly: float, failure: float, fault: str) -> None:
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO ml_predictions (
                system_id, prediction_time,
                anomaly_score, failure_probability,
                predicted_fault, model_version
            ) VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            system_id,
            datetime.now(timezone.utc),
            anomaly,
            failure,
            fault,
            MODEL_VERSION
        ))
    conn.commit()

def run_cycle(conn: Any) -> None:
    # Future placeholder:
    # model = joblib.load('model.pkl')
    # prediction = model.predict(features)
    
    snapshots = fetch_latest_snapshots(conn)
    if not snapshots:
        return
        
    for snap in snapshots:
        system_id = snap['system_id']
        anomaly = simple_anomaly_score(snap)
        failure = simple_failure_probability(snap)
        fault   = predict_fault(snap)
        write_prediction(conn, system_id, anomaly, failure, fault)
    
    logger.info(f"Generated ML predictions for {len(snapshots)} systems.")

def run_ml_engine() -> None:
    logger.info("Starting ML Engine worker...")
    conn, ok = retry_with_backoff(make_db_connection, label='ml_engine_connect')
    if not ok or not conn:
        logger.error('DB connection failed')
        return

    while True:
        try:
            run_cycle(conn)
        except Exception as e:
            logger.error(f'Cycle error: {e}')
            # attempt quick reconnect
            try:
                conn.close()
            except Exception:
                pass
            conn, _ = retry_with_backoff(make_db_connection, label='ml_engine_reconnect')
        
        time.sleep(CYCLE_INTERVAL)

if __name__ == '__main__':
    run_ml_engine()
