#!/bin/bash
# Downloads Sculpt's on-device AI + image libraries into ./vendor.
# Idempotent: skips anything already present. Everything runs locally after this —
# photos are never uploaded anywhere.
set -euo pipefail
cd "$(dirname "$0")"
V=vendor
mkdir -p "$V/wasm" "$V/models" "$V/libraw" "$V/ort"
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

fetch() { # url dest
  if [ -s "$2" ]; then return; fi
  echo "  downloading $(basename "$2")…"
  curl -fsSL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}
npmpkg() { # name version -> extracts to $T/name
  rm -rf "$T/$1"; mkdir -p "$T/$1"
  echo "  downloading $1 $2…"
  curl -fsSL --retry 3 "https://registry.npmjs.org/$1/-/$(basename "$1")-$2.tgz" | tar xz -C "$T/$1"
}

# MediaPipe (face mesh, pose, segmentation)
if [ ! -s "$V/vision_bundle.mjs" ] || [ ! -s "$V/wasm/vision_wasm_internal.wasm" ]; then
  npmpkg @mediapipe/tasks-vision 1.1.0
  cp "$T/@mediapipe/tasks-vision/package/vision_bundle.mjs" "$V/"
  cp "$T"/@mediapipe/tasks-vision/package/wasm/vision_wasm_internal.* "$T"/@mediapipe/tasks-vision/package/wasm/vision_wasm_nosimd_internal.* "$V/wasm/"
fi
fetch https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task "$V/models/face_landmarker.task"
fetch https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task "$V/models/pose_landmarker_full.task"
fetch https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite "$V/models/mobilenet_v3_small.tflite"
fetch https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite "$V/models/selfie_multiclass_256x256.tflite"

# LibRaw (camera RAW: CR2/CR3/NEF/ARW/RAF/DNG/ORF/RW2…)
if [ ! -s "$V/libraw/libraw.wasm" ]; then
  npmpkg libraw-wasm 1.6.0
  cp "$T"/libraw-wasm/package/dist/{index.js,worker.js,libraw.js,libraw.wasm} "$V/libraw/"
fi

# libheif (iPhone HEIC in Chrome/Edge; Safari decodes natively)
if [ ! -s "$V/libheif-bundle.mjs" ]; then
  npmpkg libheif-js 1.23.5
  cp "$T/libheif-js/package/libheif-wasm/libheif-bundle.mjs" "$V/"
fi

# UTIF + pako (TIFF)
if [ ! -s "$V/UTIF.js" ]; then
  npmpkg utif2 4.1.0; cp "$T/utif2/package/UTIF.js" "$V/"
fi
if [ ! -s "$V/pako.min.js" ]; then
  npmpkg pako 2.1.0; cp "$T/pako/package/dist/pako.min.js" "$V/"
fi

# ONNX Runtime (runs the object-removal model)
if [ ! -s "$V/ort/ort-wasm-simd-threaded.wasm" ]; then
  npmpkg onnxruntime-web 1.30.0
  cp "$T"/onnxruntime-web/package/dist/{ort.wasm.min.mjs,ort-wasm-simd-threaded.mjs,ort-wasm-simd-threaded.wasm} "$V/ort/"
  mkdir -p "$V/ort-gpu"; cp "$T"/onnxruntime-web/package/dist/ort.webgpu.min.mjs "$V/ort-gpu/"   # its 26 MB engine loads from the npm CDN
fi
# Object-removal models (the hosted site fetches these from Hugging Face on first use instead)
fetch https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx "$V/models/migan_pipeline_v2.onnx"
fetch https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx "$V/models/lama_fp32.onnx"
# face finder for culling (YuNet, OpenCV Zoo, MIT) — small enough to ship with the app
fetch https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx "$V/models/face_detection_yunet_2023mar.onnx"

echo "  AI models ready."
