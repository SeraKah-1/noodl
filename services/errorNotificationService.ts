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

  if (msg.includes("api key") || msg.includes("401") || msg.includes("403")) {
    return [
      "API Key belum diisi, salah, atau tidak punya izin untuk model yang dipilih.",
      "Konfigurasi key di Settings/server belum sinkron."
    ];
  }

  if (msg.includes("413") || msg.includes("terlalu besar") || msg.includes("payload")) {
    return [
      "Ukuran file/input melebihi batas server atau batas model AI.",
      "Terlalu banyak file dikirim sekaligus."
    ];
  }

  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout")) {
    return [
      "Koneksi internet tidak stabil atau request timeout.",
      "Endpoint backend tidak bisa dijangkau sementara."
    ];
  }

  if (msg.includes("json") || msg.includes("parse")) {
    return [
      "Respons AI/backend tidak dalam format yang diharapkan.",
      "Data impor rusak/corrupt atau format tidak valid."
    ];
  }

  if (msg.includes("permission") || msg.includes("denied")) {
    return [
      "Akses ditolak oleh browser/service (izin belum diberikan).",
      "Role akun tidak punya hak untuk operasi ini."
    ];
  }

  return [
    "Layanan AI/backend sedang error sementara.",
    "Input atau konfigurasi belum sesuai kebutuhan proses."
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
  const lines = [
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
    "Silakan copy-paste pesan ini ke developer/AI untuk analisis lanjutan."
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
