// Genera src/styles/embedded-fonts.css: @font-face con los woff2 de
// @fontsource/* inlineados como data URI. No se referencian como archivos
// .woff2 sueltos porque el allowlist de extensiones del CDN de Sura (ver
// integracion-spec §8) no incluye fuentes -- un .woff2 subido se rechaza
// por nombre. Inlineado dentro de un .css (que sí está en el allowlist)
// evita el problema por completo. Se corre a mano cuando cambian las
// fuentes -- el resultado se commitea, no se regenera en cada build.
const fs = require('fs')
const path = require('path')

const FONTS = [
	{ pkg: '@fontsource/nosifer', file: '400.css' },
	{ pkg: '@fontsource/righteous', file: '400.css' },
	{ pkg: '@fontsource/lemon', file: '400.css' },
	{ pkg: '@fontsource/fredoka', file: '600.css' }
]

const blockRe = /@font-face\s*{([^}]*)}/g

const out = []

for (const { pkg, file } of FONTS)
{
	const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`))
	const cssPath = path.join(pkgDir, file)
	const css = fs.readFileSync(cssPath, 'utf8')

	let match

	while ((match = blockRe.exec(css)) !== null)
	{
		const body = match[1]

		// Se ignoran subsets que no hacen falta para es/en/pt (ej. hebrew).
		const familyMatch = body.match(/font-family:\s*'([^']+)'/)
		const woff2Match = body.match(/url\(\.\/files\/([^)]+\.woff2)\)/)
		const weightMatch = body.match(/font-weight:\s*(\d+)/)
		const rangeMatch = body.match(/unicode-range:\s*([^;]+);/)

		if (!familyMatch || !woff2Match || !weightMatch || !rangeMatch)
		{
			continue
		}

		if (woff2Match[1].includes('hebrew'))
		{
			continue
		}

		const woff2Path = path.join(pkgDir, 'files', woff2Match[1])
		const base64 = fs.readFileSync(woff2Path).toString('base64')

		out.push(`@font-face {
	font-family: '${familyMatch[1]}';
	font-style: normal;
	font-display: swap;
	font-weight: ${weightMatch[1]};
	src: url(data:font/woff2;base64,${base64}) format('woff2');
	unicode-range: ${rangeMatch[1]};
}`)
	}
}

const header = `/* GENERADO por scripts/generate-embedded-fonts.js -- no editar a mano.
 * @font-face con los woff2 de @fontsource/* inlineados como data URI (ver
 * ese script para el motivo: el allowlist de extensiones de Sura no
 * incluye fuentes, así que no pueden viajar como archivos .woff2 sueltos).
 */
`

fs.writeFileSync(
	path.join(__dirname, '..', 'src', 'styles', 'embedded-fonts.css'),
	header + '\n' + out.join('\n\n') + '\n'
)

console.log(`OK: ${out.length} @font-face generados en src/styles/embedded-fonts.css`)
