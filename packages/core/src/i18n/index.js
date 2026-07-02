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
const messages = {
    "en": {
        "error.camera_not_initialized": "Camera is not initialized.",
        "error.camera_permission_denied": "Camera permission denied.",
        "error.camera_not_available": "No suitable camera device found.",
        "error.camera_unsupported": "getUserMedia is not available on this platform.",
        "error.tracker_init_failed": "Failed to initialize face tracker.",
        "error.tracker_not_initialized": "Face tracker is not initialized.",
        "error.tracker_detect_failed": "Face detection failed.",
        "error.renderer_init_failed": "Failed to initialize renderer.",
        "error.glasses_load_failed": "Failed to load glasses model.",
        "error.snapshot_failed": "Snapshot capture failed.",
        "error.snapshot_disabled": "Snapshot export is disabled by privacy policy.",
        "error.analysis_timeout": "Face analysis timed out waiting for quality frames.",
        "error.analysis_in_progress": "Face shape analysis already in progress.",
        "error.sdk_destroyed": "SDK has been destroyed.",
        "error.renderer_disposed": "Renderer has been disposed.",
    },
    "zh-CN": {
        "error.camera_not_initialized": "摄像头未初始化。",
        "error.camera_permission_denied": "摄像头权限被拒绝。",
        "error.camera_not_available": "未找到合适的摄像头设备。",
        "error.camera_unsupported": "当前平台不支持摄像头功能。",
        "error.tracker_init_failed": "人脸追踪器初始化失败。",
        "error.tracker_not_initialized": "人脸追踪器未初始化。",
        "error.tracker_detect_failed": "人脸检测失败。",
        "error.renderer_init_failed": "渲染器初始化失败。",
        "error.glasses_load_failed": "眼镜模型加载失败。",
        "error.snapshot_failed": "截图失败。",
        "error.snapshot_disabled": "隐私策略已禁用截图导出。",
        "error.analysis_timeout": "脸型分析超时，未获取到足够的高质量帧。",
        "error.analysis_in_progress": "脸型分析正在进行中。",
        "error.sdk_destroyed": "SDK 已被销毁。",
        "error.renderer_disposed": "渲染器已被销毁。",
    },
    "ja": {
        "error.camera_not_initialized": "カメラが初期化されていません。",
        "error.camera_permission_denied": "カメラの権限が拒否されました。",
        "error.camera_not_available": "適切なカメラデバイスが見つかりません。",
        "error.camera_unsupported": "このプラットフォームではカメラ機能を使用できません。",
        "error.tracker_init_failed": "顔トラッカーの初期化に失敗しました。",
        "error.tracker_not_initialized": "顔トラッカーが初期化されていません。",
        "error.tracker_detect_failed": "顔検出に失敗しました。",
        "error.renderer_init_failed": "レンダラーの初期化に失敗しました。",
        "error.glasses_load_failed": "眼鏡モデルの読み込みに失敗しました。",
        "error.snapshot_failed": "スクリーンショットの取得に失敗しました。",
        "error.snapshot_disabled": "プライバシーポリシーによりスクリーンショットエクスポートが無効です。",
        "error.analysis_timeout": "顔分析がタイムアウトしました。",
        "error.analysis_in_progress": "顔分析は既に進行中です。",
        "error.sdk_destroyed": "SDKは破棄されました。",
        "error.renderer_disposed": "レンダラーは破棄されました。",
    },
    "ko": {
        "error.camera_not_initialized": "카메라가 초기화되지 않았습니다.",
        "error.camera_permission_denied": "카메라 권한이 거부되었습니다.",
        "error.camera_not_available": "적합한 카메라 장치를 찾을 수 없습니다.",
        "error.camera_unsupported": "이 플랫폼에서는 카메라 기능을 사용할 수 없습니다.",
        "error.tracker_init_failed": "얼굴 트래커 초기화에 실패했습니다.",
        "error.tracker_not_initialized": "얼굴 트래커가 초기화되지 않았습니다.",
        "error.tracker_detect_failed": "얼굴 감지에 실패했습니다.",
        "error.renderer_init_failed": "렌더러 초기화에 실패했습니다.",
        "error.glasses_load_failed": "안경 모델 로드에 실패했습니다.",
        "error.snapshot_failed": "스냅샷 캡처에 실패했습니다.",
        "error.snapshot_disabled": "개인정보 보호 정책으로 인해 스냅샷 내보내기가 비활성화되었습니다.",
        "error.analysis_timeout": "얼굴 분석 시간이 초과되었습니다.",
        "error.analysis_in_progress": "얼굴 분석이 이미 진행 중입니다.",
        "error.sdk_destroyed": "SDK가 폐기되었습니다.",
        "error.renderer_disposed": "렌더러가 폐기되었습니다.",
    },
};
let currentLocale = "en";
export function setLocale(locale) {
    currentLocale = locale;
}
export function getLocale() {
    return currentLocale;
}
export function t(key) {
    return messages[currentLocale]?.[key] ?? messages["en"][key] ?? key;
}
//# sourceMappingURL=index.js.map