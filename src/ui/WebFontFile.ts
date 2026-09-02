import Phaser from 'phaser'

/**
 * Antes dependía de webfont.js (Google, vía CDN externo) para cargar las
 * fuentes -- si ese CDN no era alcanzable (ver commit del fix de la
 * pantalla negra en el preview de Sura), el juego se quedaba trabado en
 * "Loading..." para siempre. Ahora las fuentes son @fontsource/* bundleadas
 * en el JS (import en main.ts) -- @font-face local, cero red externa. Este
 * loader solo le da tiempo al navegador a parsear/decodificar los
 * @font-face antes de crear texto de Phaser con ellas (si no, el primer
 * frame puede dibujar con la fuente de fallback). document.fonts.load()
 * nunca cuelga para una fuente ya declarada localmente -- el timeout es
 * sólo red de seguridad por si el navegador no tiene FontFace API.
 */

const FONT_READY_TIMEOUT_MS = 3000

interface MinimalFontFaceSet
{
	load(font: string): Promise<unknown>
}

export default class WebFontFile extends Phaser.Loader.File
{
	private fontNames: string[]

	constructor(loader: Phaser.Loader.LoaderPlugin, fontNames: string | string[])
	{
		super(loader, {
			type: 'webfont',
			key: fontNames.toString()
		})

		this.fontNames = Array.isArray(fontNames) ? fontNames : [fontNames]
	}

	load()
	{
		let settled = false

		const advance = () => {
			if (settled)
			{
				return
			}

			settled = true
			this.loader.nextFile(this, true)
		}

		const fontSet = (document as unknown as { fonts?: MinimalFontFaceSet }).fonts

		if (!fontSet)
		{
			advance()
			return
		}

		Promise.all(this.fontNames.map(name => fontSet.load(`1em "${name}"`)))
			.catch(() => {})
			.then(advance)

		setTimeout(advance, FONT_READY_TIMEOUT_MS)
	}
}
