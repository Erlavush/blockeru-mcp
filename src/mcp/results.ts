export function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function okResult<T extends object>(value: T) {
  return {
    content: [{ type: "text" as const, text: jsonText(value) }],
    structuredContent: value,
  };
}

export function okResultWithImage<T extends object>(
  value: T,
  image: { mimeType: string; base64: string },
) {
  return {
    content: [
      { type: "text" as const, text: jsonText(value) },
      { type: "image" as const, mimeType: image.mimeType, data: image.base64 },
    ],
    structuredContent: value,
  };
}

export function errorResult(message: string, error?: unknown) {
  const detail =
    error instanceof Error ? error.message : error === undefined ? "" : String(error);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: detail ? `${message}\n\n${detail}` : message,
      },
    ],
  };
}

export function dataUrlToImagePayload(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}
