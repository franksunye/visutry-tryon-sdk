/**
 * WeChat-specific shared types for the @visutry/tryon-wechat adapter.
 *
 * The WeChat Mini Program runtime has no DOM. Camera frames arrive as
 * `ArrayBuffer` payloads from `wx.createCameraContext().onCameraFrame`, and the
 * visionkit (VK) face tracker returns mesh/landmark geometry directly. These
 * types describe those payloads so the rest of the adapter can stay mockable.
 */

import type { FrameInput } from "@visutry/tryon-core";

/**
 * A single WeChat camera frame as produced by
 * `wx.createCameraContext().onCameraFrame`. `data` is an RGBA pixel buffer of
 * size `width * height * 4`.
 */
export interface WechatCameraFrame {
  data: ArrayBuffer;
  width: number;
  height: number;
}

/**
 * Concrete WeChat frame payload handed to the core as `FrameInput`. The core
 * declares `WechatFrameInput` as an opaque `{ [key: string]: unknown }`; this
 * adapter narrows it to the real camera-frame shape so downstream consumers
 * (tracker, renderer) can read typed fields.
 *
 * Declared as a `type` alias (not an `interface`) on purpose: object type
 * literals are assignable to the core's index-signature `WechatFrameInput`,
 * whereas interfaces are not (interfaces are open to declaration merging).
 */
export type WechatFrameInput = {
  /** RGBA pixel buffer. */
  data: ArrayBuffer;
  width: number;
  height: number;
  /** Optional mirror flag propagated from the camera config. */
  mirror?: boolean;
};

/**
 * Type guard narrowing a `FrameInput` union member to a `WechatFrameInput`.
 * Used by the WeChat face tracker to reject foreign (e.g. HTML) frame shapes.
 */
export function isWechatFrameInput(frame: FrameInput): frame is WechatFrameInput {
  if (frame === null || typeof frame !== "object") return false;
  // Branded DOM frame inputs (HTMLVideoElement / HTMLCanvasElement / ImageData)
  // carry a private `__brand` discriminator and must be excluded.
  if ("__brand" in frame) return false;
  // `Uint8Array` is a member of the FrameInput union; it has no `.data` field.
  if (frame instanceof Uint8Array) return false;
  const f = frame as Record<string, unknown>;
  const hasData = f.data instanceof ArrayBuffer || f.data instanceof Uint8Array;
  return hasData && typeof f.width === "number" && typeof f.height === "number";
}
