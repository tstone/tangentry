import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  // Relative asset paths, so the build works under GitHub Pages' /tangentry/.
  base: './',
  plugins: [solid()],
})
