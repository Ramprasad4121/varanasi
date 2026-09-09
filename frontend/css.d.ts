// Author: Ramprasad — ambient CSS module declarations. Next.js handles CSS
// imports at build time; TS7 (error TS2882) requires explicit declarations
// for side-effect style imports, which older tsc silently allowed.
declare module "*.css";
