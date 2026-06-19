import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Droplets,
  Leaf,
  Loader2,
  Package,
  Play,
  Recycle,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
  Zap,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";

type AnalysisSource = "live" | "upload";
type AnalysisStatus = "idle" | "analyzing" | "done" | "error";

type Detection = {
  label: string;
  confidence: number;
  box: [number, number, number, number];
  bin: string;
  color: string;
  guidance: string;
};

type AnalysisResult = {
  model_id: string;
  image_width: number;
  image_height: number;
  detections: Detection[];
  summary: {
    primary_label: string;
    recommended_bin: string;
    note: string;
  };
  file_name: string;
  source: AnalysisSource;
  analyzed_at: string;
};

type GalleryItem = {
  id: string;
  name: string;
  previewUrl: string;
  source: AnalysisSource;
  status: AnalysisStatus;
  result?: AnalysisResult;
  error?: string;
};

type BinCard = {
  title: string;
  description: string;
  icon: typeof Recycle;
  accent: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const PREDICT_ENDPOINT = `${API_BASE}/api/predict`;
const HEALTH_ENDPOINT = `${API_BASE}/api/health`;

const BIN_CARDS: BinCard[] = [
  {
    title: "Recyclage",
    description: "Papier, carton, métal et la plupart des plastiques triables.",
    icon: Recycle,
    accent: "from-sky-500 to-cyan-400",
  },
  {
    title: "Bio-déchets",
    description: "Restes alimentaires, épluchures et déchets organiques.",
    icon: Leaf,
    accent: "from-emerald-500 to-lime-400",
  },
  {
    title: "Verre",
    description: "Bouteilles, bocaux et flacons, sans bouchons ni couvercles.",
    icon: Droplets,
    accent: "from-teal-500 to-cyan-300",
  },
  {
    title: "Déchets spéciaux",
    description: "Piles, ampoules, électroniques et produits dangereux.",
    icon: Zap,
    accent: "from-amber-500 to-orange-400",
  },
];

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

function getWasteAdvice(label: string) {
  const normalized = normalizeLabel(label);

  if (/(paper|cardboard|carton|paperboard|paper cup)/.test(normalized)) {
    return {
      bin: "Recyclage",
      color: "from-sky-500 to-cyan-400",
      guidance:
        "Déposez-le dans le bac de recyclage après l’avoir vidé et aplati si possible.",
    };
  }

  if (
    /(plastic|pet|bottle|bottle cap|can|metal|tin|aluminum|alu)/.test(
      normalized,
    )
  ) {
    return {
      bin: "Recyclage",
      color: "from-sky-500 to-cyan-400",
      guidance:
        "Rincez l’emballage et triez-le avec les recyclables lorsque c’est autorisé localement.",
    };
  }

  if (/(glass|jar|bottle)/.test(normalized)) {
    return {
      bin: "Verre",
      color: "from-teal-500 to-cyan-300",
      guidance:
        "Placez-le dans la borne à verre. Retirez bouchons, capsules et couvercles.",
    };
  }

  if (/(food|organic|banana|apple|leaf|compost|egg|peel)/.test(normalized)) {
    return {
      bin: "Bio-déchets",
      color: "from-emerald-500 to-lime-400",
      guidance:
        "Videz les liquides et jetez-le dans la filière organique ou le compost.",
    };
  }

  if (
    /(battery|electronics|electronic|phone|cable|charger|lamp|lightbulb|bulb)/.test(
      normalized,
    )
  ) {
    return {
      bin: "Déchets spéciaux",
      color: "from-amber-500 to-orange-400",
      guidance:
        "Apportez-le dans une borne dédiée, un magasin repris ou une déchèterie.",
    };
  }

  return {
    bin: "À vérifier localement",
    color: "from-violet-500 to-fuchsia-400",
    guidance:
      "Vérifiez la règle de tri locale pour ce déchet avant de le jeter.",
  };
}

async function uploadAndAnalyze(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(PREDICT_ENDPOINT, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Impossible d’analyser l’image.");
  }

  return (await response.json()) as AnalysisResult;
}

function ResultCard({
  result,
  title,
}: {
  result: AnalysisResult;
  title: string;
}) {
  const topDetection = result.detections[0];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">
            {title}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {result.summary.primary_label}
          </h3>
          <p className="mt-1 text-sm text-white/65">{result.summary.note}</p>
        </div>
        <div
          className={`rounded-2xl bg-gradient-to-br ${getWasteAdvice(result.summary.primary_label).color} p-3 text-white`}
        >
          <ShieldCheck className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-white/40">
          Recommendation de trie
        </p>
        <p className="mt-2 text-base font-medium text-white">
          {result.summary.recommended_bin}
        </p>
        <p className="mt-1 text-sm text-white/60">
          {topDetection ? topDetection.guidance : result.summary.note}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {result.detections.slice(0, 4).map((detection) => (
          <div
            key={`${detection.label}-${detection.confidence}`}
            className="rounded-2xl border border-white/10 bg-slate-950/50 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-white">{detection.label}</p>
                <p className="text-xs text-white/50">
                  {Math.round(detection.confidence * 100)}% confidence
                </p>
              </div>
              <span
                className={`rounded-full bg-gradient-to-r ${detection.color} px-3 py-1 text-xs font-semibold text-white`}
              >
                {detection.bin}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewFrame({
  previewUrl,
  analysis,
  label,
}: {
  previewUrl: string | null;
  analysis: AnalysisResult | null;
  label: string;
}) {
  const width = analysis?.image_width ?? 1;
  const height = analysis?.image_height ?? 1;

  return (
    <div
      className="relative h-full min-h-[20rem] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70"
      style={analysis ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      <div className="absolute left-4 top-4 z-10 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs uppercase tracking-[0.25em] text-white/70">
        {label}
      </div>

      {previewUrl ? (
        <img
          src={previewUrl}
          alt={label}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-10 text-center text-white/50">
          <div>
            <ImageIcon className="mx-auto h-12 w-12 text-white/25" />
            <p className="mt-3 text-sm">
              Importez une image ou lancez la caméra pour analyser un déchet.
            </p>
          </div>
        </div>
      )}

      {analysis?.detections.map((detection, index) => {
        const [x1, y1, x2, y2] = detection.box;
        return (
          <div
            key={`${detection.label}-${index}`}
            className={`absolute border-2 border-dashed bg-black/10 ${index === 0 ? "shadow-[0_0_0_1px_rgba(255,255,255,0.25)]" : ""}`}
            style={{
              left: `${(x1 / width) * 100}%`,
              top: `${(y1 / height) * 100}%`,
              width: `${((x2 - x1) / width) * 100}%`,
              height: `${((y2 - y1) / height) * 100}%`,
              borderColor: detection.color.includes("sky")
                ? "rgb(56 189 248)"
                : detection.color.includes("emerald")
                  ? "rgb(16 185 129)"
                  : detection.color.includes("teal")
                    ? "rgb(20 184 166)"
                    : detection.color.includes("amber")
                      ? "rgb(245 158 11)"
                      : "rgb(168 85 247)",
            }}
          >
            <div className="absolute -top-8 left-0 rounded-full bg-black/80 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
              {detection.label} • {Math.round(detection.confidence * 100)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState<"checking" | "ready" | "offline">(
    "checking",
  );
  const [cameraOn, setCameraOn] = useState(false);
  const [liveAnalysis, setLiveAnalysis] = useState<AnalysisResult | null>(null);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<AnalysisStatus>("idle");
  const [isAutoScan, setIsAutoScan] = useState(true);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [busyCount, setBusyCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const livePreviewRef = useRef<string | null>(null);
  const liveScanLock = useRef(false);

  const activeGallery = useMemo(() => gallery, [gallery]);

  const latestResult =
    activeGallery.find((item) => item.result)?.result ?? liveAnalysis;

  useEffect(() => {
    let cancelled = false;

    fetch(HEALTH_ENDPOINT)
      .then((response) => {
        if (!response.ok) {
          throw new Error("backend offline");
        }
        return response.json();
      })
      .then(() => {
        if (!cancelled) setHealth("ready");
      })
      .catch(() => {
        if (!cancelled) setHealth("offline");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (livePreviewRef.current) {
        URL.revokeObjectURL(livePreviewRef.current);
      }
    };
  }, []);

  useEffect(() => {
    livePreviewRef.current = livePreviewUrl;
  }, [livePreviewUrl]);

  useEffect(() => {
    if (!cameraOn || !isAutoScan) {
      return;
    }

    const interval = window.setInterval(() => {
      void analyzeCurrentFrame();
    }, 6000);

    return () => window.clearInterval(interval);
  }, [cameraOn, isAutoScan]);

  async function startCamera() {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setError(
        "Impossible d’accéder à la caméra. Vérifiez les permissions du navigateur.",
      );
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
  }

  async function analyzeCurrentFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (
      liveScanLock.current ||
      !video ||
      !canvas ||
      !cameraOn ||
      video.readyState < 2
    ) {
      return;
    }

    liveScanLock.current = true;
    setLiveStatus("analyzing");
    setBusyCount((count) => count + 1);
    setError(null);

    const width = video.videoWidth;
    const height = video.videoHeight;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      setBusyCount((count) => Math.max(0, count - 1));
      setLiveStatus("error");
      setError("Impossible de préparer le canvas de capture.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (!blob) {
      setBusyCount((count) => Math.max(0, count - 1));
      setLiveStatus("error");
      setError("Impossible de capturer l’image de la caméra.");
      return;
    }

    const previewUrl = URL.createObjectURL(blob);
    setLivePreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return previewUrl;
    });

    try {
      const result = await uploadAndAnalyze(
        new File([blob], `live-frame-${Date.now()}.jpg`, {
          type: "image/jpeg",
        }),
      );
      setLiveAnalysis({ ...result, source: "live" });
      setLiveStatus("done");
    } catch (analysisError) {
      setLiveStatus("error");
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Échec de l’analyse en direct.",
      );
    } finally {
      setBusyCount((count) => Math.max(0, count - 1));
      liveScanLock.current = false;
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    setError(null);

    const placeholders = files.map<GalleryItem>((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      source: "upload",
      status: "analyzing",
    }));

    setGallery((current) => [...placeholders, ...current].slice(0, 10));
    setBusyCount((count) => count + files.length);

    await Promise.all(
      placeholders.map(async (item, index) => {
        const file = files[index];

        try {
          const result = await uploadAndAnalyze(file);
          setGallery((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: "done",
                    result: { ...result, source: "upload" },
                  }
                : entry,
            ),
          );
        } catch (analysisError) {
          setGallery((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: "error",
                    error:
                      analysisError instanceof Error
                        ? analysisError.message
                        : "Analyse impossible.",
                  }
                : entry,
            ),
          );
        } finally {
          setBusyCount((count) => Math.max(0, count - 1));
        }
      }),
    );
  }

  const isBusy =
    busyCount > 0 ||
    liveStatus === "analyzing" ||
    gallery.some((item) => item.status === "analyzing");
  const liveAdvice = liveAnalysis
    ? getWasteAdvice(liveAnalysis.summary.primary_label)
    : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_35%),linear-gradient(180deg,#020617_0%,#0f172a_45%,#020617_100%)] text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/25 backdrop-blur xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-emerald-400 via-cyan-400 to-sky-500 p-3 text-slate-950">
              <Recycle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/45">
                Waste sorting assistant
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
                Analyse des déchets YOLOv5 par la caméra en direct et les
                téléchargements{" "}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-white/65">
                Capturez les déchets avec la caméra, téléchargez les photos pour
                une analyse par lots et obtenez des conseils de tri instantanés
                grâce à un modèle YOLOv5
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Backend
              </p>
              <p className="mt-1 text-sm font-medium text-white">
                {health === "ready"
                  ? "Connecté"
                  : health === "checking"
                    ? "Vérification..."
                    : "HorsLigne"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Caméra en direct
              </p>
              <p className="mt-1 text-sm font-medium text-white">
                {cameraOn ? "Camera active" : "Camera off"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Analyses en attente
              </p>
              <p className="mt-1 text-sm font-medium text-white">{busyCount}</p>
            </div>
          </div>
        </header>

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-100">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <main className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <section className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">
                    Détection en directe
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-white">
                    Scanner les déchets directement depuis votre camera
                  </h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={cameraOn ? stopCamera : startCamera}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
                  >
                    {cameraOn ? (
                      <Square className="h-4 w-4" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    {cameraOn ? "Stop camera" : "Start camera"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void analyzeCurrentFrame()}
                    disabled={!cameraOn || liveStatus === "analyzing"}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {liveStatus === "analyzing" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Analyze frame
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAutoScan((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/50 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-900"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {isAutoScan ? "Auto-scan on" : "Auto-scan off"}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                  <div className="aspect-video overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70">
                    <video
                      ref={videoRef}
                      className={`h-full w-full object-cover ${cameraOn ? "block" : "hidden"}`}
                      playsInline
                      muted
                    />
                    {!cameraOn && (
                      <div className="flex h-full items-center justify-center p-10 text-center text-white/50">
                        <div>
                          <Camera className="mx-auto h-12 w-12 text-white/25" />
                          <p className="mt-3 text-sm">
                            Utilisez la caméra pour vérifier les déchets en
                            direct avant de les trier.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <canvas ref={canvasRef} className="hidden" />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-slate-950/50 px-4 py-4 text-sm font-medium text-white transition hover:border-emerald-300 hover:bg-slate-900">
                      <Upload className="h-4 w-4" />
                      Téléversez une ou plusieurs images
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(event) => void handleImageUpload(event)}
                      />
                    </label>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <ScanSearch className="h-4 w-4 text-emerald-300" />
                        {cameraOn ? "En cours de scan" : "En attente d'entrée"}
                      </div>
                      <p className="mt-1 text-sm text-white/55">
                        {isBusy
                          ? "Le model est entrain d'analyser une image actuelement."
                          : "Ajoutez une photo ou lancez la caméra pour obtenir une détection."}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <PreviewFrame
                    previewUrl={livePreviewUrl}
                    analysis={liveAnalysis}
                    label="Latest live capture"
                  />
                  {liveAnalysis && (
                    <ResultCard title="Live analysis" result={liveAnalysis} />
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">
                    Images importées
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-white">
                    Analyser les photos importées par lots
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/50">
                  <ImageIcon className="h-4 w-4" />
                  {activeGallery.length} item(s)
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {activeGallery.length === 0 ? (
                  <div className="md:col-span-2 rounded-3xl border border-dashed border-white/15 bg-slate-950/50 p-8 text-center text-sm text-white/50">
                    Les images téléchargées s'afficheront ici, accompagnées de
                    leurs détections YOLOv5 et des corbeilles de déchets
                    recommandées.
                  </div>
                ) : (
                  activeGallery.map((item) => (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/50"
                    >
                      <div className="aspect-[4/3]">
                        <PreviewFrame
                          previewUrl={item.previewUrl}
                          analysis={item.result ?? null}
                          label={item.name}
                        />
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-white">
                              {item.name}
                            </p>
                            <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                              {item.source === "upload"
                                ? "Imported image"
                                : "Live frame"}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                              item.status === "done"
                                ? "bg-emerald-500/15 text-emerald-200"
                                : item.status === "error"
                                  ? "bg-rose-500/15 text-rose-200"
                                  : "bg-amber-500/15 text-amber-200"
                            }`}
                          >
                            {item.status === "done" ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : item.status === "error" ? (
                              <AlertCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            )}
                            {item.status}
                          </span>
                        </div>
                        {item.result ? (
                          <div className="space-y-2 text-sm text-white/65">
                            <p>
                              <span className="font-medium text-white">
                                {item.result.summary.primary_label}
                              </span>{" "}
                              detecté par{" "}
                              <span className="font-medium text-white">
                                {item.result.model_id}
                              </span>
                            </p>
                            <p>{item.result.summary.note}</p>
                          </div>
                        ) : item.error ? (
                          <p className="text-sm text-rose-200">{item.error}</p>
                        ) : (
                          <p className="text-sm text-white/55">
                            Envoi de l'image au serveur YOLOv5...
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-400/15 p-3 text-emerald-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-white/40">
                    Status du model
                  </p>
                  <h2 className="text-lg font-semibold text-white">
                    Pipeline de detection des ordures
                  </h2>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Inference backend
                  </p>
                  <p className="mt-1 text-sm text-white/70">FastAPI + YOLOv5</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Mode Live
                  </p>
                  <p className="mt-1 text-sm text-white/70">
                    Capture caméra avec balayage automatique périodique et
                    analyse automatique des images
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Mode Importé
                  </p>
                  <p className="mt-1 text-sm text-white/70">
                    Téléchargement par lots d'images avec résumés de détection
                    par image.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {BIN_CARDS.map((bin) => (
                <div
                  key={bin.title}
                  className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20 backdrop-blur"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`rounded-2xl bg-gradient-to-br ${bin.accent} p-3 text-slate-950`}
                    >
                      <bin.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{bin.title}</h3>
                      <p className="mt-1 text-sm text-white/60">
                        {bin.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur">
              <h2 className="text-lg font-semibold text-white">
                Recommendation actuelle
              </h2>
              {latestResult ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                      Étiquette primaire
                    </p>
                    <p className="mt-1 text-base font-semibold text-white">
                      {latestResult.summary.primary_label}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                      Poubelle
                    </p>
                    <p className="mt-1 text-base font-semibold text-white">
                      {latestResult.summary.recommended_bin}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                      Conseil
                    </p>
                    <p className="mt-1 text-sm text-white/65">
                      {liveAdvice?.guidance ?? latestResult.summary.note}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-white/55">
                  Effectuez une analyse pour alimenter le panneau de
                  recommandations.
                </p>
              )}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
