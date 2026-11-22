import { build } from 'esbuild'

await build({
  entryPoints: ['scripts/verify-extra-balls.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { '@': './src' },
  outfile: '/tmp/verify-extra-balls.mjs',
  plugins: [
    {
      name: 'stub-vue',
      setup(plugin) {
        plugin.onLoad({ filter: /\.vue$/ }, () => ({ contents: 'export default {}', loader: 'js' }))
      },
    },
  ],
})
