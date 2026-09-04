#!/usr/bin/env python3
"""Train the lightweight OCBC ONE deep-clustering demo.

The browser never trains a model during a presentation. This script creates a
seeded synthetic dataset, trains a small autoencoder, clusters the two-dimensional
embedding with K-means, and exports only the encoder and cluster geometry needed
for deterministic browser inference.
"""

from __future__ import annotations

import json
import warnings
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.exceptions import ConvergenceWarning
from sklearn.metrics import silhouette_score
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler


SEED = 42
SAMPLES_PER_STATE = 240
OUTPUT_PATH = Path(__file__).with_name("deep-kmeans-model.json")

FEATURES = [
    {"key": "monthly_income", "label": "Monthly income", "format": "currency"},
    {"key": "buffer_months", "label": "Emergency buffer", "format": "months"},
    {"key": "debt_ratio", "label": "Debt-to-income", "format": "percent"},
    {"key": "protection_gap", "label": "Protection-gap signal", "format": "score"},
    {"key": "investable_surplus", "label": "Investable surplus", "format": "currency"},
    {"key": "goal_progress", "label": "First-home progress", "format": "percent"},
]

STATE_DETAILS = {
    "buffer-building": {
        "label": "Buffer Building",
        "short": "Build liquidity before adding risk",
        "description": "Income is active, but emergency savings are still below the planning threshold.",
        "color": "#b56b2e",
    },
    "protection-gap": {
        "label": "Protection Gap",
        "short": "Review a dated uncovered risk",
        "description": "A meaningful protection need appears in the consented financial snapshot.",
        "color": "#b32331",
    },
    "growth-ready": {
        "label": "Growth Ready",
        "short": "Ready for a suitability review",
        "description": "The cash buffer is established and recurring surplus can enter planning review.",
        "color": "#34765c",
    },
}


def clipped_normal(rng: np.random.Generator, mean: float, std: float, low: float, high: float, size: int) -> np.ndarray:
    return np.clip(rng.normal(mean, std, size), low, high)


def synthetic_snapshots(rng: np.random.Generator) -> np.ndarray:
    """Create three overlapping, unlabeled financial-state populations."""

    n = SAMPLES_PER_STATE
    buffer_building = np.column_stack(
        [
            clipped_normal(rng, 3_600, 900, 1_800, 7_000, n),
            clipped_normal(rng, 0.85, 0.55, 0.0, 2.2, n),
            clipped_normal(rng, 0.19, 0.10, 0.0, 0.65, n),
            clipped_normal(rng, 0.12, 0.12, 0.0, 0.5, n),
            clipped_normal(rng, 650, 390, 0.0, 1_800, n),
            clipped_normal(rng, 0.10, 0.08, 0.0, 0.35, n),
        ]
    )
    protection_gap = np.column_stack(
        [
            clipped_normal(rng, 4_800, 1_350, 2_000, 9_000, n),
            clipped_normal(rng, 1.80, 0.85, 0.2, 5.0, n),
            clipped_normal(rng, 0.22, 0.11, 0.0, 0.65, n),
            clipped_normal(rng, 1.35, 0.30, 0.65, 2.4, n),
            clipped_normal(rng, 1_000, 560, 0.0, 2_800, n),
            clipped_normal(rng, 0.25, 0.16, 0.0, 0.75, n),
        ]
    )
    growth_ready = np.column_stack(
        [
            clipped_normal(rng, 4_800, 1_350, 2_400, 10_000, n),
            clipped_normal(rng, 3.80, 0.90, 2.5, 7.5, n),
            clipped_normal(rng, 0.14, 0.09, 0.0, 0.50, n),
            clipped_normal(rng, 0.10, 0.11, 0.0, 0.4, n),
            clipped_normal(rng, 1_350, 650, 300, 3_800, n),
            clipped_normal(rng, 0.28, 0.17, 0.03, 0.85, n),
        ]
    )
    snapshots = np.vstack([buffer_building, protection_gap, growth_ready])
    return snapshots[rng.permutation(len(snapshots))]


def tanh_layer(values: np.ndarray, weights: np.ndarray, biases: np.ndarray) -> np.ndarray:
    return np.tanh(values @ weights + biases)


def encode(autoencoder: MLPRegressor, scaled: np.ndarray) -> np.ndarray:
    hidden = tanh_layer(scaled, autoencoder.coefs_[0], autoencoder.intercepts_[0])
    return tanh_layer(hidden, autoencoder.coefs_[1], autoencoder.intercepts_[1])


def state_labels(kmeans: KMeans, snapshots: np.ndarray) -> dict[int, str]:
    original_centres = np.vstack([snapshots[kmeans.labels_ == index].mean(axis=0) for index in range(3)])
    protection_index = int(np.argmax(original_centres[:, 3]))
    remaining = [index for index in range(3) if index != protection_index]
    growth_index = max(remaining, key=lambda index: original_centres[index, 1] + original_centres[index, 4] / 1_000)
    buffer_index = next(index for index in remaining if index != growth_index)
    return {
        buffer_index: "buffer-building",
        protection_index: "protection-gap",
        growth_index: "growth-ready",
    }


def rounded_matrix(values: np.ndarray, digits: int = 8) -> list[list[float]]:
    return np.round(values, digits).tolist()


def canonical_snapshots() -> dict[str, list[float]]:
    return {
        "first_salary": [3_600, 1_000 / 2_300, 0.05, 0.0, 1_300, 0.0],
        "dubai_uncovered": [3_600, 3_500 / 2_300, 0.05, 1.0, 1_300, 1_000 / 60_000],
        "dubai_covered": [3_600, 3_500 / 2_300, 0.05, 0.0, 1_300, 1_000 / 60_000],
        "first_home": [3_600, 7_300 / 2_300, 0.18, 0.0, 1_300, 10_000 / 60_000],
    }


def main() -> None:
    rng = np.random.default_rng(SEED)
    snapshots = synthetic_snapshots(rng)
    scaler = StandardScaler().fit(snapshots)
    scaled = scaler.transform(snapshots)

    autoencoder = MLPRegressor(
        hidden_layer_sizes=(8, 2, 8),
        activation="tanh",
        solver="adam",
        alpha=0.0003,
        learning_rate_init=0.003,
        max_iter=3_000,
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=100,
        tol=1e-6,
        random_state=SEED,
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        autoencoder.fit(scaled, scaled)

    latent = encode(autoencoder, scaled)
    kmeans = KMeans(n_clusters=3, n_init=40, random_state=SEED).fit(latent)
    labels = state_labels(kmeans, snapshots)

    reconstruction = autoencoder.predict(scaled)
    reconstruction_mse = float(np.mean((reconstruction - scaled) ** 2))
    silhouette = float(silhouette_score(latent, kmeans.labels_))

    sample_indexes = np.linspace(0, len(snapshots) - 1, 150, dtype=int)
    plot_samples = [
        {
            "x": round(float(latent[index, 0]), 6),
            "y": round(float(latent[index, 1]), 6),
            "state": labels[int(kmeans.labels_[index])],
        }
        for index in sample_indexes
    ]

    centres = []
    for raw_index, centre in enumerate(kmeans.cluster_centers_):
        state_id = labels[raw_index]
        members = int(np.sum(kmeans.labels_ == raw_index))
        centres.append(
            {
                "id": state_id,
                "rawCluster": raw_index,
                "label": STATE_DETAILS[state_id]["label"],
                "short": STATE_DETAILS[state_id]["short"],
                "description": STATE_DETAILS[state_id]["description"],
                "color": STATE_DETAILS[state_id]["color"],
                "centroid": [round(float(value), 8) for value in centre],
                "trainingMembers": members,
            }
        )
    centres.sort(key=lambda item: ["buffer-building", "protection-gap", "growth-ready"].index(item["id"]))

    canonical = {}
    for name, values in canonical_snapshots().items():
        vector = np.asarray([values], dtype=float)
        point = encode(autoencoder, scaler.transform(vector))[0]
        distances = np.linalg.norm(kmeans.cluster_centers_ - point, axis=1)
        raw_cluster = int(np.argmin(distances))
        canonical[name] = {
            "state": labels[raw_cluster],
            "point": [round(float(value), 6) for value in point],
        }

    expected = {
        "first_salary": "buffer-building",
        "dubai_uncovered": "protection-gap",
        "first_home": "growth-ready",
    }
    failures = {name: canonical[name]["state"] for name, state in expected.items() if canonical[name]["state"] != state}
    if failures:
        print("Cluster centres:", [(item["id"], item["centroid"]) for item in centres])
        print("Canonical journey:", canonical)
        raise RuntimeError(f"Canonical OCBC ONE snapshots did not separate as expected: {failures}")

    all_x = latent[:, 0]
    all_y = latent[:, 1]
    x_pad = max(0.08, float(np.ptp(all_x)) * 0.08)
    y_pad = max(0.08, float(np.ptp(all_y)) * 0.08)

    payload = {
        "schemaVersion": 1,
        "model": {
            "name": "OCBC ONE Deep State Engine",
            "method": "6-8-2-8-6 tanh autoencoder + K-means",
            "purpose": "Identify a planning state; never authorise a transaction",
            "seed": SEED,
            "syntheticTrainingSnapshots": len(snapshots),
            "reconstructionMSE": round(reconstruction_mse, 5),
            "silhouetteScore": round(silhouette, 4),
        },
        "features": FEATURES,
        "scaler": {
            "mean": [round(float(value), 8) for value in scaler.mean_],
            "scale": [round(float(value), 8) for value in scaler.scale_],
        },
        "encoder": {
            "activation": "tanh",
            "layers": [
                {
                    "weights": rounded_matrix(autoencoder.coefs_[0]),
                    "biases": [round(float(value), 8) for value in autoencoder.intercepts_[0]],
                },
                {
                    "weights": rounded_matrix(autoencoder.coefs_[1]),
                    "biases": [round(float(value), 8) for value in autoencoder.intercepts_[1]],
                },
            ],
        },
        "clusters": centres,
        "plot": {
            "bounds": {
                "xMin": round(float(all_x.min() - x_pad), 6),
                "xMax": round(float(all_x.max() + x_pad), 6),
                "yMin": round(float(all_y.min() - y_pad), 6),
                "yMax": round(float(all_y.max() + y_pad), 6),
            },
            "samples": plot_samples,
        },
        "canonicalJourney": canonical,
        "disclaimer": "Synthetic demonstration data. Cluster state is planning context, not action authority.",
    }

    OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    summary = ", ".join(f"{name}={result['state']}" for name, result in canonical.items())
    print(f"Wrote {OUTPUT_PATH.name}: {summary}")


if __name__ == "__main__":
    main()
