import io
import os
from datetime import datetime

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from huggingface_hub import hf_hub_download
from PIL import Image

import yolov5

MODEL_REPO = os.getenv("HF_MODEL_REPO", "keremberke/yolov5m-garbage")
MODEL_FILE = os.getenv("HF_MODEL_FILE", "best.pt")
MODEL_SIZE = int(os.getenv("YOLO_IMAGE_SIZE", "640"))
MODEL_CONF = float(os.getenv("YOLO_CONF", "0.25"))
MODEL_IOU = float(os.getenv("YOLO_IOU", "0.45"))
HF_TOKEN = os.getenv("HF_TOKEN") or None

app = FastAPI(title="Waste Sorting API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
model_path = None


def pick_bin(label: str) -> dict[str, str]:
    normalized = label.lower()

    if any(keyword in normalized for keyword in ["paper", "cardboard", "carton", "paper cup"]):
        return {
            "bin": "Recyclage",
            "note": "Paper-like waste usually goes to recycling after removing food residue.",
        }

    if any(keyword in normalized for keyword in ["plastic", "pet", "bottle", "can", "metal", "tin", "aluminum"]):
        return {
            "bin": "Recyclage",
            "note": "Rinse the item and follow your local recycling rules.",
        }

    if "glass" in normalized:
        return {
            "bin": "Verre",
            "note": "Use the glass collection point and remove caps or lids.",
        }

    if any(keyword in normalized for keyword in ["organic", "food", "banana", "apple", "compost", "egg", "peel"]):
        return {
            "bin": "Bio-déchets",
            "note": "Organic waste should go to compost or organic collection.",
        }

    if any(keyword in normalized for keyword in ["battery", "electronics", "electronic", "phone", "cable", "lamp", "bulb"]):
        return {
            "bin": "Déchets spéciaux",
            "note": "Bring it to a dedicated collection point or hazardous waste drop-off.",
        }

    return {
        "bin": "À vérifier localement",
        "note": "Check the local sorting rules for this item.",
    }


def load_model():
    global model, model_path

    if model is not None:
        return model

    model_path = hf_hub_download(
        repo_id=MODEL_REPO,
        filename=MODEL_FILE,
        token=HF_TOKEN,
    )
    loaded_model = yolov5.load(model_path)
    loaded_model.conf = MODEL_CONF
    loaded_model.iou = MODEL_IOU
    loaded_model.agnostic = False
    loaded_model.multi_label = False
    loaded_model.max_det = 100
    model = loaded_model
    return model


@app.on_event("startup")
def startup_event():
    load_model()


@app.get("/api/health")
def health():
    current_model = load_model()
    return {
        "ok": True,
        "model_repo": MODEL_REPO,
        "model_file": MODEL_FILE,
        "model_path": model_path,
        "labels": getattr(current_model, "names", {}),
    }


@app.post("/api/predict")
async def predict(file: UploadFile = File(...)):
    current_model = load_model()
    data = await file.read()

    if not data:
        raise HTTPException(status_code=400, detail="Empty image payload.")

    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unsupported image file.") from exc

    results = current_model(image, size=MODEL_SIZE)
    predictions = results.pred[0]
    labels = getattr(current_model, "names", {})

    detections = []
    if hasattr(predictions, "cpu"):
        predictions = predictions.cpu().numpy()

    for row in predictions:
        x1, y1, x2, y2, confidence, class_id = row[:6]
        index = int(class_id)
        if isinstance(labels, (list, tuple)):
            label = labels[index] if index < len(labels) else f"class-{index}"
        else:
            label = labels.get(index, f"class-{index}")

        advice = pick_bin(label)
        detections.append(
            {
                "label": label,
                "confidence": round(float(confidence), 4),
                "box": [round(float(x1), 2), round(float(y1), 2), round(float(x2), 2), round(float(y2), 2)],
                "bin": advice["bin"],
                "color": "from-emerald-500 to-lime-400"
                if advice["bin"] == "Bio-déchets"
                else "from-sky-500 to-cyan-400"
                if advice["bin"] == "Recyclage"
                else "from-teal-500 to-cyan-300"
                if advice["bin"] == "Verre"
                else "from-amber-500 to-orange-400"
                if advice["bin"] == "Déchets spéciaux"
                else "from-violet-500 to-fuchsia-400",
                "guidance": advice["note"],
            }
        )

    primary_label = detections[0]["label"] if detections else "No confident detection"
    recommended_bin = detections[0]["bin"] if detections else "À vérifier localement"
    note = detections[0]["guidance"] if detections else "Try a clearer image or a closer frame."

    return {
        "model_id": MODEL_REPO,
        "image_width": image.width,
        "image_height": image.height,
        "detections": detections,
        "summary": {
            "primary_label": primary_label,
            "recommended_bin": recommended_bin,
            "note": note,
        },
        "file_name": file.filename or "image",
        "source": "upload",
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
    }
