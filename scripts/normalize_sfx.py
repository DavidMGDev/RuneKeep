#!/usr/bin/env python3
"""Loudness-normalize every UI sound effect so they all sit at the same perceived volume.

Two-pass EBU R128 (ffmpeg `loudnorm`) to a uniform integrated loudness + true-peak ceiling, with a
gentle leading-silence trim so one-shots fire crisply. Runs in place over assets/sounds/UI/** (wav
and mp3, recursing into OnLoseHP-1in10chance). Re-runnable: a normalized file just re-normalizes to
the same target.

    python scripts/normalize_sfx.py            # normalize everything
    python scripts/normalize_sfx.py --dry-run  # show what would change

Requires ffmpeg + ffprobe on PATH (ffmpeg 8.x verified).
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SFX_DIR = ROOT / "assets" / "sounds" / "UI"

# Targets: -16 LUFS integrated is a comfortable game-UI level; -1.5 dBTP leaves headroom so nothing
# clips after lossy re-encode. LRA 11 keeps risers' dynamics intact.
TARGET_I = -16.0
TARGET_TP = -1.5
TARGET_LRA = 11.0

# Gentle leading-silence trim (keeps tails/reverb untouched).
SILENCE = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02:detection=peak"


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def measure(path: Path) -> dict | None:
    """Pass 1: measure loudness. Returns the loudnorm JSON stats."""
    cp = run([
        "ffmpeg", "-hide_banner", "-i", str(path),
        "-af", f"{SILENCE},loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=json",
        "-f", "null", "-",
    ])
    # loudnorm prints its JSON block to stderr.
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", cp.stderr, re.DOTALL)
    if not m:
        print(f"  ! could not measure {path.name}\n{cp.stderr[-400:]}")
        return None
    return json.loads(m.group(0))


def _finite(x) -> bool:
    try:
        return math.isfinite(float(x))
    except (TypeError, ValueError):
        return False


def normalize(path: Path, dry: bool) -> bool:
    stats = measure(path)
    if not stats:
        return False
    ext = path.suffix.lower()
    # Short one-shots are too brief for R128's gated integrated measurement (input_i = -inf): fall
    # back to single-pass dynamic loudnorm, which adapts without measured_* values.
    linear = _finite(stats.get("input_i")) and _finite(stats.get("input_tp"))
    if dry:
        mode = "2-pass" if linear else "1-pass"
        print(f"  would normalize {path.relative_to(SFX_DIR)}  ({mode}, in {stats['input_i']} LUFS -> {TARGET_I})")
        return True

    if linear:
        af = (
            f"{SILENCE},loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:"
            f"measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:"
            f"measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:"
            f"offset={stats['target_offset']}:linear=true:print_format=summary"
        )
    else:
        af = f"{SILENCE},loudnorm=I={TARGET_I}:TP={TARGET_TP}:LRA={TARGET_LRA}:print_format=summary"
    # Encode args by container: keep wav as 16-bit PCM, mp3 as a high-quality VBR.
    if ext == ".wav":
        enc = ["-c:a", "pcm_s16le"]
    else:
        enc = ["-c:a", "libmp3lame", "-q:a", "2"]

    # Temp file MUST live on the same drive as the target (Path.replace can't cross drives on Windows).
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False, dir=str(path.parent)) as tf:
        tmp = Path(tf.name)
    cp = run([
        "ffmpeg", "-hide_banner", "-y", "-i", str(path),
        "-af", af, "-ar", "48000", *enc, str(tmp),
    ])
    if cp.returncode != 0 or not tmp.exists() or tmp.stat().st_size < 256:
        print(f"  ! FAILED {path.name}\n{cp.stderr[-400:]}")
        tmp.unlink(missing_ok=True)
        return False
    tmp.replace(path)
    print(f"  ok {path.relative_to(SFX_DIR)}  ({stats['input_i']} -> ~{TARGET_I} LUFS)")
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SFX_DIR.exists():
        print(f"missing {SFX_DIR}")
        return 1
    files = sorted(p for p in SFX_DIR.rglob("*") if p.suffix.lower() in (".wav", ".mp3"))
    if not files:
        print("no sound files found")
        return 1

    print(f"Normalizing {len(files)} sounds to {TARGET_I} LUFS / {TARGET_TP} dBTP ...")
    ok = sum(normalize(p, args.dry_run) for p in files)
    print(f"\nDone: {ok}/{len(files)} processed.")
    return 0 if ok == len(files) else 2


if __name__ == "__main__":
    sys.exit(main())
