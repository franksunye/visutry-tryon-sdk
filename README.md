# VisuTry Face Geometry & AR Glasses Try-On SDK

**版本**: v1.0.0-beta.0  
**状态**: Engineering Ready  
**目标平台**: H5 / 微信小程序  
**优先级**: H5 Stable First，小程序 Experimental

VisuTry SDK 是一套面向 H5 与微信小程序的端侧 Face Geometry & AR Glasses Try-On SDK，提供统一的人脸语义点、脸型分析、眼镜位姿求解、眼镜模型渲染和镜框推荐能力。

## 核心特性

- **端侧处理优先** — 人脸图像、视频帧、landmarks 默认不上传服务端
- **Core 与 Adapter 分离** — 核心算法不依赖浏览器、微信小程序、MediaPipe、Three.js
- **H5 稳定优先** — v1.0 主验收平台是 H5
- **脸型分析与试戴追踪分离** — 静态分析与实时追踪互不干扰
- **眼镜模型规范化** — 所有可试戴眼镜模型必须带 asset manifest

## 快速开始

### 安装

```bash
pnpm install
```

### 构建

```bash
pnpm build        # 构建所有包
pnpm test         # 运行所有测试
pnpm typecheck    # 类型检查
```

### 运行 H5 Demo

```bash
cd examples/web-demo
pnpm install
pnpm dev
```

在浏览器中打开 `http://localhost:5173`，允许摄像头权限即可体验 AR 眼镜试戴。

## 包结构

| 包 | 描述 | 状态 |
|---|---|---|
| `@visutry/tryon-core` | 平台无关核心：类型、坐标转换、语义点映射、脸型评分、位姿求解、smoothing、quality gate、privacy | Stable |
| `@visutry/tryon-web` | H5 适配器：getUserMedia、MediaPipe FaceLandmarker、Three.js 渲染 | Stable |
| `@visutry/tryon-wechat` | 微信小程序适配器（experimental） | Experimental |
| `@visutry/recommender` | 镜框推荐引擎：脸型 + 尺寸 + 商品规则 | Stable |
| `@visutry/demo-assets` | Demo 眼镜 manifest 和示例资产 | Demo |

## 最小示例

```typescript
import { createVisuTryWebSDK } from '@visutry/tryon-web';

const sdk = await createVisuTryWebSDK({
  canvas: document.getElementById('tryon-canvas'),
  camera: { facingMode: 'user', width: 640, height: 480 },
  tracker: { mode: 'balanced', maxFaces: 1 },
  renderer: { width: 640, height: 480, mirror: true, background: 'transparent' },
  privacy: { processOnDeviceOnly: true, allowSnapshotExport: true },
});

await sdk.initialize();
await sdk.startCamera();
await sdk.startTryOn();
await sdk.loadGlasses(manifest);

// 脸型分析
const result = await sdk.analyzeFaceShape();
console.log(result.primary, result.confidence);

// 截图
const snapshot = await sdk.snapshot();
```

## 文档

- [快速开始](docs/getting-started.md)
- [H5 集成指南](docs/web-integration.md)
- [微信小程序集成](docs/wechat-integration.md)
- [眼镜模型规范](docs/glasses-asset-standard.md)
- [脸型分析算法](docs/face-shape-algorithm.md)
- [隐私政策](docs/privacy.md)
- [性能优化](docs/performance.md)

## 技术栈

- TypeScript 5.7 (ES2020, strict)
- pnpm 10 workspace monorepo
- vitest 2.1 (jsdom)
- @mediapipe/tasks-vision 0.10.18 (478-point FaceLandmarker)
- Three.js 0.170 (OrthographicCamera, GLTFLoader)
- ESLint + Prettier + Changesets

## 许可证

MIT
