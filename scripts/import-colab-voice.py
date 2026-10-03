"""驗證製作人核准的 Colab 語音封包，轉成正式遊戲的 AAC 檔。"""

import hashlib
import io
import json
import re
import subprocess
import sys
import wave
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "chessy-voice-generated.zip"
FFMPEG = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "private-voice/venv/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
TARGET = ROOT / "public/voice"
CONTENT = ROOT / "src/content/child-text.json"


def key(speech: str) -> str:
    return hashlib.sha256(speech.encode("utf-8")).hexdigest()[:20]


rows = json.loads(CONTENT.read_text(encoding="utf-8"))
speeches = {row["speech_zh_tw"] for row in rows if row.get("audience") == "child"}
expected = {key(speech) + ".wav" for speech in speeches}
assert len(expected) == 461, f"文案語音數量已變更：{len(expected)}"
assert SOURCE.is_file(), f"找不到已核准語音 ZIP：{SOURCE}"
assert FFMPEG.is_file(), f"找不到 FFmpeg：{FFMPEG}"
TARGET.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(SOURCE) as package:
    names = package.namelist()
    assert len(names) == len(set(names)) == 461, "語音 ZIP 有重複或缺漏"
    assert set(names) == expected, "語音 ZIP 與當前兒童文案不相符"
    assert package.testzip() is None, "語音 ZIP 損壞"
    for index, name in enumerate(sorted(names), 1):
        data = package.read(name)
        with wave.open(io.BytesIO(data), "rb") as source:
            duration = source.getnframes() / source.getframerate()
            assert (source.getnchannels(), source.getsampwidth(), source.getframerate()) == (1, 2, 24000)
            assert 0.3 <= duration <= 45, f"音檔長度異常：{name}"
        destination = TARGET / (Path(name).stem + ".m4a")
        if not destination.exists():
            result = subprocess.run(
                [str(FFMPEG), "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1", "-movflags", "+faststart", "-y", str(destination)],
                input=data, capture_output=True,
            )
            assert result.returncode == 0, f"轉檔失敗：{name}：{result.stderr.decode(errors='replace')}"
        if index % 50 == 0:
            print(f"已檢查／轉檔 {index}/461", flush=True)

raw = CONTENT.read_text(encoding="utf-8")
pattern = re.compile(r'("speech_zh_tw"\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*"audio_asset"\s*:\s*)"(?:\\.|[^"\\])*"')


def assign_audio(match: re.Match[str]) -> str:
    speech = json.loads(match.group(2))
    assert speech in speeches, f"文案缺少正式語音：{speech}"
    return match.group(1) + json.dumps("voice/" + key(speech) + ".m4a")


updated, count = pattern.subn(assign_audio, raw)
assert count == len(rows), f"音檔欄位數量不符：{count}/{len(rows)}"
CONTENT.write_text(updated, encoding="utf-8")
print(f"完成：{len(speeches)} 句、{count} 筆文案，正式音檔大小 {sum(p.stat().st_size for p in TARGET.glob('*.m4a')) / 2**20:.1f} MiB")
