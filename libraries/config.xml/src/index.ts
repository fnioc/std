// Public entry point for @rhombus-std/config.xml: the XML file and stream
// source/provider pairs, plus the builder sugar that registers them.
//
// A consumer who only wants the sugar needs a bare side-effect import:
// `import "@rhombus-std/config.xml";`. `sideEffects: true` in package.json keeps
// a bundler from tree-shaking the registration away.

export { ConfigBuilderXmlAugmentations } from './ConfigBuilder-Xml-augmentations';
export { XmlConfigProvider } from './XmlConfigProvider';
export { XmlConfigSource } from './XmlConfigSource';
export type { XmlConfigSourceOptions } from './XmlConfigSource';
export { XmlStreamConfigProvider } from './XmlStreamConfigProvider';
export { XmlStreamConfigSource } from './XmlStreamConfigSource';
