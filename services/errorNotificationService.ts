import { getLocale } from './i18n';

type ErrorNotificationInput = {
  title: string;
  action: string;
  whatHappened: string;
  error: unknown;
  possibleCauses?: string[];
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message || "Unknown Error";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const inferPossibleCauses = (errorMessage: string): string[] => {
  const msg = errorMessage.toLowerCase();
  const id = getLocale() === 'id';

  if (msg.includes("api key") || msg.includes("401") || msg.includes("403")) {
    return id
      ? [
          "API Key belum diisi, salah, atau tidak punya izin untuk model yang dipilih.",
          "Konfigurasi key di Settings/server belum sinkron.",
        ]
      : [
          "API key missing, invalid, or not allowed for the selected model.",
          "Key config in Settings/server is out of sync.",
        ];
  }

  if (msg.includes("413") || msg.includes("terlalu besar") || msg.includes("payload") || msg.includes("too large")) {
    return id
      ? [
          "Ukuran file/input melebihi batas server atau batas model AI.",
          "Terlalu banyak file dikirim sekaligus.",
        ]
      : [
          "File/input size exceeds server or model limits.",
          "Too many files sent at once.",
        ];
  }

  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout")) {
    return id
      ? [
          "Koneksi internet tidak stabil atau request timeout.",
          "Endpoint backend tidak bisa dijangkau sementara.",
        ]
      : [
          "Unstable network or request timed out.",
          "Backend endpoint temporarily unreachable.",
        ];
  }

  if (msg.includes("json") || msg.includes("parse")) {
    return id
      ? [
          "Respons AI/backend tidak dalam format yang diharapkan.",
          "Data impor rusak/corrupt atau format tidak valid.",
        ]
      : [
          "AI/backend response was not in the expected format.",
          "Import data is corrupt or invalid.",
        ];
  }

  if (msg.includes("permission") || msg.includes("denied")) {
    return id
      ? [
          "Akses ditolak oleh browser/service (izin belum diberikan).",
          "Role akun tidak punya hak untuk operasi ini.",
        ]
      : [
          "Access denied by browser/service (permission not granted).",
          "Account role is not allowed for this operation.",
        ];
  }

  return id
    ? [
        "Layanan AI/backend sedang error sementara.",
        "Input atau konfigurasi belum sesuai kebutuhan proses.",
      ]
    : [
        "AI/backend service is temporarily failing.",
        "Input or configuration does not match process needs.",
      ];
};

export const buildErrorNotificationMessage = ({
  title,
  action,
  whatHappened,
  error,
  possibleCauses
}: ErrorNotificationInput): string => {
  const errorMessage = getErrorMessage(error);
  const causes = possibleCauses && possibleCauses.length > 0 ? possibleCauses : inferPossibleCauses(errorMessage);
  const id = getLocale() === 'id';
  const lines = id
    ? [
        `❌ ${title}`,
        "",
        "Apa yang terjadi:",
        `- ${whatHappened}`,
        "",
        "Kemungkinan penyebab:",
        ...causes.map(cause => `- ${cause}`),
        "",
        "Detail teknis:",
        `- Action: ${action}`,
        `- Error: ${errorMessage}`,
        `- Waktu: ${new Date().toISOString()}`,
        "",
        "Silakan copy-paste pesan ini ke developer/AI untuk analisis lanjutan.",
      ]
    : [
        `❌ ${title}`,
        "",
        "What happened:",
        `- ${whatHappened}`,
        "",
        "Possible causes:",
        ...causes.map(cause => `- ${cause}`),
        "",
        "Technical details:",
        `- Action: ${action}`,
        `- Error: ${errorMessage}`,
        `- Time: ${new Date().toISOString()}`,
        "",
        "Copy-paste this message to a developer/AI for deeper analysis.",
      ];

  return lines.join("\n");
};

export const showErrorNotification = (input: ErrorNotificationInput): string => {
  const message = buildErrorNotificationMessage(input);
  console.error("[Error Notification]", message, input.error);
  if (typeof window !== "undefined") {
    alert(message);
  }
  return message;
};
