/**
 * VisuTry SDK — lightweight i18n for user-facing error messages.
 *
 * The SDK keeps all hard-coded user-facing strings behind the `t()` lookup so
 * that platform adapters (web / wechat) and host applications can localise the
 * error messages surfaced to end users. The message catalogue is intentionally
 * small: it only covers the canonical SDK error strings emitted via
 * `createSDKError`. Callers can switch the active locale at runtime with
 * `setLocale()`; unknown keys fall back to English, then to the key itself.
 */
export type Locale = "en" | "zh-CN" | "ja" | "ko";
export declare function setLocale(locale: Locale): void;
export declare function getLocale(): Locale;
export declare function t(key: string): string;
//# sourceMappingURL=index.d.ts.map