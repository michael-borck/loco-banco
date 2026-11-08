import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { loco } from '@locolabo/theme';

export default defineConfig({
  site: 'https://locobanco.org',
  integrations: [
    starlight(
      loco({
        project: 'loco-banco',
        title: 'LocoBanco',
        description: "I have X GB of VRAM — what's the best model I can run?",
        home: 'https://locobanco.org',
        github: 'loco-banco',
        accent: { low: '#052e16', main: '#22c55e', high: '#bbf7d0' },
        logo: {
          alt: 'LocoBanco',
          src: './src/assets/art/icon.png',
          replacesTitle: false,
        },
        customCss: ['./src/styles/custom.css'],
        head: [
          { tag: 'script', attrs: { src: 'https://cdn.plot.ly/plotly-2.35.2.min.js', defer: true } },
          { tag: 'script', attrs: { src: '/javascripts/benchmark_data.js', defer: true } },
          { tag: 'script', attrs: { src: '/javascripts/chart_theme.js', defer: true } },
          { tag: 'script', attrs: { src: '/javascripts/charts_overview.js', defer: true } },
          { tag: 'script', attrs: { src: '/javascripts/charts_quality.js', defer: true } },
          { tag: 'script', attrs: { src: '/javascripts/charts_speed.js', defer: true } },
          { tag: 'script', attrs: { src: '/javascripts/charts_efficiency.js', defer: true } },
        ],
        sidebar: [
          {
            label: 'Results',
            items: [
              { label: 'Quality Analysis', slug: 'quality' },
              { label: 'Speed Analysis', slug: 'speed' },
              { label: 'Bang per Bit', slug: 'bang-per-bit' },
            ],
          },
          {
            label: 'Hardware',
            items: [
              { label: 'Benchmark Hardware', slug: 'colmena' },
              { label: 'GPU Inventory', slug: 'gpu-inventory' },
              { label: 'VRAM Tiers', slug: 'tiers' },
              { label: 'GPU Picker', link: '/picker/' },
            ],
          },
          {
            label: 'Guide',
            items: [
              { label: 'Benchmarking Guide', slug: 'guide' },
              { label: 'Result Contract', slug: 'result-contract' },
              { label: 'Advanced Reference', slug: 'advanced-reference' },
            ],
          },
        ],
      })
    ),
  ],
});
