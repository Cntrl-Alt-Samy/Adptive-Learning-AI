import coreWebVitals from 'eslint-config-next/core-web-vitals';

const nextConfig = Array.isArray(coreWebVitals) ? coreWebVitals : [coreWebVitals];

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'coverage/**',
      'reports/**',
      'next-env.d.ts'
    ]
  },
  ...nextConfig,
  {
    languageOptions: {
      globals: {
        React: 'readonly'
      }
    }
  },
  {
    // S8A-T2 gate — no raw hex outside styles/tokens.css (Sprint 8a §6).
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'hooks/**/*.ts', 'lib/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message: 'Raw hex colors are banned — use --sys-* tokens from styles/tokens.css.'
        },
        {
          selector: "TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]",
          message: 'Raw hex colors are banned — use --sys-* tokens from styles/tokens.css.'
        }
      ]
    }
  },
  {
    // React-Compiler-era rules (eslint-config-next 16): kept advisory for the
    // web MVP. Mounted-guards, one-shot engine kickoffs in effects, and
    // render-stable engine instances are deliberate SSR-safety patterns here.
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}', 'lib/**/*.ts'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn'
    }
  },
  {
    // Engine code and tests keep their existing conventions.
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts', 'workers/**/*.ts', 'api/**/*.ts'],
    rules: {}
  }
];

export default config;
