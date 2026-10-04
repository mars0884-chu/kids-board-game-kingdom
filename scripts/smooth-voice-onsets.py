"""從已核准的無損錄音重建正式語音，淡入開頭以去除硬切爆音。"""

import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import wave
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads/chessy-voice-generated.zip"
APPROVED = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "private-voice/adventure-stage-r2.wav"
FFMPEG = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "private-voice/venv/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe"
TARGET = ROOT / "public/voice"
ADVENTURE = "a6c0e34b63f16dc70071"
SOURCE_HASH = "E49497BAFAC66E1BBDFC2B287B2A83AF6F746BF88D0F430CEED39D7B86DB79CA"
APPROVED_HASH = "F2E25C0862D4191DC8F4AF36E371058CACEA2250AE4E4A40B77A79DA017B4F8F"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def key(speech: str) -> str:
    return hashlib.sha256(speech.encode("utf-8")).hexdigest()[:20]


rows = json.loads((ROOT / "src/content/child-text.json").read_text(encoding="utf-8"))
expected = {key(row["speech_zh_tw"]) for row in rows if row.get("audience") == "child"}
assert len(expected) == 461 and ADVENTURE in expected, "語音清單與已核准版本不符"
assert sha256(SOURCE.read_bytes()) == SOURCE_HASH, "原始語音封包與已核准來源不符"
approved_data = APPROVED.read_bytes()
assert sha256(approved_data) == APPROVED_HASH, "冒險闖關語音與製作人核准版本不符"
assert FFMPEG.is_file(), "找不到既有 FFmpeg"
assert {path.stem for path in TARGET.glob("*.m4a")} == expected, "目前正式音檔清單不符"

with zipfile.ZipFile(SOURCE) as package, tempfile.TemporaryDirectory(prefix="chessy-onset-", dir=ROOT / "private-voice") as temporary:
    assert package.testzip() is None, "原始錄音封包損壞"
    assert set(package.namelist()) == {name + ".wav" for name in expected}, "原始錄音清單不符"
    output = Path(temporary)
    for index, name in enumerate(sorted(expected), 1):
        data = approved_data if name == ADVENTURE else package.read(name + ".wav")
        with wave.open(io.BytesIO(data), "rb") as source:
            assert (source.getnchannels(), source.getsampwidth(), source.getframerate()) == (1, 2, 24000), f"錄音格式異常：{name}"
            assert 0.3 <= source.getnframes() / source.getframerate() <= 45, f"錄音長度異常：{name}"
        # 僅「冒險闖關」有約 0.17 秒起音空白；保留 0.05 秒緩衝，不剪掉字音。
        filter_chain = "atrim=start=0.12,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.008" if name == ADVENTURE else "afade=t=in:st=0:d=0.008"
        destination = output / (name + ".m4a")
        result = subprocess.run(
            [str(FFMPEG), "-nostdin", "-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0", "-af", filter_chain, "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1", "-movflags", "+faststart", "-y", str(destination)],
            input=data, capture_output=True,
        )
        assert result.returncode == 0, f"修音失敗：{name}：{result.stderr.decode(errors='replace')}"
        encoded = destination.read_bytes()
        assert len(encoded) > 1000 and encoded[4:8] == b"ftyp", f"音檔格式異常：{name}"
        if index % 50 == 0:
            print(f"已重建 {index}/461", flush=True)
    # 所有音檔先成功生成，才逐一取代；原版仍可由 Git 與正式封存還原。
    for name in sorted(expected):
        os.replace(output / (name + ".m4a"), TARGET / (name + ".m4a"))

print("完成 461 句開頭淡入；冒險闖關 SHA-256", sha256((TARGET / (ADVENTURE + ".m4a")).read_bytes()))
