# Three.js r170

three.js is the bundled ES module from the three@0.170.0 npm package. The MIT license is in three.LICENSE. The game imports this local file at runtime. To regenerate it in a temporary directory with that version of three and esbuild installed, run:

```sh
./node_modules/.bin/esbuild node_modules/three/src/Three.js --bundle --minify --format=esm --outfile=three.js
```
