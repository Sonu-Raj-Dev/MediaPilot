from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import subprocess
import sys
import threading
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "runtime"
DATA_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES = 800 * 1024 * 1024
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".wmv"}

ASSETS: dict[str, dict[str, Any]] = {}
PROCESS_JOBS: dict[str, dict[str, Any]] = {}
STATE_LOCK = threading.RLock()


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def safe_filename(name: str, fallback: str = "video.mp4") -> str:
    cleaned = Path(name or fallback).name
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", cleaned).strip(" .")
    return cleaned or fallback


def parse_multipart(body: bytes, content_type: str) -> dict[str, tuple[str, bytes]]:
    match = re.search(r"boundary=(?P<boundary>[^;]+)", content_type, flags=re.IGNORECASE)
    if not match:
        raise ValueError("Missing multipart boundary")
    boundary = match.group("boundary").strip().strip('"').encode("utf-8")
    result: dict[str, tuple[str, bytes]] = {}
    for raw in body.split(b"--" + boundary):
        if not raw or raw in (b"--", b"--\r\n", b"\r\n"):
            continue
        raw = raw.lstrip(b"\r\n")
        if raw.endswith(b"--"):
            raw = raw[:-2]
        raw = raw.rstrip(b"\r\n")
        if b"\r\n\r\n" not in raw:
            continue
        header_blob, content = raw.split(b"\r\n\r\n", 1)
        headers = header_blob.decode("utf-8", errors="replace")
        name_match = re.search(r'name="([^"]+)"', headers)
        if not name_match:
            continue
        filename_match = re.search(r'filename="([^"]*)"', headers)
        filename = filename_match.group(1) if filename_match else ""
        result[name_match.group(1)] = (filename, content)
    return result


def jpeg_data_url(frame: np.ndarray, max_width: int = 1600) -> tuple[str, int, int]:
    height, width = frame.shape[:2]
    preview = frame
    if width > max_width:
        ratio = max_width / width
        preview = cv2.resize(frame, (max_width, max(1, int(height * ratio))), interpolation=cv2.INTER_AREA)
    ok, encoded = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
    if not ok:
        raise RuntimeError("Could not create preview image")
    value = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{value}", preview.shape[1], preview.shape[0]


def inspect_video(path: Path) -> dict[str, Any]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError("OpenCV could not open this video. Try an MP4, MOV, WebM, or AVI file.")
    ok, frame = capture.read()
    if not ok or frame is None:
        capture.release()
        raise RuntimeError("The video opened, but no readable frames were found.")
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or frame.shape[1])
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or frame.shape[0])
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 30.0)
    if not np.isfinite(fps) or fps <= 0.1:
        fps = 30.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if frame_count else 0
    preview, preview_width, preview_height = jpeg_data_url(frame)
    capture.release()
    return {
        "width": width,
        "height": height,
        "fps": round(fps, 3),
        "frames": frame_count,
        "duration": round(duration, 3),
        "preview": preview,
        "previewWidth": preview_width,
        "previewHeight": preview_height,
    }


def build_mask(height: int, width: int, regions: list[dict[str, Any]], padding: int) -> np.ndarray:
    mask = np.zeros((height, width), dtype=np.uint8)
    for region in regions:
        try:
            x = clamp(float(region.get("x", 0)), 0, 1)
            y = clamp(float(region.get("y", 0)), 0, 1)
            w = clamp(float(region.get("w", 0)), 0, 1)
            h = clamp(float(region.get("h", 0)), 0, 1)
        except (TypeError, ValueError):
            continue
        x1 = int(round(x * width))
        y1 = int(round(y * height))
        x2 = int(round(clamp(x + w, 0, 1) * width))
        y2 = int(round(clamp(y + h, 0, 1) * height))
        if x2 > x1 and y2 > y1:
            cv2.rectangle(mask, (x1, y1), (max(x1, x2 - 1), max(y1, y2 - 1)), 255, thickness=-1)
    if padding > 0 and np.any(mask):
        kernel_size = max(1, padding * 2 + 1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        mask = cv2.dilate(mask, kernel, iterations=1)
    return mask


def apply_effect(frame: np.ndarray, mask: np.ndarray, mode: str, strength: int) -> np.ndarray:
    if not np.any(mask):
        return frame
    mode = mode if mode in {"inpaint", "blur", "pixelate"} else "inpaint"
    strength = max(1, min(32, int(strength)))
    if mode == "inpaint":
        # A small radius avoids pulling too much texture from the surrounding scene.
        return cv2.inpaint(frame, mask, max(1, min(8, int(round(strength / 3)) + 1)), cv2.INPAINT_TELEA)

    soft_mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=max(1.0, strength / 2))
    alpha = (soft_mask.astype(np.float32) / 255.0)[:, :, None]
    if mode == "blur":
        blurred = cv2.GaussianBlur(frame, (0, 0), sigmaX=max(4.0, strength * 1.8), sigmaY=max(4.0, strength * 1.8))
        output = frame.astype(np.float32) * (1 - alpha) + blurred.astype(np.float32) * alpha
        return np.clip(output, 0, 255).astype(np.uint8)

    # Pixelation is calculated once for the whole frame and composited only into the mask.
    scale = max(8, min(36, 52 - strength))
    small = cv2.resize(frame, (max(1, frame.shape[1] // scale), max(1, frame.shape[0] // scale)), interpolation=cv2.INTER_LINEAR)
    pixelated = cv2.resize(small, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_NEAREST)
    output = frame.astype(np.float32) * (1 - alpha) + pixelated.astype(np.float32) * alpha
    return np.clip(output, 0, 255).astype(np.uint8)


def get_ffmpeg_executable() -> str:
    try:
        # The project vendors imageio-ffmpeg so audio muxing works without a system ffmpeg install.
        vendor_dir = str(ROOT / "vendor")
        if vendor_dir not in sys.path:
            sys.path.insert(0, vendor_dir)
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError("The audio muxer is unavailable in this workspace.") from exc


def has_audio_track(ffmpeg: str, path: Path) -> bool:
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(path), "-map", "0:a:0", "-t", "0.1", "-f", "null", "-"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=45,
            check=False,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def mux_audio(ffmpeg: str, video_only: Path, source: Path, destination: Path, audio_codec: str) -> None:
    temporary = destination.with_name(f".{destination.stem}.with-audio{destination.suffix}")
    if temporary.exists():
        temporary.unlink()
    audio_args = ["-c:a", "aac", "-b:a", "160k"] if audio_codec == "aac" else ["-c:a", "libopus", "-b:a", "128k"]
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(video_only),
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        *audio_args,
        "-shortest",
        str(temporary),
    ]
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1800, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        raise RuntimeError("Could not preserve the source audio track.") from exc
    if result.returncode != 0 or not temporary.exists() or temporary.stat().st_size == 0:
        detail = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "unknown ffmpeg error"
        raise RuntimeError(f"Could not preserve the source audio track: {detail}")
    os.replace(temporary, destination)


def update_process(process_id: str, **updates: Any) -> None:
    with STATE_LOCK:
        if process_id in PROCESS_JOBS:
            PROCESS_JOBS[process_id].update(updates)


def run_processing(process_id: str, asset_id: str, regions: list[dict[str, Any]], mode: str, strength: int) -> None:
    asset = ASSETS[asset_id]
    source = Path(asset["inputPath"])
    asset_dir = DATA_DIR / asset_id
    output = asset_dir / "cleaned.mp4"
    browser_preview = asset_dir / "cleaned.webm"
    video_only_mp4 = asset_dir / ".video-only.mp4"
    video_only_webm = asset_dir / ".video-only.webm"
    asset_dir.mkdir(parents=True, exist_ok=True)
    capture = None
    writer = None
    preview_writer = None
    audio_present = False
    try:
        update_process(process_id, state="processing", progress=0.02, message="Opening source video")
        capture = cv2.VideoCapture(str(source))
        if not capture.isOpened():
            raise RuntimeError("Could not reopen the uploaded video for processing.")
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or asset["width"])
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or asset["height"])
        fps = float(capture.get(cv2.CAP_PROP_FPS) or asset["fps"] or 30.0)
        if not np.isfinite(fps) or fps <= 0.1:
            fps = 30.0
        total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or asset.get("frames") or 0)
        mask = build_mask(height, width, regions, max(0, min(32, int(strength))))
        if not np.any(mask):
            raise RuntimeError("No valid selection zones were supplied.")

        # Write a silent MP4 download and a VP8 WebM review copy. Audio is muxed back in below.
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(video_only_mp4), fourcc, fps, (width, height))
        if not writer.isOpened():
            # Some builds expose a different MP4 encoder name.
            fourcc = cv2.VideoWriter_fourcc(*"avc1")
            writer = cv2.VideoWriter(str(video_only_mp4), fourcc, fps, (width, height))
        if not writer.isOpened():
            raise RuntimeError("Could not create an MP4 output in this environment.")

        preview_fourcc = cv2.VideoWriter_fourcc(*"VP80")
        preview_writer = cv2.VideoWriter(str(video_only_webm), preview_fourcc, fps, (width, height))
        if not preview_writer.isOpened():
            preview_fourcc = cv2.VideoWriter_fourcc(*"VP90")
            preview_writer = cv2.VideoWriter(str(video_only_webm), preview_fourcc, fps, (width, height))
        if not preview_writer.isOpened():
            raise RuntimeError("Could not create a browser-compatible video preview in this environment.")

        index = 0
        while True:
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            cleaned = apply_effect(frame, mask, mode, max(1, int(strength)))
            writer.write(cleaned)
            preview_writer.write(cleaned)
            index += 1
            if total > 0:
                progress = 0.05 + 0.84 * min(1.0, index / total)
            else:
                progress = 0.1 + 0.75 * ((index % 240) / 240)
            if index == 1 or index % 5 == 0:
                update_process(process_id, progress=round(progress, 3), message=f"Cleaning frame {index:,}" + (f" of {total:,}" if total else ""))

        if index == 0:
            raise RuntimeError("No frames were written to the cleaned video.")

        # Finalize OpenCV containers before ffmpeg reads them.
        capture.release()
        capture = None
        writer.release()
        writer = None
        preview_writer.release()
        preview_writer = None

        update_process(process_id, progress=0.91, message="Restoring the original audio track")
        ffmpeg = get_ffmpeg_executable()
        audio_present = has_audio_track(ffmpeg, source)
        if audio_present:
            mux_audio(ffmpeg, video_only_mp4, source, output, "aac")
            mux_audio(ffmpeg, video_only_webm, source, browser_preview, "opus")
        else:
            os.replace(video_only_mp4, output)
            os.replace(video_only_webm, browser_preview)

        asset["outputPath"] = str(output)
        asset["previewPath"] = str(browser_preview)
        asset["outputName"] = f"{Path(asset['fileName']).stem}_cleaned.mp4"
        asset["previewName"] = f"{Path(asset['fileName']).stem}_cleaned.webm"
        message = "Your cleaned video is ready with original audio" if audio_present else "Your cleaned video is ready"
        update_process(
            process_id,
            state="complete",
            progress=1.0,
            message=message,
            outputUrl=f"/api/file/{asset_id}/output",
            previewUrl=f"/api/file/{asset_id}/preview",
            outputName=asset["outputName"],
            audioPresent=audio_present,
            frames=index,
        )
    except Exception as exc:  # noqa: BLE001 - surface a friendly error in the UI
        update_process(process_id, state="error", progress=0, message=str(exc))
    finally:
        if capture is not None:
            capture.release()
        if writer is not None:
            writer.release()
        if preview_writer is not None:
            preview_writer.release()


ROOT_ASSETS = {
    "app.js": "text/javascript; charset=utf-8",
    "adsense-component.js": "text/javascript; charset=utf-8",
    "adsense-config.js": "text/javascript; charset=utf-8",
    "vendor/opencv.js": "text/javascript; charset=utf-8",
    "styles.css": "text/css; charset=utf-8",
    "favicon.svg": "image/svg+xml",
    "reference.png": "image/png",
}

class AppHandler(BaseHTTPRequestHandler):
    server_version = "Clearframe/1.0"

    def log_message(self, format: str, *args: Any) -> None:  # keep the preview terminal readable
        if os.environ.get("CLEARFRAME_VERBOSE"):
            super().log_message(format, *args)

    def _send_bytes(self, payload: bytes, content_type: str, status: int = 200, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        if extra:
            for key, value in extra.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        self._send_bytes(json.dumps(payload).encode("utf-8"), "application/json; charset=utf-8", status)

    def _read_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length > MAX_UPLOAD_BYTES:
            raise ValueError(f"Please choose a video smaller than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
        return self.rfile.read(length)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path in {"/", "/index.html"}:
            return self._serve_static("index.html", "text/html; charset=utf-8")
        if path in {"/remove-logo", "/watermark-remover", "/tools/remove-watermark-video", "/tools/remove-watermark-video/index.html"}:
            return self._serve_static("tools/remove-watermark-video/index.html", "text/html; charset=utf-8")
        if path.startswith("/tools/"):
            relative = path.lstrip("/")
            candidate = ROOT / relative
            if candidate.is_dir():
                index_file = candidate / "index.html"
                if index_file.exists():
                    # Serving the index straight off "/tools/x" would leave the browser resolving
                    # the page's relative src/href against "/tools/", so redirect the way every
                    # static host does and let the page load its own app.js.
                    if not path.endswith("/"):
                        target = path + "/" + (f"?{parsed.query}" if parsed.query else "")
                        return self._send_bytes(b"", "text/plain; charset=utf-8",
                                                HTTPStatus.MOVED_PERMANENTLY, {"Location": target})
                    return self._serve_static(str(index_file.relative_to(ROOT)).replace('\\', '/'), "text/html; charset=utf-8")
            if candidate.exists() and candidate.is_file():
                content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
                return self._send_bytes(candidate.read_bytes(), content_type)
            return self._send_json({"error": "Tool asset not found"}, HTTPStatus.NOT_FOUND)
        if path.lstrip("/") in ROOT_ASSETS:
            name = path.lstrip("/")
            return self._serve_static(name, ROOT_ASSETS[name])
        if path.startswith("/api/status/"):
            process_id = path.rsplit("/", 1)[-1]
            with STATE_LOCK:
                job = PROCESS_JOBS.get(process_id)
            if not job:
                return self._send_json({"error": "Processing job not found"}, HTTPStatus.NOT_FOUND)
            return self._send_json(dict(job))
        if path.startswith("/api/file/"):
            parts = path.strip("/").split("/")
            if len(parts) == 4 and parts[0:2] == ["api", "file"]:
                asset_id, kind = parts[2], parts[3]
                with STATE_LOCK:
                    asset = ASSETS.get(asset_id)
                if not asset:
                    return self._send_json({"error": "Asset not found"}, HTTPStatus.NOT_FOUND)
                file_key = "inputPath" if kind == "input" else "outputPath" if kind == "output" else "previewPath" if kind == "preview" else None
                file_path = Path(asset[file_key]) if file_key and asset.get(file_key) else None
                if not file_path or not file_path.exists():
                    return self._send_json({"error": "File not found"}, HTTPStatus.NOT_FOUND)
                suffix = file_path.suffix.lower()
                content_type = "video/mp4" if suffix == ".mp4" else "video/webm" if suffix == ".webm" else (mimetypes.guess_type(file_path.name)[0] or "application/octet-stream")
                disposition = "attachment" if parse_qs(parsed.query).get("download") == ["1"] else "inline"
                name_key = "outputName" if kind == "output" else "previewName" if kind == "preview" else "fileName"
                return self._send_bytes(file_path.read_bytes(), content_type, extra={"Content-Disposition": f'{disposition}; filename="{safe_filename(asset.get(name_key))}"'})
        return self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def _serve_static(self, name: str, content_type: str) -> None:
        file_path = ROOT / name
        if not file_path.exists():
            return self._send_json({"error": "Static file not found"}, HTTPStatus.NOT_FOUND)
        self._send_bytes(file_path.read_bytes(), content_type)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/upload":
            return self._handle_upload()
        if parsed.path == "/api/process":
            return self._handle_process()
        return self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def _handle_upload(self) -> None:
        try:
            body = self._read_body()
            parts = parse_multipart(body, self.headers.get("Content-Type", ""))
            filename, content = parts.get("file", ("", b""))
            if not content:
                raise ValueError("Choose a video file to upload.")
            original_name = safe_filename(filename)
            ext = Path(original_name).suffix.lower()
            if ext not in ALLOWED_EXTENSIONS:
                raise ValueError("Supported formats: MP4, MOV, M4V, WebM, AVI, and MKV.")
            asset_id = uuid.uuid4().hex[:12]
            asset_dir = DATA_DIR / asset_id
            asset_dir.mkdir(parents=True, exist_ok=True)
            input_path = asset_dir / f"source{ext}"
            input_path.write_bytes(content)
            metadata = inspect_video(input_path)
            asset = {"id": asset_id, "fileName": original_name, "inputPath": str(input_path), **metadata}
            with STATE_LOCK:
                ASSETS[asset_id] = asset
            response = {key: value for key, value in asset.items() if key not in {"inputPath"}}
            return self._send_json(response)
        except Exception as exc:  # noqa: BLE001
            return self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)

    def _handle_process(self) -> None:
        try:
            body = self._read_body()
            payload = json.loads(body.decode("utf-8"))
            asset_id = str(payload.get("assetId", ""))
            with STATE_LOCK:
                asset = ASSETS.get(asset_id)
            if not asset:
                raise ValueError("Upload a video before processing.")
            regions = payload.get("regions") or []
            if not isinstance(regions, list) or not regions:
                raise ValueError("Draw at least one selection zone over a watermark.")
            mode = str(payload.get("mode", "inpaint"))
            if mode not in {"inpaint", "blur", "pixelate"}:
                mode = "inpaint"
            strength = int(clamp(float(payload.get("strength", 6)), 1, 32))
            process_id = uuid.uuid4().hex[:12]
            with STATE_LOCK:
                PROCESS_JOBS[process_id] = {"id": process_id, "state": "queued", "progress": 0, "message": "Queued"}
            worker = threading.Thread(target=run_processing, args=(process_id, asset_id, regions, mode, strength), daemon=True)
            worker.start()
            return self._send_json({"processId": process_id})
        except Exception as exc:  # noqa: BLE001
            return self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    host = "0.0.0.0"
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"MediaPilot running at http://localhost:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
