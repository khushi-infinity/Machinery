"""
Smoke test for the four stages Machinery runs on:

  1. gnani tts  - Gnani Timbre v3.0, voice Shivani, en-IN     -> WAV on disk
  2. gnani stt  - Gnani Prisma v3.0, indic-auto (round-trips clip #1)
  3. llm tools  - OpenRouter chat with native function calling
  4. llm web    - OpenRouter web-search plugin (real citations)

Run from backend/:  python test_stack.py
Needs GNANI_API_KEY + OPENROUTER_API_KEY in backend/.env. Expect 4 x PASS.
"""

import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
GNANI_KEY = os.getenv("GNANI_API_KEY", "")
OR_KEY = os.getenv("OR_KEY") or os.getenv("OPENROUTER_API_KEY", "")
OR_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")

GNANI_BASE = "https://api.vachana.ai"
OR_BASE = "https://openrouter.ai/api/v1"

results: list = []


def report(name: str, ok: bool, detail: str) -> None:
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {detail}")


# --- 1. Gnani Timbre TTS ------------------------------------------------------
wav_path = Path(__file__).parent / "artifacts" / "tts_check.wav"
try:
    r = httpx.post(
        f"{GNANI_BASE}/api/v1/tts/inference",
        headers={"X-API-Key-ID": GNANI_KEY},
        json={
            "text": "Step one. Switch off the power supply before you open the electronics bay.",
            "voice": os.getenv("GNANI_TTS_VOICE", "Shivani"),
            "model": "timbre-v3.0",
            "language": "en-IN",
            "speed": 1.05,
            "audio_config": {
                "sample_rate": 48000,
                "num_channels": 1,
                "sample_width": 2,
                "encoding": "linear_pcm",
                "container": "wav",
            },
        },
        timeout=90,
    )
    r.raise_for_status()
    if len(r.content) < 2000:
        raise ValueError(f"response too small: {len(r.content)} bytes")
    wav_path.parent.mkdir(exist_ok=True)
    wav_path.write_bytes(r.content)
    report("gnani tts", True, f"{len(r.content)} bytes -> {wav_path.name} (audio/wav)")
except httpx.HTTPStatusError as e:  # noqa: BLE001
    report("gnani tts", False, f"HTTP {e.response.status_code} {e.response.text[:200]}")
except Exception as e:  # noqa: BLE001
    report("gnani tts", False, repr(e)[:300])

# --- 2. Gnani Prisma STT (round-trips the clip from step 1) -------------------
try:
    if not wav_path.exists():
        raise FileNotFoundError("run the tts check first")
    r = httpx.post(
        f"{GNANI_BASE}/stt/v3",
        headers={"X-API-Key-ID": GNANI_KEY},
        data={"model": "prisma-v3.0", "language_code": "indic-auto"},
        files={"audio_file": (wav_path.name, wav_path.read_bytes(), "audio/wav")},
        timeout=90,
    )
    r.raise_for_status()
    out = r.json()
    text = (out.get("transcript") or "").strip()
    report(
        "gnani stt",
        bool(text),
        f"heard: {text[:150]!r} (detected {out.get('detected_language_code')}, "
        f"{out.get('processing_time', 0):.2f}s)",
    )
except httpx.HTTPStatusError as e:  # noqa: BLE001
    report("gnani stt", False, f"HTTP {e.response.status_code} {e.response.text[:200]}")
except Exception as e:  # noqa: BLE001
    report("gnani stt", False, repr(e)[:300])

# --- 3. OpenRouter chat + native tool calling ---------------------------------
try:
    r = httpx.post(
        f"{OR_BASE}/chat/completions",
        headers={"Authorization": f"Bearer {OR_KEY}", "Content-Type": "application/json"},
        json={
            "model": OR_MODEL,
            "temperature": 0.2,
            "max_tokens": 200,
            "messages": [
                {"role": "system", "content": "You are Machinery, a repair agent. Use tools before answering."},
                {"role": "user", "content": "I'm on the printer and the extruder is clicking."},
            ],
            "tools": [{
                "type": "function",
                "function": {
                    "name": "get_procedure",
                    "description": "Look up the official service procedure for a fault.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "symptom": {"type": "string", "description": "What the technician described"},
                            "machine": {"type": "string", "enum": ["printer", "mri", "pump"]},
                        },
                        "required": ["symptom"],
                    },
                },
            }],
            "tool_choice": "auto",
        },
        timeout=90,
    )
    r.raise_for_status()
    msg = r.json()["choices"][0]["message"]
    calls = msg.get("tool_calls") or []
    names = [c["function"]["name"] for c in calls]
    report("openrouter tools", bool(calls), f"model={OR_MODEL} tool_calls={names or '-'}")
except httpx.HTTPStatusError as e:  # noqa: BLE001
    report("openrouter tools", False, f"HTTP {e.response.status_code} {e.response.text[:200]}")
except Exception as e:  # noqa: BLE001
    report("openrouter tools", False, repr(e)[:300])

# --- 4. OpenRouter web-search plugin ------------------------------------------
try:
    r = httpx.post(
        f"{OR_BASE}/chat/completions",
        headers={"Authorization": f"Bearer {OR_KEY}", "Content-Type": "application/json"},
        json={
            "model": OR_MODEL,
            "max_tokens": 600,
            "plugins": [{"id": "web", "max_results": 3}],
            "messages": [{"role": "user", "content": "What does a replacement 3D printer nozzle cost in India? One sentence."}],
        },
        timeout=120,
    )
    r.raise_for_status()
    msg = (r.json()["choices"][0]["message"])
    cites = [a["url_citation"]["url"] for a in (msg.get("annotations") or []) if "url_citation" in a]
    content = (msg.get("content") or "").strip()
    ok = bool(content) and bool(cites)
    report("openrouter web", ok, f"{len(cites)} citations: {', '.join(cites[:3])[:180]}")
except httpx.HTTPStatusError as e:  # noqa: BLE001
    report("openrouter web", False, f"HTTP {e.response.status_code} {e.response.text[:200]}")
except Exception as e:  # noqa: BLE001
    report("openrouter web", False, repr(e)[:300])

print()
print(f"{sum(results)}/4 checks passed - Gnani AI (ears+voice) + OpenRouter (brain+web).")
sys.exit(0 if all(results) else 1)
