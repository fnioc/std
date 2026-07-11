// Stream provider bases -- the abstract Source/Provider pair stream-shaped
// provider packages (e.g. @rhombus-std/config.json's addJsonStream) extend.
// Unlike memory/ and chained/, this barrel is side-effect free: the bases
// carry no augmentation of their own.

export { StreamConfigurationProvider } from "./StreamConfigurationProvider";
export { StreamConfigurationSource, type StreamPayload } from "./StreamConfigurationSource";
