import os
import json
import pandas as pd
import numpy as np
from pathlib import Path

BASELINE_DIR = Path("example_files/Baseline")
OUTPUT_PATH = Path("server/data/baselines/new_good_baseline.json")

# Tolerance from current
TOLERANCE = {
  "strategy": "pad p05/p95 by 10% of observed range with min padding by channel, cap at 25% of observed range",
  "min_padding": {
    "rpm": 50.0, "RPM": 50.0, "ECT": 5.0, "IAT": 5.0, "OILT": 5.0, "FT": 5.0,
    "MAP": 0.5, "BP": 0.5, "TIP": 0.5, "OILP_press": 1.0, "Vbat": 0.2, "Vsw": 0.2,
    "TPS_pct": 2.0, "eng_load": 2.0
  },
  "default_min_padding": 0.5,
  "range_padding_pct": 0.1,
  "range_padding_cap_pct": 0.25
}

def compute_padding(p05, p95, param):
  range_val = p95 - p05
  min_pad = TOLERANCE["min_padding"].get(param, TOLERANCE["default_min_padding"])
  pad = max(min_pad, range_val * TOLERANCE["range_padding_pct"])
  pad = min(pad, range_val * TOLERANCE["range_padding_cap_pct"])
  return pad

def load_csv(csv_path):
  df = pd.read_csv(csv_path)
  numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
  return {col: df[col].dropna().values for col in numeric_cols if len(df[col].dropna()) > 0}

def main():
  all_data = {}
  file_counts = {}

  for metadata_path in BASELINE_DIR.rglob("*_metadata.json"):
    with open(metadata_path, 'r') as f:
      metadata = json.load(f)

    subdir = metadata_path.parent.name  # "PSI HD 22L"
    group, size = subdir.rsplit(' ', 1)  # split last space

    for file_info in metadata.get('files', []):
      if file_info.get('quality') != 'good':
        continue

      filename = file_info['filename']
      csv_path = metadata_path.parent / filename  # assume filename matches

      if not csv_path.exists():
        print(f"CSV not found: {csv_path}")
        continue

      data = load_csv(csv_path)
      app = file_info.get('application', 'Power Systems')

      key = (group, size, app)
      if key not in all_data:
        all_data[key] = {}
        file_counts[key] = 0

      file_counts[key] += 1
      for param, vals in data.items():
        if param not in all_data[key]:
          all_data[key][param] = []
        all_data[key][param].extend(vals)

  # Compute stats
  baseline = {
    "source": "example_files/Baseline",
    "tolerance": TOLERANCE,
    "groups": {}
  }

  for (group, size, app), params_data in all_data.items():
    if group not in baseline["groups"]:
      baseline["groups"][group] = {}
    if size not in baseline["groups"][group]:
      baseline["groups"][group][size] = {}
    subgroup = baseline["groups"][group][size]

    stats = {}
    for param, vals in params_data.items():
      if len(vals) < 10:
        continue
      p05 = np.percentile(vals, 5)
      p95 = np.percentile(vals, 95)
      pad = compute_padding(p05, p95, param)
      stats[param] = {
        "p05_mean": p05,
        "p95_mean": p95,
        "p05_padded": p05 - pad,
        "p95_padded": p95 + pad,
        "files": file_counts[(group, size, app)]
      }

    subgroup[app] = stats

  # Write
  with open(OUTPUT_PATH, 'w') as f:
    json.dump(baseline, f, indent=2)

  print(f"New baseline generated: {OUTPUT_PATH}")

if __name__ == "__main__":
  main()
