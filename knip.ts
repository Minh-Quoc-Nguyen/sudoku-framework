import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "packages/core": {
      project: ["src/**/*.{ts,tsx}"],
      ignoreExportsUsedInFile: true,
    },
  },
};

export default config;
