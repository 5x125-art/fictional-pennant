export class SaveDataError extends Error {}
export function storageErrorMessage(error: unknown): string {
  if (error instanceof SaveDataError) return error.message;
  if (error instanceof DOMException && error.name === "VersionError")
    return "このアプリより新しいデータベース形式です。対応したアプリで開いてください。保存データは変更していません。";
  if (error instanceof DOMException && error.name === "QuotaExceededError")
    return "保存容量が不足しています。操作を完了できませんでした。既存データは保護されています。";
  return "操作を完了できませんでした。保存容量やブラウザの設定を確認して、もう一度お試しください。";
}
