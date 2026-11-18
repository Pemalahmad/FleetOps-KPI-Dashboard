import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party React Bits components, kept as published (see src/components/bits/LICENSE.md).
    "src/components/bits/DotGrid.tsx",
    "src/components/bits/SpotlightCard.tsx",
    "src/components/bits/ClickSpark.tsx",
    "src/components/bits/ShinyText.tsx",
    "src/components/bits/GlareHover.tsx",
    "src/components/bits/LogoLoop.tsx",
    "src/components/bits/Magnet.tsx",
  ]),
]);

export default eslintConfig;
